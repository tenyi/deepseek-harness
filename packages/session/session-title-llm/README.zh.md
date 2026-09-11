---
description: "面向用戶與維護者的共享模型標題生成策略說明，用于配置標題提供方或排查輔助 LLM 請求。"
kind: "package-library"
---

# @deepseek-ai/dsh-session-title-llm

[English](README.md) | 中文

## 概述

`dsh-session-title-llm` 使用一致的模型請求策略，根據選中的用戶消息生成簡潔的會話標題。調用方選擇每次修訂包含哪些消息，以及成對提供 `provider`／`model` 路由，還是使用當前會話記錄的路由。必填上限約束封裝后的輸入、生成輸出與端到端時長，調用方取消在整個流式處理期間持續生效。無效、空、遲到、包含工具調用或其他非純文本的結果會在替換標題前被拒絕。

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

作為部署方，通過[首消息](../session-title-first-prompt-llm/README.zh.md)或[全消息](../session-title-all-prompts-llm/README.zh.md)提供方插件配置此策略。作為提供方作者，通過共享輔助函數注冊，而不是手寫生成邏輯。

### 注冊提供方

提供方插件調用 `registerSessionTitleLlmProvider(ctx, config, id, automatic, selectMessages)`；輔助函數驗證共享配置、在 `ctx.sessionTitle` 上注冊提供方，并讓每次生成都經過共享策略。兩個隨附插件以各自的 `first-prompt` 與 `all-prompts` 節奏和消息選擇器注冊；服務上的第二次注冊會立即拋出。

### 路由與失敗約定

`provider` 與 `model` 覆蓋項都是可選的，但必須同時作為非空字符串提供。如果沒有這一對取值，輔助函數使用當前會話已記錄 `request/header` 中捕獲的確切提供方／模型路由，因此在任何路由出現前顯式刷新時必須提供覆蓋項。輔助函數在記錄或分發前，依據 `maxInputBytes` 檢查最終 JSON 封裝用戶提示詞的大小，而不是將其截斷，并在消費流期間與完成后重新檢查超時與調用方取消，因此即使攔截器或適配器忽略 abort，也不能接受遲到的成功結果。格式錯誤或空輸出、工具調用與非 stop 結束原因都會拒絕；會話標題服務決定該拒絕屬于自動警告還是顯式調用方失敗。

### 配置

<a id="configuration"></a>

除成對的路由覆蓋項外，每個字段都必填；庫不提供默認值。

| 鍵 | 默認值 | 含義 |
|---|---|---|
| `targetWords` | 必填 | 非 CJK 標題的目標詞數 |
| `targetCjkCharacters` | 必填 | 中文、日文或韓文標題的目標字符數 |
| `maxInputBytes` | 必填 | 最終 JSON 封裝用戶提示詞的 UTF-8 字節上限 |
| `maxOutputTokens` | 必填 | 輔助生成的 token 上限 |
| `timeoutMs` | 必填 | 運行時定時器限制內的端到端時限 |
| `provider`, `model` | 可選 | 顯式路由；二者同時提供或同時省略 |

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋生成路徑；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

一份共享策略讓提供方插件無法漂移：配置校驗、路由解析、提示詞封裝、預算執行、取消與輸出校驗都在這里，只以提供方的節奏與消息選擇器為參數。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 配置 schema 與校驗、提供方注冊輔助、請求封裝、分發與輸出校驗 |

### 請求流程

生成在注冊時校驗一次配置；每次修訂把選中的消息封裝為 JSON，依據 `maxInputBytes` 檢查封裝提示詞的 UTF-8 字節數，解析路由（顯式對或已記錄 `request/header`），追加一條攜帶確切可分發請求的僅日志 `session/title-llm-request` 事件，然后在組合的超時與取消截止時間內通過 `ctx.llm` 流式生成。分發的封套攜帶 `purpose: 'session-title'`，且有意不包含 agent loop 的進程本地請求身份；DeepSeek 適配器根據該用途禁用思考，使少量輸出預算全部用于可見標題文本，其他適配器負責自身用途專用行為。輸出只組裝為文本塊；工具調用、格式錯誤或空輸出與非 stop 結束原因都會拒絕，后續模型失敗會保留請求記錄。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當生成策略不夠用時閱讀以下頁面。它們從它所插入的服務逐步進入消費它的提供方插件。

- [會話標題服務](../session-title/README.zh.md)——標題服務、回退行為與提供方注冊約定。
- [會話標題子系統](../../../docs/subsystems/session-title.zh.md)——持久標題狀態與輔助請求記錄。
- [首消息標題提供方](../session-title-first-prompt-llm/README.zh.md)——根據第一條符合條件的用戶消息生成標題。
- [全消息標題提供方](../session-title-all-prompts-llm/README.zh.md)——根據所有符合條件的用戶消息生成標題。
- [會話包映射](../README.zh.md)——相鄰的持久化、投影、標題與遙測包。

-----

<a id="model-experience"></a>
## 模型體驗

### 輔助標題請求

#### 模型看到什么

標題模型會收到固定系統指令，要求以輸入語言返回一個簡潔且無裝飾的標題；該指令包含所配置的詞數與 CJK 字符數目標。它唯一的用戶消息包含一個 JSON 數組，其中是精確選中的用戶消息及其 seq。

#### Token 影響

輔助請求根據所選輸入大小與 `maxOutputTokens` 消耗 token。它與主 agent 請求相互獨立，不會向 agent 歷史增加標題文本或封裝內容。DeepSeek 標題調用會關閉思考；主對話保留自身配置的思考模式。

#### KV Cache 影響

不會使主請求的 KV Cache 失效。輔助緩存復用由提供方決定；固定指令可復用，而 JSON 消息數組會隨每次修訂變化。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制定義被接受的生成形態。它們是當前包約束。

- **僅文本輸出**——輔助函數只接受文本輸出并拒絕工具調用；不公開結構化輸出適配器或提供方專用提示詞變體。
- **整體提示詞字節上限**——它對整個封裝用戶提示詞強制執行字節上限，而不是剪裁單條消息或應用保留策略。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。這個無狀態 helper 會在 dispatch 前校驗并凍結每個輔助請求；deadline、stream、message seq、provider 與 model 由同步檢查和測試覆蓋。
