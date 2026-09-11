---
description: "LSP 能力 seam（ctx.lsp）：按文件擴展名選擇提供方、四種規范化的代碼導航操作與結構化錯誤，供組合或擴展代碼導航的用戶與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-lsp

[English](README.md) | 中文

## 概述

使用 `dsh-lsp` 為 agent（智能體）提供語言服務器導航，包括定義、引用、實現與懸停文檔。查詢按文件擴展名選擇已配置的提供方，并返回規范化結果與結構化錯誤，因此更換后端不會改變導航請求或模型可見的響應。導航只讀，并刻意排除通用 JSON-RPC 訪問、重命名、格式化、診斷與符號列表。本包必須與 `dsh-lsp-stdio` 等提供方及面向模型的 `dsh-tool-lsp` 組合；單獨使用時不提供導航。

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

掛載語言服務器提供方與 `lsp` 工具，即可為 agent 提供文本搜索無法可靠給出的、基于語義的代碼導航——區分同名函數、跟隨導入別名、把接口連接到其實現，或讀取推斷出的類型。本包就是這些包所注冊的服務；它自身不定義任何 UI、工具或提供方。

### 何時選擇

當部署希望模型可見的代碼導航由語言服務器支撐時，選擇此服務。它覆蓋只讀導航——定義、引用、實現與懸停——并刻意排除修改（重命名、code action、格式化）、符號列表與診斷。該服務提供方無關：本地 stdio 服務器、遠程服務器與沙箱原生提供方都以相同方式注冊，因此更換后端不會改變模型看到的內容或請求方式。

### 組合導航棧

seam 需要提供方與消費方才能發揮作用。最小組合掛載服務、stdio 提供方與工具：

```yaml
- name: '@deepseek-ai/dsh-fs-local'
- name: '@deepseek-ai/dsh-subprocess-local'
- name: '@deepseek-ai/dsh-lsp'
- name: '@deepseek-ai/dsh-lsp-stdio'
- name: '@deepseek-ai/dsh-tool-lsp'
```

服務器命令、擴展名映射與文件系統／子進程配對在提供方與工具包中配置；見 [dsh-lsp-stdio](../lsp-stdio/README.zh.md) 與 [dsh-tool-lsp](../tool-lsp/README.zh.md)。

### 四種操作

每個查詢在源文件的某個光標位置提出四個語義問題之一；結果是被規范化的位置或懸停內容，絕不是原始協議載荷。

| 操作 | agent 獲得的內容 |
|---|---|
| `goToDefinition` | 光標處符號的定義位置 |
| `findReferences` | 所有引用，始終包含聲明 |
| `goToImplementation` | 具體實現位置 |
| `hover` | 該符號的規范化文檔，或沒有 |

`findReferences` 始終包含聲明，因此影響分析絕不會遺漏定義位置。協議上的位置是從零開始的 UTF-16；面向模型的工具接受從 1 開始的光標坐標并自行轉換。

### 失敗與恢復

當沒有注冊的提供方處理該文件擴展名時，查詢會以結構化錯誤 `LSP_UNAVAILABLE` 失敗——為該擴展名添加提供方，或查詢受支持的文件。無效或沖突的提供方注冊會在任何路由發布前以 `LSP_INVALID_PROVIDER` 或 `LSP_CONFLICT` 失敗；對已釋放提供方的查詢以 `LSP_DISPOSED` 失敗。消費方捕獲 `LspError` 并按穩定的 `code` 路由；經由工具，這些會呈現為模型可讀的錯誤結果。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋 seam 背后的設計決策并指出實現它們的代碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

- **能力 seam，Service Definition 角色。** 本包擁有 `ctx.lsp` 與提供方注冊表；提供方注冊的是能力而非工具，`dsh-tool-lsp` 是面向模型表層的唯一 owner。
- **原子注冊。** `registerProvider()` 在變更前驗證并檢查全部沖突：無效或沖突的注冊不會發布任何內容，其 disposer 會一并釋放 id 與全部擴展名保留。
- **與順序無關的選擇。** `query()` 按文件的最終擴展名（規范化為小寫、以點開頭的形式）路由；注冊與 HMR（熱模塊替換）順序絕不會改變路由。language id 只用于同步臨時文檔，絕不參與選擇。
- **封閉的詞匯。** 四種操作的聯合是封閉的——新增操作是跨 seam、提供方與工具的編譯期強制變更。沒有 JSON-RPC 逃生口，且每個請求字段都必填，因此不存在 `resolve()` 步驟。
- **提供方擁有的工作區坐標。** 位置結果攜帶提供方的規范工作區 URI，消費方據此在執行世界的命名空間內相對化文件 URI，而不是應用宿主平臺路徑規則。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`Lsp` 服務、`registerProvider`／`query`、`finalExtension`、`LspError` code |
| [`src/types.ts`](src/types.ts) | seam 詞匯：請求、結果、提供方與服務約定 |
| [`src/brand.ts`](src/brand.ts) | `LspProviderId` 品牌化 id 類型與工廠 |
| — | 不發布運行時不變式伴生入口；提供方 id 與擴展名路由屬于以原子方式更新的私有狀態；該 seam 既不公開可枚舉快照，也不公開可供獨立比較的生命周期事件。 |

### 注冊與選擇生命周期

注冊與釋放通過 `ctx.effect()` 執行，因此提供方路由隨注冊 fiber 一同存活與消亡。`finalExtension()` 按兩種路徑分隔符切分，對沒有擴展名的名稱或點開頭的 dotfile 返回 `''`，任何路由都不會匹配。`LspError` 擴展 `HarnessError`，攜帶穩定的 code（`LSP_INVALID_PROVIDER`、`LSP_CONFLICT`、`LSP_UNAVAILABLE`、`LSP_DISPOSED`、`LSP_UNSUPPORTED_OPERATION`、`LSP_MALFORMED_RESPONSE`），調用方據此路由，而不是解析 `message`。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從共享的導航模型逐步進入提供方與工具。

- [LSP 導航子系統](../../../docs/subsystems/lsp.zh.md)——操作、坐標、請求與結果，以及 `LspError` code。
- [dsh-lsp-stdio](../lsp-stdio/README.zh.md)——注冊到該 seam 的 stdio 提供方。
- [dsh-tool-lsp](../tool-lsp/README.zh.md)——基于該 seam 的面向模型工具。
- [lsp 組地圖](../README.zh.md)——三個包的家族及其相關文檔。

-----

<a id="model-experience"></a>
## 模型體驗

通過 `dsh-tool-lsp` 間接影響；該工具擁有面向模型的 `lsp` schema、提示詞指引與渲染結果，本注冊表自身不貢獻提示詞或 schema。

#### KV Cache 影響

不會直接失效；請求前綴變更由 `dsh-tool-lsp` 負責。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制定義 seam 當前的范圍。它們是包約束，不是任務積壓。

- **同一運行時內擴展名歸屬互斥**——兩個提供方不能同時聲明 `.ts`，即使 language id 不同；重疊會使注冊失敗。預期擴展是在注冊之上增加部署配置的 selector，它可以在不把提供方選擇加入模型輸入的前提下放寬互斥保留。
- **僅四種只讀操作**——symbol 與 call hierarchy 因需要不同 schema 而推遲；diagnostics 需要獨立的新鮮度與累積規則；修改（重命名、code action、格式化）需要獨立工具，并集成預覽、權限與寫入策略。
- **沒有觀測表層**——可用性只能通過運行 `query()` 并按拋出的 `LspError` code 路由來觀測；沒有提供方變更事件或能力狀態查詢。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
