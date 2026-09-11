---
description: "`ctx.fs` 的宿主文件系統后端：面向選擇或排查本地文件訪問的部署方與維護者。"
kind: "package-reference"
---

# @deepseek-ai/dsh-fs-local

[English](README.md) | 中文

## 概述

使用 `dsh-fs-local` 可在宿主文件系統上讀取、列出、原子寫入和編輯文件。相對路徑從可配置的基準目錄解析，而絕對路徑和父目錄遍歷不受限制。到達同一文件的路徑和符號鏈接共享一個身份。寫入保留文件權限，可選版本防護會拒絕陳舊覆蓋。直接訪問宿主文件時選擇本包；需要約束變更時使用 `fs-sandbox`，文件位于遠程執行世界時使用 `fs-e2b`。

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

當組合需要由真實宿主文件系統支撐的 `ctx.fs`、且可以接受進程本地實現時，掛載此后端。常用路徑是顯式的：加載后端、給出基準目錄，然后面向模型的工具（`dsh-tool-fs`）或你自己的插件即可讀取、寫入和編輯文件。

### 何時選擇

在單個進程中進行普通宿主文件訪問時，請選擇 `fs-local`。會話的寫入與編輯必須限制在工作區與臨時根目錄內時，選擇 [`fs-sandbox`](../fs-sandbox/README.zh.md)——它擴展此后端，只增加模式圍欄。文件必須位于與子進程共享的遠程執行世界時，選擇 [`fs-e2b`](../../e2b/fs-e2b/README.zh.md)。`config.cwd` 只是解析默認值，不是約束邊界：絕對路徑與 `..` 都可以逃逸它。

### 最小配置

加載后端并給出基準目錄；相對路徑以它為基準解析，絕對路徑忽略它。

