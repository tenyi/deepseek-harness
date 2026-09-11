---
description: "`ctx.fs` 文件系統服務約定：面向選擇或掛載文件系統后端的部署方，以及實現后端的開發者。"
kind: "package-reference"
---

# @deepseek-ai/dsh-fs

[English](README.md) | 中文

## 概述

應用需要在宿主、受限或遠程執行環境中使用一致的文件系統操作時，選擇 `dsh-fs`。消費方可以解析穩定的文件身份、在受支持時映射共享宿主文件、執行有界的文本與字節讀取、列出目錄，并原子地寫入文本及執行字面量編輯。版本防護是可選的，因此后端無需策略強制也能工作；調用方可以提供防護，在文件變化后拒絕變更。根據所需執行環境選擇 `fs-local`、`fs-sandbox` 或 `fs-e2b`。面向模型的文件系統工具由 `dsh-tool-fs` 單獨提供。

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

你很少直接加載 `dsh-fs`：你掛載一個注冊為 `ctx.fs` 的后端，然后從自己的插件調用該服務，或讓 `dsh-tool-fs` 工具替你調用。本頁服務于確實接觸它的兩類讀者——選擇后端的部署方，以及實現或消費該約定的開發者。

### 選擇并掛載后端

普通宿主文件選擇 [`fs-local`](../fs-local/README.zh.md)，會話變更必須限制在工作區與臨時根目錄內時選擇 [`fs-sandbox`](../fs-sandbox/README.zh.md)，文件狀態必須位于遠程執行世界時選擇 [`fs-e2b`](../../e2b/fs-e2b/README.zh.md)。掛載任一后端都會填充 `ctx.fs`；更換后端不會改變策略插件、工具或工具 schema。未掛載任何后端的組合就沒有 `ctx.fs`，工具會在注冊時失敗。

### 服務能做什么

通過 `ctx.fs`，你可以把任意路徑解析為穩定的目標身份、完整讀取或分片流式讀取文本文件、按顯式上限讀取原始字節、列出一層目錄、原子地創建或替換文件，并原子地應用字面量文本編輯。兩個變更操作上的版本防護都是可選的：省略它即無條件創建或覆蓋，提供它則在文件自上次觀察以來發生變化時失敗。每個操作要么返回數據，要么拋出攜帶穩定錯誤碼（如 `FS_NOT_FOUND`、`FS_STALE_VERSION`、`FS_AMBIGUOUS_EDIT`）的類型化 `FsError`，調用方依據錯誤碼分支，絕不解析消息文本。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋約定背后的設計決策，并指出實現它們的代碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

該約定建立在一個分離與三項承諾之上：

- **約定高于機制。** 服務只命名存儲層能做什么——解析、stat、讀取、列出、寫入、編輯——絕不規定如何存儲字節。后端擁有目標身份、執行世界坐標、解碼、二進制拒絕與原子性。
- **策略不放在基類上。** 已觀察狀態、編輯前讀取與版本防護的變更是插件（`dsh-fs-observation-policy`）的職責，通過提供可選防護來添加——因此沙箱化或遠程后端不會繼承任何面向模型的觀察策略。
- **`editText` 留在 seam 上。** 版本校驗、字面量匹配與原子重寫共享同一個臨界區，錯誤歸因與一方勝出/一方陳舊的并發語義因此保持正確；遠程后端也可以將其實現為原生比較并編輯操作。
- **界限制在此 seam 上。** `readBytes` 要求 `maxBytes`，并以 `FS_TOO_LARGE` 失敗而不是截斷，因此任何后端都不會無界緩沖文件。`readByteRange` 則以窗口為界：后端最多傳輸所請求的 `length` 字節（外加為到達 `offset` 而跳過的前綴），因此由調用方對 `length` 的上限承擔防護。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 服務定義：抽象 `FileSystem` 類、`ctx.fs` 聲明與 `fs/*` 事件詞匯 |
| [`src/types.ts`](src/types.ts) | 詞匯：`FsTarget`/`FsTargetKey`、`FsVersion`、`FsObservation`、`FsWriteIntent`、`FsError` 及其錯誤碼 |

