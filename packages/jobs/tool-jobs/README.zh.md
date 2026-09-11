---
description: "面向模型的后臺任務控制，供選擇、配置或排查 job_output、job_list、job_kill 與完成通知的用戶與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-jobs

[English](README.md) | 中文

## 概述

使用 `dsh-tool-jobs`，可通過 `job_output`、`job_list` 與 `job_kill` 檢查和控制后臺命令、PTY 工作與 subagent。讀取可在配置的超時內等待，列表結果標識各任務的 kind 與狀態，而取消只有在工作停止后才結算。歸屬明確的工作完成時，agent（智能體）會收到會話內通知：繁忙的 agent 在下一步收到通知，空閑的 agent 則可能由有界的 follow-up 輪次喚醒。配置控制等待上限、完成投遞與連續喚醒次數。流輸出僅供單一讀取方消費，待領通知無法在所有者釋放后存活。

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

在 agent 需要啟動、觀察和停止后臺任務的任何組合中加載本插件：它注冊三個工具、附加生產方所需的控制器，并投遞完成通知。它需要組合中已提供的 `ctx.tools`、`ctx.jobs` 與 `ctx.systemPrompt` 服務。

### 三個工具

- `job_output(job_id, wait?, timeout_ms?)`——讀取任務輸出。流任務只返回自上次讀取以來的輸出；最終輸出任務在結算后返回其結果。每個響應都以 `[status: ...]` 結尾。除非 `wait: true`，否則讀取是非阻塞的；`wait: true` 最多等待到配置上限，超時時仍讓運行中的任務保持存活。
- `job_list()`——列出你的后臺任務及其 id、kind 與狀態，每行一個：`<id> [<kind>] <status> — <label>`。
- `job_kill(job_id, reason?)`——立即請求取消運行中的任務；任務在其工作真正停止后以 `killed` 結算。終止任務返回其當前快照，可選的原因會被記錄并轉發給任務。

三個工具依次返回 `{ text, job }`、`PublicJobSnapshot[]` 與 `{ outcome: 'cancellation-requested' | 'already-finished', job }`。公共快照攜帶 id、kind、label、status/detail 及開始／結束時間，并省略歸屬與通知簿記字段。三個工具都通過通用 UI 卡片渲染：output 和 list 用 `read`，kill 用 `execute`。

### 完成通知

任務完成時，擁有它的 agent 會收到會話內消息 `background job <id> (<kind>: <label>) finished [status: ...]. Read its output with job_output.`。繁忙的 agent 會在下一步收到注入的通知——inbox 尚有內容時輪次無法結束，因此同時結算的多個任務只花掉一步，而不是各占一輪。空閑的 agent 則被一個 follow-up 輪次喚醒，因為無人領取的通知等于模型永遠不會知道的完成。kill 或針對終止任務的 read/wait 會把完成標為已報告并抑制重復通知；排空 owner 或服務的 teardown 取消同樣如此。

喚醒是有界的：每個所有者最多可被喚醒 `maxConsecutiveWakes` 次，此后的通知降級為注入；領取任何用戶撰寫的消息都會恢復預算。設界是因為這條鏈會自激——被喚醒的一輪可能啟動某個后臺任務，而它的完成又會喚醒同一個所有者。`completionDelivery: quiet` 讓空閑所有者也在注入通道上，確定性 transcript（文本記錄）需要的正是這一點。

### 最小配置

不帶配置加載插件是常用路徑；`waitTimeoutMs` 高于 `maxWaitTimeoutMs` 時會在加載時失敗。