```yaml
- name: '@deepseek-ai/dsh-fs-local'
  config:
    cwd: /absolute/path/to/workspace
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `cwd` | `process.cwd()` | 相對路徑的基準目錄 |
| `diffBasisMaxBytes` | `10 MiB` | 每次覆寫 diff 一側的 UTF-8 字節上限；更大的覆寫返回 `before: null` |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-fs-local)完整列出了所有受支持字段及其 JSDoc。

### 你能做什么

完整或流式讀取任意普通 UTF-8 文本文件，按你選擇的上限或按字節窗口讀取原始字節，并按穩定名稱順序列出一層目錄。原子地創建或替換文件，并原子地應用字面量文本編輯；兩個變更操作都按文件串行化，并發寫入方絕不會交錯。版本防護是可選的：省略它即無條件創建或覆蓋，提供它則在文件自上次觀察以來發生變化時失敗。

失敗是攜帶穩定錯誤碼的類型化 `FsError`——`FS_NOT_FOUND`、`FS_NOT_TEXT`（二進制內容）、`FS_STALE_VERSION`（自觀察以來已變化）、`FS_EDIT_NOT_FOUND` 或 `FS_AMBIGUOUS_EDIT`（無唯一字面量匹配）等——因此調用方依據錯誤碼分支，絕不解析消息文本。編輯遇到缺失目標時，無論是否提供版本防護，都報告 `FS_STALE_VERSION`。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋本地后端背后的設計決策，并指出實現它們的代碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

后端建立在三個想法之上：

- **Realpath 身份。** `targetKey` 是文件的 `realpath`，因此經符號鏈接到達同一文件的兩個輸入路徑共享一個身份，寫入落在鏈接目標上，同時保留鏈接。
- **原子發布。** 寫入先寫入目標旁私有暫存目錄內的獨占臨時文件，執行 fsync 后發布；現有文件的 mode 會保留，Windows 上的 DACL 在替換后也會保留。
- **單一變更臨界區。** 每目標 FIFO 鎖串行化讀取→防護→寫入窗口，并發寫入與編輯因此被確定性排序——一方勝出，其余操作看到新版本后因版本陳舊而被拒絕。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 服務接線：`LocalFileSystem`、`Config`、每目標變更鎖 |
| [`src/fsio.ts`](src/fsio.ts) | 不依賴 Cordis 的原始 I/O：探測、讀取、原子寫入、字面量編輯、行尾處理 |
| [`src/win32.ts`](src/win32.ts) | 原子替換的 Windows 專屬 DACL 保留 |

### 寫入路徑

每次寫入先探測目標、執行可選防護（`createIfAbsent` 或 `replaceIfVersion`）、在兩側都足夠小時捕獲有界的 `before` diff 基礎、把新內容暫存到目標旁、fsync，然后原子發布。帶防護的創建使用絕不替換并發創建者的硬鏈接發布，并以 `FS_NOT_OBSERVED` 拒絕它。

### 編輯路徑

每次編輯先探測、在字面量匹配前校驗版本防護（陳舊編輯因此報告 `FS_STALE_VERSION`，絕不會給出誤導性的無匹配）、讀取文件、以 LF 規范化執行字面量替換、恢復文件主要的行尾風格，然后重新發布——全部在每目標鎖內完成。

### 歸屬與不變式

原始 I/O 不依賴 Cordis，在 `src/fsio.ts` 中獨立單元測試；`src/index.ts` 保持為輕量接線。`config.cwd` 只是解析默認值——約束是 `fs-sandbox` 或 `tools/execute` 權限插件的工作。取消是盡力而為的 `AbortSignal`，在每次異步探測前后檢查。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從約定逐步進入相鄰的后端、工具與策略。

- [文件系統子系統](../../../docs/subsystems/filesystem.zh.md)——窮盡式提供方約定、策略事件與錯誤分類體系。
- [dsh-fs](../fs/README.zh.md)——本后端實現的 `ctx.fs` 約定。
- [fs-sandbox](../fs-sandbox/README.zh.md)——擴展本后端的沙箱強制后端。
- [tool-fs](../tool-fs/README.zh.md)——消費 `ctx.fs` 的面向模型工具。
- [fs-observation-policy](../fs-observation-policy/README.zh.md)——通過 `fs/*` 事件防護變更的策略插件。
- [Windows DACL 保留筆記](../../../.agents/notes/archived/bug-fix/2026-07-19-windows-atomic-write-dacl-preservation.md)——原子替換為何復制目標的訪問策略。

-----

<a id="model-experience"></a>
## 模型體驗

通過 `dsh-tool-fs` 間接產生影響；該消費方把本提供方帶行窗口的 UTF-8 內容、變更確認與提供方消息原文渲染為有保留上限的結果，而版本、原子寫入機制與目錄元數據仍屬內部細節。

#### KV Cache 影響

不會直接使緩存失效；具名消費方負責請求前綴的任何變化。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本地后端何時不合適，或何時需要特別的運維注意。它們是當前包約束，不是通用文件系統對比或任務積壓。

- **`config.cwd` 不是沙箱**：它是解析默認值，而非約束；絕對路徑和 `..` 可以逃逸。請使用更嚴格的 `ctx.fs` 后端或 `tools/execute` waterfall（瀑布式事件）上的權限插件實施約束。
- **版本 token 依賴文件系統元數據**：它們組合設備、inode、大小、納秒級 mtime 與納秒級 ctime；如果存儲層在重寫時無法更新其中任何一項事實，仍可能繞過陳舊防護。
- **`editText` 會把整個文件及編輯后的副本保存在內存中**：只有讀取路徑支持流式處理。
- **低于上限的覆寫仍會緩沖上下文基礎**：`writeText` 除調用方持有的替換內容外，最多還會保留略低于 `config.diffBasisMaxBytes` 的舊文本；該上限不限制返回的 `after` 值，也不限制整文件展示回退。
- **二進制檢測不對稱**：讀取只對前 8192 字節執行 NUL 采樣，編輯則掃描整個 buffer，因此 NUL 出現在后部的文件可以讀取，但編輯會被拒絕。
- **每目標變更鎖僅限進程內**：即使跨進程，帶防護的創建仍采用原子且不替換的發布方式；但只有當可選版本防護觀察到元數據變化時，系統才能發現其他進程中的替換寫入方，且絕不會將其串行化。
- **帶防護的創建要求支持硬鏈接**：拒絕硬鏈接發布的文件系統或掛載點無法支持 `createIfAbsent`；后端會使目標保持缺失狀態并報告 `FS_IO_ERROR`。
- **提交后清理采用盡力而為語義**：如果移除僅所有者可訪問的暫存目錄失敗，成功發布仍視為成功，并留下私有殘留供運維人員后續清理。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。本包沒有獨立事件序列或可變數據關系，相關約定在所屬 seam 強制執行。