### 調用流程

每個普通操作都以 `resolve(path, { cwd })` 開始，它產生穩定的 `FsTarget`（不透明 `targetKey` 加用于模型/UI 輸出的 `displayPath`）；經不同路徑到達同一文件會產生相同 key。`processPathFromHostPath(hostPath)` 在后端共享或顯式映射宿主文件時，單獨把絕對宿主文件映射進此執行世界，否則返回 `undefined`。讀取隨后執行 `stat` → `readText`/`streamText`/`readBytes`/`readByteRange`，列出執行 `listDir`，變更則經過每個目標一個臨界區：先檢查可選防護，應用新內容，再原子發布結果。

### `fs/*` 策略事件

本包聲明三個事件，使發出方（`dsh-tool-fs`）與策略監聽器（`dsh-fs-observation-policy`）共享詞匯，而無需讓發出方依賴策略插件。`fs/write-intent` 與 `fs/edit-intent` 是單槽決策 waterfall（瀑布式事件）：第一個監聽器直接決策，絕不調用 `next()`。`fs/observed` 是發后即忘的記錄事件，攜帶 `FsObservation`——存在并帶版本，或確認缺失。事件只攜帶 `dsh-fs` 詞匯和一個不透明 `object` 參與者。

### 不變式

- `targetKey` 與 `version` 是帶品牌的不透明 id：消費方不得解析或解釋它們；只有 `displayPath` 用于模型/UI 輸出。
- 失敗是攜帶穩定錯誤碼的類型化 `FsError`，絕不是臨時拼寫的消息字符串。
- 該 seam 不設 I/O deadline；取消是每個原語上可選的 `AbortSignal`。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從窮盡式約定逐步進入構建于其上的后端與消費方。

- [文件系統子系統](../../../docs/subsystems/filesystem.zh.md)——窮盡式提供方約定、策略事件與錯誤分類體系。
- [fs-local](../fs-local/README.zh.md)——實現該約定的宿主文件系統后端。
- [fs-sandbox](../fs-sandbox/README.zh.md)——實現該約定的沙箱強制后端。
- [tool-fs](../tool-fs/README.zh.md)——消費 `ctx.fs` 的面向模型工具。
- [fs-observation-policy](../fs-observation-policy/README.zh.md)——通過 `fs/*` 事件防護變更的策略插件。
- [能力 seam 筆記](../../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.zh.md)——文件系統棧為何拆分為約定、提供方、策略與工具。

-----

<a id="model-experience"></a>
## 模型體驗

通過 `dsh-tool-fs` 間接產生影響；該消費方把提供方文本和錯誤渲染為有界且保留的文件系統工具結果。

#### KV Cache 影響

不會直接使緩存失效；具名消費方負責請求前綴的任何變化。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明該約定何時不合適，或何時需要特別的運維注意。它們是當前包約束，不是通用文件系統對比或任務積壓。

- **變更操作約定只支持文本**：文本讀取和兩個變更操作都以 `FS_NOT_TEXT` 拒絕二進制/非 UTF-8 內容；`readBytes` 與 `readByteRange` 是原始字節原語，二進制安全的變更操作仍延期。
- **只有十三個原語**：沒有刪除、重命名、復制或監視；`listDir` 只列出一層，遞歸、glob、分頁與搜索不在范圍內（見[目錄列出筆記](../../../.agents/notes/archived/architecture/2026-07-03-filesystem-directory-listing-seam.md)）。
- **沒有 I/O deadline**：該 seam 不啟動超時；取消只是每個原語上盡力而為的可選 `AbortSignal`（見[fs 能力族立場](../README.zh.md)）。
- **先解析后操作使遠程后端每次工具調用需要兩次往返**：折疊或緩存解析由這種后端自行決定。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
