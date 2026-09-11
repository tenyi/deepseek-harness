---
description: "面向以子進程方式啟動 DeepSeek Harness 運行時、并通過 stdio JSON-RPC 驅動 agent（智能體）輪次的調用方的 TypeScript SDK 客戶端：DeepSeekHarness 運行 API 與低層 HarnessClient。"
kind: "package-library"
---

# @deepseek-ai/dsh-sdk-client

[English](README.md) | 中文

## 概述

`dsh-sdk-client` 讓 TypeScript 程序通過 stdio JSON-RPC 啟動并驅動完整的 DeepSeek Harness 運行時。使用 `DeepSeekHarness` 可打開會話、發送文本或圖像提示詞、收集事件與通知流，并在運行時進入 idle 后取得最后提交的助手響應；使用 `HarnessClient` 可直接發送協議請求和訂閱通知。調用方可以提供 `dshBin`；否則客戶端解析同版本的 `@deepseek-ai/dsh` 可執行文件。客戶端跨多次運行持有子進程，公開類型化的傳輸與協議錯誤，并在 `close()` 或 `await using` 時回收進程。它適用于調用方能夠選擇運行時 profile 和啟動設置的場景。

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

當 TypeScript 代碼需要從另一進程驅動完整 Harness 運行時、且你能顯式指名運行時可執行文件時，使用本客戶端。常用路徑極簡：用啟動規格構造 `DeepSeekHarness`，運行提示詞，然后關閉它，使子進程總能被回收。

### 用 DeepSeekHarness 運行 agent 輪次

```ts
import { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'

await using harness = new DeepSeekHarness({
  profile: 'sdk',
  patches: ['./automation.cordis.yml'],
  provider: 'deepseek-official',
  model: 'deepseek-v4-flash',
  reasoningEffort: ReasoningEffortId('max'),
  maxTokens: 49_152,
})
const result = await harness.run('say hi')
console.log(result.finalResponse)
```

子進程在首次使用時惰性啟動，并在多次 `run()` 調用之間持續歸實例所有；請調用 `close()`（或使用 `await using`），子進程才總能被回收。`start()` 會記憶化有界的 `initialize` 握手，其中包含工作區 cwd、提供方／模型路由、可選且由適配器持有的 `reasoningEffort`，以及可選的正整數 `maxTokens` 輸出上限。服務器會在接受提示詞前校驗該確切路由；省略推理強度時保留模型自身的默認值。`initializeTimeoutMs` 默認 10 秒，診斷會寫明所選 profile 并附帶保留的 stderr 尾部。`run(input, { sessionId?, onNotification? })` 接受文本或 `SdkPromptContentBlock[]`；內聯柵格圖像塊攜帶規范 base64 與 `mimeType`，并在運行時內變成持久附件。該調用擁有一個活動區間：它將提示詞排入隊列，等待其消息 id 出現在持久入隊回執中，然后持續收集到整個 agent 下一次進入 `idle`。它返回 `RunResult { sessionId, finalResponse, events, notifications }`，其中 `finalResponse` 是該區間內根會話最后提交的助手文本——并非因果上歸屬于該提示詞的響應，因為 steering（中途引導）、注入的上下文和其他排隊工作都可能在 idle 前參與其中。`session(id?)` 打開具名或全新的會話句柄。握手失敗且清理成功時，實例會換入全新客戶端，使后續調用用新進程重試，直到終結性的 `close()`；如果初始化和清理均失敗，`start()` 會返回保留兩個原因的有序 `AggregateError`，并繼續保留失敗的客戶端，避免在原進程退出尚未得到證明時啟動另一個進程。`maxTokens` 限制每個根 agent 請求的輸出量，并由進程內后代繼承；壓縮（compaction）插件單獨持有摘要上限。

### 用 HarnessClient 做低層控制

`HarnessClient` 是運行 API 之下的協議客戶端：顯式 `start()`、`initialize()`、`prompt()`、`request()` 與 `close()`，外加通知訂閱。`prompt()` 在運行時接受排隊消息后立即返回該消息的 id，絕不等待 agent 活動。`subscribe(filter?)` 返回 `NotificationSubscription`（可等待的 `next()`、非阻塞 `tryNext()`、異步迭代）；`subscribeSessionTree(id)` 把范圍限定到一個會話及從 `subagent.started` 血緣邊發現的后代——運行時對上下文內每個會話都發通知，范圍限定在客戶端完成，與 Python SDK 完全一致。

本客戶端為每種失敗模式導出類型化錯誤：`JsonRpcResponseError`（協議錯誤響應，保留 code 與 data）、`RequestTimeoutError`（配置的時限已到）、`SdkProtocolError`（響應超出文檔化協議）、`TransportClosedError`（運行時已消失——消息攜帶退出碼與有界 stderr 尾部）。`close()` 先請求協議 `shutdown`（受 `shutdownTimeoutMs` 約束，默認 1000 毫秒），然后走 stdin-EOF → SIGTERM → SIGKILL 階梯直到進程退出；冪等，已關閉的客戶端拒絕復用。`HarnessClientOptions.env` 給定時整體替換子進程環境（`undefined` 原樣繼承父進程環境）；憑據策略歸調用方——`dsh-subprocess` 的 `scrubbedParentEnv` 是面向隔離啟動的共享擦除基底。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋客戶端背后的設計；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

