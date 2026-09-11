---
description: "目錄選擇 seam 的應用內瀏覽后端：為 web GUI 宿主提供單層目錄列舉與子目錄創建，也能服務于遠程客戶端。"
kind: "package-reference"
---

# @deepseek-ai/dsh-host-directory-picker-browse

[English](README.md) | 中文

## 概述

無法觸達 OS 選擇器的用戶仍能通過 `dsh-host-directory-picker-browse` 選擇工作區目錄：它基于 Node 標準庫提供單層目錄列舉與子目錄創建，宿主屏幕上不渲染任何東西——因此它能服務原生后端無法觸及的遠程客戶端。列舉只返回目錄、按名稱排序，跟隨指向目錄的符號鏈接，并攜帶宿主判定的 `hidden` 標志；創建不遞歸，且把名稱校驗為單個路徑段。一行組合配置還會用應用內**選擇工作區目錄**對話框填滿工作區流程的目錄擴展位。

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

在遠程瀏覽器、SSH 轉發會話或無人值守宿主等無法使用 OS 選擇器的場景中，如果必須選擇工作區目錄，請組合此后端。工作區流程驅動 `directoryPicker/list` 與 `directoryPicker/createDirectory`；兩個原語都基于宿主文件系統返回結果。

### 列舉目錄

`list(path?)` 返回一個目錄層級：按名稱排序的子目錄及其絕對路徑、`hidden` 標志（POSIX 上為點前綴）、`home` 錨點，以及 `crumbs`——從根到目標的祖先鏈，其中每個 crumb 都是跳轉目標，根以完整路徑標注。不帶路徑時列舉宿主賬戶的家目錄。單次調用至多返回 `maxEntries` 行（配置項，默認 1,000——GitHub 網頁端對目錄列舉采用的同一上限），被截斷的層級會報告 `truncated: true`，供客戶端提示層級不完整。指向目錄的符號鏈接會被跟隨；斷鏈與循環鏈接被跳過。

### 創建目錄

`createDirectory(path, name)` 在既有父目錄下創建一個子目錄。它不遞歸——父目錄缺失是真實失敗，不是要補造的層級——并且拒絕任何非單個非空白路徑段的內容（`name` 不得包含分隔符，也不得為 `.` 或 `..`）。

### 可觀察的失敗

兩個原語都拒絕非完全限定的路徑——相對形態，以及 Windows 上 `isAbsolute` 會放行的無盤符有根形態（`\foo`、`/foo`）與不完整的 UNC 前綴——報 `directory-unreadable` 或 `directory-create-failed`，而不是把它解析到宿主進程工作目錄之下。創建已存在的子目錄時返回 `directory-exists`。調用方的 `AbortSignal` 會停止進行中的掃描，因此斷連或超時不會讓掃描比調用方活得更久。

### 配置

| 字段 | 默認值 | 含義 |
|---|---|---|
| `maxEntries` | `1,000` | 單個列舉層級的完整結果上限；隱藏行計入該上限 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-host-directory-picker-browse)是每個受支持字段及其 JSDoc 的窮盡式真源。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

### 設計理念

后端把單個目錄層級流式送入一個有界、按名排序的窗口，因此無論目錄有多少子項，內存都保持 O(maxEntries)：被截斷的層級保留按名排序的頭部、隱藏行計入上限、只探測窗口內候選，并報告 `truncated: true`。窗口插入為二分查找、滿窗尾部單次比較即拒絕，因此超大型層級在頭部之后的每個候選都只需 O(1)，而不是窗口掃描。

### 完全限定柵欄

`fullyQualified` 拒絕任何不指向一個與進程狀態無關的固定文件系統位置的路徑：POSIX 上要求 POSIX 絕對路徑；Windows 上只接受盤符限定（`C:\…`）或完整 UNC（`\\server\share…`）形態。無盤符有根形態與不完整 UNC 前綴能通過 `isAbsolute`，卻仍會解析到進程的當前盤符，因此后端會拒絕它們，而不是重新定位協議傳入的值。

### 中止與探測

每次等待文件系統操作時，都會通過 `raceAbort` 與調用方的信號競爭，因此停滯的網絡文件系統無法讓已離開的調用方請求繼續存活；已放棄的讀取操作即使稍后結束，其結果也會被忽略。符號鏈接的可進入性由 `stat` 探測決定——失敗即不可進入——窗口內的斷鏈符號鏈接不會從窗口外回填，因為發生過驅逐本身已把層級標記為截斷。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | `BrowseDirectoryPicker` 服務：列舉、創建、有界窗口、錯誤映射 |
| — | 不發布運行時不變式伴生入口；每次列舉或創建都是一次無狀態的文件系統往返；文件系統本身保存的狀態具有權威性。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當后端約定不夠用時閱讀以下內容：先看 seam 定義，再看決策記錄與原生替代方案。

- [目錄選擇 seam](../directory-picker/README.zh.md)——`browse` 能力約定與類型化錯誤詞匯。
- [目錄選擇能力 seam 決策](../../../.agents/notes/archived/architecture/2026-07-28-directory-picker-capability-seam.md)——列舉與創建背后的策略裁決。
- [原生后端](../directory-picker-native/README.zh.md)——面向本地操作者的 OS 選擇器替代方案。
- [自適應選擇器](../directory-picker-auto/README.zh.md)——兩個后端之間的啟動時判定。
- [生成配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-host-directory-picker-browse)——每個受支持配置字段及其源聲明。

-----

<a id="model-experience"></a>
## 模型體驗

無。GUI 宿主的目錄選擇后端不注冊任何面向模型的內容。

#### KV Cache 影響

無；該包既不組裝也不發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明瀏覽交互在何處不完整或有意不限定范圍。它們是當前包約束，不是任務積壓。

- **不讀取 Windows 隱藏屬性**——Node 的 dirent 不暴露 `FILE_ATTRIBUTE_HIDDEN`，因此在所有平臺上 `hidden` 都意味著點前綴，直到原生探測值得付出相應成本為止。
- **不枚舉盤符根**——Windows 上祖先鏈止于盤符根；跨盤依賴瀏覽器 UI 的路徑輸入入口，而不是這里的枚舉原語。
- **全盤可瀏覽**——沒有按部署限定的瀏覽根；`workspace.create` 接受任意路徑，因此這里的根會限定 UX 范圍，而不是安全邊界。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
