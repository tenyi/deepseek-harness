---
description: "面向宿主驅動 UI 的文件引用發現與 @file mention 語法，供選擇該 seam 或為其搭配提供方的用戶與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-file-reference

[English](README.md) | 中文

## 概述

宿主驅動 UI 使用 `dsh-file-reference` 提供 `@file` 補全：UI 為指定 agent（智能體）請求路徑候選，模型輸入 `@path` 或 `@"path with spaces"`，選中候選后，匹配的 mention 作為普通提示詞文本插入。seam 本身不擁有文件系統訪問——具體提供方（如 `@deepseek-ai/dsh-file-reference-local`）負責提供候選、排序、緩存與失效。選中候選絕不讀取或附帶文件內容；模型必須調用文件系統工具才能查看文件。Session Controller 通過 `fileReferences/list` Remote 向瀏覽器消費方暴露同一發現能力。

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

當宿主驅動 UI（Web 或終端）需要提供 `@file` 補全時選擇本包，并搭配一個命名空間與 agent 實際生效的 `read` 工具一致的提供方。單獨掛載該 seam 而沒有提供方時，UI 只能得到空的補全列表。

### mention 語法

輸入開頭或空白后的 `@path` token 會觸發補全；其他 token 內部的 `@`（如電子郵件地址）不會。`@"path with spaces"` 打開帶引號的 mention，目錄候選在其尾斜杠后保持引號打開，使補全可以繼續深入下一層。格式化器會拒絕含有語法無法安全表示的控制字符或內嵌引號的路徑。

### 獲取候選

`ctx.fileReferences.list(agent, query, signal)` 返回指定 agent 工作目錄中僅含路徑的文件與目錄候選，由提供方確定性地排序。目錄 mention 呈現時帶尾隨 `/`，使補全可以繼續深入下一層。瀏覽器消費方通過 Session Controller 適配器的 `ctx.remote.fileReferences.list` 調用同一發現能力；末位 signal 參數可取消慢速自動補全。

### 搭配提供方

本地文件系統請掛載 `@deepseek-ai/dsh-file-reference-local`；其他命名空間（遠程或虛擬文件系統）需要發現能力與生效工具一致的提供方。當指定 agent 可以調用 `read` 時，提供方可以安裝穩定的 `FILE_REFERENCE_PROMPT` 指引，告訴模型先讀取被引用文件、再聲稱檢查過它。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋該 seam 的設計；可觀察行為見[使用本包](#use-this-package)。

### 設計理念

本包把抽象發現服務與共享、瀏覽器安全的 mention 語法分開，由提供方負責命名空間訪問、排序、緩存與失效。該服務保持 wire 中立；`dsh-api-session-controller` 持有 `fileReferences/list` Remote 適配器，并在解析 Agent 后委派給當前提供方。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 抽象 `FileReferenceService` 與 `FILE_REFERENCE_PROMPT` |
| [`src/grammar.ts`](src/grammar.ts) | `activeAtToken` 識別與 `formatFileMention` 渲染 |
| [`src/types.ts`](src/types.ts) | 僅含路徑的結果類型 `FileReferenceCandidate` |
| — | 不發布運行時不變式伴生入口；接口不保留 candidate 或 lifecycle 狀態；具體提供方負責自己的 cache 與 invalidation 關系。 |

### 主要流程

UI 通過 `activeAtToken` 識別活動 `@` token，用查詢文本調用 `list`，再渲染排序后的候選。選中后，`formatFileMention` 發出匹配的提示詞寫法（`@path`、`@"path with spaces"`，或帶引號目錄的開放形式 `@"dir/`）。任何環節都不讀取文件內容；當指定 agent 擁有 `read` 工具時，提供方還可以安裝穩定的 `FILE_REFERENCE_PROMPT` 提示詞段。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

包級約定不夠用時閱讀以下頁面。它們從隨附提供方進入共享引用表面，以及候選所指向的工具。

- [本地文件引用提供方](../file-reference-local/README.zh.md)——本 seam 的隨附本地工作區實現。
- [會話引用子系統](../../../docs/subsystems/session-reference.zh.md)——宿主 UI 背后的共享文件引用與會話引用約定。
- [上下文組地圖](../README.zh.md)——相鄰的請求上下文包。
- [文件系統工具目錄](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-fs)——被引用路徑所對應的 `read` 工具。

-----

<a id="model-experience"></a>
## 模型體驗

間接影響模型體驗：本包的發現 seam 與語法把文件引用指引委托給組合的提供方，由它負責呈現。

#### KV Cache 影響

接口與語法本身不增加請求 token；提供方擁有的提示詞段決定可復用前綴是否改變。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明該 seam 何時不合適。它們是當前包約束。

- **路徑候選僅供參考**：該 seam 不保證后續面向模型的文件系統工具能夠訪問同一命名空間；部署時必須讓提供方與實際生效的 `read` 實現對齊。
- **沒有文件內容引用對象**：所選文件仍是普通提示詞文本，其內容必須經過模型顯式調用工具后才對模型可見。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
