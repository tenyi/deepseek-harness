---
description: "瀏覽器 UI 渲染器：React slot 綁定、ctx.uiRenderer 與 dsh Web 客戶端組裝后的應用根。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-renderer

[English](README.md) | 中文

## 概述

`dsh-client-ui-renderer` 掛載組裝完成的 dsh Web 客戶端 GUI：完整客戶端插件名冊穩定后，啟動內核調用 `ctx.uiRenderer.mount(container)`，它會 hydrate 不依賴框架的啟動頁，并在下一次繪制前切換到完整的 React 應用。業務插件仍是接收類型化 props 的普通 React 組件，通過 props 獲取會話與 Workspace 數據，永遠不需要自行接線訂閱——渲染器在 slot outlet 處把運行時的裸 observable source 綁定為 selector 鉤子。Web 外殼與啟動內核是它僅有的直接消費方，因此只要組合需要 React 渲染的 GUI，就需要它。

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

本包屬于基礎設施：Web 外殼與啟動內核是它僅有的直接消費方。只要組合需要 React 渲染的 GUI，就需要它——`dsh-client-web` 加載名冊，等待每個 entry 激活，然后調用 `ctx.uiRenderer.mount(container)`。

### 掛載做什么

`mount(container)` 會安裝 slot 渲染器、在存在時 hydrate 現有啟動 DOM、在下一次繪制前把組裝后的應用渲染進容器，并返回一個卸載 React 根的 disposer。渲染器執行全程序唯一一次上下文級 `renderSlot('root')` 調用；注冊的根占用方擁有產品布局與文檔元數據。

### 對業務插件

業務插件通過 slot 系統注冊組件；渲染器在 outlet 處把運行時的會話與 Workspace observable source 綁定為 selector 鉤子。插件通過其組合 props 收到標準會話 props（session id、對話快照鉤子）——它絕不導入渲染器，也不觸碰 React 內部機制。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本包實現一條邊界：對象層（運行時，無 React）擁有業務狀態；這里是 ctx 到 React 集成唯一發生的位置——slot 渲染器、`SessionProvider` 與 `useSyncExternalStore` 適配器。

### 激活與掛載

插件在 `slots`、`sessions` 與 `layout` 就緒后激活；它安裝 `createSlotRenderer()` 并 reflect `uiRenderer` 服務。`mountApp` 會查找啟動內核的 `[data-dsh-boot]` 元素：存在時經 `BootHandoff`（一個保留加載 DOM 的單幀透傳）hydrate，否則創建全新的根節點并同步提交渲染。

### Slot 綁定

`createSlotRenderer` 把 slot 注冊表連接到 React：條目列表成為響應式 source，每個 outlet 經已安裝的渲染器渲染。業務插件通過帶類型的 slot `hooks` 傳遞裸 observable source；渲染器經 uSES 適配器在 outlet 處完成綁定。

### 身份

React、React DOM、Cordis、ui-slots 與 ui-primitives 通過 Web 外殼的靜態模塊表保持同一瀏覽器身份；本包則以動態客戶端 bundle 的形式加載。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

以下頁面覆蓋周邊機制與組合模型。

- [ui-slots](../ui-slots/README.zh.md)——本渲染器綁定到 React 的 slot 注冊表純核心。
- [web](../web/README.zh.md)——加載名冊并調用 `mount` 的外殼。
- [ui-session](../ui-session/README.zh.md)——提供本渲染器所綁定標準會話 source 與鉤子的適配器。
- [Web 客戶端架構](../../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.zh.md)——加載鏈、對象層與分層紅線。
- [slot 系統標準](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.zh.md)——權威組合模型。

-----

<a id="model-experience"></a>
## 模型體驗

無。該包是瀏覽器端渲染組裝層，不注冊任何面向模型的內容。

#### KV Cache 影響

無；該包既不組裝也不發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明應用首幀何時出現、按區域就緒能走多遠；它們是當前包約束。

- **應用首幀會等待全部客戶端 entry**：啟動內核只在 loader 名冊穩定后交出掛載點；按區域就緒仍屬暫緩事項。
- **slot 渲染沒有 Suspense 集成或逐 entry 惰性加載**：完整插件名冊穩定后，渲染器才掛載根節點。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
