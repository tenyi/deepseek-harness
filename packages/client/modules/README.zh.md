---
description: "面向用戶與維護者的 web GUI 客戶端模塊系統說明：宿主側組合啟動圖并提供插件 bundle，瀏覽器側按需加載，用于組合或排查客戶端插件。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-modules

[English](README.md) | 中文

## 概述

`dsh-client-modules` 把插件包的 `dsh.client` 聲明變成可加載的瀏覽器 bundle：宿主半側掃描已啟用的 Loader 條目并組合啟動圖，可用的 Web 載體通過 `/plugins` 提供每個 bundle，由 shell 持有的載體則通過 `fetchBundle()` 分派完全相同的 bundle 響應。瀏覽器半側按需惰性加載這些 bundle。插件 bundle 惰性執行——運行 bundle 只注冊 factory，模塊副作用在物化時運行——因此插件首次被使用之前什么都不會運行。這里的一切都是瀏覽器內核機制；模型永遠看不到它。

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

聲明類型使用 [`DshClientManifest`](../../util/package-manifest/README.zh.md)。Client-modules 校驗 JSON，并持有歸一化后的啟動圖。

組合或構建瀏覽器客戶端插件時使用它：本包把包的 `dsh.client` 聲明變成可加載的瀏覽器 bundle，無需任何逐插件接線。它隨 web 組合激活；外殼在任何插件運行前啟動它。

### 聲明客戶端插件

瀏覽器插件包在其 `package.json` 中以 `platform: 'web'` 聲明 `dsh.client`，導出 `./client` bundle，并在 `dsh.client.external` 下列出任何基座之外的模塊請求。宿主半側把每份聲明變成 `/plugins` 下提供的 bundle，并讓動態提供方先于其消費方加載。

### 瀏覽器加載什么

application combo 腳本在啟動時僅注冊一次插件 factory；模塊主體仍保持惰性，只在首次 import 或物化時運行。共享 combo URL 的 row 共用一個進行中的腳本任務。HMR（熱模塊替換）會讓一條發生變化的 row 改用帶 revision 的單資源 combo URL。`<id>/client` 與裸 id 解析到同一組導出，因為插件 bundle 就是其包的客戶端半側。

### 共享模塊

外殼初始化一張凍結的模塊表（`PLATFORM_MODULES`：React、Cordis 與靜態 UI 庫）；每個動態 bundle 都精確針對該基座解析其 external。`dsh.client.external` 只添加基座之外的精確請求；系統會將每個請求解析到其指定的動態包 row 或完全匹配的靜態表鍵。純類型 import 會被擦除，不產生請求。組合階段會拒絕畸形請求、缺失提供方、自請求與同步請求環。

### 構建要求

