# Web Client 架構

[English](web-client.md) | 中文

Web Client 是由獨立加載插件組裝而成的瀏覽器側 Cordis 應用。它有四個可復用底座：[Client Modules](client-modules.zh.md) 加載插件圖，[API Gateway](../api-gateway.zh.md) 提供類型化 Host 通信，[Slots](slots.zh.md) 組合 React UI，[Conversation](conversation.zh.md) 把 Session 歷史窗口變成各 target 自有的視圖。本文串聯這些系統，并規定 Client model 與功能包各自所在的位置。

## 分層與所有權

| 層 | 主要 owner | 職責 |
|---|---|---|
| Host 應用 | 業務 service 與 `packages/api/*-controller` Host entry | 擁有權威狀態、持久化、mutation 順序、訪問策略與 stream 生產。 |
| 傳輸與 API assembly | `client/connection`、`api/gateway`、`api/remotes` | 建立 Client generation，公開生成的 `ctx.remote` method 與 stream，轉發選定的 Cordis event，并承載取消和結果。 |
| Client model | `api/session-controller/client`、`api/workspace-controller/client` | 維護不依賴 React 的 Host 狀態鏡像，處理 stream/unary 競態，擁有對象 identity 與訂閱，并公開收窄的 command service。 |
| UI adapter | `client/ui-session`、`client/ui-workspace` | 把 model observable 轉換為 root 或 Session scope 的標準 Slot source，不接管業務狀態所有權。 |
| Conversation 數據 | `client/ui-conversation`、`ui-chat` 與 `ui-trajectory` 等 target package | 把標準 event 與緊湊的 Assistant 歷史批次組裝成相互獨立的 target snapshot，并擁有共享的 Conversation shell 與輸入流程。 |
| 組合與渲染 | `client/ui-slots`、`client/ui-renderer`、`client/ui-layout`、各 UI 功能包 | 聲明擴展位置、推導組件 props、把 observable 綁定成 React hook，并掛載最終組件樹。 |

依賴方向是 Host 狀態 → Remote 傳輸 → Client model → UI adapter → Conversation 或 presentation → Slots → React。用戶操作通過 callback 反向進入注入的 Client service 或生成的 Remote namespace。Presentation component 絕不接收 Cordis `ctx`、transport object 或其他功能插件的實現。

## 瀏覽器啟動

Host 把組合后的 `WebBootGraph` 寫入 `window.__DSH_BOOT__`，并在 parser-preloaded script 執行前安裝瀏覽器 module-loader facade。模塊系統是一張 lazy CommonJS 表：加載 bundle 只注冊 factory；materialize entry 時才以同步 `require` 運行 factory，并解析 platform module 和已聲明的動態依賴。

Web boot kernel 創建模塊系統、預取 `immediately` entry、掛載 vendored Cordis Loader，再創建圖中的每個 entry。Cordis service injection 決定激活順序；module graph 順序只決定同步 import 能否被 materialize。完整 roster 到達 settled 狀態后，`ui-renderer` hydrate 不依賴框架的 boot DOM，并調用唯一一次 context 級 `renderSlot('root')`。[Client Modules](client-modules.zh.md)負責 graph、bundle route、cache revision 與 loader 細節。

## Remote 通信

Host 業務 service 使用 Typert Remote decorator 標記可調用 method。Host generation 產出嚴格 descriptor、runtime codec、declaration merge 與 source map。Client 側 `api-remotes` assembly 選擇這些生成貢獻，并把具體 method 掛到 `ctx.remote.<namespace>` 與 Session scope 的 `agentCtx.remote.<namespace>`。功能包依賴生成的 service face，而不依賴 Gateway 實現或 Host 包的運行時 entry。

Connection 擁有 request correlation、`/api` carrier、trust check、精確 Fetch 路由與 connection generation。API Gateway 擁有 Remote dispatch、取消、logical stream 與選定 Host event 的轉發。Controller 操作應進入生成的 Remote method 或顯式 Remote stream；功能自有的下載則注冊精確 Fetch 路由。[API Gateway 參考](../api-gateway.zh.md)定義 generation 與調用，[Connection README](../../packages/client/connection/README.zh.md)定義物理 carrier 與信任策略。

