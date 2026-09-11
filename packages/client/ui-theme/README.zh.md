---
description: "dsh Web 客戶端的主題與正文字號設置：--dsw-* token 樣式表、ThemeRuntime 狀態、「通用」設置行與插件前引導。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-theme

[English](README.md) | 中文

## 概述

`dsh-client-ui-theme` 讓 Web GUI 用戶在設置中選擇 `light`、`dark` 或 `system`，并把會話正文字號設為 12 至 17 px。回環客戶端把兩個值存入 `ui-theme` 設置命名空間，本地提供方默認將其持久化到 `$DSH_HOME/settings.yaml`。插件通過 `prefers-color-scheme` 解析 `system` 并發布不可變的 `ThemeSnapshot`；ui-layout 把每份快照應用到文檔。本包還提供 `--dsw-*` token 樣式表，并注入同步引導，使所選調色板與字號在外殼加載前生效。第三方主題可通過 `ctx.theme` 注冊別名 token 覆蓋。

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

用戶從設置（「通用」分區）的兩行中切換配色方案與正文字號；在回環瀏覽器上，兩個選擇都會跨重啟持久化。功能插件通過 `ctx.theme` 消費當前快照，并在 CSS 中讀取 `--dsw-*` token；它們不自行管理主題狀態。

### 外觀與字號

插件在「通用」分區注冊外觀偏好方塊與字號步進器。步進器接受 12 至 17 px 的整數，默認值為 14 px。它以相同增量調整會話標題與基礎文本，包括用戶氣泡與 composer 草稿；流內行的標題、摘要與表格跟隨比正文低一檔的字號，小號文本和代碼保持固定字號。每次通過的變更都經 Host settings API 寫入。連續快速變更按操作順序攜帶命名空間 revision 串行寫入，最新寫入被拒時重新加載持久值。非 loopback 頁面把兩個選擇都保留在進程內。

### 注冊主題

組合可以通過 `ctx.theme` 注冊帶別名 token 覆蓋的第三方主題 id；覆蓋層按注冊順序折入活動快照的 token 中。移除其中一個絕不會覆蓋最后一個持久化的內置偏好。第三方主題 id 仍是進程內擴展，不會跨越內置 settings schema。

### 插件前調色板

當主機組合包含 HTTP 服務器時，宿主側會把已注冊的 `ui-theme` 設置或 schema 默認值嵌入每份 index 響應。瀏覽器在加載頁面渲染前設置 `color-scheme`、`body[data-ds-dark-theme]` 與 `--dsh-content-font-size`，因此首幀繪制就采用所選調色板與字號。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

服務擁有主題與字號狀態并發布快照。ui-layout 展示轉換器應用這些快照，token 樣式表則擁有顏色與會話文本尺度。

### 樣式表

`src/styles/` 下有六張樣式表，由 ui-theme 的動態客戶端 entry 依次導入：`base.css`、`corner-shape.css`、`design-platform.css`、`scrollbar.css`、`gradient-shadow-text.css` 與 `shiki.css`。客戶端 bundle 將其編譯并注入為插件持有的全局樣式，因此卸載與 HMR（熱模塊替換）會隨 ui-theme 一同移除。`scrollbar.css` 是 `--dsw-alias-scrollbar-*` token 的唯一消費方，必須排在聲明這些 token 的 `design-platform.css` 之后。

`corner-shape.css` 平滑所有圓角：在 `@supports (corner-shape: superellipse(1.5))` 內定義 `--dsw-corner-shape`，并通過通配選擇器應用到所有元素及其 `::before`/`::after`，因此不支持 `corner-shape` 的引擎保持普通圓弧。正圓形狀——`border-radius: 50%` 的圓與膠囊半徑——因超級橢圓會使其變形，須在所屬組件樣式表中把 `corner-shape: round` 與半徑聲明配對；corner-shape 樣式表 spec 跨全部包樣式表強制這一配對。

