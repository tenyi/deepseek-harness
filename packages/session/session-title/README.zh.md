---
description: "面向用戶與維護者的日志支持型會話標題說明，用于選擇標題來源、配置服務或排查標題狀態。"
kind: "package-reference"
---

# @deepseek-ai/dsh-session-title

[English](README.md) | 中文

## 概述

使用 `dsh-session-title` 為每個會話提供客戶端可見標題，標題可以來自第一條符合條件的用戶消息、可選異步生成器或顯式用戶重命名。已接受的標題在回放、恢復與分頁后仍然存在，但絕不會進入模型輸入。自動生成絕不會延遲主 agent（智能體）響應，較新的標題請求會取代舊工作。當客戶端需要帶可配置長度上限的持久標題，以及通過 `refresh()` 主動重新生成標題的路徑時，請選擇本包。

## 目錄

- [使用本包](#use-this-package)
- [理解實現](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

掛載服務，讓會話獲得客戶端可以顯示、且絕不觸及模型的標題。常用路徑是顯式的：加載會話存儲、以必填上限掛載服務，并可選掛載一個提供方插件。

### 選擇標題來源

標題來自三個來源，最新者勝出。內置回退在配置上限內從第一條符合條件用戶消息的開頭若干詞派生；已注冊提供方對符合條件的消息生成標題；顯式 `rename()` 接受用戶提供的標題。只有人類 `user/message` 事件中的文本塊符合條件，空提示詞或非文本提示詞會等待后續符合條件的輸入。用戶來源的最新標題會釘住會話——后續用戶消息不再安排自動修訂，顯式 `refresh()` 仍是有意的解釘手段。

### 最小配置

所有上限都是必填項；該庫不提供默認值。以三個上限掛載服務：

```yaml
- name: '@deepseek-ai/dsh-session'
- name: '@deepseek-ai/dsh-session-title'
  config:
    fallbackMaxWords: 8
    fallbackMaxBytes: 96
    maxTitleBytes: 120
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `fallbackMaxWords` | 必填 | 確定性回退中以空白分隔的最大詞數 |
| `fallbackMaxBytes` | 必填 | 回退允許的最大 UTF-8 字節數；不得超過 `maxTitleBytes` |
| `maxTitleBytes` | 必填 | 接受任何來源標題的最大 UTF-8 字節數 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-session-title)是每個受支持字段及其 JSDoc 的窮盡式真源。

### 添加提供方

可選異步提供方可通過 `ctx.sessionTitle.register(provider)` 注冊一個；第二次注冊會立即拋出。隨附的模型支持提供方是[首消息](../session-title-first-prompt-llm/README.zh.md)與[全消息](../session-title-all-prompts-llm/README.zh.md)，兩者都使用共享的 [LLM（大語言模型）生成策略](../session-title-llm/README.zh.md)。提供方只有在帶標記、由循環構建的請求的確切路由與已記錄 `request/header` 匹配時才啟動，較新的修訂會取代并中止舊工作。

### 讀取標題

`get(session)` 從活躍或回放會話讀取折疊出的最新標題，`foldSessionTitle(events)` 是對日志的純折疊。服務要求 `ctx.sessionProjections` 并注冊兩個單元：客戶端可見的 `title` 單元（供客戶端列表行使用的已接受標題字符串）和僅供 host 使用的 `titleInput` 單元——后者折疊第一條與最新一條合格消息及其計數，使調度與回退讀取通過 `stateOf()` 達到 O(1)；某次提供方生成所需的完整合格前綴，則會在執行時從會話日志中掃描取得。顯式 `refresh(session)` 在需要時物化回退，然后對當前符合條件的消息顯式運行已注冊提供方。

### 失敗與恢復

自動失敗會發出警告并保留最新標題；顯式 `refresh()` 在提供方錯誤或調用方取消時拒絕，取消不會回滾已接受的回退事件。自動工作絕不會延遲主 agent 響應，其延遲完成會追加一個獨立純日志事件而不打開輪次，陳舊的完成結果無法追加。fork 出的會話會原樣繼承種子中的標題事件。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋標題設計；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

標題是持久的、僅寫入日志的狀態：每個已接受的修訂都是 `session/title` 事件，`foldSessionTitle()` 選擇最新事件，因此標題像任何其他會話事件一樣在回放、恢復與分頁中存活。服務擁有調度、取代與接受；提供方負責生成。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 服務：配置、折疊、回退調度、提供方注冊表、并發、`title` 投影單元 |
| [`src/normalize.ts`](src/normalize.ts) | 標題文本清洗、UTF-8 安全截斷與確定性回退 |
| [`src/types.ts`](src/types.ts) | `title` 投影鍵聲明的歸屬位置 |

### 生命周期與并發

每個會話的工作狀態維護一個修訂計數器、一個進行中的回退，以及待處理與活躍的提供方工作。較新的用戶消息、提供方 dispose（資源釋放）、會話 dispose 或顯式刷新都會通過 `AbortController` 中止舊工作；提供方、修訂、會話或信號已陳舊的完成結果無法追加。顯式刷新會在提供方工作之前預留修訂號；重疊的自動／顯式回退請求共享一個會話本地正在進行的追加操作。服務拆卸會取消排隊工作，并在卸載完成前等待不響應取消的調用結算。

### 規范化

已接受標題會清除終端控制序列、方向性與不可見控制符以及非空白的 C0/C1 控制符；空白被規范化，按字節上限截斷時絕不切斷 Unicode 碼點。確定性回退在 `fallbackMaxWords` 與 `fallbackMaxBytes` 內取第一條符合條件消息的開頭若干詞。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當服務約定不夠用時閱讀以下頁面。它們從子系統參考逐步進入在此插拔的模型支持提供方。

- [會話標題子系統](../../../docs/subsystems/session-title.zh.md)——持久標題狀態與提供方詞匯類型。
- [共享 LLM 標題策略](../session-title-llm/README.zh.md)——兩個隨附提供方共用的模型生成輔助模塊。
- [首消息標題提供方](../session-title-first-prompt-llm/README.zh.md)——根據第一條符合條件的用戶消息生成標題。
- [全消息標題提供方](../session-title-all-prompts-llm/README.zh.md)——根據所有符合條件的用戶消息生成標題。
- [會話包映射](../README.zh.md)——相鄰的持久化、投影、標題與遙測包。

-----

<a id="model-experience"></a>
## 模型體驗

### 會話標題狀態

#### 模型看到什么

無。`session/title` 只寫入日志，絕不會進入會話接口、`deriveMessages()`、系統提示詞、工具 schema 或請求前綴。

#### Token 影響

回退與已接受的提供方修訂不會向主 agent 請求增加 token。可選提供方的獨立輔助請求由對應提供方包的文檔說明。

#### KV Cache 影響

不影響主請求；標題事件不會改變其重建內容或緩存鍵。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明標題服務不提供什么。它們是當前包約束。

- **沒有標題刪除、搜索或列表索引**——不經顯式 `refresh` 就解釘回自動標題、搜索與列表索引不屬于此服務。
- **至多一個提供方**——注冊表有意只接受一個實現，因此部署若要組合相互競爭的標題策略，必須編寫一個自行負責優先級的提供方。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
