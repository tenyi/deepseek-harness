---
description: "web GUI 宿主的 HTTP 服務器：具名路由與 upgrade 注冊、index 轉換，以及服務 Web 殼 SPA dist 的唯一回退席位。"
kind: "package-reference"
---

# @deepseek-ai/dsh-host-webserver

[English](README.md) | 中文

## 概述

瀏覽器經由 `dsh-host-webserver` 通過 HTTP 訪問 web GUI：一個 `node:http` 服務器，其他插件在其中注冊具名路由、upgrade 路由、index 啟動輸入與一個回退 handler。它不了解任何 harness 概念，也不提供任何文件服務——`/api` 橋接、插件 bundle、HMR（熱模塊替換）事件流與 SPA dist 都屬于注冊它們的插件。路由匹配順序固定不變：先在整張表中匹配精確 route，再匹配最長前綴，最后交給回退 handler。它只服務瀏覽器；Electron 通過 `file://` 加載 dist，并經 IPC 橋接承載 fetch。

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

把 webserver 組合為面向瀏覽器宿主的 HTTP 傳輸，然后讓功能插件認領各自的路由。激活即開始監聽；注冊順序不影響請求處理，因為具名路由組合起來互不相交。

### 最小配置

```yaml
- name: '@deepseek-ai/dsh-host-webserver'
  config:
    host: 127.0.0.1
    port: 3000
```

`host` 只接受兩個值：`127.0.0.1`（默認姿態，僅回環）與 `0.0.0.0`（有意向網絡開放——服務器自身不攜帶 TLS、認證或來源策略）。`port` 為 0 時請求 OS 分配端口；之后用 `ctx.webServer.port` 讀取正在監聽的端口。

設置 `compression: 'gzip'` 可以包裝符合條件的 socket-backed 響應，而不改變 route API。客戶端必須接受 gzip，且媒體類型必須可壓縮；已知長度小于 `compressionThresholdBytes` 的響應保持未壓縮，未知長度的流則立即符合條件。已有編碼、`Cache-Control: no-transform`、range 響應、SSE（Server-Sent Events）、ZIP 與已打包的 `.gz` Worker image 均保持不變。隨附 Web bundle 使用 level 1 與 1024 字節閾值；其他組合默認不壓縮。

### 注冊路由

`register(route)` 添加具名的 `exact`／`prefix` HTTP route，`registerUpgrade(route)` 為精確 pathname 添加 upgrade route，兩者返回的 disposer 都會移除注冊。同一張表內的重復路徑會拋錯——route 模式是組合層約定，沖突即配置錯誤。HTTP 匹配先在整張表中匹配精確 route，再匹配最長前綴，最后交給回退 handler；upgrade 只做精確匹配，未命中連接直接關閉。

### 回退席位

`registerFallback(handler)` 認領所有未被具名 route 命中的請求的唯一一個 handler。第二次注冊會拋錯；沒有注冊回退時服務器回答 404。在隨附的 Web 組合中，[SPA dist 服務器](../frontend-static/README.zh.md)擁有該席位，并對其渲染的每個 index 響應調用 `renderIndex`。

index 啟動輸入分兩層。`collectIndexInjections()` 收集一張全新的注入表——每次調用發一次 `webserver/index-inject` 事件，每個訂閱方推入其當前行——`renderIndex(html)` 先把這些行渲染進 index.html 正文，再按注冊順序應用原始 `tapIndex(transform)` 轉換。`script-preload` 行會渲染為 classic script 的提示性 preload 鏈接。靜態部署會在啟動 payload 中攜帶同一批行。`applyIndexTaps(html)` 只應用原始轉換；它是任何行都無法表達的標記的逃生口。

### 失敗時的行為

監聽失敗（例如 EADDRINUSE）會以綁定診斷信息拒絕插件初始化。handler 拋錯的 HTTP 請求會得到 400——若響應頭已經發出則銷毀 socket——并記錄 warning；它絕不會退出進程。upgrade handler 拋錯或升級 socket 出現傳輸錯誤時，會記錄 warning 并銷毀對應 socket。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

### 設計理念

本包是一個不帶任何 harness 詞匯的普通路由注冊表：`WebServer` 繼承 Cordis `Service`，持有三張路由表、回退 slot、原始 index 轉換列表，以及 index 渲染器經其收集行的 `webserver/index-inject` 事件。index 渲染每次響應組合兩層：`renderIndex` 先把包含提示性 `script-preload` 行的全新注入表渲染進正文，再按注冊順序應用原始轉換；`applyIndexTaps` 只運行轉換。upgrade handler 擁有協議握手與連接內容；webserver 只交付原始 socket 與 request。`host` 與 `port` getter 暴露其他插件據以自適應的組合期事實（例如 directory-picker 選擇器）。

### 匹配與生命周期

`match(pathname)` 先查精確表，再遍歷前綴表取最長匹配，最后走回退。激活（`[Service.init]`）即開始監聽；資源釋放會啟動 `close()` 與 `closeAllConnections()`，銷毀所有受跟蹤的升級 socket，并僅在服務器與這些 socket 均已關閉后返回。Node 的 `closeAllConnections()` 不包含升級 socket，因此服務顯式跟蹤它們。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | `WebServer` 服務：路由表、回退席位、index 渲染、匹配、生命周期 |
| — | 不發布運行時不變式伴生入口；路由注冊與釋放通過同一服務修改同一張路由表，register/dispose 探針只會重復執行實現。真實路由與 HMR 測試負責驗證該行為。 |
| [`src/injections.ts`](src/injections.ts) | 結構化 `IndexInjection` 行與 `renderIndexInjections` 行渲染 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當服務器約定不夠用時閱讀以下內容：先看子系統參考，再看回退持有者，以及誰注冊哪條路由背后的分層決策。

- [HTTP 服務器子系統](../../../docs/subsystems/web-server.zh.md)——路由、匹配順序與服務器接受的配置。
- [SPA dist 服務器](../frontend-static/README.zh.md)——回退席位的隨附持有者。
- [Web 配置樹啟動與傳輸分層](../../../.agents/notes/implemented/architecture/2026-07-24-web-config-tree-boot-and-transport-layering.zh.md)——功能插件為何擁有每條路由。
- [生成配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-host-webserver)——每個受支持配置字段及其源聲明。

-----

<a id="model-experience"></a>
## 模型體驗

無。該 HTTP 載體只橋接瀏覽器與 API handler，不注冊任何面向模型的內容。

#### KV Cache 影響

無；該包既不組裝也不發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明服務器在何處有意保持最小。它們是當前包約束，不是任務積壓。

- **不提供服務器級 TLS、認證或來源策略**：`dsh-client-connection` 等 route owner 會實施自己的請求策略。綁定非回環地址仍會向該網絡公開未受保護的 route 與靜態資源。
- **Socket 選項固定不變**：配置只選擇綁定宿主與端口；在具體部署產生需求前，backlog 和其他 socket 設置仍保持內部實現。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
