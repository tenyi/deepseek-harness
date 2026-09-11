---
description: "面向模型的 glob 與 grep 發現工具：供組合或排查 agent（智能體）工作區搜索的用戶與維護者使用。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-fs-search

[English](README.md) | 中文

## 概述

使用 `dsh-tool-fs-search` 為模型提供本地工作區中的 `glob` 文件發現與 `grep` 內容搜索。搜索無需在宿主上安裝 `rg`，也無需文件系統提供方；結果相對于工作目錄，并包含隱藏與忽略文件但排除 VCS 元數據。可配置上限約束內聯輸出；掛載可選 spill 存儲后，達到上限的結果仍可完整恢復。若需讀取、寫入或編輯文件，請選擇同級 `dsh-tool-fs` 包。

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

在 `ctx.subprocess` 后端之后掛載工具；無需宿主 `rg` 安裝，也無需文件系統提供方。模型隨后獲得按修改時間排序的文件發現與按行組織的內容搜索，兩者都有界并受超時防護。

### 最小組合

一個子進程后端，然后是工具；spill 后端為可選，使達到上限的結果可完整恢復。

```yaml
- name: '@deepseek-ai/dsh-subprocess-local'
- name: '@deepseek-ai/dsh-tool-fs-search'
  config:
    sampleOverCapGlobResults: false
- name: '@deepseek-ai/dsh-spill-local'
```

`sampleOverCapGlobResults` 是必填項且沒有回退值：部署必須顯式選擇超過上限時的排序約定。格式化 spill 成功時，兩種模式都會在 spill 產物中保留完整排序列表。

### 工具

| 工具 | 參數 | 行為 |
|---|---|---|
| `glob` | `pattern`、`path?` | 查找路徑匹配 glob 模式的文件，包含隱藏與忽略文件但排除 VCS 元數據；不含 `/` 的模式匹配任意深度的基名，因此 `*` 匹配整棵樹；完整結果保持按修改時間排序 |
| `grep` | `pattern`、`path?`、`include?` | 用 ripgrep 正則搜索文件內容，并按文件分組返回 `Line N: <preview>` 匹配；`include` 是一個正向 glob 過濾器，逗號分隔列表與否定值會被前置拒絕 |

常規預算不進入面向模型的 schema：需要周邊上下文的模型用 `read` 讀取匹配文件，需要后續結果的模型遵循返回的 spill locator 檢索提示。

### 配置

`sampleOverCapGlobResults` 為必填；其余鍵是可選的搜索上限，默認值如下。

| 鍵 | 默認值 | 含義 |
|---|---|---|
| `sampleOverCapGlobResults` | 無（必填） | `true` 在頂層條目之間對超過上限的 `glob` 頁面采樣；`false` 保留按修改時間排序的前部 |
| `globMaxResults` | `100` | 一次 `glob` 調用內聯展示的最大路徑數 |
| `grepMaxMatches` | `250` | 一次 `grep` 調用內聯保留的最大平鋪匹配數；后續匹配寫入格式化 spill 產物 |
| `grepMaxLineBytes` | `2000` | 每條匹配行預覽的字節上限，保留 UTF-8 邊界 |
| `rawOutputMaxBytes` | `20000000` | 搜索將解析的完整原始 `rg` stdout 上限；更大的原始輸出以 `SEARCH_RAW_OUTPUT_OVERFLOW` 失敗 |
| `timeoutMs` | `30000` | 附加到兩個工具的協作式工具調用預算，通過 `exec.signal` 強制執行 |
| `graceMs` | `3000` | subprocess seam 在 `timeoutMs` 之外授予的終止升級寬限期 |
| `stderrMaxBytes` | `65536` | `rg` stderr 的診斷尾部預算 |
| `searchMetaMaxBytes` | `65536` | 一次搜索序列化 `presentationMeta` 的字節上限；超出部分丟棄尾部的組/路徑 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-fs-search)是每個受支持字段及其 JSDoc 的窮盡式真源。

### 部署要求

Node 部署在受支持的 macOS、Linux 與 Windows 目標上獲得 `@vscode/ripgrep` 平臺包；Python SDK 的 wheel 包把目標原生二進制復制到單文件運行時旁，作為 `-rg` 伴隨文件。兩種載體均不要求宿主安裝 `rg`。返回路徑相對于解析后的工作目錄顯示（有會話 cwd 時使用會話 cwd），只有該工作目錄與文件系統根目錄是同一工作區時，才能用 `read` 繼續讀取。

### 失敗與恢復