內部 `$events` logical stream 是 Connection generation source。它的 opening `ready` frame 攜帶用于路徑顯示的 Host home，并在 Host listener 已掛載、任何 controller 開始 baseline read 之前建立 generation。`ctx.remote.$on()` 把 allowlist 內的普通 event 交付給 root Client Context，并把 scoped waterfall event 交付給已解析的 Session Context；waterfall listener 可以返回結果、調用 `next()` 或拒絕。

## Client models

每個 API controller 包都擁有配對的 Host face 與 Client face。Host 側擁有權威 mutation 與 stream 生產；Client 側基于相同的生成 wire type 維護 identity 穩定、與 React 無關的 model，并公開 observable snapshot 與 command。UI 包消費這些 Client service，不在 component store 中復制 transport state。

### Sessions

[`api/session-controller`](../../packages/api/session-controller/README.zh.md)公開 Session list、search、creation、selection data、prompt、queue、cancellation、pagination 及 follow/control stream 等 Host command。其 Client 側按 `ClientSessions → SessionManager → Session` 組織：

- `ClientSessions` 提供 `ctx.sessions`，擁有 Session scope 與穩定的 `SessionBinding` object，并投影選中的 list state。
- `SessionManager` 擁有 list baseline、實時 list/control update、惰性 Session instance、queue、projection store、subagent catalog，以及 pull 與后到 update 之間的沖突順序。
- 每個 `Session` 擁有一段由 `SessionEventLikeEntry` value 表示的連續邏輯 event window、pagination、follow、prompt/control state 與供 adapter 消費的 observable snapshot。

持久 event 路徑打開 `follow()`，其首幀包含當前 header、tail page、cursor 與完整 projection baseline。歷史 record 帶有顯式 `event` 或 `chunks` 判別字段和字段對齊的內部 `event`；journal 先校驗每條 record 的邏輯 seq 閉區間，Client 再直接把這些 record 保留為 `SessionEventLikeEntry`，無需逐 record 轉換。每個物理 generation 都根據該 snapshot 原子替換保留窗口，隨后按 seq append 標準實時 event。`page()` 只用于更早歷史與 gap repair。瞬態 control stream 每代以完整 baseline 開始，隨后應用 queue、job 與 projection update。

### Workspaces

[`api/workspace-controller`](../../packages/api/workspace-controller/README.zh.md)把 Workspace mutation policy 與權威 follow feed 留在 Host。`ClientWorkspaceModel` 擁有瀏覽器側 row、order、archived Session id、command echo，以及 stream/unary 競態合并。每代 stream 先給出完整 baseline，再給出 `upsert`、`remove`、`order` 和 `archived` increment；重連時以新 baseline 替換 model。`WorkspaceController` 把該 model 作為 `ctx.workspaces` 公開，而 `ui-workspace` 向 UI 提供 `useWorkspaces` 與 navigation callback。

這種配對不會產生第二份業務真相。Host controller 決定持久狀態與 mutation outcome；Client model 維護最新可用的本地 projection，在有利于渲染時保持 object identity，并明確 delayed response 與 replacement baseline 的合并規則。

## Conversation 與 presentation

`ui-session` 安裝 `session` scope adapter，并提供 `useSessions`、`useSession`、`sessionId` 和 `useProjection`。領域 adapter 可以繼續添加標準 source，但不會把 React hook 放進 model object。

`ui-conversation` 對每個 `SessionBinding.eventSource` 只綁定一次。它的 event registry 把持久 Session event 與 Client-only `assistant/live-chunk` update 關聯成穩定的業務 Context，view registry 則 materialize target snapshot。Chat Assistant、Trajectory Assistant 與 Turn Tail 同時解釋 live chunk 和持久 settlement 中嵌入的緊湊 stream，因此重連與分頁歷史無需持久 token 行即可復現相同 Assistant 狀態。`ui-chat` 與 `ui-trajectory` 分別注冊自己的 Definition 和 builder：它們可以解釋同一 event family，但不會導入或共享彼此的最終 display model。Shell 選擇一個已注冊 view，再通過標準 hook 與 Slot 交付其 snapshot。[Conversation](conversation.zh.md)定義 Context identity、replay、Location data、target builder 與 keyed renderer。

