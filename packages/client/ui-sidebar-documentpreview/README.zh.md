---
description: "右側 Sidebar 的文檔預覽：共享文件加載與控件，可選 Markdown、代碼、圖片、PDF 和 HTML 渲染器，并以純文本兜底。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sidebar-documentpreview

[English](README.md) | 中文

## 概述

在右側 Sidebar 預覽可讀文件，無需另開 tab 即可切換已注冊的渲染器。Markdown 和代碼接收累計文本頁；PDF、HTML 和常見圖片接收完整字節；未知文件擴展名使用純文本。tab 負責加載、文件狀態、渲染器選擇、換行和重新載入，文檔正文通過同一元數據注冊表與子 slot 注冊。Sidebar tab 的 kind 為 `text`。

## 目錄

- [注冊了什么](#what-it-registers)
- [地址](#addresses)
- [怎么讀](#how-it-reads)
- [導航](#navigation)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備注](#dev-note)

-----

<a id="what-it-registers"></a>
## 注冊了什么

- **類型** —— `ctx.sidebarRightTabs.register(...)`，id 為 `@deepseek-ai/dsh-client-ui-sidebar-documentpreview`（這個實現在 tab 系統中的身份，也是其正文注冊所用的鍵），kind `text`，pattern `dsh-resource://file/**`，檔位 `fallback`。`canOpen` 只接受 Session 地址，其中路徑可為相對或絕對路徑；不認領裸 `absolute` 地址。在 `extension` 或 `builtin` 檔以更窄 pattern（比如 `*.png`）注冊的類型接走那些地址；其他受支持文件落到這里。整個地址就是內容身份，所以不同目錄下同名的兩個文件、或同一路徑在兩個會話之下，是兩個 tab；解碼后的 basename 是 tab 標題，keyed slot `sidebar.right.pane.tab.title` 會在標題前放置按擴展名選擇的 `FileTypeIcon`。
- **正文** —— keyed slot `sidebar.right.pane.tab`，鍵為類型的 id。固定頭部在可用時顯示 Host 的絕對路徑，否則顯示請求路徑；目錄使用三級標簽色，文件名使用一級標簽色，路徑過長時保留末段并向開頭淡出，提示中仍提供完整值。下拉菜單可在匹配的渲染器與純文本間切換。僅當所選渲染器聲明 `wrap: true` 時顯示換行開關；圖標表示點擊后切換到的模式，該偏好按 tab 保存，初始開啟。重新載入仍在此頭部，不放入 Sidebar 的 tab 條。正文貼合格的每條邊，各渲染器自行提供內容留白，并可擁有內部滾動區。這與 Files tab 右側預留 2px 滾動條間距的布局有意不同：Preview 使用格的完整寬度，使貼邊 HTML 與代碼滾動區終止于格的邊緣。
- **共享加載與視圖狀態**，會話作用域、按 tab id 分桶。store 持有累計頁或完整字節、讀取與觀察版本、加載/失敗狀態、渲染器選擇、滾動位置、換行和已響應的導航 revision。普通 inject face 調用 Remote 讀取，并經聲明的 store action 寫入。重新載入和加載模式變化會淘汰舊請求；tab 的中止信號清理其狀態。

文檔實現在 `ctx.documentPreviews.register({ id, extensions, priority, title, loading, wrap? })` 注冊元數據，并以相同 `id` 向 keyed、Session 作用域的子 slot `sidebar.right.tab.document` 注冊正文。兩處注冊都由 effect 持有，通過 `ctx.slots.inject` 等待子 slot。正文接收 `resourceAddress`、準備好的 `content`、`wrap`、`scrollportRef` 和標準 `useTabInfo`/`useResource` 鉤子，不接收自定義資源加載器。擁有內部滾動元素的渲染器把 `scrollportRef` 掛到該元素上；該元素卸載后，owner 恢復使用共享正文。元數據聲明 `loading: 'text-pages'` 或 `'bytes-complete'`。注冊表保留所有匹配備選：`extension`（默認）優先于 `builtin`，隨后按更長的后綴、再按注冊順序排列。所選實現仍可用時，下拉選擇保持不變；移除后選擇下一個候選。內置正文也使用相同注冊方式。

<a id="addresses"></a>
## 地址

tab 使用 `fileAddressFor` 構造的 Session 地址，攜帶相對或絕對路徑。`hostFileOf(address)` 僅從地址取得 Session，不接收外部 Session 參數，也不借用當前或 Tab Session。Host 通過 Session 文件系統解析文件及關聯路徑，由該后端控制讀取權限。任何 UI（包括 Global 組件）都共享同一完整地址的元數據。[Workspace Files README](../../api/workspace-files/README.zh.md) 定義這些規則；渲染器選擇不改變導航地址。

<a id="how-it-reads"></a>
## 怎么讀

正文通過 `useTabInfo().tab` 讀取記錄、導航和生命周期。`useResource<'file'>(tab.contentId)` 提供元數據，普通 inject 回調提供內容讀取：

- 資源快照僅包含 `status`、`value` 和 `failure`；`value` 是 `WorkspaceFileStat` 元數據。提供方可用后，內容讀取無需等待首個元數據幀。觀察失敗優先于 Preview 的變更提示顯示；兩者都不會自動替換已加載內容。
- **文本頁** —— 純文本、Markdown 和代碼通過 inject 回調調用 `remote.workspaceFiles.read(sessionId, path, { offset }, signal)`。首次掛載讀取第一頁；滾動到正文末尾或點擊 **加載更多** 會讀取下一頁，直到 `eof`。owner 以 `{ kind: 'text', text, pages, eof }` 提供累計前綴，包含源碼偏移和行數。Markdown 和代碼增量渲染此前綴，不把每頁當成獨立文檔。第一頁之后到達的更新版本頁會使讀取從頭開始，避免混合版本。尚無內容時，失敗會以文件類型圖標、說明與重試按鈕填滿正文；較晚的失敗保留已有內容并在其下提供重試。
- **完整字節** —— PDF、HTML 和常見圖片通過 inject 回調調用 `remote.workspaceFiles.readAll(sessionId, path, signal)`。`rpc.ts` 將線路上的 base64 解碼為 `data: Uint8Array<ArrayBuffer>`，供 `{ kind: 'bytes', data }` 使用。Host 的 `maxFileBytes` 上限拒絕超大文件，不截斷。PDF 在傳給 worker 前復制保留的字節，使 Preview 緩沖區仍可使用。字節僅保存在臨時視圖狀態中，絕不進入持久布局或 Session JSONL。加載模式變化會淘汰先前結果。
- **重新載入** —— 僅當前 Preview tab 通過自己的 Remote 回調重讀，保留滾動偏好并淘汰舊請求。變更提示將讀取版本及起讀時的觀察版本與后續 `resource.value.version` 比較；刷新前已觀察到的版本不會被當成新變化。讀取既不刷新共享元數據，也不清除其它 tab 的提示。

HTML 以貼合正文四邊的 Blob iframe 運行，沙箱屬性嚴格為 `sandbox="allow-scripts"`，不含 `allow-same-origin`；腳本無法訪問父應用的源或文件讀取接口。渲染器通過普通 inject 回調調用 `remote.workspaceFiles.readRelated`，加載直接聲明的相對 `.js` 經典腳本和 `.css` 樣式表；固定安全上限為單個資源 4 MiB、總計 32 MiB、64 個不同資源。Host 代碼解析關聯路徑，`rpc.ts` 解碼返回的字節。在渲染器內部，base64 僅用于把 iframe 引導載荷嵌入腳本文本。`<base href>` 將依賴解析交給瀏覽器，HTTPS 資源也由瀏覽器處理。本地模塊 import、CSS `url()`/`@import` 和動態 `fetch` 不使用 Host 文件訪問。讀取失敗、無效 UTF-8 或超出上限都使預覽失敗，不發布部分資源包。替換或卸載文檔會釋放其 Blob URL。

PNG、JPEG、GIF、WebP、BMP、ICO 和 SVG 通過 Blob URL 在 `<img>` 靜態圖片上下文中渲染。圖片保持固有 CSS 像素尺寸；小圖在共享滾動區內居中，大圖可沿任一軸滾動。渲染器既不提供縮放，也不提供拖拽平移。SVG 標記絕不進入應用 DOM 或 iframe，因此其中的腳本無法執行，也無法訪問父頁面。替換或卸載圖片會撤銷其 Blob URL。

共享文案來自 `sidebarDocumentPreview`；各內置渲染器擁有自己的本地化標簽。

首次讀取、追加頁及 HTML/PDF/圖片準備共用加載指示器，并遵循減少動態效果偏好。下一頁加載期間保留已顯示的內容。PDF 頁面組成一個縱向、適配寬度的連續序列，并在接近視口時惰性渲染。代碼預覽默認顯示源碼行號，但復制文本不包含行號；純文本與代碼使用相同字號和行高。代碼直接坐在分欄自身的背景上，而不是會話卡片的填充色；復制條與占滿剩余高度的內部滾動區相鄰，因此橫縱滾動條都從復制控件下方開始。

<a id="navigation"></a>
## 導航

`ctx.sidebarRight.openResource(address, { params: { line } })` 通過 `file` 參數攜帶 1 起算的源碼行號。在 `text-pages` 模式下，owner 順序加載到該行或 EOF。純文本與代碼渲染器提供源碼行錨點；Markdown 不提供。所選渲染器沒有錨點時，導航保持待處理；用戶切換到純文本或代碼后執行。代碼導航直接滾動內部源碼視口。字節模式渲染器不消費源碼行導航。每個完成的導航 revision 只響應一次。不帶 `revealIfOpened: false` 打開同一文件時聚焦已有 tab，并送達新 revision。

<a id="model-experience"></a>
## 模型體驗

無，因為預覽是純瀏覽器側的查看器，不注冊工具、提示詞段或會話事件。

#### KV Cache 影響

無直接影響；用戶在這里讀到的東西永不進入模型請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>
- **預覽而非編輯。** 查看器不提供文件編輯或共享搜索接口；目錄地址以 `not-regular-file` 失敗。未知擴展名使用純文本讀取，仍受其 UTF-8/NUL 檢查限制。
- **文本順序分頁，完整文件受限。** 定位到較深處的源碼行需要先加載此前各頁；PDF、HTML 和圖片必須取得 Host `maxFileBytes` 上限內的完整結果。
- **字節視圖不恢復滾動位置。** PDF、HTML 與圖片的渲染器重新掛載或重新載入時可能回到頂部；圖片的橫向位置始終不恢復，HTML iframe 的滾動屬于其不透明瀏覽上下文。
- **本地 HTML 依賴集合有限。** 只打包直接引用的經典 `.js` 腳本和 `.css` 樣式表。瀏覽器解析的資源仍受瀏覽器源與網絡規則限制；iframe 不獲得運行時文件讀取橋接。
- **換行圖標為包內自繪。** `IconWrapFill16` 與 `IconNowrapFill16` 住在 `src/client/icons.tsx`，直到共享圖標集提供為止；它們的 props 已與共享圖標契約一致。
- **滾動寫入未節流。** 每次滾動事件都把偏移記進 store；行塊已 memo 化，于是由此引發的重渲染交還給 React 的是同一批元素。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。渲染器元數據、文檔加載和視圖狀態歸本地注冊表與聲明的 Slot store 所有，沒有可比對的獨立運行時來源；注冊釋放和 tab 生命周期由行為測試覆蓋。
