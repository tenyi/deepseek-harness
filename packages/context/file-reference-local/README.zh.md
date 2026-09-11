---
description: "面向用戶與維護者的本地工作區 @file 補全提供方，用于啟用、調整規模或排查 ctx.fileReferences 的發現能力。"
kind: "package-reference"
---

# @deepseek-ai/dsh-file-reference-local

[English](README.md) | 中文

## 概述

agent（智能體）及宿主 UI 可以用各 agent 本地工作區中經過排序的路徑補全 `@file` mention；有界發現讓大型倉庫也能保持響應迅速。結果會在工具活動后刷新且不會阻塞補全，并且始終不會跟隨目錄符號鏈接。當 `read` 可用時，模型還會收到關于如何理解引用路徑的穩定指引。當 `read` 使用 Harness 宿主文件系統時選擇本包；遠程或虛擬命名空間需要與之匹配的發現能力。

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

當 `@file` 補全應發現 Harness 宿主自身的文件系統——即隨附 `read` 工具所操作的命名空間——時，掛載此提供方。每個 agent 的工作區從該會話的工作目錄開始建立索引；會話沒有工作目錄時回退到宿主進程目錄。

### 啟用提供方

默認設置適合典型工作區，因此最小掛載無需任何配置：

```yaml
- name: '@deepseek-ai/dsh-file-reference-local'
  config:
    maxResults: 20
```

### 你能得到什么

在宿主 UI 中輸入 `@` 會為指定 agent 返回至多 `maxResults` 個排序路徑候選。包含 `/` 的查詢直接列出匹配目錄的條目；裸查詢對有界遞歸索引做模糊排序。目錄候選以尾斜杠保持 mention 開放。任何工具結果之后，該 agent 的索引會被標記為陳舊：下一次查詢仍由它作答，其替代品在后臺構建，因此重建不會擋在光標前面。

### 配置

| 字段 | 默認值 | 含義 |
|---|---|---|
| `maxResults` | `20` | 單次查詢返回的排序候選最大數量 |
| `maxEntries` | `50000` | 每個 agent 工作區建立索引的文件與目錄最大數量 |
| `excludedDirectories` | `['.git', 'node_modules', 'dist', 'build', 'out', 'coverage', 'target', '.next', '.nuxt', '.turbo', '.venv', '__pycache__', '.pytest_cache', '.mypy_cache', '.gradle']` | 遍歷與候選中排除的目錄基名 |

所有數值都必須是正的安全整數，所有排除名都必須是不含 `/` 或 `\` 的非空基名。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋提供方的設計；可觀察行為見[使用本包](#use-this-package)。

### 設計理念

提供方為每個 agent 維護一個可復用的 `WorkspaceFileSearch`，以該會話的 `cwd` 為根。目錄范圍查詢（`a/b/...`）列出實時目錄狀態，裸模糊查詢共享一次有界遞歸遍歷。每個工作區僅首次裸查詢會等待該遍歷；`tool/result` 事件把已完成的條目標記為陳舊，下一次裸查詢在替代品構建期間繼續由它作答。模型指引是按 agent 的提示詞段，僅在指定 agent 擁有 `read` 工具時貢獻；agent dispose（資源釋放）時會同時釋放索引與提示詞 fiber。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | `LocalFileReferenceService`：配置校驗、按 agent 搜索、提示詞安裝 |
| [`src/search.ts`](src/search.ts) | `WorkspaceFileSearch`：遍歷、排序、排除、陳舊標記與后臺重建 |
| — | 不發布運行時不變式伴生入口；按 agent 的 index 是私有 advisory cache，其失效與 dispose 行為通過服務測試直接觀察。 |

### 主要流程

`list(agent, query, signal)` 要么列出某個目錄的條目，要么讀取共享的有界索引，對候選排序（精確、前綴、子串，再到子序列得分，目錄有加成），并按確定性順序返回至多 `maxResults` 個。`tool/result` 事件把指定 agent 的索引標記為陳舊；下一次裸查詢仍從舊索引返回結果，同時在后臺構建替代索引。不可讀或已排除的子目錄不貢獻候選，而不可讀的根目錄則讓該次遍歷失敗：一次瞬時故障不得用空索引覆蓋仍然有效的條目。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

包級約定不夠用時閱讀以下頁面。它們從本提供方所實現的 seam 進入其候選所指向的工具。

- [文件引用 seam](../file-reference/README.zh.md)——本提供方所實現的服務約定與 `@file` 語法。
- [會話引用子系統](../../../docs/subsystems/session-reference.zh.md)——宿主 UI 背后的共享文件引用約定。
- [文件系統工具目錄](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-fs)——發現能力必須匹配其命名空間的 `read` 工具。
- [上下文組地圖](../README.zh.md)——相鄰的請求上下文包。

-----

<a id="model-experience"></a>
## 模型體驗

### `read` 可用時的文件引用指引

#### 模型看到的內容

當指定 agent 有實際生效的 `read` 工具時，提供方會貢獻以下穩定的系統提示詞段：

##### 文件引用指令

```markdown
Tokens prefixed with @ are workspace paths the user explicitly referenced, relative to the workspace root. A trailing slash marks a directory: list it when its contents matter. Anything else is a file: use the read tool when its contents are needed, and do not claim to have inspected it before reading. @"..." quotes a path containing spaces.
```

#### Token 影響

該影響有條件且固定：只要 `read` 對指定 agent 可見，這一句就會存在；候選查詢本身不增加 token，所選路徑只會貢獻普通用戶消息中的對應字符。

#### KV Cache 影響

該穩定句子會加入系統提示詞前綴。掛載或移除此提供方，或者改變 `read` 是否可見，都會改變該前綴；查詢、候選項和索引陳舊標記不會改變前綴。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明該提供方何時不合適。它們是當前包約束。

- **宿主本地命名空間**：提供方掃描 Harness 宿主的文件系統，因此遠程或虛擬 `read` 實現需要使用命名空間與該工具一致的提供方。
- **有界的提示性索引**：超大型工作區可能省略 `maxEntries` 之后的路徑；被排除或無法讀取的目錄不會出現。默認排除項只列沒有任何生態用作源碼目錄的構建產物；`lib` 被刻意排除在外，因此構建進 `lib` 的工作區需通過 `excludedDirectories` 自行加上。
- **一次失效的陳舊窗口**：緊接工具結果之后的裸查詢反映的是上一次遍歷時的目錄樹；下一次查詢才看到重建結果。
- **沒有忽略文件語義**：`.gitignore` 和其他項目忽略文件不會影響發現；系統只排除已配置的目錄基名。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
