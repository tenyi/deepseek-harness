---
description: "面向瀏覽器功能測試的 jsdom slot 測試運行時，供測試作者針對生產機制檢驗 slot、存儲與渲染。"
kind: "package-library"
---

# @deepseek-ai/dsh-client-test-runtime

[English](README.md) | 中文

## 概述

`SlotTestRuntime.create()` 讓 Vitest 套件在 jsdom 中驅動生產 slot、store、帶類型的 Session 與 Workspace fixture，并對局部 DOM 斷言。面向插件激活、重載、重連與清理的測試，`createClientTest` 使用具名端點 Remote mock 啟動 web profile 的 bundle roster，無需業務 Host。缺失服務與未打樁調用會明確失敗。整機 fixture 擁有啟動和銷毀，局部 runtime 提供冪等銷毀。通過 `devDependencies` 將本包用于客戶端測試；它不是產品插件。

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

本包讓瀏覽器功能測試擁有可掛載的真實運行時：創建測試臺，聲明你的功能所占用的 slot，掛載功能插件，渲染一個 slot，在局部視圖上斷言，然后 dispose（資源釋放）——全程不存在生產邏輯的第二份實現。

### 搭建功能測試

`SlotTestRuntime.create()` 組裝運行時，`declare(children)` 注冊一個自動 frame，其逐 key 的 `<div data-slot>` 包裹層成為快照根，`mount(plugin)` 在真實 fiber 上運行功能，`renderSlot(key, owner, opts?)` 返回帶限定查詢與原位更新的 slot 局部視圖：

```text
const runtime = await SlotTestRuntime.create()
await runtime.declare({ 'feature-slot': {} })
const handle = await runtime.mount(FeaturePlugin)
const view = runtime.renderSlot('feature-slot', { owner: props })
expect(view.container).toMatchSnapshot()
await runtime.dispose()
```

`mount` 會預檢必需服務，缺失時自明報錯——先用 `provide(name, value)` 提供額外服務。運行時會提供不可用的 `fileUpload` 替身，使裝配可以掛載；測試上傳行為時，需要在掛載前替換 `runtime.fileUpload.upload`。`storeOf(key, scopeKey)` 返回渲染器交給 slot 組件的實時存儲實例，用于身份與動作驅動寫入斷言。

可選渲染參數通過 `entryKey` 選擇 keyed 條目，或通過 `only` 選擇 list 條目；`view.update(owner)` 保留該選擇。`runtime.panelInfo` 提供默認的 `usePanelInfo` 數據源，初始不選中全局面板。掛載生產 Layout 所有者之前，先調用 `releasePanelInfoSource()` 釋放該數據源。`dispose()` 同時釋放默認的工作區與面板信息根數據源；提前釋放是冪等的，不會移除替代它們的所有者。

### 局部 DOM 快照

注冊的快照序列化器把 CSS-module 哈希類名折回語義名（`_frame_a1b2c3` → `frame`），使 `.snap` 文件只含結構，并把 `<svg>` 內部折疊為 `data-content` 指紋。需要自定義頁面 frame 的套件改用 `root.declare(children, Frame)` 而非自動 frame；`dispose()` 沿單一軸拆除視圖、功能 fiber、已鑄 scope 與持久化存儲狀態，且冪等。

### 腳本化 Remote 應答與失敗

`TestRemote` 是 `ctx.remote` 面的替身：它把自己連同每個被腳本化的命名空間各注冊一個服務，使注入 `remote.<name>` 的插件得以解除掛起；`$on` 訂閱由顯式的測試事件驅動器推動；`$host` 是普通可變字段，套件直接賦值即可腳本化帶 home 或非 loopback 的 Host。UI 套件也在本包取用 `RemoteError` 構造器這個值——`dsh-api-remotes` facade 承載不了它，因為從套件發起的值 import 會拉起該裝配尚未構建的 `/remote` 產物鏈。

按 Host 會答的碼來腳本化失敗，并以生產代碼同樣的方式斷言——判 `code`，絕不判類：

```text
import { RemoteError } from '@deepseek-ai/dsh-client-test-runtime'

remote.goals.create.mockResolvedValue({
  ok: false,
  error: new RemoteError('goal/not-found', 'goal "g1" does not exist', { goalId: 'g1' }),
})
expect(view.getByRole('alert')).toHaveTextContent('goal/not-found')
```

