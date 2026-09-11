---
description: "Web GUI 的浏覽器與 Host 之间的通訊協定层：Remote RPC、带重连的事件流投递、精确 Fetch 路由、/api HTTP 桥與浏覽器信任栅栏。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-connection

[English](README.md) | 中文

## 概述

本包承载浏覽器到 Host 的 Remote 呼叫、精确 Fetch 回應與 connection generation。Client 插件挂载 `ctx.connection`，其中包含当前页面的 loopback 狀態、通用 RPC、当前 generation 與其 Host 資訊、可观察的恢复狀態、立即重连命令，以與單一 generation source 的註冊点。source 報告 ready 后 generation 才可見；source 結束、失败、被撤回或显式 stop 都會清空它，再由 `ConnectionController` 执行重试策略。

## 目录

- [使用本包](#use-this-package)
- [浏覽器認证與要求信任](#browser-authentication-and-request-trust)
- [Connection generation](#connection-generation)
- [模型體验](#model-experience)
- [已知限制與暂缓事项](#known-limitations-and-deferred-work)
- [開发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

浏覽器透過 HTTP POST 执行 Remote 一元呼叫；API Gateway 自己拥有 `/api/remote.mux` WebSocket 與其逻辑流。由 shell 持有的组合透過 `connection.rpc.open` 提供等价的 Remote 流，不打開 WebSocket。Host half 始终提供與载體無關的 RPC 註冊表和精确 `GET`/`HEAD`/`POST` 路由註冊表。存在 Web 载體時，它还持有唯一 `/api` route、Fetch bridge、浏覽器認证與 Host/Origin 校验；由 shell 持有的载體則直接分派共享 Fetch handler。每条精确路由會在 bridge 讀取任何字节前声明缓冲或流式要求體處理方式。Typert Gateway 認领生成的 Remote endpoint，功能包註冊 Session 日志下载、原始檔案上传等非 JSON 回應，未認领的要求回報 404。Loopback hostname 判定只供浏覽器侧当前页面狀態使用，留在包內。浏覽器原始要求體传输由 [`dsh-client-file-upload`](../file-upload/README.zh.md) 提供。

-----

<a id="browser-authentication-and-request-trust"></a>
## 浏覽器認证與要求信任

每個 Host RPC 方法和 WebSocket 流都要求一個浏覽器工作階段，不存在按方法区分的 loopback 层。每個行程生成一個随机啟動令牌。`dsh-web-app` 打印并打開带 `?token=...` 的普通根 URL；`frontend-static` 把根路径和 index 要求交給 `ctx.connection.authorizeIndex`，后者只在 `GET /` 接受該令牌，寫入绑定 authority 的签名 cookie，再重定向到干净的 `/`。缺失、過期、畸形或 authority 不匹配的 cookie 會在 RPC 分发前得到 401。静态资源保持公開。HTTP 载體不在根路径交换之外接受 query token，也不接受 Authorization header token。

cookie 签名密钥是 `ctx.credentials` 中由 `client-connection/browser-session` 拥有的 grant 记录。本地提供方把它持久化到 `$DSH_HOME/.credentials.yaml`；`BrowserAuth` 在 Connection 激活期间加载或建立該记录，并把密钥留在內存中，因此要求認证同步执行。刪除或替换該记录會在下一次 Connection 激活時生效。cookie 携带绝对签发與過期区间，`cookieMaxAgeDays` 預設设為 30 天，并在确定性名称與签名 payload 中同時绑定规范化 hostname 和 port。它是 host-only、`Path=/`、`HttpOnly`、`SameSite=Strict`；随附伺服器使用 loopback HTTP，因此刻意不設定 `Secure`。

認证之前，每個要求仍經過 `src/api-request-trust.ts`。其 `Host` 必须是 loopback，或與 `trustedHosts` 条目匹配：带端口的 `host:port` 精确匹配，不带端口的条目匹配任意端口，两侧均經 WHATWG 归一化。若附带 `Origin`，它必须等於該 Host；`sec-fetch-site: cross-site` 一律拒绝。畸形設定 authority 會让插件加载失败。這些檢查防御 DNS rebinding 與跨站浏覽器要求，绝不建立身份。Host/Origin 校验失败回報 403；Host 可信但未認证的要求回報 401。`dsh web --host 0.0.0.0` 可用且會把采樣到的 LAN 字面量加入 `trustedHosts`。决策记录：[浏覽器要求信任](../../../.agents/notes/implemented/architecture/2026-07-28-api-browser-trust-boundary.zh.md)與[浏覽器令牌認证](../../../.agents/notes/implemented/architecture/2026-08-24-browser-token-authentication.zh.md)。

<a id="connection-generation"></a>
## Connection generation

API Gateway Client 把內部 `$events` 逻辑流註冊為唯一 generation source，與有無 `$on` 订阅無關。Host 在 API Remotes source factory 同步挂好所有增量 listener 后，先傳送唯一 `{ type: 'ready', clientId, host: { home } }` 项，再傳送事件。`ConnectionController` 仅在收到該 ready 项后发布 generation 并呼叫 `onConnected`，因此 baseline 不會跑在增量 listener 前面。

`$events` 結束、Remote 流報错、收到非 ready 首项或畸形事件项，都會使当前 generation 失效。預設情况下，挂起的握手在 3 秒后记录 Host 回應缓慢告警，在 15 秒后记录就绪超時并中止，包含等待物理 socket 的時间。取消后，source 必须停止投递、释放资源并結束，替换 source 才能啟動；已取消 source 迟到的 ready 不能发布 generation。浏覽器報告網路可用時，Controller 发布 `connecting`，并在 500ms、1s、2s、4s、8s 與 10s 上限內采用 50%–100% 抖动重试，达到终档后继續尝试直到恢复。每次重试都要求 Gateway 替换一次物理 WebSocket，再重開 `$events`。[持續恢复决策](../../../.agents/notes/implemented/bug-fix/2026-09-05-continuous-client-recovery.zh.md)规定握手期限與重试策略。

`ctx.connection.reconnect()` 會中断活动工作、重置序列，并立即開始 retry 1。浏覽器 `offline` 會中断活动工作、发布 `disconnected` 并暂停自动尝试；下一次 `online` 轉換會重置序列并从 500ms 档開始。只有 ready 项會发布 `connected`。Gateway mux 不拥有独立重试调度。

可透過 Host Connection 行的 `config.recovery` 覆盖重试上限、增长因子或握手告警與取消時间；[設定目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-client-connection)列出接受的字段。Host 校验這些值，并将其注入所提供的每個页面。Client 在提供 Connection 前校验啟動資料，并在 Gateway 啟動循環時采用這些預設值；显式传給 `start()` 的時序覆盖优先。增长因子必须是至少為一的有限数。若就绪、失败、取消或硬期限先於告警发生，該告警會被取消。修改 Host 恢复設定后需重新加载页面。


<a id="model-experience"></a>
## 模型體验

無。通訊協定消费层只在浏覽器與主机之间搬运已經组合好的消息；這里没有任何內容進入模型要求。

#### KV Cache 影响

無；該包既不组装也不傳送提供方要求。

## 已知限制與暂缓事项

<a id="known-limitations-and-deferred-work"></a>

- **缓冲型 `/api` 路由會把每個要求體保留在內存里**：`maxRequestBodyBytes`（預設 300 MiB，按預設 200 MiB 图片总量上限經 base64 膨胀加信封余量得出）限制普通图片與 RPC 信封。显式启用的流式路由接收带背压的分块并绕過总量上限；路由實現负责持久化、取消與存储配额。
- **浏覽器 cookie 不带 `Secure`**：当前随产品提供的传输方式是 loopback HTTP；若部署經明文網路暴露同一 authority，bearer cookie 可能在传输中泄露。
- **没有 logout 操作**：清除浏覽器 cookie 會結束單個浏覽器工作階段；刪除 owner 凭f64ee记录并重启 `dsh` 會撤销全部工作階段。


<a id="dev-note"></a>
### 開发备注

<details>
<summary>维护者工作上下文——点击展開</summary>

無。

</details>

**執行時不变式：** 不发布伴生入口。浏覽器工作階段驗證會在要求授权工作時异步讀取凭f64ee记录，而记录的 commit-event 生命周期由 credentials 伴生入口负责；流與重连的時序與 rpcId 往返約束由行為规范直接驗證，路由註冊與 dispose（资源释放）的对称性由 webserver 伴生入口审计。