```yaml
- name: '@deepseek-ai/dsh-tool-jobs'
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `waitTimeoutMs` | `30,000` | `wait: true` 省略 `timeout_ms` 時使用的等待時間 |
| `maxWaitTimeoutMs` | `600,000` | 模型所給等待時間的上限；更大的值向下收斂到它 |
| `completionDelivery` | `wakeup` | `wakeup` 為空閑所有者開啟一輪；`quiet` 讓通知繼續待領 |
| `maxConsecutiveWakes` | `3` | 一個所有者可由喚醒開啟的輪數，超出后通知降級為注入 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-jobs)是每個受支持字段及其 JSDoc 的窮盡式真源。

### 可能出什么問題

組合中未加載 `tool-jobs` 的 agent 無法啟動后臺工作：本插件的控制器正是生產方 `ctx.jobs.start()` 得以啟用所依賴的。模型給出的等待時間超過 `maxWaitTimeoutMs` 時會向下收斂到上限，超時的等待返回 `[status: running]` 并讓任務保持存活，而不是失敗。待領于空閑所有者的完成通知無法在該所有者釋放后存活。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋工具背后的設計決策，并指出實現它們的代碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

- **與 kind 無關的控制。** 同一套三個工具讀取、列出和取消每種生產方 kind 的任務——bash、subagent、PTY——因為它們都通過通用的 `ctx.jobs` 運行時注冊。
- **投遞歸本插件，收件人歸注冊表。** 插件決定未報告的完成如何到達所有者——注入繁忙的一步，或喚醒空閑所有者的一輪——而注冊表把每次結算路由給其所有者 scope 鏈所能抵達的監聽器，因此某個 preset 下的掛載永遠看不到另一個 preset 的 agent，無論掛載了多少 preset，一個 agent 每次完成都只讀到一條通知。
- **生產方自有的輸出上限。** 生產方提供 `outputLimitBytes` 時，完整的模型側結果——輸出讀取、終止 kill 快照或完成通知——會在添加狀態與通知元數據之后被施加上限；省略該字段的生產方保持無界行為。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：工具注冊、完成監聽器、提示詞區段、輸出上限 |
| — | 不發布運行時不變式伴生入口；這個面向模型的適配器沒有獨立的生命周期流；執行關系歸其調用的能力 seam 所有。 |

### 輸出上限

`job_output` 與 `job_kill` 會在策略運行前于前置的 pre-execute 監聽器中捕獲調用方可見任務，因此生產方上限適用于完整渲染結果。`job_output` 在策略保留默認渲染時保持其輸出／狀態拆分，對輸出尾部與 `[status: ...]` 后綴設界；其他單文本結果——拒絕、短路、規范化工具或流水線失敗、替換與阻止——按單個文本設界，而結構化多塊策略結果保持自身形狀。有界完成通知先為穩定的 `background job <id>` 前綴與 `job_output` 收集指令預留空間，再把剩余字節用于可變的 kind、label、status、detail 與截斷標記，因此在 PTY 支持的 64 字節下限下通知仍可操作；已有的生產方截斷標記會被復用，不會重復添加。

### 通知投遞通道

`onJobDone` 跳過已報告或無所有者的任務。`wakeup` 投遞在預算內為空閑所有者開啟一輪，按確切 `Agent` 記錄在 `WeakMap` 中；領取用戶撰寫的消息（`agent/inbox/claimed`）會重置該所有者的預算。繁忙的所有者——或超出預算的任何通知，以及 `quiet` 投遞——改為注入 next-step inbox。teardown 結算抵達時已標記為 `reported`，因此釋放永遠不會花一次模型請求來宣布無人能讀的通知。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從任務類型逐步進入注冊表約定與生成 schema。

- [后臺任務運行時子系統](../../../docs/subsystems/jobs.zh.md)——任務類型、快照字段與 `ctx.jobs` 的 Cordis 接口面。
- [jobs 組映射](../README.zh.md)——同級組頁面及其包表格。
- [注冊表約定](../jobs/README.zh.md)——工具背后的抽象 `ctx.jobs` 服務。
- [進程本地注冊表](../jobs-local/README.zh.md)——任務在本進程中的運行位置。
- [生成的工具目錄](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-jobs)——`job_output`、`job_list` 與 `job_kill` 的確切 schema。
- [生成的配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-jobs)——每個受支持配置字段及其源聲明。
- [任務注冊表 seam Agent Note](../../../.agents/notes/archived/architecture/2026-07-26-job-registry-seam.md)——按所有者隔離的注冊表約定及其理由。

-----

<a id="model-experience"></a>
## 模型體驗

### 系統提示詞

#### 模型看到什么

該插件注冊 scope 中的每次請求都包含以下指引。按 agent scope 過濾工具時，可能會隱藏工具，卻不會移除獨立注冊的提示詞區段。

##### 后臺任務指引

```markdown
Track every background job id you start. You are notified in-session when a job finishes — do not busy-poll or sleep on one; keep working on independent steps and do not duplicate a running job's work. Before giving a final answer, collect every still-relevant job with job_output (set wait: true only when you are genuinely blocked on it), and job_kill jobs that stopped mattering.
```

#### Token 影響

激活期間，每次請求都會產生少量固定的輸入 token 開銷。

#### KV Cache 影響

只要插件 scope 與指引文本不變，前綴就保持穩定。激活或釋放可能使從該提示詞區段起的復用失效。

### 工具 schema

#### 模型看到什么

該工具集可見時，會看到生成的 [`job_output`、`job_list` 和 `job_kill` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-jobs)。

#### Token 影響

工具可見時，每次請求都會產生固定的 schema token 開銷。

#### KV Cache 影響

只要工具定義與可見性不變，前綴就保持穩定。注冊生命周期或 scope 限制可能使從第一個發生變化的 schema token 起的復用失效。

### 結果與通知

#### 模型看到什么

讀取會返回輸出或 `(no new output)`，隨后是 `[status: <status>]` 和可選 detail。空列表返回 `(no background jobs)`。kill 返回 `requested cancellation of job <id>` 或現有終止狀態。尚未報告且有所有者歸屬的完成使用上述通知。

#### Token 影響

結果與通知在壓縮（compaction）前保留于父級歷史。流讀取不會重復已消費的輸出；生產方提供的 `outputLimitBytes` 會限制每次完整讀取或通知。在 `wakeup` 下，抵達空閑所有者的通知還會額外買下一次用戶并未要求的模型請求，其數量按所有者由 `maxConsecutiveWakes` 封頂；抵達繁忙所有者的通知則只是給它已經在支付的那一輪加一步。

#### KV Cache 影響

僅追加；新可見內容位于可復用請求前綴之后，不會使現有 KV Cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明工具何時不合適。它們是當前包約束，不是任務積壓。

- **落在 driver 退休窗口內的結算仍會讓通知擱淺**——在輪次循環最后一次檢查 inbox 與 driver 提交 idle 相位之間，所有者讀起來仍是繁忙，因此通知走注入且無人喚醒。steering（中途引導）存在同樣的問題；修復它屬于 `agent-loop`。
- **已花掉的喚醒預算不會隨時間恢復**——只有用戶撰寫的輸入才能補充，因此預算耗盡的無人值守 agent 要等到其他原因開啟下一輪時才收走剩余通知。
- **待領于空閑所有者的通知無法在該所有者釋放后存活**——釋放時的取消會清空未領取的 inbox，日志保留插入/取消這一對作為記錄。
- **流讀取只有單一消費方**——獨立觀察者需要另一套運行時 API。
- **無 owner 的任務沒有會話隔離**——外部調用方必須提供策略或避開這些任務。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
