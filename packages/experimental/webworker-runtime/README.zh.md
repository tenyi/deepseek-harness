---
description: "面向構建或排查實驗性 Web 預覽運行時的維護者，說明瀏覽器 worker 中的 harness 托管。"
kind: "package-library"
---

# `@deepseek-ai/dsh-experimental-webworker-runtime`

[English](README.md) | 中文

## 概述

瀏覽器 worker 宿主：整棵 harness 插件樹跑在一個 dedicated Web Worker 里，用于預覽部署與打包回歸（[實驗組](../README.zh.md)）。worker 邊下載邊解壓打包好的 VFS 鏡像并掛載進內存，經 CommonJS 包裝加載器裝載模塊，并通過一條講純 HTTP 的 postMessage 隧道服務頁面。當預覽需要在沒有 Node 宿主的環境中運行已打包 harness 時，請使用它。

## 目錄

- [使用本包](#use-this-package)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

一條 tsdown 管線產出三個構建產物；另有一層由源碼維護的進程實現：

- **`lib/index.js`（裝配庫）**——`createWorkerHost`/`startWorkerHost` 掛載基礎鏡像和按序排列的數據 overlays（`storage/`）、安裝模塊加載器（`module-system/`）與 `process` shim、經鏡像自帶的 `dsh-app-boot` 啟動插件樹，并把服務 seam 交給隧道。Overlay 只能替換 `home/` 與 `workspace/` 下的文件，不能替換基礎 manifest、配置或模塊。鏡像布局契約（`image-layout.ts`：虛擬根、config/manifest 路徑、空目錄、`lowered` 包裝契約門）與 packer 共享。boot patch 強制部署形態行：關前端靜態服務、JSONL 會話日志走明文、preset 根指向鏡像內 `config/agent-presets`。
- **`lib/worker.js`（worker 束）**——裝配庫加本包的 Node 兼容層，合成一個自含 ES module。模塊代理表（`module-proxies.ts`）是唯一平臺叉口：`node:*` 內建走 VFS、隧道和瀏覽器原語，瀏覽器做不到的走結構化 stub（調用即在 console 報錯并拋出），native/binary 包則替換執行后端。`node:module` 在鏡像 package 根之上提供 `createRequire().resolve` 與 `.resolve.paths()`，使未修改的包無需執行目標模塊即可發現 manifest。全局 `process` shim 帶有包括 `title` 在內的 Node 環境識別字段，避免 Worker 執行誤入僅適用于 DOM 的分支。pack 期解析器會把名稱靜態可知的模塊請求報告給 packer 的可達性遍歷，其中包括通過 `node:module` 或 `module` 具名導入在模塊作用域直接發起的 `createRequire(import.meta.url)('pkg')` 調用。保存、經 CommonJS 獲取或另設基準的 `createRequire` 調用需要鏡像入口種子。VFS mutation 驅動 `node:fs` 的 callback、polling 和 promise watcher；打開的 descriptor 在 rename、replacement 和 unlink 后仍保留文件身份與訪問模式，只要文件名仍指向該文件，`FileHandle.stat({ bigint: true })` 報告的 device 與 inode 身份就與路徑 stat 相同，`FileHandle.chmod()` 則更新打開文件身份的權限；`readable-stream` 提供文件流以及 Chokidar、readdirp 等未修改鏡像包所用的流狀態機。AsyncLocalStorage 經 pack 時降低注入的 snapshot/restore 面在 `await` 間攜帶同步棧因果。worker 不帶編譯器：packer 未降低的鏡像在掛載時被拒。
- **`src/shell/`（worker 自己的進程層）**——瀏覽器 worker 無法 fork，所以 `node:child_process` 不是 stub 而是實現：`spawn` 把命令放進它自己的 Web Worker——就是這同一個束，由首幀告訴它「你是 shell 進程」——并以 subprocess 服務消費的 `ChildProcess` 面報告結果。命令不占宿主線程，`SIGKILL` 不管它在干什么都能終止它，而它只能靠消息觸達 VFS（由宿主應答這些幀）。Worker 平臺 executable 在不替換 JavaScript 包、也不把具體實現耦合進 `node:child_process` 的情況下保持 Landlock 等 native 包協議；普通命令使用本包的求值器與 coreutils 命令表。語法來自 `@yarnpkg/parsers` 的 `parseShell`，而 `execSync`/`fork` 依然拒絕，因為它們需要真進程。
- **`lib/client.js`（頁面半）**——啟動分為相互獨立的兩段。`chooseWorkerHostSource({ image?, fixtureManifest? })` 可選地擁有 boot barrier 與 fixture manifest：沒有 `preview-fixture` 時停在來源選擇面板，合法 query 則直接選擇；兩條路徑都返回按序排列的 overlays。`connectWorkerHost(worker, { image?, overlays? })` 仍是公開的基礎運行態連接器；調用方跳過選擇器時 overlay 列表為空。`apps/web` 調用這兩段并提供靜態打包的 Worker。開局 `init` 幀攜帶基礎鏡像與按序排列的 overlay URL，boot 載荷送達結構化 index 注入表，`applyIndexInjections` 在殼入口運行前逐行執行。腳本 preload 行只是提示，因此會被跳過：`/plugins` 資源只能經 tunnel 解析，`loadBundle` 會在首次需要時獲取 combo、把僅 tunnel 可達的 sourcemap 內嵌為 Base64 data URL，再以 Blob 執行腳本。Tunnel 還暴露 fetch 形式的傳輸、獨立文件上傳載體和 API 客戶端。請求幀通過結構化克隆保留 Blob 請求體，并轉移 `ReadableStream<Uint8Array>` 的所有權。Host Worker 將兩種請求體都逐塊送入路由，因此通用文件上傳不會在任何瀏覽器線程創建完整字節數組。

驗收在 `apps/web/tests/preview-boot.e2e.ts`：靜態服務真實構建頁面，在 headless Chromium 里驅動 pre-boot 選擇面板與 Worker 激活。空白選擇驗證首次啟動；`vfs-example` overlay 提供普通 workspace 文件與明文 persistence 產物，無需模型請求即可驗證 Workspace/Session 冷發現、工具呈現、subagent 導航和歷史分頁。fixture 生成器負責當前代日志與投影緩存；已提交的前代日志逐字節保持不變，與它們并存。選擇面板為 WebFS 保留獨立的用戶授權來源；該 provider 不讀取內置 fixture。

[已構建 bundle 導入檢查](tests/compile/transform-corpus-check.ts)在庫構建后檢查裸 Node 導入。Dockkit 例外接受 Node 針對任意樣式表報告的未知 `.css` 擴展名錯誤，而不限定某一固定路徑；其他擴展名、錯誤碼或消息，以及意外成功的豁免導入，仍然報錯。參見 [樣式表豁免決策](../../../.agents/notes/implemented/bug-fix/2026-09-10-built-bundle-css-exemption.zh.md)。

-----

<a id="model-experience"></a>
## 模型體驗

無：本包只在瀏覽器 worker 里承載插件樹并應答它的 `node:*` 調用；所有面向模型的注冊都屬于它啟動的那些插件。

#### KV Cache 影響

無：本包既不組裝也不發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **worker 組合寫明文會話日志**（`compression: 'none'` boot patch）：不帶 Zstandard 編解碼器，導出日志是 `.jsonl`，不會是 `.jsonl.zstd`。
- **`node:dns/promises`、`node:vm`、`node:net`、`node:sqlite`、`node:worker_threads` 是結構化 stub**：每次調用在 console 報告拒絕并拋出。需要原生 DNS、真進程或真 realm 隔離的行在此無法運行。
- **文件 watcher 只能觀察已掛載的 VFS**：鏡像 seed 不產生事件，VFS 也沒有符號鏈接或外部寫入方。`persistent`、`ref()` 和 `unref()` 保留 Node API，但瀏覽器沒有引用計數事件循環，因此這些接口不能控制 dedicated Worker 的生存期。
- **Worker confinement 是 VFS 邊界，不是內核 Landlock**：`read-only` 和 `workspace-write` 運行未經修改的 `@deepseek-ai/node-addon-system/landlock-run` JavaScript 與 launcher argv，進程層則實現邏輯 `landlock-run` 可執行文件，并在 shell 的每次文件系統請求上執行其授權。`full` 僅覆蓋 Worker 命令表和已掛載 VFS，不表示能夠執行任意 native 進程，也不表示 Linux 內核隔離。
- **worker 束釘住了 `@yarnpkg/parsers` 的包內路徑**——構建解析到該包自己的 `lib/shell.js` 而非包根，因為包根 barrel 還 re-export 了 Syml 解析器，會把 js-yaml 拖進一個從不解析該格式的束（約 175 kB，外加 worker 啟動時的模塊體求值）。該路徑由包 manifest 派生，包內布局一變即構建期失敗、不會靜默退回 barrel；升級這個依賴時須復核 shell 解析器是否仍在那里。
- **這個 shell 不是 bash**：沒有循環、函數、`case`、作業控制或進程替換——語法止步于管道、`&&`/`||`、子 shell、group、重定向與展開。`&` 會就地把命令跑完，`sed` 只接受替換腳本，模式是 JavaScript 正則，命令表只有 coreutils（沒有 `git`，沒有網絡工具）。
- **shell 進程沒有同步文件面**：它靠消息讀寫宿主的 VFS，因為阻塞等待回幀需要 `SharedArrayBuffer`，而那要求 GitHub Pages 給不了的跨源隔離。因此目錄遍歷類命令每個條目一次往返，并發的兩條命令寫入可以交錯。
- **transport、worker-host、頁面半的覆蓋需要瀏覽器級 harness**——這些模塊未達 per-file 覆蓋門；單測覆蓋 storage、ALS、transform 與 stub 契約。


<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。這是 Cordis 啟動前的平臺 glue；其啟動的產品樹運行各包自己的不變式，image 與 tunnel 約定在 boot 時失敗。
