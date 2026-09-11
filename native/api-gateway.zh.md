# API Gateway

[English](api-gateway.md) | 中文

本文是 Typert API Gateway 的當前狀態參考。它描述業務服務如何聲明一元 Remote 方法、構建如何生成 Host 與 Client 約定，以及調用如何復用 Connection 的 RPC 與 `/api` 路由。會話事件、增量數據和其他流協議不屬于本文范圍；它們可以使用同一個 Connection，但不使用 Remote 方法描述符。

## 編程模型

業務服務通過 `@Remote` 或 `@RemoteScope` 選擇對 Client 開放的方法。未標記的方法不會進入生成的 Client 類型或運行時貢獻，也不能通過 `ctx.remote` 調用。

`@Remote` 表示調用根 Host Context 中注冊的 Cordis 服務。復雜的 Host 對象不能直接跨 wire 傳輸；業務包必須通過 `TypertLookupMap` 聲明它與 wire identity 的關聯，并在運行時向 `ctx.typert.lookups` 注冊默認解析提供方。例如 `Agent` 參數在 Host 簽名中名為 `agent`，生成的 wire 字段為 `agentId`，Gateway 在調用業務方法前將 id 解析為 Host 對象。Host 組合可以用 `ctx.typert.lookups.configure()` 覆蓋某個 lookup key 的解析策略，而不改變業務包擁有的參數名、wire 字段或規范類型 symbol。

`@RemoteScope(key)` 表示先通過 `ctx.typert.contexts` 把 identity 解析為一個作用域 Context，再從該 Context 取得服務并調用方法。它適用于方法本身依賴作用域組合、而不需要顯式接收 `Agent` 等對象的情形。

服務通常繼承 `TypertRemoteService`，讓 Cordis 服務 key 與默認 Remote namespace 在構造器中顯式綁定。已有其他基類的服務可以改為聲明 `readonly typertRemote = bindTypertRemote(this, serviceKey)`；兩種方式都會留下可檢查的公開 binding，不依賴編譯器向構造函數注入 symbol。

```ts
import type { Agent } from '@deepseek-ai/dsh-agent'
import { TypertRemoteService, Remote, RemoteScope } from '@deepseek-ai/dsh-typert-protocol'
import type { Context } from '@deepseek-ai/cordis'

export interface CreateGoalRequest {
  objective: string
}

export interface CreateGoalResult {
  accepted: boolean
}

export class GoalService extends TypertRemoteService {
  constructor(ctx: Context) {
    super(ctx, 'goals')
  }

  @Remote('create')
  createForClient(
    agent: Agent,
    request: CreateGoalRequest,
    signal: AbortSignal,
  ): CreateGoalResult {
    signal.throwIfAborted()
    return this.create(agent, request)
  }

  @RemoteScope('agent', 'current')
  currentForClient(): CreateGoalResult {
    return { accepted: true }
  }

  private create(_agent: Agent, request: CreateGoalRequest): CreateGoalResult {
    return { accepted: request.objective.length > 0 }
  }
}
```

Remote 方法可以同步返回或返回 Promise。若需要協作式取消，Host 簽名的最后一個參數必須是全局類型的 `signal: AbortSignal`；它記錄在描述符中而不是進入 `args`，Client 生成的方法則接受最后一個可選的 `AbortSignal`。

Client 使用普通對象上的具體函數，不使用 JavaScript Proxy。直接調用與作用域調用分別出現在 `ctx.remote.<namespace>` 和 `agentCtx.remote.<namespace>`。每個 namespace 都是注冊為 `remote.<namespace>` 的可追蹤 Cordis 子服務；Client assembly 通過 `ctx.remote.$mount()` 掛載貢獻，最后一個方法撤回后該 namespace 隨即卸載。依賴聲明歸實際調用方所有：只有讀取 `ctx.remote.<namespace>` 或 `agentCtx.remote.<namespace>` 的業務包才在自己的 `inject` 中同時聲明 `remote` 與 `remote.<namespace>`；只負責掛載 contribution 的 assembly，以及不調用該 namespace 的上層運行時，不代業務包聲明 namespace 依賴。當一個 `@Remote` 方法恰好有一個 lookup 參數、且同名 `TypertContextMap` 使用相同 wire identity 時，生成的作用域簽名會省略該 identity 參數。`@RemoteScope` 只生成作用域調用接口。

