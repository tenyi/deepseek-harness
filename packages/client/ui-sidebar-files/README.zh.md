---
description: "dsh Web 客戶端右側 Sidebar 的文件樹 tab 類型：通過網絡逐層列出會話工作區根目錄，按資源地址把文件打開到 Sidebar。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sidebar-files

[English](README.md) | 中文

## 概述

右側 Sidebar 的導航器 tab 類型：把會話的工作區根目錄畫成一棵樹，逐層經線上列出，并把文件打開到 Sidebar 里。它是從引導頁進入的頁類型，不認領任何地址；它按地址打開文件，交給 `dsh-resource://file` 的查看器認領：`ui-sidebar-right` 里沒有任何東西認識本包。

## 目錄

- [注冊了什么](#what-it-registers)
- [樹](#the-tree)
- [模型體驗](#model-experience)
- [已知限制與暫緩事項](#known-limitations-and-deferred-work)
- [開發備注](#dev-note)

-----

<a id="what-it-registers"></a>
## 注冊了什么

- **類型**：`ctx.sidebarRightTabs.register(...)`，kind 為 `files`，id 為 `@deepseek-ai/dsh-client-ui-sidebar-files`，檔位 `builtin`，沒有 patterns，另有一個打開該類型的引導頁入口（order 10，標題與描述取自 `sidebarFiles` 命名空間，圖標是共享的文件夾圖標）。
- **正文**：以該 id 為鍵的 `sidebar.right.pane.tab` slot：strip 下的一行標題行，然后是樹。標題行與文檔預覽（`ui-sidebar-documentpreview`）的相同：根路徑，目錄部分灰色、最后一段正色，從不省略號截斷（比行寬的路徑保留末尾、淡出開頭），右端是它唯一的控件、重新讀取。這一行是復制而非共享，因為插件 bundle 只經平臺模塊共享運行時代碼；待 artifact 與各 slot 的形態定下來后，可以在 `ui-primitives` 放一份供每個 pane 標題行使用。
- **標簽頁標題**：以該 id 為鍵的 `sidebar.right.pane.tab.title` slot：類型標簽前的一枚 16px 共享 `FileTypeIcon` 文件夾圖標。樹本身的行不畫這枚圖標。

`src/client/` 下七個源文件：`definition.tsx`（類型是什么）、`store.ts`（它保存什么）、`face.ts`（它如何列目錄，含 Remote 綁定）、`FilesBody.tsx`（它畫什么，含排序與失敗行兩個輔助函數）、`FilesTitle.tsx`（標簽頁標題）、`locales.ts`（它說什么）、`index.ts`（接線）。

<a id="the-tree"></a>
## 樹

根是會話的工作目錄，讀自 `useSessions().byId[sessionId].cwd`，標題行里的拆分由 `@deepseek-ai/dsh-util-workspace-path` 的 `pathPartsOf` 給出。每一層以絕對路徑為鍵；子路徑是父路徑以 `/` 拼上條目名。一層在首次展開時經 `@deepseek-ai/dsh-api-workspace-files` 命名空間的 `remote.workspaceFiles.list(sessionId, absolutePath)` 列出；適配器保留列表的條目與截斷標志，丟棄其工作區相對路徑。行序為目錄優先，其后按自然序、不分大小寫的名稱排列；dotfiles 與其他條目一樣顯示。

| 條目類型 | 行 |
|---|---|
| `directory` | 切換展開與折疊；該層在首次打開時拉取，折疊期間保留。 |
| `file` | 經 `useTabInfo().tab.actions.openResource` 打開 `dsh-resource://file/session/<sessionId>/<encoded path relative to the root>`，地址由 `@deepseek-ai/dsh-util-workspace-path` 的 `fileAddressFor` 從條目的絕對路徑與樹的根生成，落在該 tab 自己的 pane 里。 |
| `other` | 灰顯且不可點擊，從而完整呈現目錄內容。 |

被端點條目上限截斷的層以一條標記收尾；空層如實說明；失敗的層按錯誤碼各顯示一行（`workspace-file/not-found`、`outside-workspace`、`not-directory`），其他情況顯示傳輸層自己的消息。重新讀取丟棄所有已列出的層并只對展開中的層重新請求；折疊的層在下次打開時重新拉取。沒有工作目錄的會話只顯示一行說明，而不是樹。

狀態保存在類型自己的存儲里，按 tab id 分桶：`root`、`levels`（每個絕對路徑的 loading / ready / failed）與 `expanded`。owner 的 `signal` 終結一個桶：中止時忘掉該 tab，其后才結算的列表什么也不寫。

<a id="model-experience"></a>
## 模型體驗

無，因為本包在瀏覽器里繪制工作區文件樹，不注冊任何面向模型的內容。

#### KV Cache 影響

無；目錄列表經 Remote 傳輸，不會組裝模型請求。

## 已知限制與暫緩事項

<a id="known-limitations-and-deferred-work"></a>
- **只有列目錄。**沒有搜索、產物過濾、拖拽、重命名、右鍵菜單、當前文件高亮或文件系統監聽；一層只會因重新讀取而變化。
- **只有一個根。**樹以會話工作目錄為根；沒有辦法瀏覽到它之上，而 Host 本來也拒絕工作區根之外的路徑。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者工作上下文——點擊展開</summary>

無。

</details>

**運行時不變量：** 不發布 companion。樹唯一的運行時狀態是每 tab 一份的 Slot store，由持有它的正文寫入、隨 tab 的中止信號忘掉；沒有第二個觀測源可與之比對。