搜索失敗攜帶本包定義的錯誤碼：`SEARCH_INVALID_PATTERN`（ripgrep 拒絕正則或 glob）、`SEARCH_FAILED`（啟動失敗、目標不可訪問、信號終止或 `--json` 輸出格式錯誤）、`SEARCH_RAW_OUTPUT_OVERFLOW`（原始輸出超過上限）與 `SEARCH_ABORTED`（協作式超時或調用方取消）。退出 0 表示成功且有結果，退出 1 表示成功的空搜索；模型參數錯誤仍是普通工具參數錯誤。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋搜索工具背后的設計決策，并指出實現它們的代碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

本地工作區發現天然是由進程支持的 `rg` 工作流；如果把搜索放到 `ctx.fs` 上，就會迫使每個文件系統后端擴展搜索 API。subprocess seam 負責 spawn 執行、進程樹終止、環境清理與有界輸出捕獲；本包負責 schema、參數校驗、argv 構造、解析、保留、格式化結果 spill 與超時聲明。工具絕不暴露后臺任務——只有在 `rg` 退出、被協作式超時終止、被中止或失敗后，調用才會返回。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`Config`、工具組合、上限校驗 |
| [`src/glob.ts`](src/glob.ts) | `glob` schema、argv、解析、內聯采樣、格式化 |
| [`src/grep.ts`](src/grep.ts) | `grep` schema、argv、`--json` 解析、預覽保留、格式化 |
| [`src/search-core.ts`](src/search-core.ts) | 共享 spawn 助手、`SEARCH_*` 錯誤、spill 交接、工作目錄相對展示 |
| [`src/presentation.ts`](src/presentation.ts) | 搜索卡片元數據投影 |
| [`src/direct-call.ts`](src/direct-call.ts) | spill 后處理的直接調用結果接受 |

### 搜索如何運行

每次調用解析打包二進制（`@vscode/ripgrep`，或 pkg 單文件運行時中可執行程序的 `-rg` 伴隨文件），前置 `--no-config`，使宿主的 `RIPGREP_CONFIG_PATH` 無法向不受約束的 spawn 注入 `--pre` 預處理器，并把每個模型控制的值作為普通 argv 元素傳入——不存在 shell 層，因此不涉及 shell 引號處理。collect 模式預算限制完整 stdout 與 stderr 尾部；lossy stdout 讀取以 `SEARCH_RAW_OUTPUT_OVERFLOW` 失敗，而不是解析靜默不完整的流。工具從不讀取原始 spill 路徑。

### 兩類預算、兩類產物

原始 stdout 與 stderr 是內部傳輸細節；工具始終把完整結果收集到內存中，只有內聯頁面設有上限。當調用產生超過內聯上限的邏輯結果時，盡力而為的 spill 會把完整格式化預覽保存到 spill 存儲，頁面攜帶其 locator；完整值不會進入模型上下文的分派則跳過 spill。spill 缺失或失敗時保留內聯頁面，并報告完整結果無法保存——絕不會成為錯誤。收集與 spill 交接位于 `src/search-core.ts` 與 `src/presentation.ts`。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從工具逐步進入 subprocess seam、spill 存儲與文件系統家族。

- [文件系統子系統](../../../docs/subsystems/filesystem.zh.md)——窮盡式提供方約定、策略事件與錯誤分類體系。
- [tool-fs](../tool-fs/README.zh.md)——用于后續讀取的同級 `read`/`write`/`edit` 工具。
- [子進程能力](../../../docs/subsystems/subprocess.zh.md)——這些工具執行所經由的 spawn seam。
- [Spill 存儲](../../spill/spill/README.zh.md)——使達到上限結果可完整恢復的可選后端。
- [超時工具](../../util/timeout/README.zh.md)——終止寬限期的 `MAX_TIMER_DELAY_MS` 上限。
- [生成工具目錄](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-fs-search)——本包注冊的窮盡式 schema。

-----

<a id="model-experience"></a>
## 模型體驗

### 系統提示詞

#### 模型看到的內容

組裝時，每個段落通過 `ctx.tools.get(name, scope)` 檢查對應工具，僅在其可見時輸出。grep 段落僅在 read 可見時包含后續使用 read 的句子。同一受支持工具集合下，原文和段落順序保持不變，包括通過 `run_code` 暴露的 PTC 能力。 這種按 scope 選擇文本的機制適用于系統提示詞段落。工具 schema 描述仍是注冊時的文本；具體而言，即使 scope 隱藏了 read，grep 的 schema 仍會推薦 read。尚未實現按 scope 改變 schema 措辭。

##### 啟用 `sampleOverCapGlobResults: true` 時的 Glob 指導

