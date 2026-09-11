# 工作流

[English](workflow.md) | 中文

工作流 seam 允許 agent（智能體）運行由模型編寫、會啟動 subagent 的編排腳本。與 [subagent](subagent.zh.md) 一樣，它是**一項可選能力**，不屬于 agent loop，因此其類型和操作記錄在此處，而非 [core.md](core.zh.md)。與 bash 一樣，每個上下文只允許一個引擎實現提供 `ctx.workflowEngine`；沒有命名提供方注冊表（第二個引擎通過插件配置替換第一個，而不與它同時運行）。

Service Definition：[dsh-workflow](../../packages/workflow/workflow)（`ctx.workflowEngine` + 下文詞匯）。Service Provider 是 [dsh-workflow-worker-thread](../../packages/workflow/workflow-worker-thread)（一個 `node:worker_threads` 引擎——每個 run 一個 worker，腳本的 vm 上下文位于其中）；面向模型的 Consumer 是 [dsh-tool-workflow](../../packages/workflow/tool-workflow)。提案與設計理由見 [dynamic-workflows Agent Note](../../.agents/notes/implemented/feature/2026-07-05-dynamic-workflows.zh.md)。

源碼：瀏覽器安全詞匯位于 [`packages/workflow/workflow/src/types.ts`](../../packages/workflow/workflow/src/types.ts)，Host 請求與活躍運行句柄位于 [`runtime-types.ts`](../../packages/workflow/workflow/src/runtime-types.ts)。

## 啟動請求

本節定義調用方啟動一次運行時提交的請求。普通工作流工具會根據模型的 `{ script, meta, args }` 調用和發起調用的 agent 構建該請求；專用消費方還可以為本次運行選擇引擎級 `subagentProvider`，并將 `maxTotalAgents` 調低，但腳本無法觀察或替換這兩項策略。`meta` 與 `args` 是普通 JSON 數據；引擎會用 schema 校驗 `meta`，并在任何工作開始前明確報錯并拒絕無效數據。引擎絕不會通過對腳本文本求值來獲取它們。`parent` 是必填字段——腳本啟動的每個子 agent 都歸屬于它，cwd、譜系與深度通過 [subagent seam](subagent.zh.md) 傳遞。

```ts type-equiv
/**
 * What a caller asks for when starting a workflow run. `meta` and `args` are
 * plain JSON data by the seam contract. `parent` is required because every
 * `agent()` spawned by the script is attributed to that live Agent.
 */
interface WorkflowStartRequest {
  /** The plain-JS script body (top-level await allowed; ends with `return <json-value>`). */
  script: string
  /** The workflow's identity block, as plain JSON data (shape-validated by the engine). */
  meta: WorkflowMeta
  /** Optional input exposed verbatim to the script as the `args` global. */
  args?: unknown
  /** Optional engine-wide child-provider override for this run. */
  subagentProvider?: string
  /** Optional per-run total-child ceiling. */
  maxTotalAgents?: number
  /** The agent on whose behalf the run executes (parent of every child). */
  parent: Agent
  /** Cancels the run when aborted. */
  signal?: AbortSignal
}
```

## 工作流的身份標識：`WorkflowMeta`

作為數據附在啟動請求上的身份塊（工具的 `meta` 參數；字段詞匯與 Claude Code 動態工作流的 meta 塊一致）。`phases` 僅用于進度展示：`phase()` 調用與標題匹配，供觀察者使用；不暗示任何執行結構。

```ts type-equiv
/**
 * The script's identity block, provided as plain JSON data alongside the
 * script body (the model-facing tool carries it as its `meta` parameter) and
 * validated by the engine before the body runs. `name`/`description` are
 * required; the rest is optional annotation. The field vocabulary matches the
 * Claude Code dynamic-workflows meta block.
 */
interface WorkflowMeta {
  /** Short kebab-case workflow name (display + persistence key). */
  name: string
  /** One-line description of what the workflow does. */
  description: string
  /** Optional guidance on when this workflow applies (shown in listings). */
  whenToUse?: string
  /** Optional phase declarations matched by `phase()` calls. */
  phases?: WorkflowPhase[]
}
```

## 終態結果：`WorkflowResult`

`WorkflowRun.result` 會兌現為一次運行的結果。`value` 是腳本的物化返回值——純宿主域 JSON 數據（腳本無返回值時為 `null`）——僅在 `completed` 時有意義。`stopReason` 是封閉聯合類型（由引擎定義；消費方可窮舉）：`completed` | `cancelled` | `error`。非 `completed` 的原因在 `error` 中攜帶失敗信息，消費方將其映射為 `isError` 工具結果，而非把部分輸出當作成功上報。

