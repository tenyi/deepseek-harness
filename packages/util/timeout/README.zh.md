---
description: "共享超時運算、截止時間融合與超時和取消分類，供需要限制調用方超時提示、啟動 deadline 并在之后區分二者的能力使用。"
kind: "package-library"
---

# @deepseek-ai/dsh-timeout

[English](README.md) | 中文

## 概述

`dsh-timeout` 讓調用方為工作設置有上限的截止時間、區分本地超時與上游取消，并監測流式讀取是否空閑。`clampTimeout` 在提示缺失時填入后端默認值，把結果限制在允許的最大值以內，并在工作開始前拒絕無效值。`deadline` 將選定的超時與上游取消合并到一個信號中，而調用方仍負責真正停止自己的進程、套接字或任務。`idleWatchdog` 只計算等待提供方讀取所花的時間；零仍保留給后端自有的不計時工作，而不是公開配置。

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

當能力要在調用方可見的超時下運行一個工作單元時使用 `deadline`，讀取流式傳輸時使用 `idleWatchdog`。先用 `clampTimeout` 驗證調用方提示，確保到達 `deadline` 的 `timeoutMs` 總是正有限值。

### 限制超時提示

```ts
import { clampTimeout } from '@deepseek-ai/dsh-timeout'

declare const requested: number | undefined
declare const DEFAULT_TIMEOUT_MS: number
declare const MAX_TIMEOUT_MS: number

const timeoutMs = clampTimeout(requested, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS, 'bash-local: request.timeoutMs')
```

提示缺失時 `clampTimeout` 填入后端默認值，把結果限制在后端最大值以內，并以調用方提供的名字拒絕非正數或非有限值的提示。此處絕不接受 0：它不是公開的禁用超時值。

### 在 deadline 下運行工作

```text
import { deadline, timeoutOf } from '@deepseek-ai/dsh-timeout'

using d = deadline(upstream, timeoutMs, 'BASH_TIMEOUT')
const outcome = await runWork({ signal: d.signal })   // work listens on d.signal and terminates itself
const timedOut = timeoutOf(d.signal, 'BASH_TIMEOUT') !== undefined
const aborted = d.signal.aborted && !timedOut
```

該信號只負責通知：調用方必須接入自己的終止機制——把 `d.signal` 傳給 `fetch`，或監聽 `abort` 并殺死子進程。讓 promise 與 timer 競速，會在子進程或套接字仍在泄漏時就讓工具調用完成。

### 分類結果

只有當本 deadline 的 timer 先觸發時，`timeoutOf(signal, code)` 才恢復超時原因。傳入你自己的 `code`，讓分類在嵌套場景中正確組合：當 `upstream` 本身是 deadline 信號時，外部超時會被當作普通的上游取消，而不是聲稱本地 timer 已到期。

### 用空閑 watchdog 處理流式傳輸

```ts
import { idleWatchdog } from '@deepseek-ai/dsh-timeout'

declare const upstream: AbortSignal | undefined
declare const idleMs: number
declare const providerIterator: AsyncIterator<unknown>

using watchdog = idleWatchdog(upstream, idleMs, 'LLM_STREAM_IDLE_TIMEOUT')
const next = await watchdog.next(providerIterator)    // timer runs only while this read is outstanding
```

timer 只在某個迭代器 `next()` 尚未完成時啟動，并會因不產生值的傳輸活動通過 `pulse()` 重新啟動，因此讀取之間的消費方處理時間絕不計入空閑。間隔必須為正有限數，且不得大于 `MAX_TIMER_DELAY_MS`。

### 哪些操作不設置超時

本地文件 `read`/`write`/`edit` 不接受 `timeoutMs`：文件 IO 不設時限地運行，因為截止時間會中止操作系統仍會完成的工作。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本庫建立在一個邊界之上：共享時序與分類，把強制終止保留在本地。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | `clampTimeout`、`deadline`、`idleWatchdog`、`timeoutOf`、`TimeoutReason`、`MAX_TIMER_DELAY_MS` |
| — | 不發布運行時不變式伴生入口；這個純工具不擁有事件流或可變運行時數據；其值代數約束由單元測試保障。 |

### deadline 如何融合來源

`deadline` 啟動一個 timer，并通過 `AbortSignal.any` 把它與上游信號融合；`AbortSignal.any` 采納最先中止的來源的原因，因此競爭會歸結為單一原因。`TimeoutReason` 攜帶能力自有的 `code` 與已流逝的 `timeoutMs`；只有當超時勝出時 `timeoutOf` 才讀取它，上游勝出則保留普通的中止原因。`[Symbol.dispose]` 清除 timer。

### 無超時哨兵值

`timeoutMs <= 0` 不啟動 timer，只轉發上游信號——沒有上游時返回永不中止的信號——因此每個調用方都保持同一種調用形態。該哨兵值服務于后端自有后臺工作；外部請求提示在到達 `deadline` 之前先被驗證為正有限值。

### 空閑 watchdog 為何重新啟動

`idleWatchdog` 保持一個穩定的融合信號，只在 `next()` 尚未完成時啟動 timer；完成后停止，后續需求或 `pulse()` 重新啟動，dispose（資源釋放）時清除，并發需求被拒絕。只有傳輸層觀察該信號，因此提供方的真實讀取必須監聽它——DeepSeek 與 pi-ai 適配器會在中止時關閉響應正文或 SDK 請求。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當你需要消費方或庫背后的邊界決策時，閱讀以下頁面。

- [超時 deadline 庫 Agent Note](../../../.agents/notes/implemented/architecture/2026-07-06-timeout-deadline-library.zh.md)——共享時序、本地強制終止的邊界。
- [工具調用超時策略](../../guard/timeout-policy/README.zh.md)——強制執行已聲明工具超時的消費方。
- [bash 提供方](../../shell/bash-local/README.zh.md)——殺死進程組的前臺 deadline 消費方。
- [文件系統子系統](../../../docs/subsystems/filesystem.zh.md)——本地文件 IO 為何不設時限。

-----

<a id="model-experience"></a>
## 模型體驗

通過渲染超時結果的超時消費方間接影響模型。

#### KV Cache 影響

不會直接導致失效；請求前綴的任何變更由超時消費方負責。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本庫刻意不做什么。它們是當前包約束，不是任務積壓。

- **只發出通知**——deadline 無法停止忽略其信號的工作；每項能力仍需要自己的 socket、進程或任務終止路徑。
- **`timeoutMs <= 0` 是內部詞匯**——只有在所屬后端已解析策略后，它才會禁用本地 timer；絕不會作為面向模型或插件的公開開關。
- **第一個中止原因決定分類**——當上游取消早于本地 timer 發生時，即使自己的超時之后也會到期，該層也無法再報告。
- **空閑 watchdog 不是總 deadline**——它針對每個尚未完成的迭代器需求重新啟動，并刻意排除消費方的處理時間。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
