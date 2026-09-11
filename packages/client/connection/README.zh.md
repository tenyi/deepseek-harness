---
description: "Web GUI 的瀏覽器與 Host 之間的通訊協定層：Remote RPC、帶重連的事件流投遞、精確 Fetch 路由、/api HTTP 橋與瀏覽器信任柵欄。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-connection

[English](README.md) | 中文

## 概述

本包承載瀏覽器到 Host 的 Remote 呼叫、精確 Fetch 回應與 connection generation。Client 插件掛載 `ctx.connection`，其中包含當前頁面的 loopback 狀態、通用 RPC、當前 generation 與其 Host 資訊、可觀察的恢復狀態、立即重連命令，以與單一 generation source 的註冊點。source 報告 ready 后 generation 才可見；source 結束、失敗、被撤回或顯式 stop 都會清空它，再由 `ConnectionController` 執行重試策略。

## 目錄

- [使用本包](#use-this-package)
- [瀏覽器認證與要求信任](#browser-authentication-and-request-trust)
- [Connection generation](#connection-generation)
- [模型體驗](#model-experience)
- [已知限制與暫緩事項](#known-limitations-and-deferred-work)
- [開發備注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

瀏覽器透過 HTTP POST 執行 Remote 一元呼叫；API Gateway 自己擁有 `/api/remote.mux` WebSocket 與其邏輯流。由 shell 持有的組合透過 `connection.rpc.open` 提供等價的 Remote 流，不打開 WebSocket。Host half 始終提供與載體無關的 RPC 註冊表和精確 `GET`/`HEAD`/`POST` 路由註冊表。存在 Web 載體時，它還持有唯一 `/api` route、Fetch bridge、瀏覽器認證與 Host/Origin 校驗；由 shell 持有的載體則直接分派共享 Fetch handler。每條精確路由會在 bridge 讀取任何字節前聲明緩沖或流式要求體處理方式。Typert Gateway 認領生成的 Remote endpoint，功能包註冊 Session 日志下載、原始檔案上傳等非 JSON 回應，未認領的要求回報 404。Loopback hostname 判定只供瀏覽器側當前頁面狀態使用，留在包內。瀏覽器原始要求體傳輸由 [`dsh-client-file-upload`](../file-upload/README.zh.md) 提供。

-----

<a id="browser-authentication-and-request-trust"></a>
## 瀏覽器認證與要求信任

每個 Host RPC 方法和 WebSocket 流都要求一個瀏覽器工作階段，不存在按方法區分的 loopback 層。每個行程生成一個隨機啟動令牌。`dsh-web-app` 打印并打開帶 `?token=...` 的普通根 URL；`frontend-static` 把根路徑和 index 要求交給 `ctx.connection.authorizeIndex`，后者只在 `GET /` 接受該令牌，寫入綁定 authority 的簽名 cookie，再重定向到干凈的 `/`。缺失、過期、畸形或 authority 不匹配的 cookie 會在 RPC 分發前得到 401。靜態資源保持公開。HTTP 載體不在根路徑交換之外接受 query token，也不接受 Authorization header token。

cookie 簽名密鑰是 `ctx.credentials` 中由 `client-connection/browser-session` 擁有的 grant 記錄。本地提供方把它持久化到 `$DSH_HOME/.credentials.yaml`；`BrowserAuth` 在 Connection 激活期間加載或建立該記錄，并把密鑰留在內存中，因此要求認證同步執行。刪除或替換該記錄會在下一次 Connection 激活時生效。cookie 攜帶絕對簽發與過期區間，`cookieMaxAgeDays` 預設設為 30 天，并在確定性名稱與簽名 payload 中同時綁定規范化 hostname 和 port。它是 host-only、`Path=/`、`HttpOnly`、`SameSite=Strict`；隨附伺服器使用 loopback HTTP，因此刻意不設定 `Secure`。

認證之前，每個要求仍經過 `src/api-request-trust.ts`。其 `Host` 必須是 loopback，或與 `trustedHosts` 條目匹配：帶端口的 `host:port` 精確匹配，不帶端口的條目匹配任意端口，兩側均經 WHATWG 歸一化。若附帶 `Origin`，它必須等於該 Host；`sec-fetch-site: cross-site` 一律拒絕。畸形設定 authority 會讓插件加載失敗。這些檢查防御 DNS rebinding 與跨站瀏覽器要求，絕不建立身份。Host/Origin 校驗失敗回報 403；Host 可信但未認證的要求回報 401。`dsh web --host 0.0.0.0` 可用且會把采樣到的 LAN 字面量加入 `trustedHosts`。決策記錄：[瀏覽器要求信任](../../../.agents/notes/implemented/architecture/2026-07-28-api-browser-trust-boundary.zh.md)與[瀏覽器令牌認證](../../../.agents/notes/implemented/architecture/2026-08-24-browser-token-authentication.zh.md)。

<a id="connection-generation"></a>
## Connection generation

API Gateway Client 把內部 `$events` 邏輯流註冊為唯一 generation source，與有無 `$on` 訂閱無關。Host 在 API Remotes source factory 同步掛好所有增量 listener 后，先傳送唯一 `{ type: 'ready', clientId, host: { home } }` 項，再傳送事件。`ConnectionController` 僅在收到該 ready 項后發布 generation 并呼叫 `onConnected`，因此 baseline 不會跑在增量 listener 前面。

`$events` 結束、Remote 流報錯、收到非 ready 首項或畸形事件項，都會使當前 generation 失效。預設情況下，掛起的握手在 3 秒后記錄 Host 回應緩慢告警，在 15 秒后記錄就緒超時并中止，包含等待物理 socket 的時間。取消后，source 必須停止投遞、釋放資源并結束，替換 source 才能啟動；已取消 source 遲到的 ready 不能發布 generation。瀏覽器報告網路可用時，Controller 發布 `connecting`，并在 500ms、1s、2s、4s、8s 與 10s 上限內采用 50%–100% 抖動重試，達到終檔后繼續嘗試直到恢復。每次重試都要求 Gateway 替換一次物理 WebSocket，再重開 `$events`。[持續恢復決策](../../../.agents/notes/implemented/bug-fix/2026-09-05-continuous-client-recovery.zh.md)規定握手期限與重試策略。

`ctx.connection.reconnect()` 會中斷活動工作、重置序列，并立即開始 retry 1。瀏覽器 `offline` 會中斷活動工作、發布 `disconnected` 并暫停自動嘗試；下一次 `online` 轉換會重置序列并從 500ms 檔開始。只有 ready 項會發布 `connected`。Gateway mux 不擁有獨立重試調度。

可透過 Host Connection 行的 `config.recovery` 覆蓋重試上限、增長因子或握手告警與取消時間；[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-client-connection)列出接受的字段。Host 校驗這些值，并將其注入所提供的每個頁面。Client 在提供 Connection 前校驗啟動資料，并在 Gateway 啟動循環時采用這些預設值；顯式傳給 `start()` 的時序覆蓋優先。增長因子必須是至少為一的有限數。若就緒、失敗、取消或硬期限先於告警發生，該告警會被取消。修改 Host 恢復設定后需重新加載頁面。


<a id="model-experience"></a>
## 模型體驗

無。通訊協定消費層只在瀏覽器與主機之間搬運已經組合好的消息；這里沒有任何內容進入模型要求。

#### KV Cache 影響

無；該包既不組裝也不傳送提供方要求。

## 已知限制與暫緩事項

<a id="known-limitations-and-deferred-work"></a>

- **緩沖型 `/api` 路由會把每個要求體保留在內存里**：`maxRequestBodyBytes`（預設 300 MiB，按預設 200 MiB 圖片總量上限經 base64 膨脹加信封余量得出）限制普通圖片與 RPC 信封。顯式啟用的流式路由接收帶背壓的分塊并繞過總量上限；路由實現負責持久化、取消與存儲配額。
- **瀏覽器 cookie 不帶 `Secure`**：當前隨產品提供的傳輸方式是 loopback HTTP；若部署經明文網路暴露同一 authority，bearer cookie 可能在傳輸中泄露。
- **沒有 logout 操作**：清除瀏覽器 cookie 會結束單個瀏覽器工作階段；刪除 owner 憑f64ee記錄并重啟 `dsh` 會撤銷全部工作階段。


<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者工作上下文——點擊展開</summary>

無。

</details>

**執行時不變式：** 不發布伴生入口。瀏覽器工作階段驗證會在要求授權工作時異步讀取憑f64ee記錄，而記錄的 commit-event 生命周期由 credentials 伴生入口負責；流與重連的時序與 rpcId 往返約束由行為規范直接驗證，路由註冊與 dispose（資源釋放）的對稱性由 webserver 伴生入口審計。
