---
description: "面向用戶與維護者的 web GUI 啟動內核說明：客戶端插件樹的兩階段啟動、無框架啟動頁與共享模塊表，用于組合或排查瀏覽器應用。"
kind: "package-library"
---

# @deepseek-ai/dsh-client-web

[English](README.md) | 中文

## 概述

`dsh-client-web` 啟動 web GUI：它先從 Host 提供的啟動圖加載客戶端模塊系統，再在應用掛載前激活每一個客戶端插件，因此只有當所有插件都就緒時完整 UI 才會出現。無框架啟動頁會逐 entry 報告狀態，因此失敗的 bundle 或插件保持可見，而不是白屏。它還定義共享模塊表（`PLATFORM_MODULES`），每個動態 bundle 都依據它解析 external。模型永遠看不到本包。

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

組裝瀏覽器應用時使用它：`apps/web` 的 Vite 入口對掛載點運行 `new AppWebEntry(container).run()`，啟動頁會在激活過程中向用戶展示進度。普通瀏覽器調用方不傳任何選項。默認使用預注入的頁面傳輸，除非提供 `seams` 覆蓋：當 `globalThis.__DSH_TRANSPORT__` 攜帶 `loadBundle` 時，模塊階段將其采納為 bundle 傳輸并跳過 `immediately` 層級的 HTTP 預取，而顯式 `seams` 仍然優先（例如外部 `<script>` 執行無法到達頁面上下文的 jsdom 測試）。

外殼基礎樣式會在支持的瀏覽器中為普通內容自動添加中西文間距。語義化代碼以及終端、diff、讀取和搜索輸出容器會保留源碼中的原始間距和列對齊；不支持 `text-autospace` 的瀏覽器會忽略這兩項聲明。

### 啟動過程是怎樣的

啟動分兩個階段：模塊階段接納 parser 已加載的 bootstrap 批次，從 Host 提供的啟動圖構建模塊系統，并通過只執行一次的共享 application 批次 URL 預取 `immediately` 層級。插件階段隨后激活每個圖 entry 并等待全部就緒，之后才把帶標記的啟動 DOM 交給 UI 渲染器，由它 hydrate 并切換到完整 UI。

### 啟動頁

啟動頁只使用原生 DOM 與本地 CSS，因此 bundle 與插件激活失敗保持可見：它顯示一個 spinner 節點，其 CSS 圓弧隨 entry 激活而增長，并逐 entry 報告狀態。spinner 及其動畫相位會一直保留，直到完整 UI 替換啟動頁。導入或激活失敗的插件會按名稱報告并給出原因（缺失服務、導入錯誤或狀態），而不是白屏。

### 共享模塊表

`PLATFORM_MODULES`（位于 `src/platform.ts`）列出外殼預置的共享模塊——React、Cordis 與靜態 UI 庫——并與 `PRELOADED_CLIENT_EXTERNALS`（parser 預載的運行時行）一起定義每個動態 bundle 解析所依據的隱式 external 基座。`dsh.client.external` 只添加基座之外的精確請求；參見[共享模塊與模塊圖](../AGENTS.md#shared-modules-and-the-module-graph)。

### 配置

本包自身不接受任何插件配置；生成的[配置目錄](../../../docs/config-catalog.zh.md)列出倉庫中每個插件配置以供對照。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋啟動內核的構建方式；可觀察行為已在[使用本包](#use-this-package)中說明。

### 設計理念

內核恰好擁有三樣東西：模塊系統、Cordis Loader 與啟動頁。Graph、批次 preload 與 loader facade 歸 Host 所有，因此 `AppWebEntry` 永不感知 bootstrap 包 id，也不解析協議格式（wire format）。動態 UI 渲染器只在每個客戶端 entry 激活后收到掛載點。

### 兩階段啟動

`run()` 調用 Host 安裝的 `window.__ModuleLoader__.create({ boot, staticModules, ...seams })`；facade 接納 parser 已加載的 bootstrap 批次后返回構造好的模塊系統與已解析 manifest（元數據清單）。模塊階段通過一個共享的 application 批次 URL 預取 `immediately` 層級。插件階段掛載 Loader、把 `loader.internal` 賦為 `modules`、統一創建全部圖 entry、等待完全停穩，然后審計激活：任何導入失敗、因缺失服務而 pending，或落入其他非 active 狀態的 entry，都會拋出一個聚合錯誤，點名每個失敗 entry。

### 啟動頁機制

啟動頁是原生 DOM 加本地 CSS，其回退字體與顏色匹配加載期間到達的主題 token。`internal/status` 事件驅動一個 spinner 節點與逐 entry 標簽；hydrate 會保留該節點與動畫相位直到應用提交，`fail()` 渲染拋出的原因。React 掛載、slot 渲染與應用組裝位于 `ui-renderer`；`ui-layout` 擁有組裝后的瀏覽器標題投影。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 庫入口：`AppWebEntry`、`getStaticModules`、平臺表 |
| [`src/boot.ts`](src/boot.ts) | `AppWebEntry`：模塊階段、啟動頁、immediately 層級預取，隨后調用 `bootClient` + `mountClient` |
| [`src/boot-client.ts`](src/boot-client.ts) | `bootClient` / `assertEntriesActive`：掛載 Loader、每個 manifest 行一個 entry、激活審計 |
| [`src/mount.ts`](src/mount.ts) | `mountClient`：經 `uiRenderer` 依賴 fiber 完成渲染器交接 |
| [`src/boot-page.ts`](src/boot-page.ts) | 無框架啟動頁：spinner、逐 entry 狀態、失敗渲染 |
| [`src/platform.ts`](src/platform.ts) | `PLATFORM_MODULES` / `PRELOADED_CLIENT_EXTERNALS`：隱式 external 基座 |
| [`src/seed.ts`](src/seed.ts) | 啟動時交給 loader 的靜態模塊表 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當啟動約定不夠用時閱讀以下頁面：它所啟動的模塊系統、掛載應用的渲染器，以及基座背后的客戶端編寫規則。

- [客戶端模塊系統](../modules/README.zh.md)——本內核消費的惰性模塊表與啟動圖。
- [UI 渲染器](../ui-renderer/README.zh.md)——接收掛載點并把 slot 數據綁定到 React。
- [客戶端模塊子系統](../../../docs/subsystems/client-modules.zh.md)——web 插件表、啟動圖協議與 bundle 路由。
- [客戶端編寫規則](../AGENTS.md#shared-modules-and-the-module-graph)——共享模塊基座與 `dsh.client.external` 語義。
- [客戶端組地圖](../README.zh.md)——本包所屬的瀏覽器半側。

-----

<a id="model-experience"></a>
## 模型體驗

無。啟動內核屬于瀏覽器側 UI 插件層，不注冊任何面向模型的內容。

#### KV Cache 影響

無；該包既不組裝也不發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明啟動內核不支持什么。它們是當前包約束，不是任務積壓。

- **應用會等待全部 entry 就緒**——只要一個 entry 失敗，無框架啟動頁就會保留并逐項報告；不支持部分 UI 可用。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。這是 Vite entry shell，只負責 boot glue 與 module-table seeding，不發出 Cordis 事件或持有跨插件可變狀態；boot chain（加載頁 → 啟動就緒 → 一次切換至 UI）由真實 carrier 上的 web e2e 冒煙測試驗證。
