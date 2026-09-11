---
description: "dsh Web 客戶端共享的 React UI 原子組件：控件、圖標、Markdown 與數學公式渲染，以及終端/讀取/差異/搜索/網頁輸出卡片（零 Cordis）。"
kind: "package-library"
---

# @deepseek-ai/dsh-client-ui-primitives

[English](README.md) | 中文

## 概述

使用 `dsh-client-ui-primitives`，通過共享 React UI 構建 Web 客戶端控件并渲染 agent 輸出。它提供標準控件、圖標、錨定浮層，以及用于帶 TeX 公式的 Markdown、終端輸出、文件讀取、差異、搜索、網頁檢索和 JSON 的渲染器。這些渲染器會丟棄原始 HTML、限制鏈接并解析 ANSI 轉義序列，以處理不受信任的模型輸出。組件不 import Cordis 運行時；調用方提供本地化 label，主題相關顏色使用 `--dsw-*` 設計 token。

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

本包是 Web 殼的構建輸入。靜態 ESM 為 Vite 保留第三方導入和樣式；獨立消費方自行提供開發依賴（[依賴規則](../AGENTS.md#dependency-declaration)）。

只要 Web 客戶端需要標準控件或 agent 輸出渲染器，就用這些原子組件拼裝功能 UI。它們只經 React 渲染，并從主題取得 `--dsw-*` 設計 token，因此無需導入主題或 slot 系統即可適配任意插件。

<a id="component-catalog"></a>
### 組件目錄

在功能包里寫控件之前，先查這張表。插件無法導入另一個插件的組件，因此本包是控件唯一可以共享的地方：合適的就復用，有意的視覺差異提升成 prop，而不是另起一份拷貝。

| 導出 | 是什么 |
|---|---|
| `Button` | 可點擊操作；`variant` 選擇 `primary`、`ghost`、`outline` 或 `toolbar`。 |
| `Switch` | 36×20 的雙態開關。`label` 必填，控件不可能在沒有名稱的情況下發布。 |
| `Input` | 單行文本輸入，用于搜索框與行內表單。 |
| `Menu` | 由條目、分隔線與分組標題構成的下拉菜單，支持嵌套子菜單。 |
| `Pill` | 可選中的膠囊按鈕，用于視圖切換與篩選器；接受 `active` 與 `onClick`。 |
| `Tag` | 只讀膠囊徽章；`tone` 選擇八種配色之一。 |
| `StateDot` | 狀態標記：`done`、`warning`、`ongoing`、`error` 或 `idle`。它是 `aria-hidden` 的，名稱由渲染點提供。 |
| `ConnectionIndicator` | 行內連接恢復控件，覆蓋斷線、重試與已恢復三種狀態。 |
| `DisclosureRow` | 24px 緊湊折疊行，標題與內容左右排列。 |
| `Modal` | 頁面遮罩之上的居中對話框。 |
| `RiskConfirmation` | 以顯式復選框把關的敏感操作確認。 |
| `OnboardingSurface` | 首次運行的引導舞臺，期間保持應用根節點 inert。 |
| `Tooltip` | 克隆錨點上的懸停文本，可置于右、下、上三個方向。 |
| `HoverCard` | 指針可停留、可選中的懸停預覽；可選帶復制按鈕。 |
| `Toast` | 頂部居中的瞬時橫幅，保持時長由所有者的 `holdMs` 決定。 |
| `JsonTree`、`JsonBlock` | 只讀 JSON 查看。 |
| `MarkdownText`、`CodeBlock` | 不可信 GFM 與 TeX 數學，以及高亮代碼。`CodeBlock` 可通過 `lineNumbers` 開啟行號；復制的源碼不含行號欄，`contentRef` 則向需要把穩定源碼包裝節點用作滾動區的 owner 提供該節點。 |
| `TerminalBlock`、`ReadBlock`、`DiffBlock`、`SearchBlock`、`WebBlock` | 與各類工具結果意圖對應的 agent 輸出卡片。 |
| `icons/*`、`FishLogo`、`BrandWordmark`、`ReferenceIcon`、`LinkIcon` | 字形與品牌標識。`LinkIcon` 用于 14px 的可點擊鏈接分類。 |
| `FileTypeIcon`、`classifyFileType`、`fileExtension` | 按類別著色的 28px 文件或文件夾圖形，以及它背后共享的不區分大小寫文件名映射。代碼與配置文件使用細分的全彩技術圖形；鏈接前置圖形使用 `LinkIcon`，圖片內容使用圖片預覽。 |

有三組容易混淆：

- **`Tag` 與 `Pill`。** 11px 膠囊尺寸的只讀徽章用 `Tag`；膠囊可選中（`active` 與 `onClick`，視圖切換與篩選器就是這樣用的），或者必須落在 24px 文本行上時用 `Pill`——`TerminalBlock` 把退出狀態渲染成靜態 `Pill` 正是后一種情況。這里尺寸和是否可交互同樣是判據，兩者不可互換。
- **`DisclosureRow` 與卡片。** 該行以固定 24px 把標題與內容左右排列。把名稱疊在描述之上的卡片是另一種布局，屬于功能包——`ui-settings-plugins` 的 `PluginCard` 是先例，并記錄了原因。
- **`FoldToggle` 與對外導出面。** 它是包內組件，未導出；輸出卡片用它做頭尾折疊。

需求確實特殊時，在自己的包里寫自己的組件沒有問題。不可以的是復制這里已有的控件——而當第二個包需要同一個控件時，它就該住進本包（[決定](../../../.agents/notes/implemented/architecture/2026-09-05-shared-client-control-primitives.zh.md)）。

### 控件與圖標

上面的目錄說明每個導出的用途；本節講 props 本身看不出來的行為。`ic_ds_*` 圖標集與 `FishLogo`/`BrandWordmark` 標記填充品牌與行內圖標 slot。`FileTypeIcon` 渲染傳統的 28px Excel、folder、HTML、image、Markdown、generic、PDF、PPT、video 與 Word 圖形，并為現有 48 個代碼和配置類別使用導入的方形技術圖形。該導入只替換圖形：資源包中額外的類別不會擴展 `CodeFileType`。`classifyFileType` 按完整文件名、前綴、后綴、可選項目上下文、擴展名的順序匹配；React 文件名優先于 TypeScript/JavaScript，Angular 后綴優先于基礎擴展名，只有傳入的項目文件包含帶 `flutter:` 的 `pubspec.yaml` 時 Dart 文件才使用 Flutter。Markdown 與 SVG 仍分別使用傳統 Markdown 與圖片圖形。辦公文件映射包含 XLSM/Numbers 的表格圖標、KEY 的幻燈片圖標，以及 RTF/ODT/Pages 的文檔圖標。`fileExtension` 為相鄰元數據 label 暴露同一套 basename 與最終點號解析。傳統圖形使用實色分類底板、白色標記和半透明白色折角；通用文件使用灰色底板與較深灰色折角。調用方可通過 `--dsh-file-type-icon-color` 覆蓋底板顏色。全彩技術圖形是明確例外，會保留其內嵌調色板。所有圖形都是裝飾性的，不自帶 label。`LinkIcon` 仍是可點擊產物鏈接較小的前置分類圖形——地球、文件夾、代碼、圖片、文檔或紙張——`classifyLinkPath` 把共享文件類型折疊進原有六類詞匯。`ConnectionIndicator` 可渲染警告色的斷聯操作、以獨立于 retry 時序的 500ms 節奏推進一至三個點的連接中狀態，或成功色的恢復狀態。懸停或鍵盤聚焦時只顯示重連操作文案，連接中的圓點動畫也保持隱藏。所有狀態都為最長的輸入 label 預留空間，并使用固定的圖標列和文字列，因此文案變化不會移動控件或改變其寬度。它的持有方提供可見性、恢復駐留時間、本地化 label 與立即重連回調；該原語不使用原生 title tooltip。`useAnchoredPosition` 與 `useAnchoredMaxHeight` 讓浮動面板與底部錨定浮層始終鉗制在視口內并跟隨錨點。`HoverCard` 通過指針離開寬限期讓采用 portal 的預覽在跨過錨點間隙時仍可觸及，并可通過 `copyText` prop 提供復制按鈕。`Toast` 的停留時長由使用方通過 `holdMs` 指定，因為橫幅該留多久取決于有多少內容要讀；同一個值同時驅動它的卸載定時器與樣式表的淡出延遲，兩者不可能再錯位。`rankByName` 是 `/` 菜單命令源與 skill（技能）源共享的候選排序器：查詢必須是名字的不區分大小寫的有序子序列；前綴命中排最前，其次按對齊分數，再按來源順序。 `Menu.autoFocus` 聚焦首個啟用項，支持上下方向鍵與 Home/End 導航，并在 Escape 時聚焦 anchor 內的第一個按鈕；操作菜單可顯式啟用。

### 渲染 agent 輸出

`MarkdownText` 渲染不可信的 GFM 與 TeX 公式、阻止不安全的鏈接與圖片，并可把已解析的文件提及轉換為顯式控件。當 owner 傳入 `pathImages` 詞表時，本地媒體路徑的圖片目標只在落定渲染階段重寫為可展示 URL（與 file mentions 相同的流式門）；不傳詞表時本地目標保持惰性 alt 文本。加載或解碼失敗后，圖片替換為作者的 alt 文本；alt 為空時顯示原始目標路徑。圖片源變化后可重新加載。回復流式輸出時，它凍結已完成的塊、按已完成行推進頂層未閉合 fence，并從保存的 Shiki grammar state 為該 fence 增量高亮。已完成的 token 行進入固定大小的 React 分組，后續分片只 reconcile 正在增長的分組；最終全量解析解決跨文檔語法時，未變化的 fence 會保留該 DOM。`TerminalBlock`、`ReadBlock`、`DiffBlock`、`SearchBlock` 與 `WebBlock` 把對應的工具結果意圖渲染為帶復制控件、溢出處理及適用時 ANSI 處理的卡片。`JsonTree` 與 `JsonBlock` 以只讀方式檢查 JSON 值；`projectUserText` 把已發送的用戶文本投影為行內普通文本段與引用 chip，供消息氣泡和排隊行使用。 傳入 `UserTextReferences` 時，文件和 skill 引用成為支持鍵盤操作的預覽按鈕，復用正文文件鏈接的懸停和聚焦樣式；第一次指針點擊可以打開預覽，后續點擊和已有選區保留原生選擇行為。鍵盤激活在存在選區時仍可打開預覽。


### 本地化文案

這些原子組件無法讀取應用 locale，因此每段面向用戶的文案都必須通過 label prop 提供。`HoverCard`、`TerminalBlock`、`JsonTree`、`CodeBlock`、`MarkdownText`、`JsonBlock`、`ConnectionIndicator`、`Modal`、`DiffBlock`、`ReadBlock`、`SearchBlock` 與 `WebBlock` 接收完整的本地化 label。本包不擁有語言回退；遺漏會導致類型檢查失敗，各功能會把帶類型的 `t` 席位映射到 primitive 的 label 接口。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本包只做一件事：提供零 cordis、零 slot 知識、僅經 `--dsw-*` token 設置樣式的純 React 原子組件，而所有功能專屬的關注點（locale、會話數據、組合）都留在拼裝它們的插件中。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 原子組件公開導出 |
| [`src/markdown/`](src/markdown/) | Markdown 與數學公式流水線：micromark 解析、KaTeX 排版、增量流式渲染器、`CodeBlock`/`JsonBlock` |
| [`src/TerminalBlock.tsx`](src/TerminalBlock.tsx) | ANSI 轉義解析（`anser`）與終端卡片渲染 |
| [`src/ReadBlock.tsx`](src/ReadBlock.tsx) / [`src/DiffBlock.tsx`](src/DiffBlock.tsx) | 讀取與差異卡片 |
| [`src/SearchBlock.tsx`](src/SearchBlock.tsx) / [`src/WebBlock.tsx`](src/WebBlock.tsx) | 搜索與網頁檢索卡片 |
| [`src/icons/`](src/icons/) | `ic_ds_*` 字形組件與品牌標記 |
| [`src/code-file-icon-artwork.ts`](src/code-file-icon-artwork.ts) | 48 個細分代碼文件類別的內嵌內層 SVG markup |
| [`src/code-file-icon-artwork.manifest.json`](src/code-file-icon-artwork.manifest.json) | 設計導出摘要、已納入類別與有意排除的圖稿 |
| [`src/useAnchoredPosition.ts`](src/useAnchoredPosition.ts) / [`src/useAnchoredMaxHeight.ts`](src/useAnchoredMaxHeight.ts) | 浮動面板與浮層幾何鉤子 |

### 流式 Markdown

回復流式輸出期間，`MarkdownText` 增量解析：除末尾兩個塊外全部凍結為緩存的 React 元素，每個分片只重新解析其后的源文本尾部，因此每分片的工作量跟隨尾部而非整個回復。末尾的頂層未閉合 fence 會保留已解析的 code node，只把最后一個已完成行與當前未完成行交給同一套 GFM grammar；閉合 fence 或有歧義的解析會回到普通尾部路徑。高亮同樣從保存的 Shiki grammar state 續接，并只發布新完成行與可變尾部。`CodeBlock` 把已完成行封入固定大小的 React 分組、復用更早的分組，并在代碼與語言未變化時跨定稿保留整棵高亮樹。定稿時的全量解析仍會解析跨過凍結邊界的引用。

### 幾何與溢出

輸出卡片共享同一套幾何模型：`white-space: pre` 并橫向滾動，讓按列對齊的內容保持對齊；超過 `maxLines`（默認 16）時折疊為頭部切片加尾部切片，由展開按鈕控制，長正文不會撐高卡片。`TerminalBlock` 把 ANSI 解析為 React span，并帶逐行列緩沖處理光標移動，遵循行內擦除、制表位與字符寬度。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

以下頁面說明這些原子組件在客戶端技術棧與設計系統中的位置。

- [ui-renderer](../ui-renderer/README.zh.md)——掛載組裝后應用并綁定 slot 數據的 React 渲染器。
- [ui-tool](../ui-tool/README.zh.md)——拼裝這些輸出卡片的工具調用展示層。
- [ui-conversation](../ui-conversation/README.zh.md)——渲染 Markdown 回復與工具卡片的聊天界面。
- [ui-theme](../ui-theme/README.zh.md)——這些原子組件樣式所依賴的 `--dsw-*` token 體系。
- [Web 樣式](../../../docs/web-styling.zh.md)——Web 客戶端組件的權威樣式規則。

-----

<a id="model-experience"></a>
## 模型體驗

無。該包是瀏覽器端 UI 插件層，不注冊任何面向模型的內容。

#### KV Cache 影響

無；該包既不組裝也不發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明原子組件在邊緣情況下的行為；它們是當前包約束，不是組件路線圖。

- **流式期間跨邊界引用解析被推遲**：定義落在增量凍結邊界另一側的引用式鏈接或腳注，在回復流式輸出期間渲染為字面文本；定稿時的全量解析會將其解析。
- **長高亮 fence 會保留完整 token DOM**：流式路徑避免重新解析、重新 tokenize 和 reconcile 已完成前綴，但不會丟棄舊顏色或虛擬化 token span。因此最終 DOM 數量仍隨 fence 的 token 數增長；嵌套／容器內 fence 與病態的單個超長行仍走通用尾部路徑。
- **字形級圖標是重新繪制的近似版本**：魚形標志與閃光標記來自字體字形，而本地設計數據無法導出其矢量幾何；在獲得精確導出路徑前，使用手工重建版本代替。
- **`Pill` 與 `Input` 沒有設計來源**：兩個原子組件均自行定義；與其相似的側邊欄搜索字段和視圖標簽條由消費方組合，不是這些原子組件。
- **`StateDot` 沒有 `Active` 變體**：支持的狀態為 done、warning、ongoing、error 和 idle。
- **面向用戶的文案必須由渲染點提供**：這些原子組件是 zero-Cordis 的，拿不到 `ctx.locale`；各功能必須通過原子組件的帶類型 prop 提供完整本地化 label（見[決策](../../../.agents/notes/implemented/architecture/2026-08-23-locale-owned-client-ui-copy.zh.md)）。
- **`TerminalBlock` 不是終端模擬器**：它渲染已結束或仍在運行的命令輸出，而不是交互式會話：SGR 顏色、回車、退格、行內擦除、制表位與字符寬度會被遵循；絕對光標定位、清屏與備用屏幕序列會被剝離。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。這些是純 props-in React atom，沒有 Cordis API、事件、service 或跨插件可變狀態；渲染約定由組件測試覆蓋。