```ts type-equiv
/**
 * The outcome resolved by a live workflow run. `value` is
 * the script's materialized return value (plain host-realm JSON data; `null`
 * when the script returned `undefined`) — meaningful only for `completed`.
 * A non-`completed` reason carries the failure in `error`; the consumer maps
 * it to an `isError` tool result rather than reporting partial output.
 */
interface WorkflowResult {
  /** The script's return value (host JSON data; `null` for no return). */
  value: unknown
  /** Why the run settled. */
  stopReason: WorkflowStopReason
  /** The failure message (present iff `stopReason` is not `completed`). */
  error?: string
  /**
   * How many `agent()` calls the run accepted over its whole lifetime. On a
   * graceful settlement this is the script-side count (calls still queued for
   * a concurrency slot included); on a termination path (grace force-settle,
   * worker death) it degrades to the host-observed count — calls queued
   * inside a terminated script are unknowable then.
   */
  agentsStarted: number
}
```

## 活躍運行：`WorkflowRun`

腳本執行期間消費方持有的句柄。消費方會等待 `result`，可以在運行期間調用 `cancel`，并且必須在每條路徑上調用 `dispose`（資源釋放）。`result` 不會被拒絕：腳本失敗會兌現為 `stopReason: 'error'`。運行被取消后，即使腳本本身永不結算，結果也會在引擎規定的有界寬限期內結算；引擎會強制將其結算為 `cancelled`，隨后 worker-thread 引擎會終止腳本所在的 worker。因此，等待 `result` 的消費方不會在取消后無限期掛起。`dispose()` 會執行取消、等待有界結算并等待子 agent 完全停穩，不會因腳本卡死而掛起。

```ts type-equiv
/**
 * Holder-owned live workflow. `result` never rejects; consumers may cancel
 * and must call idempotent `dispose()` to await script and child quiescence.
 */
interface WorkflowRun {
  readonly id: WorkflowRunId
  /** The validated meta block available before the script body runs. */
  readonly meta: WorkflowMeta
  readonly result: Promise<WorkflowResult>
  /** Cancel the run and its children. */
  cancel(reason?: string): void
  /** Cancel if needed and await bounded settlement and cleanup. */
  dispose(): Promise<void>
}
```

## 失敗紀律：`WorkflowError.fatal`

腳本內部的鉤子誤用：錯誤參數、未知或延遲的 `agent()` 選項、超出[結構化輸出子集](../../packages/core/tools/README.zh.md)的 schema、超出上限、seam 啟動失敗、取消，都會拋出 `fatal: true` 的 `WorkflowError`。`parallel()`/`pipeline()` 組合器對 fatal 錯誤直接重新拋出，而非將該項映射為 `null`：一個拼寫錯誤的選項必須明確報錯并終止腳本，絕不能消融為看似普通子 agent 失敗的結果。逐項的 `null` 保留給子運行失敗（非 `completed` 的 stop reason）和階段內的普通腳本錯誤。

## 事件