### 整體檔

上面的 slot 檔把一個功能掛在替身上。整體檔起真實裝配：`TestClient.start(plan, mock, options)` 把 `{ rpc: mock.rpc }` 裝到 `globalThis.__DSH_TRANSPORT__`，進程內 import 每個 roster 行的 `/client` 模塊（或取計劃里的 `provide` 替換），用 `graphFromRoster` 合成啟動圖并把已加載模塊交給生產模塊系統，經生產 `bootClient` 啟動，按需掛載 `uiRenderer`，再等 `ctx.connection.state === 'connected'`。它藏在深 import 后面，slot 檔測試永不加載它：

```text
// @vitest-environment jsdom
import { createClientTest, webApp } from '@deepseek-ai/dsh-client-test-runtime/src/assembly/index.ts'
import { ok } from '@deepseek-ai/dsh-remote-mock'

const test = createClientTest({ roster: webApp }, { mount: true })
test('registers into the sidebar', async ({ remote, start }) => {
  remote.settings.describe.mockResolvedValue(ok({ writable: true, hasDocument: false, namespaces: [] }))
  const client = await start()
  expect(client.ctx.slots.entries('sidebar.settings')).toHaveLength(1)
})
```

`createClientTest` 使用原生 Vitest fixture：每個測試獲得已加載 `remoteDefaultResponses` 的新 `mock`、等同于 `mock.remote` 的 `remote` Proxy，以及配置應答后才起機的 `start()`。重復啟動共用一個 Promise，調用方必須 await 它來觀察啟動錯誤。fixture 收尾等待啟動，即使斷言失敗也銷毀客戶端、檢查漏配，并拒絕測試結束后保存的 `start` 調用。需要分別擁有多個客戶端時直接用 `TestClient.start`。這些 fixture 隔離自己的狀態，不隔離 `location` 等頁面全局。