```ts ignore-check
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { AgentContext } from '@deepseek-ai/dsh-api-session-controller/client'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'

export const inject = ['remote', 'remote.goals']

declare const ctx: Context
declare const agentCtx: AgentContext
declare const agentId: SessionId

await ctx.remote.goals.create(agentId, { objective: 'ship it' })
await agentCtx.remote.goals.create({ objective: 'ship it' })
```

Client 應用只裝配 `@deepseek-ai/dsh-api-remotes`。該包以運行時值導入被選業務包的 `/remote` 子路徑，通過 `ctx.remote.$mount()` 掛載貢獻，同時重新導出相同文件中的聲明合并。增加一個 Host Remote 包是 Client 組合所有者的顯式選擇；業務組件不需要分別加載 Typert Gateway 或業務包的 Remote JS。

`api-remotes` 裝配與 `ctx.remote` 約定不依賴 React；任何 Client 裝配能看到的 Host 方法都只限于生成時選擇的 Remote 方法。

## 組件職責

| 位置 | 包或入口 | 職責 |
|---|---|---|
| 共享 | `@deepseek-ai/dsh-typert-protocol` | 聲明 decorator、Gateway binding、可合并協議映射、調用描述符及提供方類型；不啟動 TypeScript 分析，也不注冊 Cordis 服務 |
| 構建 | `@deepseek-ai/dsh-typert-generator` | 從 Host `ts.Program` 嚴格分析 Remote 簽名、類型圖、lookup、Context 與源碼位置，并生成 Host 和 Host-for-Client 產物 |
| Host | `@deepseek-ai/dsh-typert-registry` 與 Loader | 把生成的 Host 描述符、schema 及業務包注冊項放入 `ctx.typert`，并持有 lookup 與 Context 提供方 |
| Host | `@deepseek-ai/dsh-api-session-controller` | 負責應用的 Agent/Session 身份策略，并配置對應的 Typert lookup |
| Host | `@deepseek-ai/dsh-api-gateway` | 提供 `ctx.typertGateway`，認領 Remote endpoint，解析對象或 Context，調用實時 Cordis 服務，并校驗請求值和返回值 |
| Client | `@deepseek-ai/dsh-api-gateway/client` | 提供 `ctx.remote` 與 `remote.<namespace>` 子服務，把生成的描述符掛成具體方法，并通過 Connection 發起、校驗和取消調用 |
| Client | `@deepseek-ai/dsh-api-remotes/client` | 顯式選擇并掛載本應用允許使用的 `/remote` 貢獻，向業務代碼帶入對應的聲明合并 |
| 雙側 | `@deepseek-ai/dsh-client-connection` | 提供 RPC carrier、請求關聯、信任邊界、取消、響應 envelope 與 `/api` HTTP bridge |

API Gateway 包同時擁有 Host dispatcher 與 Client Remote endpoint 兩個對等入口，但兩側構建不會進入同一個 `ts.Program`。Host 入口不導入 Client 的 Cordis `Context` 合并，Client 入口也不導入 Host Gateway 服務。

## 嚴格生成流水線

根構建依次執行 `build:lib:host`、`build:lib:client` 與 `build:web`。Host lib 階段先運行 `tsc -b tsconfig.host.json`，再運行 `tsdown --env.DSH_BUILD_FACE host`；Typert generator 由正常 Host Project Reference 圖編譯，并在這次 tsdown 中以 Host aggregate 為唯一 `ts.Program` 種子運行。Client lib 階段隨后運行 `tsc -b tsconfig.client.json` 與 `tsdown --env.DSH_BUILD_FACE client`，使用剛生成的 Remote Client 聲明和運行時貢獻，但不再次啟動 Typert。

兩次 tsdown 都接收完整 workspace，且都只打包 `lib/types` 中由對應 tsc 階段發射的 JavaScript。根配置不掃描 Client 產物、不按包名分類，也不向 tsdown 傳維護式 filter；各包的本地配置根據 `DSH_BUILD_FACE` 返回當前階段的入口。普通 Client 插件在 Client 階段一起生成 Node loader 入口與 browser bundle。