`workflow/*` 事件（`workflow/start`、`workflow/phase`、`workflow/log`、`workflow/agent-start`、`workflow/agent-end`、`workflow/end`，見[事件目錄](#cordis-surface)）是**僅供觀察**的 emit，攜帶數據快照：每個 payload 以 `WorkflowRunInfo`（id + meta）開頭，而非活躍的 `WorkflowRun`，因此訂閱者無法獲得 `cancel`/`dispose`；`workflow/end` 刻意省略 result value（觀察結果的監聽器不得收到調用方 result 的可變別名）。每次 emit 對每個監聽器隔離：訂閱者拋出的異常會被記錄到日志中而不會傳播，也不會阻止后續注冊的監聽器收到事件；每個監聽器收到自己的 payload 克隆，因此修改它既不會損壞引擎也不會影響其他監聽器。這種隔離方式與 `subagent/start`/`subagent/end` 一致。

## 持久 Chat 記錄

頂層 `dsh-tool-workflow` 消費方把展示事實投影到調用它的父 Session，同時不改變執行所有權。運行接受后寫 `tool-workflow/run-start`，以 `runId + seq` 配對成員開始與結束，并且只在結果已取得且 dispose 完全停穩后寫 `tool-workflow/run-end`。嵌套 transport 調用不寫記錄。第一次 append 失敗會禁用本運行后續寫入，因此日志保持為空或合法連續前綴，工具結果不變。

`dsh-tool-workflow/invariant` 會在實時提交前和 Session 加載時校驗同一協議：每個運行只有一個 start，成員序號為正且唯一，成員 end 必須配對，仍有開放成員時不能結束運行，運行結束后不能繼續更新。日志尾部缺少成員 end 或 run end 是有效的中斷證據，不是損壞。

`dsh-client-ui-workflow-run` 通過 Conversation Node 引擎把四類事件折疊為一個 `workflow-run` Chat 節點，以 run-start 序號錨定在原工作流工具節點之后。階段組只來自真正開始過的成員，并保留精確字符串，包括字段缺省與 `''` 的區別。Location 關閉時，缺失終點會顯示為已中斷。[界面包 README](../../packages/client/ui-workflow-run/README.zh.md)負責定義 disclosure、狀態與同父本地導航行為。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxworkflowengine--workflowengine-abstract-seam"></a>

### `ctx.workflowEngine` — `WorkflowEngine` (abstract seam)

Workflow Service Definition contract. Invalid requests throw before publication; a live run is holder-owned, its result never rejects, cancellation and disposal are bounded, and disposal waits for child cleanup within that bound. Lifecycle listener failures are contained, and `workflow/end` fires exactly once as the result settles.

```ts cordis-catalog
/**
 * Parse and execute a workflow script.
 * @param request - the script, its `args`, the parent agent, and an
 *   optional cancel signal.
 * @returns the live run; its `result` resolves when the script settles.
 */
abstract start(request: WorkflowStartRequest): WorkflowRun
```

Source: [`packages/workflow/workflow/src/index.ts`](../../packages/workflow/workflow/src/index.ts)

<a id="workflow-events"></a>

### `workflow/*` events

<a id="workflowagent-end--emit"></a>

#### `workflow/agent-end` — emit

One `agent()` call settled (clean result, child failure, or run cancellation). Paired with Events['workflow/agent-start'] by `agent.seq`, exactly once per started call on every stop path — on an engine termination path (a worker killed past its grace) the end is engine-synthesized with outcome `'cancelled'`.

```ts cordis-catalog
/**
 * One `agent()` call settled (clean result, child failure, or run
 * cancellation). Paired with {@link Events['workflow/agent-start']} by
 * `agent.seq`, exactly once per started call on every stop path — on an
 * engine termination path (a worker killed past its grace) the end is
 * engine-synthesized with outcome `'cancelled'`.
 * @param info - the run's identity snapshot.
 * @param agent - the call identity plus its outcome.
 * @mode emit
 */
'workflow/agent-end'(info: WorkflowRunInfo, agent: WorkflowAgentEndInfo): void
```

Source: [`packages/workflow/workflow/src/index.ts`](../../packages/workflow/workflow/src/index.ts)

<a id="workflowagent-start--emit"></a>

#### `workflow/agent-start` — emit

One `agent()` call established a published child run. Paired with Events['workflow/agent-end'] by `agent.seq`. A call that never receives a published run from the provider emits neither event in this pair.

```ts cordis-catalog
/**
 * One `agent()` call established a published child run. Paired with
 * {@link Events['workflow/agent-end']} by `agent.seq`. A call that never
 * receives a published run from the provider emits neither
 * event in this pair.
 * @param info - the run's identity snapshot.
 * @param agent - the call's sequence number, label, phase, and child id.
 * @mode emit
 */
'workflow/agent-start'(info: WorkflowRunInfo, agent: WorkflowAgentInfo): void
```

Source: [`packages/workflow/workflow/src/index.ts`](../../packages/workflow/workflow/src/index.ts)

<a id="workflowend--emit"></a>

#### `workflow/end` — emit

A workflow run settled (any stop reason). Fired when WorkflowRun.result resolves. Paired with Events['workflow/start'].

```ts cordis-catalog
/**
 * A workflow run settled (any stop reason). Fired when
 * {@link WorkflowRun.result} resolves. Paired with
 * {@link Events['workflow/start']}.
 * @param info - the run's identity snapshot.
 * @param result - the outcome data (stop reason, error, agent count) —
 *   deliberately WITHOUT the result value (see {@link WorkflowResultInfo}).
 * @mode emit
 */
'workflow/end'(info: WorkflowRunInfo, result: WorkflowResultInfo): void
```

Source: [`packages/workflow/workflow/src/index.ts`](../../packages/workflow/workflow/src/index.ts)

<a id="workflowlog--emit"></a>

#### `workflow/log` — emit

The script emitted a narration line (a `log(message)` call).

```ts cordis-catalog
/**
 * The script emitted a narration line (a `log(message)` call).
 * @param info - the run's identity snapshot.
 * @param message - the logged message, verbatim.
 * @mode emit
 */
'workflow/log'(info: WorkflowRunInfo, message: string): void
```

Source: [`packages/workflow/workflow/src/index.ts`](../../packages/workflow/workflow/src/index.ts)

<a id="workflowphase--emit"></a>

#### `workflow/phase` — emit

The script entered a phase (a `phase(title)` call) — progress grouping for observers; no execution semantics.

```ts cordis-catalog
/**
 * The script entered a phase (a `phase(title)` call) — progress grouping
 * for observers; no execution semantics.
 * @param info - the run's identity snapshot.
 * @param title - the phase title, verbatim.
 * @mode emit
 */
'workflow/phase'(info: WorkflowRunInfo, title: string): void
```

Source: [`packages/workflow/workflow/src/index.ts`](../../packages/workflow/workflow/src/index.ts)

<a id="workflowstart--emit"></a>

#### `workflow/start` — emit

A workflow run started — the script's meta block validated, the body about to execute. Paired with Events['workflow/end'].

```ts cordis-catalog
/**
 * A workflow run started — the script's meta block validated, the body
 * about to execute. Paired with {@link Events['workflow/end']}.
 * @param info - the run's identity snapshot (id + meta).
 * @mode emit
 */
'workflow/start'(info: WorkflowRunInfo): void
```

Source: [`packages/workflow/workflow/src/index.ts`](../../packages/workflow/workflow/src/index.ts)
<!-- END GENERATED cordis-surface -->
