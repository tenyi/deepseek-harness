---
description: "Web GUI 的外殼布局：三欄 AppFrame（右欄作為貼邊面板的軌道）、面板幾何服務與主題呈現；供窗口外殼的使用者與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-layout

[English](README.md) | 中文

## 概述

本包提供 Web GUI 的三欄 AppFrame、左右欄寬度與 `ctx.layout` 呈現控制。右欄先讓步以保護中欄空間，全屏由占用方呈現，框架保留寬屏底層軌道。主題呈現器負責配色、別名 token、正文字號與 document 元數據；布局狀態在刷新后重置。

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

本插件在 root slot 中組合側邊欄、主內容和右欄。側邊欄寬度為 264～420px，默認為 280px，收起后保留 56px 控制欄；窗口寬度低于 1024px 時自動收起，打開右側面板也會收起手動展開的側邊欄。右側面板首次打開時使用視口寬度的 45%，之后保留用戶的像素寬度偏好，上限為 70%。為給中欄保留 400px，框架先將右側面板縮減至 300px，再報告空間不足，使占用方將其關閉，最后才進一步壓縮中欄。拖動沒有過渡延遲；右側手柄在關閉或全屏時不顯示。

全局面板占據 root 作用域的 `main` keyed slot；`conversation` 是為會話界面保留的 key。`ctx.layout.selectPanel(id)` 選中已注冊面板，`null` 則選中會話界面，但不改變當前會話。默認組合不注冊任何全局面板。

### 主題呈現

呈現器消費解析后的主題快照，并投影到 document：`html { color-scheme }` 驅動原生 UA 控件，依據當前配色方案設置 `body[data-ds-dark-theme]`，把主題的別名 token 與 `--dsh-content-font-size` 設為 body 上的內聯變量，并持有一個 `<meta name="theme-color">`，其內容隨計算后的 body 背景色更新。對呈現器執行 dispose（資源釋放）時，它會連同其他全局寫入一起移除自己的元數據節點。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

`selectPanel(id)` 在改變選中態前檢查實時 `main` 注冊表；缺失的 key 會拋錯并保留當前面板。`beginNavigation()` 為異步 UI 導航返回 abort signal。后續調用、有效面板選擇（包括重復選擇）或布局釋放會中止該 signal，但不取消底層會話創建。消費方在提交導航或搬移草稿前檢查 signal。

一次注冊聲明四個子 slot，并綁定 `ctx.layout` 的 `selectPanel`、`toggleSidebar`、`openRightbar(track, fullscreen)` 與 `closeRightbar`。同一個 root 存儲把 `panelInfo` 選中態與 `layoutInfo` 測量、寬度偏好、呈現報告分開。`usePanelInfo` 訂閱引用穩定的選中態對象，AppFrame 訂閱引用穩定的布局對象。`rightbar` owner 提供實際 `width`、`viewportWidth`，以及表示能否以普通模式呈現的 `canShow`；占用方在空間不足時執行確定性的收起，變寬不自行重新展開。全屏隱藏寬度手柄，但不自行釋放占用方要求保留的軌道。AppFrame 保持各列容器掛載。右欄的 root 控制器僅在選中會話界面時，經 `SessionProvider` 渲染 `rightbar.session`；內容卸載時的報告釋放軌道。獨立的標題組件僅在會話界面可見時使用所選會話標題，以構建配置的產品標題或本地化 `common.brand.localBuild` 為回退值；語言變化會更新該回退值。主題呈現器是第二個 effect：從解析后的快照做純 DOM 寫入——初始狀態經 getter 讀取一次，此后僅事件驅動，不經過 React。它先應用調色板、字號與 token 變量，再把渲染出的背景測量為唯一的顏色依據。全屏呈現禁用網格和手柄過渡；占用方完全覆蓋框架后才報告新的列布局。退出全屏時，框架先保持無過渡并安裝目標布局：關閉移除右軌道，恢復保留右軌道。后續普通幾何操作恢復正常過渡。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當布局面不夠用時閱讀以下頁面。它們從框架進入它所渲染的欄與它所呈現的主題。

- [ui-sidebar](../ui-sidebar/README.zh.md)——占據 `sidebar` 欄及其座位。
- [ui-conversation](../ui-conversation/README.zh.md)——占據 `main` 中的 `conversation` key。
- [ui-sidebar-right](../ui-sidebar-right/README.zh.md)——以每會話一個停靠面占據 `rightbar` 欄。
- [ui-theme](../ui-theme/README.zh.md)——呈現器消費其解析快照的主題 seam。
- [Web 客戶端架構](../../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.zh.md)——瀏覽器插件行如何加載并注冊槽位。

-----

<a id="model-experience"></a>
## 模型體驗

無。布局外殼管理瀏覽器查看狀態；這里沒有任何內容進入模型請求。

#### KV Cache 影響

無；該包既不組裝也不發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制界定了當前布局行為。它們是當前包約束，不是通用窗口管理器對比或任務積壓。

- **面板幾何是瞬時狀態**——重新加載會恢復側欄默認值并隱藏右側面板；拖動設置的寬度是整個框架共用的一份偏好，而非每個會話各自的屬性。
- **極窄窗口**——右側面板關閉后，中欄仍可能小于 400px；左側 56px 控制欄仍會保留。
- **軌道與面板沿同一條曲線運動**——框架的軌道過渡和占用方的滑入讀取同一組時長與緩動變量；占用方若自用一套，擠壓時面板邊緣就會與會話界面的邊緣脫開。
- **擠壓重排期間無滾動錨定**——布局變化可能移動讀者的視口。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。外殼中 `ctx.layout` 背后的瀏覽狀態存儲不發出 Cordis 事件；clamp 與軌道的時序由本包各欄與服務規格直接斷言。
