---
description: "帶類型的 Client 到 Host 調用與流：分派、校驗、取消、重連與轉發的 Host 事件。"
kind: "package-reference"
---

# @deepseek-ai/dsh-api-gateway

[English](README.md) | 中文

## 概述

為 Host 與 Client 兩側的 Cordis 環境提供 Typert RPC endpoint。Host 入口提供 `ctx.typertGateway`，`@deepseek-ai/dsh-api-gateway/client` 則提供 `ctx.remote`；兩者使用同一份生成的 `InvocationDescriptor` 約定，并將業務選擇交給 API Remotes。Connection 承載一元調用的請求關聯、信任和響應 envelope，Gateway 則擁有多路復用的 Remote 流。

## 目錄

- [Host 服務：`TypertGatewayService`（ctx key：`typertGateway`）](#host-service-typertgatewayservice-ctx-key-typertgateway)
- [Client 服務：`ClientRemote`（ctx key：`remote`）](#client-service-clientremote-ctx-key-remote)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備注](#dev-note)

-----

<a id="host-service-typertgatewayservice-ctx-key-typertgateway"></a>
## Host 服務：`TypertGatewayService`（ctx key：`typertGateway`）

每次調用時，`ctx.typertGateway.invoke()` 都會解析當前的描述符和 Cordis 服務，校驗具名參數是否完全匹配，解析已注冊的對象或 Context 身份標識，調用公開的業務方法，并校驗其結果。業務服務繼承 [`dsh-typert-protocol`](../../typert/protocol/README.zh.md) 的 `TypertRemoteService`，并用 `@Remote` 或 `@RemoteScope` 標記方法；已有其他基類時仍可改用 `bindTypertRemote()`。

嚴格模式從 `ctx.typert.local` 讀取生成的調用描述符。查找參數使用 `ctx.typert.lookups` 中當前有效的解析器：業務包注冊穩定聲明與默認策略，Host 組合可用 effect-scoped `configure()` 覆蓋解析行為；`@RemoteScope` 則通過已注冊的 Host Context 適配器解析其接收者。SRC 模式是開發階段的回退路徑，適用于從未具備嚴格定義的端點；它解析簡單參數名，并且只允許非查找參數使用可安全表示為 JSON 的值。已觀測到的嚴格定義一旦撤回，系統會直接報錯，而不會降低校驗強度。

Connection 可用時，Host 入口會在 Connection 共享的 `/api` FetchHandler 上注冊 trusted-host interceptor。Connection 把這個復合 handler 交給 HTTP bridge；handler 將已認領 endpoint 分發給 Gateway，未認領且沒有精確 Fetch 路由負責的請求返回 404。直接調用 `invoke()` 會保留業務錯誤；`TypertGatewayError` 是 `RemoteError` 的子類，其 `gateway/*` 碼命名了分發、綁定、提供方、查找、Context、參數和編解碼器各自負責的故障。因策略而拒絕的解析器——冷恢復失敗或 ownership fence——拋出自己的 `RemoteError`，它選定的碼原樣到達調用方。

支持取消的 Remote 方法會把 `signal: AbortSignal` 聲明為最后一個 Host 參數。signal 是 descriptor 元數據，而不是 wire 參數：Connection 將它提供給 Gateway，Gateway 則在已解碼的業務參數之后注入它。SRC 識別這個保留的末位參數名，嚴格生成還要求它具有全局 `AbortSignal` 類型。

流式 Remote 使用 `@Remote({ mode: 'stream' })` 并返回 `Iterable` 或 `AsyncIterable`。`ctx.typertGateway.stream()` 執行與一元調用相同的 endpoint、參數、lookup 和取消校驗，再用生成的 result codec 校驗每個產出項。Client 插件激活時打開 Gateway 自有的 `/api/remote.mux` WebSocket，并讓它在空閑時保持連接。Connection 擁有重試調度；每次 retry 前，它要求 mux 取消候選或活動 socket，并且只做一次全新的物理連接嘗試。Host 按配置的 `websocketHeartbeatIntervalMs` 間隔（默認 2 秒）發送 Ping 控制幀，瀏覽器在 WebSocket 協議層自動回復 Pong，使空閑網絡中間層持續看到流量，而不新增 Remote 流幀。若 socket 尚未回復上一次 Ping，Host 會在下一間隔終止它。可獨立取消的邏輯流共享這條連接；進程內 Connection 載體直接提供等價的流，不打開該 WebSocket。

Host 組合可通過 `registerRemoteEvents()` 注冊唯一的應用事件 source。Gateway 為它保留內部 `$events` logical endpoint，只接受空 `args`，并在 source 撤回時中止該注冊打開的流。事件名單、參數校驗、每個 Client 的隊列及 opening `{ type: 'ready', clientId, host: { home } }` frame 中的 Host home 由 API Remotes 擁有。source factory 在返回 iterable 前同步掛好增量 listener，因此 Client 只在增量投遞就緒后發布 generation 并開始 baseline 讀取。

<a id="client-service-clientremote-ctx-key-remote"></a>
## Client 服務：`ClientRemote`（ctx key：`remote`）

`ctx.remote.$mount()` 會校驗并注冊生成的 Host-for-Client 貢獻項，然后為發起調用的 Cordis fiber 安裝具體的直接方法和作用域方法。每個 namespace 都是可追蹤的 `remote.<namespace>` 子 Service，并在最后一個方法撤回后卸載。重復端點、命名空間沖突，以及缺少生成的嚴格編解碼器的描述符，都會在方法可調用前報錯。

每次一元調用都會校驗位置參數，構造與描述符完全匹配的具名 `args`，再通過 `ctx.connection.rpc.call('/api', endpoint, ...)` 發送。生成的流方法返回 `AsyncIterable`，并在進程內 Connection 載體可用時通過它打開邏輯流，否則通過共享的 Gateway WebSocket 打開。生成的支持取消的方法接受最后一個可選 `AbortSignal`；Client 會在調用載體前將它與貢獻項的掛載生命周期合并。一元結果和每個流項都經過校驗后才會交給應用代碼。撤回貢獻項會同時移除其描述符和方法、中止正在進行的調用與流，并使外部仍持有的方法句柄在調用時返回拒絕。

每次一元調用都解析為 `RemoteResult<T>`——`{ ok: true, value }` 或 `{ ok: false, error }`——且絕不因載體問題 reject：本面把斷線載體折入錯誤分支，調用方 signal 中止時答以 `gateway/cancelled`，因此沒有消費方需要包一層來兜載體失敗。只有裝配故障仍會 reject：參數個數不符、方法未掛載、貢獻已撤下、缺少 Context 適配器。`error` 是活的 `RemoteError` 實例，所以 `throw result.error` 保持 throw 語義；而 `isRemoteFailure(value)` 是消費方唯一需要的謂詞——它認下的捕獲值帶著 Host 碼，它拒絕的一律是本地故障，調用方應當讓其崩掉。`carrierFailure(endpoint, error)` 與 `cancelledFailure(endpoint, cause)` 構造這兩種折疊結果，測試里的替代實現據此采用相同的折疊方式。

`ctx.remote.$host` 以普通值讀取固定的 Host 事實：`home`（首個 ready 幀之前為 undefined）與 `isLoopback`。它不是存儲——沒有訂閱、沒有代次計數——所以需要響應重連的消費方去監聽 `connection/reset`，而不是輪詢它。

`ctx.remote.$stream()` 返回跨越多個物理載體代次的單消費方 `RemoteStream`。Host 仍在線時，它允許一次立即重試；Host 離線時，它等待下一代連接，并為每個流項標注物理代次。領域消費方校驗并接受各代次的 opening value；業務與協議錯誤仍然終止流。一切終態失敗離開本面時都是 `RemoteError`，包括重試耗盡和在 opening value 之前就結束的代次，因此流消費方與一元調用方用同一種方式判別。`RemoteStreamCarrierError` 命名的是可重試的物理丟失，它只作為 `carrierFailed` 回調參數到達領域，絕不作為終態結果。`RemoteSnapshotStream` 在此之上規定每代由一個初始快照和后續 delta 組成。`RemoteJournalStream` 基于領域提供的 entry 閉區間提供 follow-before-page、分頁、重連追趕與缺口修復；它丟棄完整重復項，并拒絕缺口、倒置區間和部分重疊。領域還可以攜帶無 cursor 的通知：通知絕不推進或修復持久 cursor，在缺口修復期間收到的通知只會在 replacement page 提交后發布。若更新代次取代該修復，舊代次 held notification 會與其 page 一同丟棄。對任一種流執行 dispose（資源釋放）時，系統會取消該流的請求，并在活動 iterator 完全停止后完成資源釋放。

`ctx.remote.$on()` 訂閱一條被轉發的 Host 事件。它的合法鍵恰好等于 Host 裝配聲明的轉發選擇，listener 類型就是事件所屬包自己的 Cordis `Events` 聲明，因此不存在會與之漂移的第二份簽名。每個訂閱歸屬調用方 fiber，并隨該 fiber 一起消失。Client Remote 服務激活時就把 `$events` pump 注冊為 Connection generation source，無論當前是否存在 `$on` listener。瀏覽器使用 Remote mux，進程內組合使用 `connection.rpc.open`；opening `ready` 項建立 Connection generation 并提供 Host 信息。物理 carrier 失敗、Remote 流故障、意外正常結束、非 ready 首項或畸形事件項都會終止該 generation，由 Connection 按持續且間隔封頂的帶抖動指數退避重開。普通通知按注冊順序運行并隔離 listener 失敗；Agent-scoped waterfall（瀑布式事件）允許 listener 返回結果、調用 `next()` 或拒絕，Gateway 再通過現有 HTTP 一元載體回送該結果。

`ctx.remote` 不暴露 Connection 生命周期控制。只有職責包含恢復的消費方才直接讀取 `ctx.connection.state` 并調用 `ctx.connection.reconnect()`；普通 Remote 消費方仍只使用生成的 namespace 與 `$stream()`。

生成的聲明合并通過共享的 `TypertClientRemote` 約定提供 TypeScript API。Client 入口不包含 Host 服務或 Host Cordis 接口合并；方法查找和調用使用普通對象與函數，而不使用 JavaScript Proxy。

<a id="model-experience"></a>
## 模型體驗

無，因為該包分發應用調用，不注冊任何提示詞、工具或會話事件。

#### KV Cache 影響

無直接影響；被調用的業務服務負責產生任何模型可見結果。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- Connection 適配器對分發故障與未歸類異常答以 `gateway/internal`，且不附帶詳細信息；擁有方或 Gateway 自己拋出的 `RemoteError` 帶著自有碼、message 與 details 過線。其 `cause` 鏈與 `TypertGatewayError` 子類身份只對同進程調用方留存。
- SRC 模式僅支持名稱唯一的標識符參數，不支持解構、默認值或剩余參數。它只校驗值能否安全表示為 JSON，不校驗生成的業務類型，也絕不會推斷可選字段。
- Client 側只能掛載嚴格模式生成的貢獻項。SRC 標記不具備 Client 編解碼器或類型投影。
- `$stream()` 監督載體替換，但不推斷回放語義；各領域自行擁有恢復 cursor 或替換 baseline 的校驗，以及正常結束的分類。Connection generation 會重開內部 `$events` 流；單向通知不會重放，仍處于 pending 的 scoped waterfall 則沿用同一個 event id 重放。
- lookup 解析器按 key 配置；當前無法讓單個 Remote 參數或 endpoint 在同一 `agent`/`session` key 下選擇 live-only 策略。
- 被轉發的事件到達 `$on` 時不做業務載荷投影或脫敏。普通通知在重連后不重放；Agent-scoped waterfall 只投影選擇 Client Context 所需的頂層 Agent 身份，并自行攜帶 pending 生命周期。
- `websocketHeartbeatIntervalMs` 同時是 Ping 周期和 Pong 截止時間。對端未在下一周期前回復時，Host 會終止連接；如果部署的事件循環或網絡可能停頓超過該間隔，必須調大此配置。


<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。Host 調用會重新讀取權威的 Cordis 與 Typert 狀態，Client 方法、描述符與 `$on` 訂閱的變更則統一歸屬同一個 effect。
