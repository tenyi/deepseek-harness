---
description: "spill 存儲服務：保存超大工具文本或已捕獲的會話引用，并返回可用于取回內容的定位信息。"
kind: "package-reference"
---

# @deepseek-ai/dsh-spill

[English](README.md) | 中文

## 概述

`dsh-spill` 讓插件和工具通過公開的 `ctx.spillStore` API 保存超大文本，并取得不透明定位信息、精確字節數與取回指引。當完整結果必須保持可取回、同時又不能填滿模型上下文時選擇它。配置 `dsh-spill-local` 可獲得本地持久化；當超大工具結果應變為有界預覽時，再添加 `dsh-spill-policy`。該 API 不提供保留、替換、取回或搜索操作。存儲故障會使保存操作拒絕，由調用方決定保留內聯內容還是讓操作失敗。

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

保存 spill 產物的組合需要掛載一個后端——僅本包本身不存儲任何內容。`dsh-spill-policy` 決定工具結果何時 spill；`dsh-session-reference` 直接保存截斷后的會話引用 transcript（文本記錄），不需要該策略。調用方使用 `ctx.spillStore.saveText()` 并明確指定歸屬；可選消費方通過 `ctx.get("spillStore")` 獲取后端。

### 何時選擇

當部署需要在模型看到有界預覽后仍能取回全文時，選擇 spill 存儲，例如抓取的頁面正文或已捕獲的會話引用 transcript。前提是后端的定位信息與取回指引在部署環境中可用；該服務不要求本地文件系統訪問。

### 最小可用組合

把后端與策略一起掛載；設置 `maxInlineBytes` 后，任何過大的純文本工具結果都會自動變成預覽加定位信息。

```yaml
- name: '@deepseek-ai/dsh-spill-local'
- name: '@deepseek-ai/dsh-spill-policy'
  config:
    maxInlineBytes: 50000
```

### 保存文本

掛載后端后，用所屬會話、來源描述、建議文件名與完整文本調用 `ctx.spillStore.saveText()`：

```text
const ref = await ctx.spillStore.saveText({
  owner: { sessionId: 'session-1' },
  source: { kind: 'tool', toolName: 'web_fetch', callId: 'call-1', label: 'result' },
  suggestedName: 'web_fetch.txt',
  content: fullText,
})
```

返回的 `SpillRef` 攜帶三個字段：`locator`，后端產生的面向模型的不透明句柄（對 `dsh-spill-local` 是本地文件路徑，對其他后端可能是 URI 或鍵）；`bytes`，寫入的精確 UTF-8 字節數；`retrievalHint`，消費方展示給模型的指引——對本地后端而言是讀取或搜索該路徑。消費方將定位信息與指引一同呈現，絕不自行解析定位信息。

### 歸屬與邊界

存儲按所屬會話分組：fork 后的會話從種子日志繼承既有定位信息，無需復制或更改歸屬，fork 后新產生的 spill 使用子會話 id。會話引用產物歸接收上下文的目標會話所有，而不是被引用的源會話。`suggestedName` 只是提示——后端會把它清理成單個安全路徑段，絕不把它當作可信路徑。預覽與 spill 決策由消費方負責；存儲與產物過期由后端負責。

### 故障與恢復

`saveText` 只在真實存儲故障時拒絕——權限不足、磁盤已滿或后端不可用。由調用方決定如何降級：已交付的策略把拒絕當作盡力而為處理，記錄警告并保留原始內聯結果，因此 spill 失敗絕不會把成功的工具調用變成錯誤或隱藏內容。如果沒有掛載后端，就沒有可保存的目標；請在組合中加載 `dsh-spill-local` 或其他后端。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋該服務背后的設計決策；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

本包建立在一個分離與刻意的極簡之上：

- **約定、實現與策略保持分離。** 本包定義后端做什么（`saveText`）；`dsh-spill-local` 實現它；`dsh-spill-policy` 決定何時觸發。各項關注點獨立演進與替換。
- **只有一個方法，別無其他。** 該 seam 不負責保留策略、結果替換或取回/搜索 API——那些都有各自的歸屬包。
- **在 seam 處拒絕，絕不靜默降級。** 降級由調用方負責；seam 報告真實存儲故障。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：抽象 `SpillStore` 服務及其 `saveText` 約定 |
| [`src/types.ts`](src/types.ts) | 詞匯：`SaveTextSpill`、`SpillRef`、帶品牌類型 `SpillLocator`、`SpillOwner`、`SpillSource` |
| — | 不發布運行時不變式伴生入口；除歸屬 seam 強制執行的約定外，本包不暴露獨立的事件序列或可變數據關系。 |

### 數據模型

`SaveTextSpill` 將存儲歸屬與描述性來源信息分開。`SpillSource` 接受工具來源 `{ kind: "tool", toolName, callId, label }` 或 `{ kind: "session-reference", sessionId, label }`，后者的 id 標識被捕獲的源會話。會話引用絕不偽造工具調用 id。來源信息與歸屬命名空間都不授予讀取權限。消費方把返回的定位信息視為不透明值，并與取回指引一同展示。

### 生命周期

后端繼承 `SpillStore` 并以插件方式加載，注冊為 `ctx.spillStore`；每個上下文只有一個實現，第二次加載會失敗。執行 dispose（資源釋放）時會釋放該服務。抽象類本身不注冊任何內容——本包只提供約定與詞匯。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從共享詞匯逐步進入已交付后端、策略與設計依據。

- [spill 子系統](../../../docs/subsystems/spill.zh.md)——窮盡式詞匯、歸屬與后端關系。
- [spill 包映射](../README.zh.md)——三包家族與各自職責。
- [dsh-spill-local](../spill-local/README.zh.md)——已交付的本地文件系統后端。
- [dsh-spill-policy](../spill-policy/README.zh.md)——決定最終結果何時過大的策略。
- [dsh-output-retention](../../util/output-retention/README.zh.md)——策略背后的預覽機制。
- [工具輸出 spill 決策](../../../.agents/notes/implemented/architecture/2026-07-08-tool-output-spill-files.zh.md)——能力邊界與設計依據。

-----

<a id="model-experience"></a>
## 模型體驗

spill 消費方將后端的定位信息與取回指引渲染給模型，從而間接影響模型體驗。

#### KV Cache 影響

不會直接導致 KV Cache 失效；請求前綴變更由上述消費方負責。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明 spill 存儲服務單獨使用時在哪些方面不完整。它們是當前的包約束。

- **沒有取回或刪除 API**——消費方只能渲染后端的定位信息與指引；生命周期與訪問語義仍由后端自行決定。
- **存儲不等于訪問控制**——所屬會話區分寫入命名空間，但不會授權通過定位信息讀取內容；每個后端與取回消費方都必須自行強制執行訪問邊界。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文：尚未決定的探索方向與開放問題。它明確不具權威性。

#### 未來：執行器 spill 文件集成

該 seam 只有 `saveText`；為既有執行器 spill 文件提供保存文件或鏈接/復制路徑（例如規范化 bash 臨時文件），以及為 subagent 展開提供工具自有 spill，仍然延期，見[工具輸出 spill 決策](../../../.agents/notes/implemented/architecture/2026-07-08-tool-output-spill-files.zh.md)。

#### 未來：非本地后端與清理

遠程或數據庫后端仍是開放方向。本地后端執行其[啟動清理策略](../spill-local/README.zh.md#startup-cleanup)；該服務未定義按會話清理或刷新定位信息的 API。

</details>