客戶端是同一協議上的兩層：`DeepSeekHarness`（自有運行）疊加在 `HarnessClient`（協議客戶端）之上，與 Python SDK 的分層一致。它運行在任何 harness 上下文之外，因此直接 spawn 運行時而非經由 `dsh-subprocess` 服務——即該 seam 記錄的 SDK 托管傳輸例外——其關閉階梯也位于本包。運行時對上下文內每個會話都發通知；會話樹范圍限定是客戶端對 `subagent.started` 血緣邊的過濾。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/api.ts`](src/api.ts) | `DeepSeekHarness` + `HarnessSession`：自有運行、從回執到 idle 的收集、`finalResponse` |
| [`src/client.ts`](src/client.ts) | `HarnessClient`：spawn、握手、請求、訂閱扇出、類型化錯誤 |
| [`src/dispose.ts`](src/dispose.ts) | 私有關閉階梯：stdin EOF → SIGTERM → SIGKILL 直到真正退出 |
| [`src/types.ts`](src/types.ts) | 啟動與超時選項、通知結構、`RunResult` |
| [`src/index.ts`](src/index.ts) | 消費方接口：兩層客戶端與面向調用方的類型 |
| — | 不發布運行時不變式伴生入口；本客戶端庫運行在任何 harness 上下文之外（其對端是獨立運行時進程）；運行時自身的包負責維護事件流關系。 |

### 自有活動流程

一次運行會訂閱會話樹、把提示詞排入隊列，等待提示詞的消息 id 出現在持久的 `agent/inbox/spliced` 回執中，然后持續收集通知，直到整個 agent 報告 `idle`。`finalResponse` 從收集到的事件中最后一條 `assistant/message` 派生。傳輸丟失、超時與協議違例會使本次運行被拒絕；模型結果仍可在事件流中觀察，但不會歸屬于某一輸入。

### 錯誤與關閉

每種失敗模式都映射到一個導出的錯誤類——協議錯誤響應、請求時限已到、響應超出文檔化協議、運行時死亡——調用方可以按失敗類型分支處理；這四個類從 [src/index.ts](src/index.ts) 導出。關閉采用私有的冪等階梯（stdin EOF → SIGTERM → SIGKILL），位于 [src/dispose.ts](src/dispose.ts)，只在進程真正退出時結束。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當客戶端約定不夠用時閱讀以下頁面。它們從協議格式進入服務插件與使用本客戶端的應用。

- [SDK 協議格式](../protocol/README.zh.md)——本客戶端使用的 JSON-RPC 方法與載荷結構。
- [JSON-RPC 服務插件](../server/README.zh.md)——服務本客戶端的運行時插件。
- [Python SDK](../../../python/README.zh.md) — 共享同一運行時對端與協議的設計孿生。
- [SDK subagent 后端](../../subagent/subagent-dsh-sdk/README.zh.md) — harness 內部消費本客戶端的例子。
- [SDK 應用組合包](../../bundle/sdk-app/README.zh.md) — 本客戶端啟動的 `dsh --profile sdk` 運行時應用。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為這是客戶端進程庫；模型可見行為存在于所 spawn 運行時組合的插件中。

#### KV Cache 影響

客戶端進程中無影響。子進程的 profile、patch、提供方、模型與歷史決定緩存復用。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本客戶端何時不合適或需要特別注意。它們是當前包約束，不是與其他 SDK 客戶端的對比或任務積壓。

- **無捆綁運行時解析**——客戶端解析同版本 `@deepseek-ai/dsh` 包（或調用方提供的 `dshBin`）；打包可執行文件的發現留在 Python 側，直到出現 TypeScript 發行版消費方。
- **無輪次中取消**——協議層沒有提示詞取消方法；放棄輪次意味著關閉運行時（見[協議限制](../protocol/README.zh.md#known-limitations-and-deferred-work)）。
- **沒有逐提示詞結果**——低層 `prompt()` 只返回入隊回執；高層 `run()` 負責從回執到 idle 的收集，放棄該過程意味著關閉運行時。
- **客戶端→服務端通知與服務端→客戶端請求**在協議兩端都未實現；傳輸層為未來審批流程保留了承載能力。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文，明確不具權威性——已交付的行為與限制見上文各節與代碼。啟動規格有意保持完全顯式：在出現 TypeScript 發行版消費方之前，不計劃做捆綁運行時解析。請讓關閉階梯與錯誤詞匯與驅動同一運行時的 Python 客戶端保持同步。沒有記錄其他未解決的開放設計問題。

</details>