`api/remotes`、`api/gateway`、`api/session-controller` 與 `api/workspace-controller`（外加 `client/connection`）都拆分 TypeScript face。`api/remotes` 的 Client project 依賴業務包在 Host tsdown 中生成的 `/remote` 聲明；根 aggregate 與直接消費方必須分別引用各拆分包自己的 `tsconfig.host.json` 或 `tsconfig.client.json`。`api-remotes` 的 `clientBundle(..., { hostPhase: true })` 讓 Host 入口在 Host tsdown 中生成，讓 Client tsdown 只生成 browser 入口。Agent/Session lookup 策略位于 `@deepseek-ai/dsh-api-session-controller`，而非 `api-remotes`。

每個貢獻業務包把生成文件寫入自己的 `lib/`，而不是源碼目錄：

| 文件 | 消費方 | 內容 |
|---|---|---|
| `typert.host.js` | Host Loader | Host face 的運行時反射、嚴格調用描述符和 schema 注冊值 |
| `typert.host.d.ts` | Host 類型系統 | Host face 的生成聲明 |
| `typert.remote-client.js` | `api-remotes` | 可掛載的 `TypertRemoteContribution`，包含嚴格描述符與運行時 codec |
| `typert.remote-client.d.ts` | Client 類型系統 | `TypertRemoteNamespaceMap` 與 `TypertRemoteScopeMap` 的聲明合并及 Client-safe 類型引用 |
| `typert.remote-client.d.ts.map` | 編輯器 | 將生成的方法屬性映射回 Host 包中的 Remote 方法聲明 |

業務包通過 `./typert` 暴露 Host Loader 入口，通過 `./remote` 暴露 Host-for-Client 入口。生成器同時校驗這些包 export 及發布文件清單；只有具備相應入口的顯式貢獻包才會生成產物。

Remote Client 聲明中的參數名來自 wire 字段，參數和返回類型則引用原業務包導出的 Client-safe 類型。聲明 map 把 `ctx.remote.goals.create` 最終解析到的生成屬性映射到帶 `@Remote` 的 Host 源方法，因此支持 declaration-map 的編輯器可以從 Client 調用跳到真實實現，而不是停在生成的 `.d.ts`。

嚴格分析要求 Remote 是公開、非靜態、有具體實現的實例方法。方法不能是泛型；參數必須是具名且必填的簡單標識符，不能使用解構、默認值、rest 或可選參數。可 JSON 表示的普通類型由 Typert 生成嚴格 schema；工作區 class 等復雜對象必須具有唯一的 `TypertLookupMap` 聲明。lookup 與 Context 包同時負責靜態聲明合并和運行時提供方注冊；缺少任一側都會導致構建失敗，或者首次調用需要該提供方時失敗。

## 運行時調用

Remote 調用使用 Connection 的 `/api` 路由。Client Remote 調用 `connection.rpc.call('/api', '<namespace>/<method>', { args }, signal)`；HTTP carrier 對應 `POST /api/<namespace>/<method>`，payload 只包含一個具名 `args` 對象。

Connection 在 HTTP bridge 之前執行 `/api` 的統一信任檢查，再在共享 FetchHandler 內分發。Typert Gateway 只認領存在嚴格描述符或活躍 SRC marker 的兩段式 endpoint；功能自有的精確 Fetch 路由處理非 JSON 響應，其他請求返回 404。Connection 擁有傳輸、RPC id、響應 envelope 和請求取消，Gateway 只擁有 Remote 數據協議和業務分發。替換 Connection carrier 不要求改變 Remote 描述符或 Client 編程接口。

Gateway 每次調用都從當前注冊表解析描述符和實時服務，不緩存業務對象。它要求 `args` 的字段集合與描述符完全一致，先用 codec 校驗 wire 值，再通過注冊的 lookup 或 Context 提供方解析對象或接收者，最后調用 binding 指向的服務方法并校驗返回值。缺少提供方、identity 未命中、binding 不一致、參數缺失或多余、schema 失敗和方法不存在都會在進入業務代碼前或離開業務代碼后失敗。

lookup 提供方的 `register()` 同時提供穩定聲明和默認 resolver；`configure()` 提供由 Host 組合擁有、可異步執行且受 effect 生命周期約束的 resolver。配置可以先于提供方掛載；沒有提供方時調用仍以 `gateway/lookup-unavailable` 失敗，配置卸載后則恢復提供方默認策略。Session Controller 負責 `agent` 與 `session` 的標準 resolver 語義：復用 live Agent，自動恢復普通冷會話，對并發恢復去重，并拒絕由 subagent routing 擁有的 identity；`session` lookup 返回該 Agent 的 Session。恢復失敗與 ownership fence 拋出攜帶自有碼的 `RemoteError`（`session/not-found` 或 `session/agent-busy`），Gateway 原樣編碼上 wire；只有未歸類的 throw 才折成 `gateway/internal`。