兩檔測試的所有命名空間都使用[通用 Remote Proxy](../remote-mock/README.zh.md#remote-proxy)。裝配測試使用 `remote` fixture；局部 `TestRemote` 可以接收 `{ settings: mock.remote.settings }`。直接配置返回數據，并讀取原生 `.mock.calls`。mutation 應答不會自動更新后續 describe 應答：場景發布新數據時，顯式修改 `remote.settings.describe.mockResolvedValue(...)`。Proxy 文檔擁有無構建類型說明和必需的構建后本地類型檢查規則。

### Roster 與啟動行為

`webApp` 是 `web` profile 的瀏覽器 roster，首次 import 裝配入口時從它的 bundle（先 `dsh-base`、再 `dsh-web-app`）按啟動器的方式現讀，只是匹配不到任何行的補丁在這里拋錯、啟動器只警告：每個 bundle 的 `dsh.bundle.patch` 列表用 include 插件的 YAML 方言解析、用它的 `applyEntryPatches` 合成，每個未禁用且其包聲明 `dsh.client.platform === 'web'` 的行成為一行，帶上該聲明的 `inject` 與 `immediately`；`bundleRoster(bundles)` 對任意 bundle 列表做同樣的事。沒有任何東西從 bundle 拷貝出來，bundle 一改下次跑測試就能看見。`webApp.closure(names)` 保留點名的行及其傳遞注入的全部行（即按 bundle 組合方式起這些插件所需的行），`webApp.pick(names)` 與 `webApp.without(names)` 手工裁剪，三者都對未知名字拋錯，`ClientRoster.of(rows)` 內聯構造一份。`remoteDefaultResponses` 是 roster 在沒有 session、沒有 workspace、默認設置下啟動時恰好會打的那些 Remote 端點的默認響應；測試用 `mock.load(table)` 在其上疊加自己的 `RemoteTable`，任何沒有規則的調用都會在 `dispose()` 時經 `mock.assertNoUnmatched()` 讓測試失敗。`mount` 要求 roster 提供 `uiRenderer`；否則 `start` 響亮失敗而不是返回一個空容器。`client.connection` 是 roster 的 Connection 服務（沒有任何 `Context` 增強聲明它），`connectTimeoutMs` 限定等就緒的時長，超時消息列出 mock log。`reload(name)` 按 client-hmr 的方式重建一個 Loader entry（先拆 registry，再 `entry.refresh()`），并在 worker 的啟動輪次內裝上本客戶端的載體，重建的 `connection` 行因此讀到自己的 mock；`unload(name)` 移除它；`flush()` 在 `act` 內讓 React 落定。jsdom 既沒有 `EventSource`（client-hmr 在 apply 時打開一個）也沒有 `ResizeObserver`（布局組件掛載時觀察尺寸），所以 `start` 對缺失的全局裝惰性樁、`dispose` 只移除它裝的那些——這是 jsdom 的缺口，不是產品需求。每個 roster 里的 `@deepseek-ai/dsh-api-remotes` 行都會被去掉：它生成的 Remote 客戶端只存在于構建后的 `lib/`，而 `remote.<ns>` 正是本檔要替掉的東西。`start` 改為給 roster 注入的每個 `remote.<ns>` 服務（加上此刻 mock 登記過規則的命名空間；之后才首次登記的命名空間沒有代理）提供一個無契約代理；`ctx.remote.<ns>.<method>(...args)` 變成對端點 `<ns>/<method>` 的調用，攜帶位置參數，mock 登記了 `stream()` 腳本的走流、否則走一元，并沿用生成客戶端的結果折疊（載體拋錯折成 `gateway/internal`，中止折成 `gateway/cancelled`）。沒有規則的端點照樣發出，所以 mock 會記下它、`dispose()` 讓測試失敗。

### 何時使用

當功能套件要在真實運行時下檢驗 slot、存儲、渲染與銷毀時使用本測試臺——生產 `SlotRegistry`、渲染器與 provide bundle 物化都會被掛載，絕不重實現。它是客戶端測試基礎設施：永遠不觸及模型請求，功能包僅以 `devDependencies` 依賴之。

### 可能出什么問題

- **已聲明服務未提供**——`mount` 自明報錯并列出缺失名稱；請先用 `provide()` 提供。
- **在 `declare` 之前嘗試渲染**——`renderSlot` 自明報錯；請先聲明該 key。
- **測試調用會話行為樁上未打樁的動詞**——fixture 樁按設計自明報錯，缺失的樁會在調用點浮現，而非靜默通過。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋測試臺的設計；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計

測試臺不復制生產邏輯：它掛載生產 `SlotRegistry`、生產渲染器與 `UiSession` 適配器。`TestSessions` 與 `TestWorkspaces` 實現功能通過 Cordis 消費的 owner 接口，每個 fixture Session 實現 `SessionFace`，`stubSettingsScope` 實現 `SettingsScope`。`UiSession` 從這些控制器綁定派生標準渲染器數據源。未 stub 的 `ISession` 行為會攜缺失方法名失敗。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | `SlotTestRuntime` 組裝、`TestRoot`、自動 frame、`mount`/`dispose` |
| [`src/sessions.ts`](src/sessions.ts) + [`src/workspaces.ts`](src/workspaces.ts) | `ISessions`/`IWorkspaces` 測試替身與 `FixtureSession` 行為樁 |
| [`src/fixtures.ts`](src/fixtures.ts) | 普通 fixture 構造器：會話快照、workspace 列表狀態 |
| [`src/snapshot.ts`](src/snapshot.ts) | DOM 快照序列化器（類名哈希折疊、`<svg>` 指紋） |
| [`src/remote.ts`](src/remote.ts) | 用于 host RPC 的 `TestRemote` 替身、`RemoteError` 值轉出 |
| [`src/translate.ts`](src/translate.ts) + [`src/locale-env.ts`](src/locale-env.ts) | 翻譯與固定瀏覽器語言測試輔助 |
| [`src/settings-scope.ts`](src/settings-scope.ts) | 帶測試驅動發布與寫入 spy 的 `stubSettingsScope` |
| [`src/assembly/roster.ts`](src/assembly/roster.ts) | `ClientRosterRow`、`ClientRoster`（`of`/`closure`/`pick`/`without`）、它所標注的 `AssemblyPlan`，以及 `graphFromRoster` |
| [`src/assembly/modules.ts`](src/assembly/modules.ts) | 源碼 `/client` 導入及替換，通過生產模塊 facade 的待注冊工廠隊列登記 |
| [`src/assembly/test-client.ts`](src/assembly/test-client.ts) | `TestClient`：裝傳輸、jsdom 樁、`bootClient`、掛載、等就緒、`reload`/`unload`/`dispose` |
| [`src/assembly/vitest.ts`](src/assembly/vitest.ts) | 測試級 `mock` 與懶啟動 `start` fixture |
| [`src/assembly/remote-default-responses.ts`](src/assembly/remote-default-responses.ts) | `remoteDefaultResponses`：roster 啟動期 Remote 端點的默認響應 |
| [`src/assembly/remote-proxies.ts`](src/assembly/remote-proxies.ts) | 經 Connection 的無契約 `remote.<ns>` 代理：`remoteNamespacesOf`、`remoteProxiesPlugin` |
| [`src/assembly/bundle-roster.ts`](src/assembly/bundle-roster.ts) | `bundleRoster` 與 `webApp`：用 include 插件自己的 schema 與補丁應用從 bundle 補丁文件讀出瀏覽器 roster |
| — | 不發布運行時不變式伴生入口；本測試支持包不擁有生產事件流或可變數據，而是圍繞測試替身組裝生產 SlotRegistry 與渲染器。所掛載的生產包擁有各自的不變式，本包行為由本包測試檢驗。 |

### 生命周期

`create()` 構建全新上下文，掛載 slot 與會話注冊表，安裝渲染器，并提供 session/workspace 替身和明確失敗的文件上傳替身。`mount` 在啟動 fiber 前對照上下文檢查每個已聲明注入，使缺失提供方自明報錯而非永久掛起。`dispose()` 先卸載 React 樹，再 dispose 功能 fiber、釋放根注冊、dispose 已鑄 session scope 并清除持久化存儲狀態；每個公共修改器都包裹在 act 中，因此測試無需自行處理 SlotCore 微任務批處理或 React `act`。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從測試臺逐步進入它所掛載的生產機制以及使用它的測試。

- [ui-session](../../client/ui-session/README.zh.md)——從控制器替身派生標準 Slot 數據源的生產適配器。
- [UI slots 包](../../client/ui-slots/README.zh.md)——測試臺掛載的 `SlotRegistry` 約定。
- [UI renderer 包](../../client/ui-renderer/README.zh.md)——測試臺安裝的渲染器。
- [測試策略](../../../docs/testing.zh.md)——覆蓋層級與瀏覽器快照流水線。
- [test-support 組地圖](../README.zh.md)——兄弟 harness 與支持包。

-----

<a id="model-experience"></a>
## 模型體驗

無；本包是瀏覽器側測試基礎設施，不會發起任何模型請求。

#### KV Cache 影響

無；本包既不組裝也不發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本測試臺如何被消費。它們是當前包約束，不是任務積壓。

- **整體檔不運行生成的 Remote 客戶端**——`remote.<ns>` 代理轉發位置參數，不經過生成的 zod 校驗、wire 名映射或 scoped 身份注入；mock handler 直接接收這些參數，生成客戶端仍由 built-artifact e2e 車道覆蓋。
- **代理調用繞過 Gateway 客戶端的 `invoke` 與 `invokeStream`**——不做 `$mount` 生命周期檢查，流失敗不經 `normalizeConnectionStream` 重新標記，一元拒絕由代理自己用 Gateway 客戶端導出的 `carrierFailure` 與 `cancelledFailure` 折疊。`ctx.remote.$stream`、`$on`、`$host` 是真 Gateway 客戶端的。
- **未聲明的端點按一元調用發出**——代理從 mock 的登記學到每個端點的模式；spec 既沒給腳本也沒聲明（`RemoteTable.streams`、`mock.stream(endpoint)`）的流端點記為 `unary` 漏配，產品代碼收到的是折疊結果而不是失敗的流。`remoteDefaultResponses` 聲明了 roster 啟動后才打開的流；無論哪種，`dispose()` 都會讓測試失敗。
- **本包的 client 編譯程序加了 `node` 環境類型**，好讓 roster 讀取器使用 `node:fs`；slot 檔的源碼也在這些類型下編譯。
- **Session、Conversation 與 Chat fixture 保持分離**——`sessionSnapshot` 只包含 Session 控制器狀態，`conversationSnapshot` 包含與目標無關的 Conversation 狀態，`chatSnapshot` 包含 Chat 目標狀態。組裝測試提供 Session 事件條目，而不是向 `SessionSnapshot` 添加 Conversation 或 Chat 字段。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
