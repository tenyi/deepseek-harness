---
description: "Web GUI 的產出文件與可點擊文件引用：已完成輪次末尾的產出文件行，以及收尾正文中的行內代碼鏈接；供產出物體驗的用戶與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-deliverables

[English](README.md) | 中文

## 概述

本包渲染已完成輪次末尾的產出文件行——列出修改工具創建或修改的文件——并把收尾正文中匹配的行內代碼引用轉為鏈接，讓被點名的文件在右側 Sidebar 中打開。鏈接路徑來自成功的文件修改與顯式交付，而非收尾正文——無論模型是否記得點名，產出文件都會被列出。正式提供的組合中只有 Web patch 加載本包；刪除其 cordis.yml 條目會同時移除指引、文件行與正文鏈接。

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

與 `ui-conversation` 一起掛載本插件；已完成輪次隨即以產出文件行收尾，位于收尾消息正文與其動作頁腳之間。每個標簽項經屬主的 `openFile` 打開文件——chat 視圖把它路由到右側 Sidebar 作為一個文本預覽 tab——相對路徑按會話 cwd 解析。該行不提供文件夾動作：Sidebar 沒有目錄形態，因此省略項只顯示為標簽。

<a id="explicit-deliveries"></a>
### 顯式交付

Web 的 `standard`、`ptc` 與 `cordis` preset 提供 `present` 用于聲明交付會話文件系統可訪問的最終文件，包括通過 Bash 創建的文件。創建文件后，以 `files: [{ path, description? }]` 調用。[present 工具](../../fs/tool-present/README.zh.md)擁有文件數量限制和會話聲明。收尾輪次把單個交付顯示為橫向占滿內容區的卡片，把多個交付顯示為間距 10px 的雙列網格。文件超過四個時，列表默認收起，并提供顯示或隱藏完整列表的控件。每張卡片高 60px，上下內邊距為 8px、左右為 10px；40px 圖標框內使用 20px 的共享 `FileTypeIcon`，文件名為 13px、次要文本為 10px，“打開”操作為 12px。卡片顯示 basename 與說明；沒有說明時顯示文件類型，說明末尾的括號后綴會被省略，懸停卡片時該行切換為側欄預覽提示。點擊卡片或分段“打開”控件的左側會在右側 Sidebar 中預覽文件；右側箭頭打開標準菜單，其中提供 Host 默認應用，以及 macOS 上的“在 Finder 中顯示”、Windows 和 WSL 上的“在文件資源管理器中顯示”或 Linux 默認文件管理器的“打開所在文件夾”。匹配的行內代碼引用在右側 Sidebar 中預覽相同源文件；原生打開需要顯式選擇卡片菜單中的操作。同一路徑重復聲明時，選擇收尾回復之前最近一次的說明。

`present` 工具行顯示正在交付、已交付、失敗或中斷狀態；展開已結束的調用可查看其記錄的結果。可折疊卡片網格保留全部交付文件。菜單中的兩個操作共享等待狀態，并顯示進度、成功確認或各自可重試的錯誤。交付卡片出現時讀取桌面信息，連接更換時清除緩存，舊連接的響應不能更新元數據。選擇原生菜單操作后，鍵盤焦點回到仍可用的側邊欄“打開”按鈕。等待操作完成時關閉菜單，用戶再次點擊才會打開。Host 沒有桌面時禁用“打開”菜單；桌面信息讀取失敗時提供“重試”。服務 Host 必須具備桌面和合適的默認應用；遠程瀏覽器不會打開其所在設備上的應用。

### 該行

“本輪文件改動”行列出成功的文件工具修改；最終文件交付需要調用 `present`。首個文件區塊位于收尾正文下方 20px，后續顯式交付區塊位于該行下方 16px，操作頁腳位于最后一個文件區塊下方 20px。該行通過 CSS 容器寬度檔位響應式展示至多六個文件標簽項。Flexbox 負責收縮文件名并用省略號截斷，CSS 為未展示路徑選擇匹配的本地化 `+ N 個文件` 標簽；完整路徑仍保留在 `title` 中，該行不執行 JavaScript 布局觀察，也不提供橫向滾動。

### 行內代碼鏈接

收尾正文鏈接產出或已交付的路徑：行內代碼 token 按精確路徑解析，或當它恰好等于其中某條路徑的 basename 且該路徑唯一時解析——兩條路徑共享同一 basename 時保持不可點擊而不作猜測，因此提及絕不打開錯誤的文件。解析成功的提及保留代碼標簽，并采用 Markdown 樣式表的鏈接樣式，完整路徑作為其 `title`。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

