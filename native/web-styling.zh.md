# Web UI 樣式參考

[English](web-styling.md) | 中文

本文規定瀏覽器客戶端包的樣式職責歸屬與組件規則。當前 token 值位于 [`packages/client/ui-theme/src/styles/`](../packages/client/ui-theme/src/styles/)；本文不重復這份由源碼生成的清單。

## 職責歸屬

[`ui-theme`](../packages/client/ui-theme/README.zh.md) 負責 `--dsw-*` 靜態色階、語義別名、排版、動效、漸變、陰影、滾動條樣式以及明暗主題偏好。[`ui-layout`](../packages/client/ui-layout/README.zh.md) 將解析后的主題快照應用到文檔。功能包使用語義別名，不得另行定義全局主題。

全局樣式表歸 `ui-theme/src/styles/` 所有。組件樣式以 CSS Modules 形式放在組件旁。當某個值屬于該組件的布局或呈現約定時，組件可以定義局部自定義屬性；共享顏色、排版、層級和動效屬于主題包。

## 組件規則

- 重新設計控件樣式之前先復用控件：[ui-primitives 組件目錄](../packages/client/ui-primitives/README.zh.md#component-catalog)是唯一跨功能包的通道，有意的視覺差異應作為那里的一個 prop，而不是另起一份拷貝（[決定](../.agents/notes/implemented/architecture/2026-09-05-shared-client-control-primitives.zh.md)）。
- 使用 CSS Modules 和 `clsx`；不得添加組件庫或 Tailwind。
- 功能組件使用 `--dsw-alias-*` 語義 token。不得復制靜態色板值或在其中寫入顏色字面量。
- 功能組件 CSS 不得包含主題選擇器。明暗主題覆蓋屬于主題所有方。
- 字體大小必須與行高配對；已有角色匹配時使用主題排版變量。
- 當組件約定要求保留列結構時，源碼文本、終端輸出和 diff 行不得換行；使用共享滾動條樣式，不得定義組件專用滾動條選擇器。
- 呈現規則寫在 CSS 中。React 內聯樣式可以傳遞組件局部自定義屬性值，但不得編碼主題分支。
- 添加過渡動畫或僅懸停可見的控件時，保留清晰可見的鍵盤焦點和減少動態效果行為。
- 支持的引擎上，圓角繼承 ui-theme `corner-shape.css` 的全局超級橢圓平滑。每個正圓 `border-radius`（`50%`、`100%` 或膠囊半徑）必須配對 `corner-shape: round`，使圓形與膠囊保持圓弧；ui-theme 的 corner-shape spec 強制這一配對。
- 高層級表面（菜單、浮層、對話框、面板、懸浮按鈕、輸入框）設 `border: 0` 并使用 `box-shadow: var(--dsw-elevation-panel)`、`var(--dsw-elevation-prominent)` 或輸入框專用的 `var(--dsw-elevation-soft)`（更大模糊、更低透明度）：0.5px 發絲描邊是第一層投影，`--dsw-elevation-stroke-color` 可按表面或狀態重綁或抑制描邊。不得將 `--dsw-alias-border-*` border 與 lv/elevation 投影配對——ui-theme 的 elevation spec 會拒絕；狀態色 border（warn 面板）保持真 border。
- 使用中性 `--dsw-alias-border-*` token 的平面邊框與分割線一律 `0.5px`——按鈕、輸入框、卡片、行分割線，以及以填充盒繪制的分隔線（菜單分隔、對話標題欄接縫、markdown `hr`、豎向軌道線）共用發絲線粗細，Chromium 將其繪制為一個設備像素。dashed 記號與狀態色 border 保持 1px；spinner 圓環經 spec 的顯式豁免保留原寬度。更寬的中性 solid border 會被 ui-theme elevation spec 拒絕。
- 可點擊產物鏈接（Markdown 錨點、正文文件引用、網頁來源與抓取鏈接、產物 chips、workflow 成員鏈接）經 `--dsw-alias-link` 著色、`font-weight: 500`，默認無下劃線，hover/focus 時為 3px offset 的點狀下劃線。帶文字的錨點另以 ui-primitives 的 `LinkIcon` 分類圖形（隨 `currentColor`）作前置；workflow 成員鏈接與只包圖片的錨點不帶圖形，工具行文件鏈接保持其灰色點線示能（[可點擊鏈接 Agent Note](../.agents/notes/implemented/feature/2026-09-04-web-clickable-link-styles.zh.md)）。

## 變更系統

在所屬 `ui-theme` 樣式表中添加或修改共享 token，然后在功能包中使用其語義別名。公共樣式約定發生變化時，更新所屬包的參考文檔。視覺行為遵循[測試策略](testing.zh.md)；[樣式系統 Agent Note](../.agents/notes/implemented/process/2026-07-19-web-styling-system.zh.md) 記錄框架依據。