宿主提供的是已構建的客戶端 bundle，因此啟動前 `pnpm run build` 必須已產出每個 `lib/client.js`；缺失 bundle 會明確導致激活失敗，并給出一條構建說明及包／路徑列表。源碼啟動會把宿主側導入映射到 TypeScript 源碼，但仍消費這一構建后的客戶端導出。本包自身不接受任何插件配置。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋模塊系統的構建方式；可觀察行為已在[使用本包](#use-this-package)中說明。

### 設計理念

本包分為兩側：Node 半側負責組合與提供（`ctx.clientModules`，`ClientModuleRegistry`），瀏覽器半側負責加載（`ctx.modules`，`ClientModuleSystem`）。兩者之間的協議是啟動圖——以 `window.__DSH_BOOT__` 注入的 `WebBootEntry` 行，`<` 已轉義，插件控制的字符串無法逃出 script 元素。vendored Loader 唯一的消費點是 `EntryTree.import`，因此模塊系統就是「插件代碼如何到達」的唯一可替換實現。

### 惰性 CJS 模型

執行插件 bundle 只注冊其 factory；每個模塊主體副作用（包括 CSS 注入）都位于 factory 閉包中，在物化時運行（`factory(require)` → 導出，在 `loadCache` 中記憶化）。factory 依賴另一個已注冊但未物化的模塊時會遞歸物化它；require 循環會拋出異常，因為 factory 形式的 CJS 無法提供部分導出。解析會依次檢查平臺 seed 表、已記憶記錄、啟動圖 row 與已注冊 factory；其他情況一律拋錯。交給 factory 的同步 `require` 使用相同順序，但不含異步圖 row 加載，并把觀察到的邊記錄到模塊記錄中。

### 增量組合

Node 半側逐包增量掃描——沒有全量重掃路徑。每次發出 `internal/plugin` 事件時，系統都會把該 fiber 的 entry 名標臟；微任務 flush 會把每個臟名與當前 loader 條目對賬，激活 pass 會初始化同一個臟集合并同步 flush，因此首次掃描與穩態共用同一實現。包元數據按 Loader specifier 與所屬 tree base URL 緩存至重啟，解析出的 manifest（元數據清單）包名作為瀏覽器模塊身份。若不同的 active Loader source 解析到同一包名，組合會失敗；移除沖突來源后，剩余來源無需重啟 fiber 即可接替。bundle 內容變更只能通過 `rebuilt()`（HMR 鉤子）進入圖。

Node 半側會在發布前快照每個客戶端 bundle 及其現有 source map。它把資源分組到 `/plugins/??...&rev=...` combo URL：modules row 使用一個 bootstrap combo，其余 row 使用一個或多個 application combo；每個階段都會在 URL 超過 3 KiB 之前分區。每個 combo map 都是 Indexed Source Map v3，并在可用時使用作者提供的 section，否則為已打包 bundle 生成 identity section。初始逐插件 revision 使用進程 nonce，所以啟動時不哈希每個插件；HMR 只哈希被報告為已變化的產物。已公告響應不可變；未知組合或 revision 返回 404。

### 啟動 manifest 注入

宿主貢獻結構化 index 行，并向 `<head>` 注入：`window.__ModuleLoader__` queue facade、每個 application combo 的提示性 preload、阻塞 parser 的 bootstrap combo 腳本，然后才是外殼讀取前的啟動圖。Web 載體把這些行渲染進 index 響應；由 shell 持有的載體則可以在沒有 Web server 時渲染同一批行。facade 的 `create()` 物化 modules bundle、把構造委托給其 `createClientModuleSystem` 導出，并讓同一 facade 進入 live registration 模式。

### 源碼索引

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | Node 半側：`ClientModuleRegistry`、掃描、產物快照、可選 combo 路由、結構化 index 行 |
| [`src/client/index.ts`](src/client/index.ts) | 瀏覽器半側：bootstrap 導出、`ctx.modules` 登記 |
| [`src/client/system.ts`](src/client/system.ts) | `ClientModuleSystem`：加載／物化／失效機制 |
| [`src/client/manifest.ts`](src/client/manifest.ts) | 協議類型、啟動清單解析與 `dsh.client` 聲明解析器 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當模塊約定不夠用時閱讀以下頁面：子系統參考、啟動插件樹的外殼，以及圖背后的客戶端編寫規則。

- [客戶端模塊子系統](../../../docs/subsystems/client-modules.zh.md)——web 插件表、`WebBootGraph` 協議與 bundle 路由。
- [Web 啟動內核](../web/README.zh.md)——創建模塊系統并啟動插件樹的外殼。
- [客戶端 HMR 驅動器](../hmr/README.zh.md)——在重建 bundle 上驅動 `invalidate`/`prefetch` 的重載鏈路。
- [客戶端編寫規則](../AGENTS.md#shared-modules-and-the-module-graph)——共享模塊基座與 `dsh.client.external` 語義。
- [客戶端組地圖](../README.zh.md)——本包所屬的瀏覽器半側。

-----

<a id="model-experience"></a>
## 模型體驗

無。模塊 loader 屬于瀏覽器側內核機制，不注冊任何面向模型的內容。

#### KV Cache 影響

無；該包既不組裝也不發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明模塊系統不做什么。它們是當前包約束，不是任務積壓。

- **有意采用扁平模塊圖**——每個 bundle 是一個模塊節點，其邊只指向表中的葉節點；接口（`loadCache`/`edges`/`invalidate`）已經支持通用模塊圖，因此可以改變 externalization 粒度而不更改接口。
- **自身不維護卸載記錄**——樣式移除與 fiber 拆卸順序屬于 HMR 驅動器（`@deepseek-ai/dsh-client-hmr`）；loader 只在每條記錄中登記其擁有的樣式標簽 id。
- **快照式提供會保留產物字節**——Host 在內存中保留每個 bundle、可選 source map、生成的單資源響應和當前啟動 combo 響應；HMR 還會保留上一代啟動響應。內存會隨已組合客戶端產物增長為數份副本，以換取不可變響應和一代競態容忍。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