Node 半部注冊靜態 `ui:deliverable-file-references` 系統提示詞段，要求模型點名成功創建或修改的主要文件，并把這些文件以及正文中提到的其他本輪變更文件寫成 Markdown 行內代碼。瀏覽器半部把組合 `ProducedFiles` 與顯式交付的包裝組件注冊進 chat 視圖的 `conversation.chat.turnTail` 洞。`deliverablesDefinition` 根據 `write`、`edit` 和有修改作用的 `str_replace_editor` 命令中經過校驗的原始參數，把每個輪次成功的第一方修改調用折疊進 `DeliverablesTurnData`。讀取、刪除、不受支持的工具、格式錯誤的調用和失敗結果不貢獻任何條目。新的修改工具必須增加顯式 Client contribution 才能加入列表。本包還提供 chat 視圖按收尾消息查詢的 `chatFileMentions` 服務；把插件組合出去會同時移除兩個表面，視圖的空鏈以零成本留下。

原生打開使用經過認證的 POST，通過當前查看的會話、事件序號和原始文件索引定位聲明。Host 讀取聲明及當前查看的會話 header，將其中的 cwd 傳給 `workspaceFiles.stat`；未記錄 cwd 時使用部署的工作目錄。它與側欄預覽使用同一組合文件系統，無需啟動 Agent，子會話也適用。原生操作要求規范化的進程路徑能從 Host 路徑映射回同一進程路徑。提供方沒有這種映射時返回 422，卡片提示使用側欄預覽；Host 上存在同名文件并不足夠。同一份桌面可用性配置同時約束信息查詢和實際執行。編輯會影響后續打開的內容；刪除后返回錯誤。不創建文件內容副本或附件。插件釋放時取消并等待進行中的原生打開請求。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當產出物面不夠用時閱讀以下頁面。它們從該行進入 turn-tail 洞與詞表背后的決策。

- [ui-conversation](../ui-conversation/README.zh.md)——聲明 `conversation.chat.turnTail` 洞并渲染收尾正文。
- [工作區文件鏈接](../../../.agents/notes/implemented/feature/2026-07-31-web-workspace-file-links.zh.md)——產出文件行背后的決策；其 Host 打開路徑已被[右側 Sidebar](../../../.agents/notes/implemented/feature/2026-09-04-right-sidebar-docking-infrastructure.zh.md)取代。
- [行內文件提及](../../../.agents/notes/archived/feature/2026-08-07-web-inline-file-mentions.md)——收尾正文可點擊提及背后的決策。
- [客戶端包映射](../README.zh.md)——相鄰的瀏覽器 UI 包。

-----

<a id="model-experience"></a>
## 模型體驗

### 可點擊文件引用指引

#### 模型看到的內容

一段固定提示詞要求模型在最終回復中點名成功創建或修改的主要文件，并將這些文件以及正文中提到的其他本輪變更文件寫成采用精確路徑或唯一 basename 的 Markdown 行內代碼，例如 `out/report.html`。

#### Token 影響

加載本包時增加一段固定提示詞。[present 工具](../../fs/tool-present/README.zh.md#model-experience)擁有交付 schema 和結果文本。

#### KV Cache 影響

該段落在本包掛載期間始終以 first-party 順序 9000 保持靜態，因此留在可復用的提示詞前綴中，不會隨輪次改變。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制界定了當前產出物詞表。它們是當前包約束，不是通用文件鏈接對比或任務積壓。

- **提及匹配只認精確路徑或唯一 basename**——后綴式提及保持惰性；等真實的收尾消息形態產生需求后再放寬匹配規則。
- **終端創建的文件需要顯式交付**——調用 `present` 聲明后才會顯示交付卡片和可點擊引用。
- **聲明不保存文件內容**：重新打開或轉移 Session 后，源文件仍需能被當前查看的 Session 文件系統訪問。文件缺失、為目錄或最終路徑為符號鏈接時返回 404。
- **目錄沒有打開目標**——標簽項在右側 Sidebar 的文本預覽中打開文件，該預覽僅支持文件，不提供原生文件夾打開動作。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。提示詞、slot、dictionary、文件操作路由與可選 service 注冊歸 effect 所有；Session 日志擁有聲明，文件系統擁有文件內容。