`gradient-shadow-text.css` 從 `--dsh-content-font-size` 派生 `--dsh-content-font-delta`，并以該增量移動 Markdown 標題與基礎文本階梯。它同時派生低一檔變量 `--dsh-content-font-size-secondary`（設置 ≤14 時為設置值 −1，>14 時為設置值 −2；默認設置下為 13 px）及配套的 `--dsh-content-font-delta-secondary`，供表格變體與比正文低一檔的流內行使用。緊湊的小號文本與代碼變體保持固定字號。階梯之外，用戶氣泡與 composer 草稿直接讀取正文字號變量對，流內行的標題及摘要讀取低一檔變量對。該表還持有陰影階（`--dsw-shadow-lv*`）與 elevation token：`--dsw-elevation-stroke` 經可重綁的 `--dsw-elevation-stroke-color` 畫 0.5 px 發絲描邊，`--dsw-elevation-panel`/`--dsw-elevation-prominent`/`--dsw-elevation-soft`（composer 專用的更大模糊、更低透明度檔）在描邊之上疊兩層極淡柔光，因此高層級表面設 `border: 0`，不再有占布局的輪廓；派生 token 逐元素重聲明，使表面對描邊色的重綁真實生效。

### 滾動條重新綁定

`scrollbar.css` 在 `body` 上把 `--dsh-scrollbar-thumb` 與 `--dsh-scrollbar-thumb-hover` 綁定到 l1 基礎表面 token；高層級表面（菜單、浮層、對話框）在自己的容器上把它們重新綁定為 l2 token；這組變量的另一個合法目標是 `transparent`（ui-sidebar 在指針不在欄內時就這樣重新綁定自己的列）。WebKit 系瀏覽器還會讀取 `--dsh-scrollbar-width`、`--dsh-scrollbar-thumb-border` 與 `--dsh-scrollbar-track-margin`；滾動表面可重新綁定它們，在較窄的可見滑塊外保留較寬的拖動區域，或讓軌道避開圓角兩端。兩條渲染路徑在構造上互斥：Firefox 走 `@supports not selector(::-webkit-scrollbar)` 內的標準細滾動條，WebKit 系引擎走偽元素，因此幾何與 hover 定制只經由偽元素路徑生效。

### 偏好持久化

在 loopback 瀏覽器上，服務先以 schema 默認值立即提供自身，隨后加載 `ui-theme` 命名空間，并把每次通過的主題或字號變更經 Host settings API 寫入。收到推送的設置變更時或重連后都會重新拉取該命名空間。非 loopback 頁面不會創建該 Host-backed scope。該持久化邊界由 [Host 支撐的偏好筆記](../../../.agents/notes/implemented/bug-fix/2026-08-06-host-backed-web-preferences.zh.md) 擁有。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

以下頁面覆蓋布局展示轉換器、token 消費方與樣式規則。

- [ui-layout](../ui-layout/README.zh.md)——應用解析后主題快照的展示轉換器。
- [ui-sidebar](../ui-sidebar/README.zh.md)——滾動條重新綁定約定的消費方。
- [ui-conversation](../ui-conversation/README.zh.md)——為 composer 席位消費 `--dsh-scrollbar-width` 的消費方。
- [Web 樣式](../../../docs/web-styling.zh.md)——Web 客戶端組件的權威樣式規則。
- [Host 支撐的偏好](../../../.agents/notes/implemented/bug-fix/2026-08-06-host-backed-web-preferences.zh.md)——持久化邊界決策。

-----

<a id="model-experience"></a>
## 模型體驗

無。該包是瀏覽器端 UI 插件層，不注冊任何面向模型的內容。

#### KV Cache 影響

無；該包既不組裝也不發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制定義主題擴展表面與顏色權威；它們是當前包約束。

- **第三方主題是擴展點，不是產品**：注冊主題意味著覆蓋同名別名變量；目前不會驗證一組覆蓋是否完整。
- **token 樣式表是顏色值的唯一權威來源**：設計系統中缺失的值會有意不補入；一律采用最接近的語義 token，設計負責人批準的新增值須在同一變更中以一個靜態尺度層級與一個語義別名的形式進入。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。settings scope 校驗并發布持久 theme section，注冊表與自身變更同步發出 `theme/change`；存儲與注冊表的一致性由本包針對 Host、scope 與服務行為的測試直接覆蓋。
