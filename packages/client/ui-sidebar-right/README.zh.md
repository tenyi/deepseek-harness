---
description: "dsh Web 客戶端的右側 Sidebar：每會話一個停靠面、兩種呈現形態、導航控制器 ctx.sidebarRight、tab 類型注冊表 ctx.sidebarRightTabs 與 Tab 域。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sidebar-right

[English](README.md) | 中文

## 概述

右側 Sidebar：停靠套件與本產品相遇的地方。它為每個會話持有一個停靠面，以兩種呈現形態之一把它畫成貼靠框架右列邊緣的一塊面板，把展開按鈕放進會話 header，并擁有導航控制器（`ctx.sidebarRight`）、tab 類型注冊表（`ctx.sidebarRightTabs`），以及告訴每個已開 tab 它是如何被導航到、能活多久的 Tab 域。

## 目錄

- [什么住在這里，什么不住](#what-lives-here-and-what-does-not)
- [呈現形態](#presentations)
- [展開按鈕](#the-expand-button)
- [狀態](#state)
- [擴展席位](#extension-seats)
- [`ctx.sidebarRight`](#ctxsidebarright)
- [Tab 域](#the-tab-domain)
- [引導頁](#the-guide)
- [文案](#copy)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備注](#dev-note)

-----

<a id="what-lives-here-and-what-does-not"></a>
## 什么住在這里，什么不住

布局本身——分裂樹、它的操作、拖拽手勢、浮窗——屬于 `@deepseek-ai/dsh-client-ui-dockkit`，并保持與宿主無關。本包提供套件拒絕知道的一切：產品文案、tab 的 `kind` 是什么意思、新格用哪個 tab 播種、停靠面掛在哪里、其它插件如何觸達它。

<a id="presentations"></a>
## 呈現形態

普通與全屏共用同一棵面板內容樹，切換不會重掛載Tab。普通面板貼靠右欄；全屏面板覆蓋窗口并保留寬屏底層列寬。窗口低于768px時打開右欄自動全屏；窄屏退出全屏會收起右欄，變寬不重新打開已關閉的右欄。 全屏打開時，底層列寬保持不變，直到滑入結束后才無過渡地準備普通軌道。 全屏面板退場前，關閉先準備全寬會話區，恢復先準備普通右軌道；退場期間底層不播放寬度動畫。

| 形態 | 軌道 | 面板 |
|---|---|---|
| `push`（默認） | 面板寬度：會話區讓出空間 | 在軌道內；它的左緣與會話區的右緣沿框架自己的曲線一起移動 |
| `fullscreen` | 保留寬屏普通軌道；窄屏自動全屏不占軌道 | 覆蓋整個窗口 |

席位通過 `ctx.layout.openRightbar(track, fullscreen)` / `closeRightbar()` 報告呈現，框架不注入本包。寬屏切換全屏不改變中欄寬度；寬度拖拽區只在普通展開態顯示。獨立浮窗及 `float`/`dock` 操作保持可用。

面板沒有標題行。它的兩個控件——形態切換與折疊按鈕——搭在套件 chrome 席位上，位于右上格 tab 條的最末端，因此 tab 條就是面板的整條上邊。每條 tab 條從左到右讀作：在允許時帶關閉按鈕的 tab 膠囊，添加控件（只在該格沒有引導 tab 時繪制；它通過 `ctx.sidebarRight.openTab` 在該格打開引導頁），該格的分欄控件，以及右上格里的兩個面板控件。窄格里只有 chip 讓位；其后的控件從不收縮或被裁切。

<a id="the-expand-button"></a>
## 展開按鈕

面板隱藏時，會話 header 角落席位里的一個按鈕（`conversation.session.header.corner`，在工具組右緣之外，與 Session 日志控件齊平）是回去的路。它的圖形是左側 sidebar 折疊圖標的鏡像。它與面板共用一個存儲（slot 運行時允許兩個同作用域席位共用一個 handle）；面板顯示時它什么也不渲染，角落席位隨之收起。于是折疊的 Sidebar 不花會話區任何代價：沒有軌條、沒有寬度，轉錄的滾動條留在列的邊緣。沒有會話就沒有按鈕也沒有面板。

面板取會話區的底色與正文字號，而不是自成一層浮起的表面：它是頁面的一列，不是壓在頁面上的卡片。

`rightbar` 入口是 root 作用域的控制器。它讀取 `usePanelInfo`，僅在選中會話界面時掛載 session 作用域的 `rightbar.session` 子樹。切換到全局面板會隱藏右側 Sidebar 并釋放框架列寬，但不刪除會話的 tab 狀態。

<a id="state"></a>
## 狀態

每個會話 id 一個 `SurfaceState`——布局、它記錄的序列、以及它已鑄造的 id 數——保存在注冊時聲明的存儲里。每個動作都遵循同一形態：鑄造意圖需要的 id，向套件 planner 詢問由哪些操作承載，記錄它們，然后把該會話的整個停靠面賦回去。沒有任何動作就地編輯布局，這正是讓套件的純函數成為唯一計算布局之處的原因。

把鑄造計數器帶在停靠面里，是記錄的序列可回放的原因：操作內嵌它們創建的 id，因此從同一初始狀態回放能復現同一棵樹。每個動作記錄一條歷史，無論它需要多少操作。展開、折疊與切換形態也都被記錄。

每個動作之后，套件的 settle planner 保證展開的停靠面有內容：最后一個 tab 被搬走或浮出的停靠格會被并掉；根格被清空時填入默認頁。折疊的停靠面沒有這種回填——會話以折疊且為空的停靠面開始，收起整列的關閉也讓它保持為空——首次會展示空布局的那次展開才播種默認頁。顯式關閉遵循[默認頁與關閉規則](#the-guide)。展開期間永遠至少有一個 tab，永遠沒有空格——因此沒有單獨的「關閉格」手勢。

停靠面的最后一個 tab 還多帶一條規則，由 store 的 `closeTab` 決定并經 `canCloseTab` 鏡像給套件：作為唯一停靠 tab 的引導頁不畫關閉控件也不畫菜單里的關閉項——它的 chip 呈安靜樣式，在沒有擴展條目時次鍵按下也不彈出菜單——對它的編程式關閉什么都不記錄；任何其它 tab 獨自留下時，點擊關閉會連同整列一起收起，記為一條歷史，布局保持為空，直到下次展開時創建當時的默認頁。浮動面板不參與這條規則：它們無論列是否展開都會渲染，其 tab 照常關閉。

狀態只在內存中。刷新會讓每個會話回到折疊的默認態；切換會話則讓每個停靠面留在原處。

<a id="extension-seats"></a>
## 擴展席位

tab 類型分兩階段注冊，隨包發布的引導類型走的正是別的包的類型走的同一條公開路徑（`ui-sidebar-documentpreview` 是活的證明）。兩個階段都在類型自己的 `ctx.effect` 里，因此注冊與創建它的插件同生共死。

1. **類型**——`ctx.sidebarRightTabs.register({ id, kind, patterns?, priority?, canOpen?, title, guide? })`，一份沒有運行時鉤子的靜態聲明，返回 disposer。`id` 是這個實現在 tab 系統里的身份，在全部注冊中唯一（包名是天然取值；隨包引導頁是 `@deepseek-ai/dsh-client-ui-sidebar-right/guide`）：一旦 extension 可以接管 builtin 的 kind，kind 就不再唯一，所以實現要自己命名，同一 `id` 的第二次注冊會 throw。資源類型給出 `patterns`，即作用于 `dsh-resource://` 地址的 glob：含 `:` 的匹配整個地址（`dsh-resource://file/**`）；不含的匹配 URI 路徑的任意深度且忽略大小寫（`*.md`），不是 URI 的地址不匹配任何這類模式。頁類型——引導頁、文件樹——不給出模式，按 kind 打開。`canOpen(address)` 否決一次命中。`title(address)` 是 tab chip 的文字，在 tab 打開時捕獲。`guide` 列出引導頁的入口框；選中一個即把貢獻它的類型作為頁打開。一個 `kind` 最多承載一份 `builtin` 與一份 `extension` 注冊（extension 生效；它離開后 builtin 恢復）；kind 上的其它任何撞名都 throw。`id` 同時也是該類型正文與標題注冊時用的 key，因此 extension 與它接管的 builtin 各占一個格位，席位渲染生效的那個。
2. **正文**——`ctx.slots.register({ name: 'sidebar.right.pane.tab', key: definition.id }, Body)` 通過框架注入的 `useTabInfo()` 讀取 `{ sidebar, panel, tab }`。`sidebar` 提供開合與全屏信息，`panel.id` 命名所在格，`tab` 包含原記錄字段、`visible`、`navigation`、`signal` 和 `actions`。這些字段不再作為平鋪owner props傳入；類型自己的store仍使用 `useStore`/`actions`。可選標題注冊及引導替換共享該hook；未注冊標題時使用打開時保存的文本。

由哪個類型打開資源遵循編輯器解析器的慣例：`patterns` 命中的類型先按 `priority` 檔排序——`extension`（產品外的類型，最高檔，也是未命名時的默認）、`builtin`、`fallback`（任何更具體的類型都應勝過的通用查看器）——再按命中模式的長度，再按注冊順序；`canOpen` 會剔除候選。各檔是字符串字面量，因此別的包里的類型不需要從這里做運行時導入。`candidates(address)` 返回排序，`claim(address, kind?)` 返回決定；指定 `kind` 時跳過它的 glob 但保留它的 `canOpen`。

另有兩個席位擴展已有之物：`sidebar.right.tab.guide`（chain）替換引導 tab 的正文而不替換 tab，`sidebar.right.tab.menu.item`（list）在套件自己的布局動作之后向 tab 菜單追加內容級動作。目前沒有面向格級動作或折疊態控件的席位，因為還沒有東西需要它。

<a id="ctxsidebarright"></a>
## `ctx.sidebarRight`

`openResource(address, options?)` 與 `openTab(kind, options?)` 是導航控制器，進入該列的每條路都調用其中之一：會話區的文件鏈接與工具行的行號引用（`openResource(fileAddress, { params: { line } })`），tab 條的添加控件與引導入口框（`openTab`），文件樹的行（`tab.actions.openResource`）。資源地址是 `dsh-resource://<type>/…` URI；不帶 `options.kind` 時由注冊表認領（glob 與 `canOpen`，最高檔勝出），帶它時由該 kind 生效的類型打開。頁按 kind 命名；tab 記錄在本包拼出、別處無人書寫的地址下（`contract/seed.ts`）。兩者以同一組步驟作為一條歷史運行：已展示同一 (kind, contentId) 的資源 tab 被聚焦，不限所在分欄，除非 `revealIfOpened: false`；頁 tab 始終只在目標分欄內去重，不受該選項影響；否則新 tab 落到 `options.replaceTab` 所在的格與位置（并關掉那個 tab），再退而落到 `options.paneId`，再退而落到活躍停靠格；面板展開，因為用戶看不到的內容不算打開。隨后 Tab 域記錄這次導航——`params` 以 `navigation.params` 抵達正文，`revision` 遞增——不進布局歷史。`params` 按所開之物定型：某資源類型的查看器把自己那項并入 `SidebarRightResourceParamsMap`（文本預覽聲明 `{ line?: number }`）；接受參數的頁類型按其 kind 并入 `SidebarRightTabParamsMap`；值約定為 JSON 形狀，運行時不校驗。`dsh-resource://` 之外的地址、無人認領的地址、或未注冊的 kind 都會 throw：那是接線錯誤，不是用戶錯誤。

`close(tabId)` 關閉一個 tab；`active()` 讀取活動 tab。`isExpanded()` 與 `toggleExpanded()` 讀取并驅動該列的展開；形態切換是面板自己的控件，不屬于這個接口。布局操作供以編程方式安排該列的調用方使用，每個都像它替代的手勢一樣被記錄：`focus(tabId)` 聚焦一個 tab 及其格；`split(paneId?)` 在與 tab 條控件相同的格預算與空間規則下分欄一個停靠格（默認活躍格），返回新格的 id，做不到時返回 `undefined`——且不記錄任何東西；`float(tabId, rect?)` 把停靠 tab 浮出為浮窗；`dock(paneId)` 把浮窗放回活躍停靠格。不存在的 tab 或格、或已處于調用目標狀態的，都原樣不動。該接口只暴露操作：沒有布局快照、沒有操作日志、沒有按地址查找。`_undo()` / `_redo()` 步進已掛載停靠面的歷史；它們是 `@internal`——序列沒有面向用戶的控件，這兩個只為測試存在。命令需要一個已掛載的會話停靠面；沒有時它們 throw，而不是寫進一個沒人繪制的面里。

<a id="the-tab-domain"></a>
## Tab 域

Tab域按（Session，Tab id）保留導航、中止信號與綁定動作；私有裝配回調收養各會話的store，并在每次提交時對齊記錄。記錄消失或插件卸載才中止signal，收起和切會話不銷毀記錄；undo恢復的是新occurrence。`useTabInfo()` 組合框架綁定的store與導航hook，不在組件中手寫訂閱或在渲染時創建記錄。`tab.actions` 始終作用于自己的會話；`tab.visible` 區分正文與標題，浮窗不受整欄收起影響。`adopt` 不在公開控制器上。

<a id="the-guide"></a>
## 引導頁

默認頁取決于已注冊的引導入口數，不取決于 tab 類型數或已打開的 tab 數。恰好一個入口時直接打開對應頁面（隨包組合中為 Files）；沒有入口或有多個入口時打開引導頁。即使只有一個入口，顯式添加引導頁仍會打開引導頁。只有作為唯一停靠 tab 的引導頁不可關閉；關閉其它任何唯一 tab 時會同時收起整列。chip、上下文菜單與 `close` API 使用同一規則。

引導 tab 是一枚弱化的羅盤，下方是各已注冊類型貢獻的每個 `guide` 條目一個入口膠囊，按 `order` 排列并在正文中居中；引導頁自己沒有文字。膠囊顯示條目的圖標——條目沒注冊圖標時用引導頁自己更淺的立方體占位符——和標題；列出的條目不超過四個時，注冊了 `description` 的條目在標題下顯示它，更長的列表則去掉所有描述。選中一個膠囊會調用 `tab.actions.openTab(entry.kind, { replaceTab: true })`，于是引導頁讓位給它打開的頁。一個格最多持有一個引導 tab。tab 條的添加控件只在該格沒有引導 tab 時繪制，并以 `openTab('guide', { paneId, revealIfOpened: false })` 在該格打開一個，這樣別的格里的引導頁不會截走這次點擊；把引導頁開進已有引導頁的格則改為聚焦它；把引導頁拖入、放入或收回到這樣的格會合并進去——來者關閉，該格自己的被聚焦；對引導頁 `duplicateTab` 不記錄任何東西。分欄、展開且為空的根格、以及唯一 tab 拖到本格邊緣分屏后騰出的格使用相同的默認頁規則，每個新格一個 tab；這種本格邊緣拖放讓被拖的 tab 保持聚焦。普通的 `openTab('guide')` 只在活躍或指定分欄內打開或聚焦引導頁。對空分欄執行 split 不產生變化，也不返回新分欄。產品最多保留左右兩格，默認均分，分隔條限定在 20%～80%。寬度不足以容納兩格時不允許新分欄；已有兩格時，正文拖放用于跨格移動，不再創建第三格。達到兩格上限時隱藏分欄控件；關閉回單格后恢復。

<a id="copy"></a>
## 文案

該列里的每個字符串都來自 `sidebarRight` 語言命名空間，包括套件的無障礙名稱。tab 的標題在 tab 鑄造時固定；類型的顯示名跟隨當前語言。

<a id="model-experience"></a>
## 模型體驗

無，因為本包是瀏覽器側 UI 插件層，不注冊任何面向模型的內容。

#### KV Cache 影響

無；本包既不組裝也不發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **只在內存中。** 不持久化任何東西；刷新讓每個會話從折疊態開始。
- **沒有會話就沒有停靠面。** 狀態按會話 id 鍵控，因此 hero 畫面右側什么都不顯示。
- **硬編碼的層疊。** 面板與浮窗宿主使用固定的 z-index 值，因為客戶端還沒有 z-index token 層。
- **未暴露撤銷。** 記錄的序列只能通過 `@internal` 服務方法步進；產品控件是有意缺席的。
- **標題在打開時固定。** 類型的 `title(address)` 被捕獲進記錄；會變的標題只來自可選的標題席位。
- **沒有內容導航棧。** 后退回放的是布局操作；編輯器式的「已訪問內容」前進/后退尚未構建。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者工作上下文——點擊展開</summary>

無。

</details>

**運行時不變量：** 不發布 companion。兩個服務（`sidebarRight`、`sidebarRightTabs`）在同一個 effect 內經 `ctx.reflect.provide` 提供并隨之拆除；席位綁定與 Tab 域 occurrence 的生命周期由本包的 spec 直接斷言，不存在會與之分歧的獨立觀察。