```markdown
Use the glob tool — not shell find — to discover files by path pattern. A pattern with no "/" matches basenames at any depth, so "*" matches every file in the tree rather than its top level. Results are files only, never directories, and include hidden and ignored files: a result that fits comes back in modification-time order, while a larger one is sampled across top-level entries, so it spans the tree instead of one subtree.
```

##### 啟用 `sampleOverCapGlobResults: false` 時的 Glob 指導

```markdown
Use the glob tool — not shell find — to discover files by path pattern. A pattern with no "/" matches basenames at any depth, so "*" matches every file in the tree rather than its top level. Results are files only, never directories, and include hidden and ignored files: a result that fits comes back in modification-time order, while a larger one keeps the modification-time-ordered head.
```

##### Grep 指導

```markdown
Use the grep tool — not shell grep or rg — to search file contents. Use read on a matched file when you need surrounding context.
```

#### Token 影響

指導成本取決于可見工具；必填的采樣選擇決定采用哪一個 glob 變體。

#### KV Cache 影響

可見工具集合、插件作用域、采樣選擇與指導文本不變時前綴穩定。限制、激活、dispose（資源釋放）或改變選擇可能從首個變化的段落開始使復用失效。

### 工具 schema

#### 模型看到的內容

glob 描述聲明了配置的超過上限排序方式。生成的 [`glob` 和 `grep` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-fs-search) 使用 `sampleOverCapGlobResults: true`；工具無條件注冊。

#### Token 影響

工具可見時每個請求有固定的 schema 成本。

#### KV Cache 影響

工具可見性與定義不變時前綴穩定。注冊生命周期或作用域限制可能從第一個改變的 schema token 起使復用失效。

### 結果與 spill 提示

#### 模型看到的內容

`glob` 每行返回一個路徑；`grep` 在每個路徑下分組展示 `Line <line>: <preview>` 匹配。空搜索返回 `No files found` 或 `No matches found`。達到上限的結果以省略計數結尾，并附 spill locator 與后端檢索提示，或說明完整結果無法保存。啟用 `sampleOverCapGlobResults: true` 時，超過上限的 `glob` 頁面按實際搜索根正下方的條目輪轉取路徑，頁腳說明采樣依據及其覆蓋的頂層條目數；`false` 時頁面是按修改時間排序的前部，并保留普通的上限結果頁腳。spill 產物始終持有按修改時間排序的完整列表。

#### Token 影響

內聯路徑與匹配受 `globMaxResults`、`grepMaxMatches` 與 `grepMaxLineBytes` 約束；調用及其保留結果在壓縮（compaction）前留在歷史中。

#### KV Cache 影響

僅追加；新可見內容跟在可復用請求前綴之后，不會使既有 KV Cache 條目失效。

### 工具錯誤

#### 模型看到的內容

失敗被規范化為 `Error: <message>`，并攜帶結構化 `SEARCH_INVALID_PATTERN`、`SEARCH_FAILED`、`SEARCH_RAW_OUTPUT_OVERFLOW` 或 `SEARCH_ABORTED` 元數據供調用方使用。

#### Token 影響

只有失敗的調用會增加這些保留 token。

#### KV Cache 影響

僅追加；新可見內容跟在可復用請求前綴之后，不會使既有 KV Cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明搜索工具何時不合適，或何時需要特別的運維注意。它們是當前包約束，不是通用搜索對比或任務積壓。

- **搜索與文件訪問沒有共享工作區證明**——只有當工作目錄與文件系統根目錄指向同一工作區時，返回路徑才可繼續讀取；本包不執行運行時跨服務校驗。
- **打包二進制固定在依賴版本上**——Node 部署使用 `@vscode/ripgrep` 選擇的版本；Python 單文件運行時將對應目標的原生版本復制為必需的 `-rg` 伴隨文件。不支持的平臺或損壞的安裝會以 `SEARCH_FAILED` 使調用失敗，Python 運行時包則會在啟動前拒絕缺少伴隨文件的安裝。遠程或虛擬文件系統需要共置的工作區或另一個搜索消費方。
- **schema 只暴露一個有界頁面**——偏移分頁、大小寫開關、替代輸出模式與提供方支撐的發現仍不在本包范圍內；達到上限的完整輸出需要 spill 后端。
- **啟用采樣時僅按搜索根正下方的第一段路徑分組**——超過上限的 `glob` 頁面在這些頂層條目之間平衡，因此集中在更深處的結果在該層級之下仍會呈現不均；遞歸平衡被延期。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。這個面向模型的適配器沒有獨立生命周期流；執行關系由它調用的能力 seam 負責。
