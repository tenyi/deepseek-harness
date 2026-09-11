---
description: "僅用于開發環境的瀏覽器客戶端插件熱重載：重建插件 bundle 后原地替換運行中的插件，供開發者迭代 web GUI。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-hmr

[English](README.md) | 中文

## 概述

`dsh-client-hmr` 會在瀏覽器客戶端插件的 bundle 重建后原地重載該插件，讓編輯插件源碼的開發者無需整頁刷新即可看到變更。如果沒有重建 watcher，整條鏈路保持空閑：只有 `pnpm run dev:web` 之類的進程重寫客戶端 bundle 時才會產生它所響應的重建。每次重載只替換一個插件并攜帶全新組件狀態，而數據層（連接、運行時與 Session 對象）保持不變。這里的一切都是瀏覽器側的開發機制；模型永遠看不到它。

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

為正在編輯的插件啟用重建 watcher，然后保存：瀏覽器會從 dev server 拾取重建后的 bundle，并在不重載頁面的情況下替換該插件。在客戶端開發期間使用它；在生產構建中沒有任何可觀察行為，因為沒有 watcher 會重寫 bundle。

### 啟動重載鏈路

對同一個宿主運行 `pnpm run dev:web`（或任何寫入插件 `lib/client.js` 的 tsdown watch 進程）；重建后的插件隨后會被自動逐個替換進運行中的瀏覽器。

### 一次重載做什么

每次重載都會重新執行插件 bundle，并用全新狀態重新掛載插件。依賴被重載插件的插件會隨之自動重載。失敗的重載會以可見方式報告，并在下一次重建時從頭重試。

### 配置

| 字段 | 默認值 | 含義 |
|---|---|---|
| `pollIntervalMs` | `500` | bundle stat 輪詢間隔，單位為毫秒 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-client-hmr)是所有受支持字段及其 JSDoc 的完整真源。

### 觀察成功

成功的替換會立即顯示編輯后的 UI，無需頁面重載，且插件在替換后繼續工作。請記住權衡：被重載插件內的 React 狀態會丟失，而會話、工作區與連接狀態會保留。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋重載鏈路的構建方式；可觀察行為已在[使用本包](#use-this-package)中說明。

### 設計理念

鏈路分為兩半，共用一份約定：node 半側負責 bundle 檢測與通知，瀏覽器半側負責替換。node 半側運行一個 interval，從 module host 讀取文件前的基線開始 stat 輪詢每個圖 bundle。未變化的啟動 row 無需讀取內容或求 hash 即可開始監視；發生變化的 row，或產物恢復后的 dirty row，會進入 `rebuilt()`，且只廣播真實 revision 變更。`rebuilt()` 會把當前 source map 與已變化的 bundle 一起讀取；僅寫入 map 不會重載可執行代碼。node 半側還提供 `/plugins/events`，一個廣播 `graph` 與 `rebuilt` 幀的 SSE（Server-Sent Events）通道。

### 瀏覽器側替換

收到 `rebuilt` 幀后，幀內 revision 會讓 `invalidate` 選擇該插件不可變的單資源 combo URL，而不是初始多資源 URL。`prefetch` 在舊 fiber 仍在服務時加載并注冊新 factory。其余順序是：先從注冊表刪除，再拆卸（在 fiber 的 disposer 發出 `internal/plugin` 之前執行 `registry.delete`，否則 vendored Loader 會把該 entry 標為禁用）、等待舊 fiber 卸載完成、刪除 `entry.fiber`、移除自身擁有的 `<style data-plugin>` 標簽，然后 `entry.refresh()` 重新導入并掛載，`fiber.await()` 直接把啟動失敗重新拋出。替換之所以安全，是因為在惰性 CJS 模型下執行只是注冊：每個模塊副作用都位于 factory 閉包中，在物化時運行。

### 級聯與自重載

fiber 的激活 epoch 會串聯其服務提供方的 uid，因此替換提供方 fiber 會通過 Cordis 自身級聯重載所有依賴方，無需 HMR（熱模塊替換）側維護任何簿記信息。本插件本身也是一個圖 entry，因此 `rebuilt` 幀可能點名它；進行中的重載在舊 bundle 的閉包中繼續運行，新 bundle 的 apply 會打開全新通道。

### 失敗策略

不回滾：導入失敗會讓 entry 失去 fiber（下一個 `rebuilt` 幀從頭重試），apply 失敗則會在外殼的狀態投影中留下 FAILED fiber。兩者都會輸出醒目的錯誤日志。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | node 半側：bundle stat 輪詢、`rebuilt` 上報、`/plugins/events` SSE 通道 |
| [`src/client/index.ts`](src/client/index.ts) | 瀏覽器半側：SSE 訂閱、串行重載隊列、fiber 替換 |
| [`src/events.ts`](src/events.ts) | 共享幀類型（`graph` / `rebuilt`）與端點常量 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當重載約定不夠用時閱讀以下頁面：提供 bundle 的模塊系統、啟動它們的外殼，以及 external 背后的模塊圖規則。

- [客戶端模塊系統](../modules/README.zh.md)——本驅動器驅動的惰性 CJS 模塊表與 `invalidate`/`prefetch` 鉤子。
- [Web 啟動內核](../web/README.zh.md)——啟動插件樹并展示 entry 狀態的外殼。
- [客戶端組地圖](../README.zh.md)——本包重載的瀏覽器半側。
- [生成配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-client-hmr)——每個受支持配置字段及其源聲明。

-----

<a id="model-experience"></a>
## 模型體驗

無。重載驅動器屬于瀏覽器側 UI 插件層，不注冊任何面向模型的內容。

#### KV Cache 影響

無；該包既不組裝也不發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明重載驅動器不會保留或恢復什么。它們是當前包約束，不是任務積壓。

- **重載有意保持粗粒度**——全新 fiber 與全新組件；被重載插件內的 React 狀態會丟失，而數據層（連接 fiber、運行時 fiber、Session 對象）不受影響。react-refresh 級狀態保留與重新執行 bundle 沖突，因此有意排除。
- **失敗時不回滾**——失敗的重載會讓該 entry 保持 FAILED 并在 loader 狀態投影中可見；系統不會自動恢復先前 bundle。
- **重建幀不會替換啟動圖**——每個幀都攜帶單資源 combo 重載所需的插件產物 revision；頁面重載時才接收重新組合的啟動圖。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
