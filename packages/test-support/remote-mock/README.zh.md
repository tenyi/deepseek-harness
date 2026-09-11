---
description: "Typert Remote 流量的端點具名 mock：一元應答與流腳本的表、活流控制、日志與 Connection 載體面，供測試作者在沒有 Host 的情況下啟動真實瀏覽器客戶端。"
kind: "package-library"
---

# @deepseek-ai/dsh-remote-mock

[English](README.md) | 中文

## 概述

`dsh-remote-mock` 讓測試通過 `mock.remote.<namespace>.<method>`，使用原生 Vitest mock 方法配置 Host 響應。同一組函數應答直接調用與真實 Connection 流量；可復用的表提供默認響應，顯式聲明的流支持測試驅動的推幀與取消。缺少響應時調用失敗，`assertNoUnmatched()` 會在收尾時再次報告。本包無需業務 Host 即可在 Node 或瀏覽器頁面中運行，不導入 DOM、React 或 Node 模塊，只從 `devDependencies` 消費。

## 目錄

- [使用本包](#use-this-package)
- [理解實現](#understand-the-implementation)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

### 何時使用

當測試要啟動與 `ctx.remote` 對話的真實客戶端插件、并想按端點名腳本化 Host 側時使用它：經 `__DSH_TRANSPORT__` 的整體 jsdom 測試，以及直接調用 `dispatch` / `open` 的單元測試。端點是 Gateway 的 wire 名（`session/page`、`settings/describe`）；`args` 是調用方的位置參數列表，末尾的 `AbortSignal` 已剝掉；值就是測試登記的東西，原樣應答。唯一的聲明是端點是一元（`unary`）還是流（`stream`）。

<a id="remote-proxy"></a>
### 使用 Remote Proxy

`mock.remote` 無需方法清單或領域專屬 Helper 即可提供每個命名空間和方法。每個訪問過的端點使用緩存的原生 Vitest mock；`@vitest/spy.fn` 就是 `vi.fn` 背后的實現，也能在沒有 Vitest runner 的瀏覽器頁面中運行。同一個 mock 應答直接調用與 Connection 流量，因此返回值覆蓋和調用斷言觀察的是客戶端實際調用的函數：

```text
const mock = RemoteMock.create().load(remoteDefaultResponses)
mock.remote.settings.describe.mockResolvedValue(ok({
  writable: true, hasDocument: false, namespaces: [],
}))
mock.remote.settings.mutate.mockResolvedValueOnce(ok(updatedNamespace))
// After the client writes:
expect(mock.remote.settings.mutate).toHaveBeenCalledWith('locale', operations, revision)
```

使用 `mockResolvedValue` 設置持續響應，使用 `mockResolvedValueOnce` 或 `mockReturnValueOnce` 排隊設置響應，使用 `mockImplementation` 按參數決定行為。原生隊列按登記順序消費響應，耗盡后由 mock 的當前實現應答；初始實現讀取已登記的默認響應。`mockClear()` 保留響應與隊列；`mockReset()` 清除覆蓋并恢復初始實現，由它讀取最新默認響應。若未配置默認響應，排隊響應耗盡后仍會失敗，包括可能同步拋錯的直接調用。

只有顯式 `stream()` 或響應表中的流聲明才選擇流方法；其余均使用一元 mock。訪問方法不會憑空構造成功的業務結果。保存方法引用前先聲明流模式：每個端點/模式擁有各自的 mock。命名空間和方法的 `then` 探測及 symbol 讀取均無副作用。

`MockedRemote` 使用 Vitest 的深層 mock 類型轉換，覆蓋完整生成的 `TypertRemoteNamespaceMap`。非空映射保留命名空間與方法名、參數、返回值和原生 spy 類型。映射為空時只有這個測試 Proxy 變成 `any`，允許任意命名空間和方法；它不增補或弱化生產 Remote 聲明。不需要復制方法簽名、抑制可選生成模塊錯誤或開啟編譯器級全局 Flag。交付 Remote/mock 改動前運行 `pnpm run typecheck`，生成并檢查真實 Client 類型；聲明缺失、陳舊或不完整時先重新構建。無構建測試通過或推斷為 `any` 都不是嚴格類型證據。

### 登記默認響應

`load(table)` 安裝可復用的 `unary` 值或 handler、`stream` 腳本以及無腳本的 `streams` 聲明。`unary(endpoint, value)` 與 `unary(endpoint, fn)` 登記單個默認響應；handler 接收調用方的位置參數，并使用現有請求類型。每個端點僅保存最新默認響應，包括顯式 `undefined`；更新默認響應不會清除原生覆蓋。`ok(value)` 構造 `{ ok: true, value }`；失敗使用 `{ ok: false, error: { code, message, details } }`。有狀態 handler、promise 與原生隊列均由各測試獨立持有：

```text
const initial = { writable: true, hasDocument: false, namespaces: [] }
const mock = RemoteMock.create().load({
  unary: { 'settings/describe': ok(initial) },
})
mock.remote.settings.describe.mockResolvedValueOnce(ok({ ...initial, hasDocument: true }))
```

### 駕馭流

流腳本是一個接收打開時的 `args` 與 `StreamHandle`（`push`、`end`、`fail(error)`、`signal`）的函數；腳本返回后流保持打開，直到句柄結束或失敗。`frames(items)` 構造吐完即結束的腳本，`openStream(initial)` 構造吐完后保持打開的腳本。`mock.streams` 控制客戶端當前打開著的流，可按打開時的參數過濾；`opened(endpoint, count)` 在該端點被打開達到該次數時 resolve，`drained(endpoint)` 在每條匹配流的消費方都拉完了迄今推入的全部內容時 resolve——打開的流要其消費方再次等待，已定局的流要隊列已空（拉完指從隊列取走；只有在讀循環內處理項的消費方才等于處理完）：

```text
mock.stream('session/follow', openStream([snapshotFrame]))
await mock.streams.opened('session/follow', 1)
mock.streams.push('session/follow', eventFrame, ([request]) => (request as { sessionId: string }).sessionId === SID)
mock.streams.fail('session/follow', new Error('gone'))
await mock.streams.drained('session/follow')
```

失敗的流讓消費方的下一次讀取以給定的 `Error` reject。消費方取消（打開時的 signal 或 iterator 提前 `return()`）會中止 `StreamHandle.signal`、結束迭代而不拋錯，并把該流記為 `cancelled`。

### 接上客戶端

`mock.rpc` 是 `ClientConnectionRpc` 面：裝成 `globalThis.__DSH_TRANSPORT__ = { rpc: mock.rpc }`，生產的 `connection` 插件就用它替代 HTTP 調用方，每次 Remote 調用直達 `dispatch`、每條流直達 `open`，中間沒有信封。payload 攜帶 `{ args }`——整機代理發數組、Gateway 自身端點發一個對象（到達時是一個位置參數）；signal 中止的調用以中止原因 reject。`RemoteMock.create()` 登記一條流 `$events`，用 `{ type: 'ready', clientId, host: { home } }`（host 來自 `RemoteMockOptions.host`，默認 `/home/mock`）應答 Gateway 客戶端的打開并保持打開——這正是整機能達到 `connected` 的原因；測試可以像任何流一樣覆蓋或讓它失敗。

### 觀察與斷言

`mock.log.calls(endpoint?)` 列出經 `dispatch` 或 `rpc.call` 的一元調用（`args`、`seq`、實時 `state` 為 `pending` / `answered` / `failed`，以及作為 `result` 的應答值或拋出的錯誤），`streams(endpoint?)` 列出腳本流的打開記錄及其實時 `state` 與 `pushed` 計數，`requests(endpoint?)` 按順序列出調用與打開的首個位置參數（不帶端點時去掉 Gateway 自己帶 `$` 前綴的端點），`unmatched()` 列出沒找到規則的請求。原生 `.mock.calls` 還包含直接 Proxy 調用；載體的流 mock 會收到末尾的取消信號。`assertNoUnmatched()` 在收尾時報告漏配。`modeOf(endpoint)` 報告顯式登記；`endpoints()` 還包含訪問過的 Proxy 方法，使裝配能夠提供它們的命名空間。

### 可能出什么問題

- **請求沒有規則**——`dispatch` reject、`open` 拋出 `remote-mock: no rule for <endpoint>; registered: …`，日志記下這次漏配；請登記該端點。
- **payload 不是 `{ args: unknown[] | object }`**——`rpc.call` reject、`rpc.open` 拋 `TypeError`；整機代理發數組形式、Gateway 自身端點發對象形式，所以問題出在手寫調用。
- **同一條流上有第二個并發讀取**——該讀取 reject；Gateway 順序讀取流，因此這指向測試側誤用。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

### 設計

`dispatch` 與 `open` 接收端點與位置參數；`rpc` 通過 Connection 的已解碼載體接口暴露同一個核心。每個 mock 獨立持有原生函數及排隊覆蓋；共享表提供默認響應，不復制 handler 或應答對象。每條腳本流擁有自己的隊列、唯一掛起讀取和日志條目；`end`、`fail`、消費方取消三者中最先發生者定局。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 公開面轉出 |
| [`src/remote-mock.ts`](src/remote-mock.ts) | `RemoteMock`：默認響應、原生 mock、Connection 分發、受控流與缺失響應檢查；`ok` |
| [`src/remote-proxy.ts`](src/remote-proxy.ts) | 命名空間／方法查找與生成映射的 mock 類型 |
| [`src/streams.ts`](src/streams.ts) | `frames` / `openStream` 腳本與 `MockStream`（句柄 + `AsyncIterable`） |
| [`src/log.ts`](src/log.ts) | 帶共享 `seq` 計數器的日志 |
| — | 不發布運行時不變量伴生件；本測試支持庫不擁有任何生產事件流或可變進程狀態，其行為由本包測試覆蓋。 |

</details>

-----

<a id="model-experience"></a>
## 模型體驗

無；本包是瀏覽器側測試基礎設施，無一物到達模型請求。

#### KV Cache 影響

無；本包既不組裝也不發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **僅進程內載體**——`rpc` 經 `__DSH_TRANSPORT__.rpc` 服務同一 realm 的客戶端；不提供給瀏覽器車道測試用的 HTTP 或 WebSocket 載體。
- **值按引用傳遞**——應答與流項都未經序列化就到達客戶端，真實線路會拒絕的非 JSON 值在這里原樣通過。
- **不校驗值**——一元應答必須是調用方讀取的結果（`{ ok, value }` 或 `{ ok: false, error }`）；mock 原樣傳遞它，不檢查這些字段。
- **不做 payload 匹配**——規則只按端點匹配；在 handler 內按業務參數判別。
- **原生流覆蓋自行管理 iterable**——覆蓋返回自有 iterable 時，不參與腳本流日志、`requests`、`opened`、`drained` 以及 `push` / `end` / `fail`；調用方也負責取消。原生調用斷言仍然有效。需要這些控制能力的場景應使用已登記的流腳本。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