`ui-slots` 提供類型化 registry 與 lifecycle ledger；`ui-renderer` 是唯一通過 `useSyncExternalStore` 綁定裸 observable、擁有 React context 并渲染 root tree 的包。功能 component 通過推導出的 props 接收 framework hook、owner prop、store action 與顯式 injection。[Web Client Slots](slots.zh.md)列出這些輸入、擴展 API 與當前 Slot 層級。

## 數據通路

| 路徑 | 順序 |
|---|---|
| 持久 Session 展示 | Host Session log → packed Remote `follow`/`page` 歷史 → Client `SessionEventLikeEntry` window → Conversation Context → target snapshot（`chat`、`trajectory` 或其他已注冊 target）→ Slot view → React |
| 瞬態 Session control | Host control baseline → Remote snapshot stream → `SessionManager` queue/job/projection store → Session 與 list snapshot → 標準 hook → component |
| Workspace 狀態 | Host Workspace baseline 與 increment → `ClientWorkspaceModel` → `ctx.workspaces.list` → `useWorkspaces` → sidebar、hero 與 navigation entry |
| scoped interaction | Host Cordis waterfall → API Remotes `$events` → Session Context 上的 `ctx.remote.$on()` → 所屬 UI 包 → result 或 `next()` |
| 用戶 command | component callback → 注冊項 inject face 或 Slot owner → `ctx.sessions`、`ctx.workspaces` 或生成的 scoped Remote → Host Controller → 權威 update → stream 或 event projection 回到 Client |

## 重連

物理恢復與邏輯恢復彼此獨立。Gateway mux 恢復物理 WebSocket；Connection 發布可用 generation 后，每個 `RemoteStream` 分別重開自己的 logical source。Carrier failure 可以重試；business error、非法 opening item 或 protocol violation 會令所屬 logical stream 終止。

恢復方式由數據語義決定：

- 持久 Session journal 校驗邏輯 seq range，并根據每個 generation 的 opening snapshot 替換窗口；`page()` 提供更早歷史并修復后續 range gap。
- Session control 與 Workspace stream 在斷開期間保留最后一次發布的值，再用新的 opening baseline 原子替換。
- 普通 forwarded notification 不會 replay。需要可靠恢復的 stateful domain 必須提供 baseline、cursor 或顯式 query；scoped waterfall 保留自身的 request lifetime。

架構中沒有統一的 Client `Runtime`、`HostFrame`、`events.mux`、`events.host` 或通用 `resync()` API。Connection 公開 generation state，Gateway 管理 logical stream，Client model 則按自身數據定義 replacement 或 resume 語義。

## 包邊界

功能插件包可以通過 `import type` 共享聲明；不得運行時導入或轉發另一個功能插件的值。跨包行為使用注入的 Cordis service，跨包 UI 使用 Slots。特定 target 的 Conversation Definition、projection helper 與最終 view data 留在所屬 target 包中，即使 Chat 和 Trajectory 有意實現平行邏輯。

共享運行時值需要一個職責收窄、沒有功能生命周期的靜態 owner，例如 `client/store`、`ui-primitives` 或瀏覽器安全的 util 包。Transport 與生成 API assembly 可以導入運行時 contribution，因為組裝同一個 protocol 正是它們的顯式職責。功能包不能只為繞過此規則而添加 `dsh.client.external`。

根據所添加的擴展查閱四篇詳細參考：

- [Client Modules](client-modules.zh.md)：package discovery、loading、共享 module identity 與 boot order。
- [API Gateway](../api-gateway.zh.md)：Host method、生成的 Remote contribution、stream 與 forwarded event。
- [Web Client Slots](slots.zh.md)：component、hook、store、injection 與 placement。
- [Conversation](conversation.zh.md)：持久 event correlation、target snapshot，以及 Chat 或 Trajectory view contribution。