Client 卸載一個貢獻時會一起移除描述符和具體方法，中止其進行中的調用，并使外部仍持有的陳舊方法句柄拒絕繼續調用。Host 上已經注冊過的嚴格 endpoint 被撤回后也不會降級到 SRC 推斷，以免熱卸載悄然降低校驗強度。

## SRC 開發回退

Host 通過 `node --import tsx/esm` 從源碼啟動時不會執行 Typert 編譯插件。標準 decorator 初始化器仍會把方法名和調用模式記錄到 Service 原型上的帶版本描述符中，`TypertRemoteService` 或 `bindTypertRemote()` 則提供顯式服務 binding；Gateway 因而可以在不啟動 `ts.Program` 的情況下構造一個較弱的臨時描述符。描述符使用穩定的字符串屬性名，因此 `remoteMethods()` 能讀取協議包另一個已安裝副本寫入的標記。

SRC 回退從運行中函數解析簡單參數名。參數名與某個已注冊 lookup 的 `parameter` 相同，例如 `agent` 或 `session`，就使用其 `agentId` 或 `sessionId` wire 字段并在 Host 解析對象；其他參數只檢查值是否為無循環、無特殊 prototype 的 JSON-safe 數據。`@RemoteScope` 直接使用已注冊 Host Context 提供方的 wire 字段。SRC 不讀取 TypeScript 類型，不生成 Zod schema，不推斷可選參數，也不支持解構、默認值、rest 或重復參數名。

SRC 只解決 Host 源碼進程的分發問題。Client 不會從運行中的 Host 發現 decorator，Client Remote 也拒絕掛載缺少嚴格 codec 的 SRC 描述符；其類型、codec 和 Remote 注冊值始終來自最近一次生成的 `lib/typert.remote-client.*`。

## 開發模式

Web 開發先使用 `pnpm run build` 準備當前 Host、Client 與 Web 產物，然后在兩個終端中分別運行源碼 Host 和 Client plugin watcher：

```sh
pnpm dsh web
pnpm run dev:web
```

`dsh` 通過 tsx 啟動 Host 源碼，所以 Host 可以使用 SRC 回退；`dev:web` 只監聽帶 `dsh.client` 聲明的 Client 插件并重寫其 `lib/client.js`，它不會分析 Host decorator，也不會生成 Remote Client DTS。

只修改 Remote 方法實現體而不改變約定時，無需重新生成 Typert 文件。新增或刪除 decorator、修改導出名、namespace、參數、返回值、lookup、Context 或取消簽名時，重新執行有序 lib 構建，讓 Host 先生成嚴格約定，再讓 Client 編譯并打包新的貢獻：

```sh
pnpm run build:lib
```

運行中的 Client watcher 會在重新打包時消費這些生成文件。若已單獨運行 `pnpm run build:lib:host` 刷新 Host 約定，也可再運行 `pnpm run build:lib:client` 完成 Client 側；干凈工作樹不能跳過 Host 階段。僅重新編譯前端源碼不能從 Host decorator 推導新類型。`pnpm run typecheck` 會執行 Host lib 階段后再運行 Client tsc，CI 與發布構建也使用同一順序。

## 邊界

Remote 只處理有單個請求與單個結果的一元方法調用。會話事件流、分頁、增量 reduce、projection 和實體子流需要獨立的數據協議與注冊模型；即使它們復用 Connection，也不應偽裝成 Remote 方法或放入調用描述符。

API 各層按 `remotes → gateway → connection → webserver` 組織。BFF 與 Typert RPC 層位于 `packages/api`；Connection 與 WebServer 位于 `packages/client/connection` 和 `packages/host/webserver`。需要流式或瀏覽器原生響應的功能注冊精確的 Connection Fetch 路由，而不定義 Remote 方法。

lookup 策略按 key 配置，因此所有 `agent` 或 `session` 參數共享冷恢復行為。只接受 live 對象需要顯式的逐參數或逐 endpoint 策略，而這種策略并不存在；不能通過業務方法內部猜測對象是否來自恢復。
