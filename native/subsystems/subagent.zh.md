# Subagent

[English](subagent.md) | 中文

subagent seam 讓一個 agent（智能體）將工作委派給子 agent。與 [bash](shell.zh.md) 一樣，它是**一項可選能力**，不屬于 agent loop（智能體循環），因此其類型定義在此而非 [core.md](core.zh.md) 中。它不同于其他能力 seam，因為**同一上下文中可共存多個提供方實現**，并按名稱注冊（`ctx.subagents`），而 bash 只允許一個執行器。該注冊表遵循 [LLM（大語言模型）適配器注冊表](llm-streaming.zh.md)，而非單服務的 bash 執行器。

Service Definition：[dsh-subagent](../../packages/subagent/subagent)（`ctx.subagents` + 下文詞匯）。Service Provider 是六個兄弟包：`dsh-subagent-spawn-in-process`、`dsh-subagent-fork-in-process`、`dsh-subagent-acp`、`dsh-subagent-codex`、`dsh-subagent-claude-code`、`dsh-subagent-dsh-sdk`；面向模型的 Consumer 包括 [dsh-tool-subagent](../../packages/subagent/tool-subagent)（按提供方委派）和 [dsh-tool-subagent-control](../../packages/subagent/tool-subagent-control)（可選的全局 `send_message`、`interrupt_agent` 與 `list_agents` 控制工具）。同一個 `ctx.subagents` 服務通過內部激活管理器負責可繼續子 agent 編排，并直接基于會話存儲和可選的會話持久化提供只讀的 child 與后代發現。產品提供方設計理由見 [Codex 與 Claude Code Agent Note](../../.agents/notes/implemented/feature/2026-08-04-claude-code-and-codex-subagent-backends.zh.md)；通用 seam 的設計理由見 [subagent Agent Note](../../.agents/notes/implemented/feature/2026-06-21-subagent-capability-seam.zh.md)、[可繼續 subagent Agent Note](../../.agents/notes/implemented/feature/2026-07-28-continuable-subagent-conversations.zh.md)和[相鄰 Agent 消息 Agent Note](../../.agents/notes/implemented/architecture/2026-08-27-adjacent-agent-steer-messaging.zh.md)；[已歸檔的列表身份投影記錄](../../.agents/notes/archived/architecture/2026-08-06-subagent-list-identity-projection.md)記錄了最初的列表身份決策。

源碼：[`packages/subagent/subagent/src/types.ts`](../../packages/subagent/subagent/src/types.ts)、[`packages/subagent/subagent/src/index.ts`](../../packages/subagent/subagent/src/index.ts)和 [`packages/subagent/subagent/src/continuation.ts`](../../packages/subagent/subagent/src/continuation.ts)

`subagentCatalog` projection 通過 Session 觀察和客戶端快照暴露按父會話事件排序的 `SubagentCatalogEntry[]`。每個條目包含子級 id、創建時間、模式和依模式確定的標簽；fork 繼承的目錄事實不在其中。[subagent 包](../../packages/subagent/subagent/README.zh.md) 定義目錄創建和持久化語義。

## 兩類能力，兩種發現方式

提供方通過一個靜態描述符公布其**啟動時**功能，服務會在單次 run 存在之前即行檢查；如果請求依賴提供方不具備的功能，會被明確拒絕（`SubagentError('UNSUPPORTED_CAPABILITY')`），絕不會被接受后靜默忽略。這些 flag 僅描述單次 [`start()`](#the-provider-contract-subagentprovider) 路徑，即由提供方組合子 agent 的路徑。**可繼續**子 agent 由繼續執行管理器自行組合，因此它們由唯一一個可選方法把關，方法存在即為能力，并以 TypeScript 的類型收窄作為發現機制：[`SubagentProvider.prepareContinuable`](#the-provider-contract-subagentprovider)。

```ts type-equiv
/**
 * Which START-TIME features a provider supports. Checked by the service before delegating to
 * {@link SubagentProvider.start}: a request that needs a capability the chosen provider lacks
 * is rejected with a typed error rather than accepted-then-ignored (the "fail loud, no silent
 * degradation" rule). These flags describe the ONE-SHOT
 * {@link SubagentProvider.start} path, where the provider composes the child;
 * continuable children are composed by the continuation manager itself and are
 * gated by {@link SubagentProvider.prepareContinuable} instead. Each flag
 * corresponds one-to-one to a {@link SubagentStartRequest} option: `depthLimit`
 * to `maxDepth`; the other names match.
 */
interface SubagentCapabilities {
  readonly agentOptions: boolean
  readonly outputSchema: boolean
  readonly depthLimit: boolean
  readonly toolFilter: boolean
  readonly persona: boolean
}
```

## 單次啟動請求

工具層根據模型輸入和自身配置構建此請求；服務在 `start` 之前針對指定提供方進行校驗。必填的 `parent` 提供會話 cwd、譜系與委派深度。可選的 Agent 提供方、模型、推理強度與 token 覆蓋、output schema、depth、工具過濾器和 persona 需要對應的能力 flag 匹配。進程內后端會把 `agentOptions` 合并到父 Agent 選項之上，將 filter 和 persona 的作用域限定在子 agent 創建階段，并通過強制 capture 工具實現所支持的 object-rooted schema。DSH SDK 后端會把四個 Agent 路由字段合并到實例默認值之上，并在子運行時初始化期間校驗；ACP、Codex 與 Claude Code 會在啟動傳輸前拒絕 `agentOptions`。

```ts type-equiv
/**
 * What a caller asks for when starting a ONE-SHOT subagent. The tool layer
 * builds this from the model's `{ description, prompt }` plus its own config;
 * the service validates {@link SubagentCapabilities} against the named provider
 * and resolves the durable descriptor before dispatching to
 * {@link SubagentProvider.start}.
 */
interface SubagentStartRequest {
  /** Optional short display label persisted with a session-backed child. */
  readonly label?: string
  /** Content delivered as the child's user message. */
  readonly prompt: ContentBlock[]
  /**
   * The spawning agent. In-process providers derive workspace, lineage, and
   * delegation depth from its durable session state. ACP reads only its cwd,
   * and only when no deployment `cwd` override is configured.
   */
  readonly parent: Agent
  /**
   * Cancellation signal from the spawning context (the tool's `exec.signal`).
   * This is the canonical cancellation channel both before and after startup:
   * a provider rejects `start()` after cleaning partial resources when it
   * fires before the run is published, and cancels the published run's
   * remaining turn work when it fires afterward.
   */
  readonly signal: AbortSignal
  /**
   * Optional host-Agent provider, model, reasoning-effort, and output-token
   * overrides. Requires {@link SubagentCapabilities.agentOptions}; in-process
   * providers merge them over the parent Agent's options when they create the
   * child, while the DSH SDK provider merges them over its instance defaults
   * before initializing the separate child runtime.
   */
  readonly agentOptions?: AgentOptions
  /**
   * Object-rooted JSON Schema within `assertObjectJsonSchema`'s enforced subset. Start rejects
   * unsupported schemas or providers without the capability. Data must be plain host-realm JSON;
   * a successful child returns the matching value as {@link SubagentResult.structured}.
   */
  readonly outputSchema?: ObjectJsonSchema
  /**
   * Optional absolute delegation-depth cap for the child being started: its
   * computed depth must be less than or equal to this non-negative safe
   * integer. Requires {@link SubagentCapabilities.depthLimit}; rejected at
   * start otherwise.
   */
  readonly maxDepth?: number
  /**
   * Optional child tool scoping. Requires {@link SubagentCapabilities.toolFilter};
   * rejected at start otherwise. In-process backends apply it as a scoped
   * `tools.restrict()` in the child's creation window: the named tools vanish
   * from the child's prompt AND refuse to execute (one visibility), with loud
   * unknown-name validation.
   */
  readonly toolFilter?: ToolRestriction
  /**
   * Optional per-child persona. Requires {@link SubagentCapabilities.persona};
   * rejected at start otherwise. In-process backends register it as a scoped
   * `deployment:persona-prefix` section on the child, SHADOWING the deployment's
   * persona for this child alone — same template semantics as the deployment
   * persona (strict `{{…}}` interpolation against the registered variables).
   */
  readonly persona?: string
}
```

`signal` 是就緒前后唯一的取消通道。[subagent 組合控制 Agent Note](../../.agents/notes/implemented/feature/2026-07-12-subagent-persona-tool-filter-and-depth.zh.md)規定 persona、live 全局工具過濾、絕對深度以及「可見性而非權限」的設計理由。

面向調用方的請求不攜帶目錄格式細節或繼續執行狀態。`SubagentRuntime.start()` 會在能力檢查后解析分離的一次性描述符，再將以下面向提供方的請求傳給所選傳輸；可繼續子 agent 絕不會到達 `SubagentProvider.start()`：

```ts type-equiv
/**
 * Provider-facing one-shot request after {@link SubagentRuntime.start} resolves
 * the durable child descriptor.
 */
interface ResolvedSubagentStartRequest extends SubagentStartRequest {
  /** Detached descriptor a session-backed provider persists in the child log. */
  readonly descriptor: SubagentDescriptorData
}
```

## 可繼續子 agent 與激活

**可繼續后臺 subagent** 是一份持久化子 agent 會話（Session），至多關聯一個進程內的 **Activation（激活）**，即被重建的子 Agent 處于駐留狀態的時段。Activation 不是請求、結果、取消或 Task：它可以執行多個 FIFO 輪次，并在其創建的后代仍在運行期間保持駐留。繼續執行管理器負責 activation 準入、直接父級鑒權、實時所有權圖、冷恢復（cold resume）與子級優先釋放；agent loop 負責一切輪次排序與執行。任何可繼續路徑都不會創建 Task，也不會創建承載中間結果的包裝層。

```text
persisted Session
  -> optional live Activation
       -> one retained AgentHandle
       -> Agent inbox as the only turn FIFO
       -> zero or more owned child Activations
```

`SubagentRuntime.startContinuable()` 會預留穩定的子 agent id，對版本化的 `subagent/descriptor` payload 建立快照，向指定提供方索取其分離的 `ContinuableCreateSpec`，通過私有的 activation-owner 作用域創建子 Agent，建立任何可繼續父級的所有權，并提交初始提示詞。當收件箱（inbox）準入產出消息 id 時，它以 `{ childId, messageId }` resolve——無需等待輪次開始，也無需等待消息進入會話日志。在該準入之前的任何失敗都會以兩個 id 都不返回的方式 reject，并 dispose（資源釋放）任何已創建的 handle，回滾 Activation 與父級所有權。

`SubagentRuntime.sendMessage()` 是唯一由模型編寫消息的操作。它接收確切在線 sender 與目標 id，只允許直接 parent 或直接可繼續 child，自行推導 sender 來源信息，并根據目標 child 的 Activation 駐留狀態路由：

| 目標 Activation 狀態 | `sendMessage` |
|---|---|
| `running` | 在同一 Activation 中 steer 最近的 step |
| `waiting` | 喚醒并 steer 同一 Activation |
| 無 Activation | 冷恢復新的 Activation，然后 steer |

`running` 表示 Agent 擁有活躍的 driver 或 maintenance 任務；`waiting` 表示沒有活躍的 Agent 工作，但其 Inbox 非空或仍擁有至少一個尚未完成 dispose 的子 Activation；`settled` 表示沒有活躍的 Agent 工作、Inbox 為空且其擁有的每個子級都已 dispose，此時管理器會 dispose [`AgentHandle`](core.zh.md#creation-and-ownership) 并移除該 Activation。管理器根據 `Agent.whenIdle()`、`Agent.inbox.hasPending`、其擁有的子級集合，以及讓過期觀察失效的 Activation generation 推導這些內部條件，而非維護第二套執行狀態機。最終 Session flush 之后，child-lock 決策會通過 `Agent.runMaintenance()` 的同步 task 入口占用 idle 階段，并在同一個 JavaScript turn 內關閉準入。這條保守規則不區分投遞模式：`Agent.inject()` 停放的 context 可以讓空閑 Activation 及其在線祖先繼續駐留，直到喚醒投遞將其 claim、queue 變更將其移除，或 manager teardown 將其丟棄。

Agent 收件箱是唯一隊列。每條 Agent 消息都使用 `Agent.steer()`：空閑目標會啟動一個輪次，運行中目標則在最近的 step 邊界領取消息。瀏覽器 `subagent.prompt` Remote 會另行通過同一條內部準入路徑攜帶 `delivery: 'queue' | 'steer'`；Queue 開啟后續 FIFO 輪次，Steer 保留 Agent loop 的 best-effort 最近 step 行為以及消息的人類來源。投遞成功會返回被接受的 `MessageId`；既有的 `agent/inbox/inserted`、`agent/inbox/claimed` 與 `agent/inbox/discarded` 事件仍是消息生命周期的觀測點，繼續執行層不定義第二條隊列。

權限來自確切在線 sender。parent 到 child 的投遞要求目標的 `SessionHeader.parentSession` 指向 sender；child 到 parent 的投遞要求 sender 的駐留 Activation 指向目標。sibling、相隔多于一條邊的 ancestor、self-target、陳舊 Agent 對象與一次性 child 都會被拒絕。每條已接受消息都以 `Agent <sender-id> sent a message:` 作為前綴，并記錄 `AgentMessageSource`；來源信息記錄 sender，但不授予權限。

對于 `startContinuable()`、`sendMessage()` 與瀏覽器 prompt 投遞，調用方 signal 僅在收件箱接受之前掌管查找、物化與準入。此后管理器獨立掌管該 Activation：之后的調用方取消既不會取消已接受的輪次，也不會 dispose 子 agent。公開 subagent 服務不暴露由調用方選擇的 Agent 消息調度；瀏覽器人類 Queue 與 Steer 仍是內部適配器選擇。

在線 queue occurrence 變更屬于 Session 域。只有在線 subagent-owned Agent 的當前 projection identity 為 continuable，且其 descriptor 序號位于該 child 自身的非 seed suffix 時，`session.updateQueue` 才會接納普通 Edit、Remove 與 QueueDock Steer。Identity projection 以 last-wins 方式折疊 descriptor，因此 child descriptor 會覆蓋 fork lineage 保留的 descriptor；own-suffix 序號檢查會阻止僅來自 seed 的祖先 identity 授權變更。One-shot、缺失、未知、損壞或冷 child 會被拒絕，queue 變更絕不會冷恢復 child。這些變更以目標 Session id 作為人類權限，包括待處理 `nextStep` steering 或注入 context。Steer 要求 queued `MessageId`，且 command 開始時 Agent 必須報告 running；準入后發生取消時，會使用 Agent 已接受的喚醒 `nextTurn` fallback。Edit 會在同一個 `MessageId` 下改寫內容，且 Edit 與 Steer 都會同步完成 Inbox 變更，因此 settlement 只會觀察最終狀態。`agent/inbox/claimed` 與 `agent/inbox/discarded` 都會喚醒 watcher 重新讀取是否仍有待處理 occurrence；這樣，直接 Agent 投遞可以恢復停放工作，而移除最后一個停放 occurrence 可使 idle child 結算。[人類 inbox 控制 Agent Note](../../.agents/notes/implemented/feature/2026-08-27-continuable-subagent-human-inbox-control.zh.md)擁有這些語義。

`SubagentRuntime.interrupt(targetSessionId, authority)` 是唯一的公開停止操作：它同步完成鑒權，對在線目標發出 `Agent.cancel(cause, { keepInbox: true })`，然后不等待完全停穩即返回。Activation、其尚未領取的待處理 inbox 工作與已發布的后代均不受影響；已被領取進入中斷輪次的工作不會重新入隊。被中斷的 driver 進入 idle 后，一次喚醒發送會恢復被暫停的 FIFO 隊列。不存在的目標——未知、一次性或已結算——以及未綁定管理器的組合是被接受的 no-op。對在線目標，錯誤的 parent 地址或不在其在線祖先鏈中的調用方會以 `UNAUTHORIZED` 拒絕；陳舊的 ancestor 對象和指向自身的 ancestor 請求會在查找目標前拒絕。

```ts type-equiv
/**
 * Authority under which one interrupt request is admitted. `user` carries the
 * durable direct-parent address a human client presented; `ancestor` carries
 * the exact live Agent object whose recorded lineage must contain the caller.
 */
type SubagentInterruptAuthority =
  | { readonly kind: 'user'; readonly parentSessionId: SessionId }
  | { readonly kind: 'ancestor'; readonly agent: Agent }
```

每個 Activation 都擁有自己的 `AgentHandle` 和一個 `ownedChildren: Set<SessionId>`；由于一份會話至多有一個存活 Activation，子會話 id 無需另一個運行時化身引用即可標識存活的子 agent。啟動子 agent 或提交源自 parent 的工作，會在子 agent 能夠運行之前將其注冊到受繼續執行管理的父級集合中；只要該集合非空，該父級就無法 settle。頂層或其他非繼續執行的 Agent 沒有 Activation，處于 waiting 圖之外。只有當子 Agent 沒有活躍工作、其 Inbox 為空、該子 agent 的每個子級都已 dispose、best-effort 的最終會話 flush 結算完畢，且子 agent 的 `AgentHandle` 完成 dispose 之后，才會釋放子 agent。

最終結算會等待 `ctx.sessions.flush(session)`，但會忽略其參與布爾值，因為任意 listener 都無法證明某個持久化后端已存儲該狀態。rejection 會被記錄，但不會使 Activation 失敗；管理器仍會 dispose 該 handle 并釋放所有權，此后持久化的子 agent 狀態在后續恢復時可能缺失或陳舊。管理器卸載會調用內部的管理器全局 drain，關閉準入并 dispose 每片在線森林；`drainContinuableDescendants(parents)` 只關閉由 host 確切擁有的在線 Agent 之下的準入，并 dispose 其可繼續后代，而無關森林保持在線。兩者都會等待各自作用域內已獲準的物化過程，自頂向下傳播取消，按 child-first 順序釋放 handle，并且即使個別分支失敗也會等待所有選中分支。持久化子會話不受該進程內拆卸的影響。

```ts type-equiv
/** Durable attribution for one model-authored message between adjacent Agents. */
interface AgentMessageSource {
  readonly kind: 'agent-message'
  /** A message another agent addressed to this one (`relay` context form). */
  readonly form: 'relay'
  /** Session id of the Agent whose tool call produced the message. */
  readonly senderSessionId: SessionId
}
```

```ts type-equiv
/** Options for one model-authored message between adjacent Agents. */
interface SubagentSendMessageOptions {
  /** Caller cancellation, owning the operation only until inbox acceptance. */
  readonly signal: AbortSignal
}
```

```ts type-equiv
/** Identities returned once a continuable child accepted its initial prompt. */
interface ContinuableStart {
  /** The durable child session id, stable across activations. */
  readonly childId: SessionId
  /** The accepted initial prompt's inbox message id. */
  readonly messageId: MessageId
}
```

當駐留 Activation 結算時，管理器會向該 child 持久化的直接 parent 投遞一條通知，說明該 epoch 如何結束，并攜帶其最終 assistant 內容。對每個調用方拿到過 id 的 child，這條投遞都是無條件的；它發生在會讓 parent 被判定為已結算的所有權釋放之前，并通過與 Agent 消息相同的喚醒 Agent 投遞到達駐留 parent。若 parent 自身所在的譜系已在拆卸中，這條通知會以不喚醒的方式送達，因為喚醒一個 idle Agent 是開啟一個輪次，而不是排隊等待工作。其來源信息使用一個獨立的 kind，因此 transcript（文本記錄）絕不會把運行時的記賬呈現為 child 自己寫下的內容。

```ts type-equiv
/**
 * Durable attribution for the runtime's own account of a continuable child
 * settling. Deliberately a different kind from
 * {@link AgentMessageSource}: an Agent message is content the sender chose,
 * while this message is the manager stating what became of the child, and a
 * transcript that merged them would credit the child with words it never wrote.
 */
interface SubagentSettledMessageSource {
  readonly kind: 'subagent-settled'
  /** A runtime account shown without expanding the row (`notice` context form). */
  readonly form: 'notice'
  /** One-line account of how the child ended. */
  readonly summary: string
  /** Session id of the child that settled. */
  readonly senderSessionId: SessionId
}
```

提供方只參與準備初始創建 spec，`spawn` 與 `fork` 在此有所不同。其返回的 spec 只攜帶分離的、提供方專屬的創建輸入——即可選的父級歷史種子——不含 Agent、`AgentHandle`、提示詞投遞、結果、dispose 或恢復操作。冷恢復根本不經由提供方分發：管理器折疊通用描述符，通過同一個 activation-owner 作用域調用 `ctx.agents.resume()`，并提交等待中的輪次。

```ts type-equiv
/**
 * What the continuation manager asks a provider for while materializing one
 * continuable child's FIRST activation. The manager has already reserved the
 * durable child identity and owns every later operation, so this request
 * carries only what distinguishes a fresh child from one seeded with parent
 * history.
 */
interface ContinuableCreateRequest {
  /** The reserved durable child session id, for provider diagnostics. */
  readonly sessionId: SessionId
  /** The delegating parent agent whose history a seeding provider reads. */
  readonly parent: Agent
  /**
   * Caller cancellation, which owns preparation only until the manager accepts
   * the initial prompt into the child's inbox.
   */
  readonly signal: AbortSignal
}
```

```ts type-equiv
/**
 * A provider's detached contribution to one continuable child's creation. This
 * is DATA, never a capability: it carries no Agent, `AgentHandle`, prompt
 * delivery, result, disposal, or resume operation, because the continuation
 * manager owns the child's whole lifecycle after preparation.
 */
interface ContinuableCreateSpec {
  /**
   * Completed-turn prefix of the parent's log to seed the child session with,
   * or absent for a fresh child. Same durable contract as
   * `CreateAgentOptions.seed`: contiguous from seq 0, lossless JSON, balanced.
   */
  readonly seed?: readonly SessionEvent[]
}
```

描述符（[descriptor.ts](../../packages/subagent/subagent/src/descriptor.ts) 中的 `SubagentDescriptorData`）是每個由會話支撐的 subagent 所使用、按模式判別的持久化身份。兩種模式都攜帶提供方名稱。`one-shot` 描述符可以攜帶調用方擁有的可選顯示 `label`；`continuable` 描述符要求以委派 `description` 作為持久化創建標簽，并另外對已解析的子 agent `agentOptions.provider`／`model`／`reasoningEffort` 與可選的 `persona`／`toolFilter` 建立快照，用于冷恢復。它絕不會對可合并擴展的 `AgentOptions` 對象建立快照，因此無關的擴展值不會破壞繼續執行，后續新增組合配置輸入則是一次有意的版本更改。描述符省略 `subagentDepth`（冷恢復以持久化 header 中的 `delegationDepth` 作為單調下界）和 `outputSchema`（單次運行或 Activation 的結果約定，而非持久化身份）。

本地一次性提供方會在子 agent 的初始輪次內、首次請求前追加描述符。繼續執行管理器會在任何提供方提供的譜系之后、初始提示詞獲準之前追加描述符；`Session.inheritedEventCount` 仍是 fork 譜系邊界：恢復時的描述符權威讀取子 agent 自身的后綴，而供列表使用的身份投影以 last-wins 折疊 `subagent/descriptor`，子 agent 自己的描述符會覆蓋 fork seed 中祖先的描述符。seeded cold list 會跳過 cache hint，直到權威 observation 提供該精確 cut。該事件只進入日志：不含 `surfaceOp`，絕不進入模型歷史，并由僅追加日志跨壓縮保留。格式錯誤的當前版本描述符屬于損壞；本運行時無法對不受支持的版本進行分類。

## 持久化枚舉：`listChildren()`、`listDescendants()` 與其條目

`SubagentRuntime.listChildren(parentSessionId)` 從 `ctx.sessions` 與會話查詢引擎 `listSessions()` 的實時優先合并中枚舉 parent 直接且由會話支撐的 subagent——不會加載或恢復任何 Agent。候選是持久 header 攜帶 `origin: 'subagent'` 的直接 child；該標記只負責枚舉分類與粗粒度的通用路由拒絕，不能證明描述符有效、child 可恢復或操作已獲授權——身份由投影折疊負責，恢復由 Activation 約定負責。每行的 `mode`／`label` 是已注冊 `subagent` projection unit 的值，經三級階梯供值：存活 child 由注冊表水位緩存供值（零日志讀取）；冷 child 先讀可選的投影 checkpoint 緩存（`cachedSnapshot`——過 own-suffix seq 門的身份即定值，own descriptor 一經追加不可變）；否則在一次 `query.observeSession()` 冷觀察上經注冊表折疊（有界并發，每次列表重新計算）。該緩存是純可選加速層：服務缺席、行里是 `null` 哨兵或 key 缺席、seq 門不過、讀取出錯，都靜默落到權威重折。折疊規則是 `subagent/descriptor` last-wins 且沒有失敗通道：子 agent 自己的描述符覆蓋 fork seed 中祖先的描述符，格式錯誤或版本不認識的載荷折疊為可序列化的 `null` 哨兵，視同無值。結果是按 `createdAt`、再按 id 排序的 `SubagentListEntry[]`：取到身份即生成帶有 `mode: 'one-shot' | 'continuable'` 和 `activity: 'running' | 'inactive'` 的 `child` 條目；可繼續條目始終攜帶 `label`，一次性條目則只在啟動調用方提供展示元數據時攜帶該字段。已定局而折疊無身份的候選生成 `corrupt` diagnostic——缺失、格式錯誤與版本不認識的描述符有意不再細分（`unsupported` 仍保留在類型中但從不產出）；運行中而無身份的候選被省略（描述符落盤前的創建窗口）；冷檢查失敗生成一條 `unavailable` diagnostic 并在下次列表自然重試，因此一個損壞的 sibling 不會隱藏健康 child。`hasChildren` 標記存在持久 subagent origin 的直接后代，讀取自同一份合并材料。活動狀態只表示邏輯記錄是否在 `ctx.sessions` 中存活，而不表示結果或可恢復性。缺少持久化時，枚舉退化為僅存活枚舉而不是報錯——此時冷 child 本就無法恢復。缺少 `ctx.sessionProjections` 注冊表時，`listChildren()` 拋出攜帶錯誤碼 `SUBAGENT_CONTROL_PROJECTIONS_UNAVAILABLE` 的 `SubagentError`，缺少會話存儲時則拋出 `SUBAGENT_CONTROL_SESSION_STORE_UNAVAILABLE`，兩者都在任何讀取之前檢查，因此零 child 的部署同樣確定失敗；列表工具在插件加載時要求 `ctx.subagents` 與 `ctx.agents`。UI 等服務消費方可以展示兩種模式，并為無標簽的一次性 child 選擇回退展示；面向模型的 `list_agents` 適配器（[dsh-tool-subagent-control](../../packages/subagent/tool-subagent-control) 中可單獨加載的 `/list-agents` 插件）則只保留可繼續條目，并通過在線 Agent 注冊表將狀態細化為自己的 `running`／`idle`／`ready` 詞匯，其中 `ready` 把僅存于存儲的 child 命名為可恢復而非終態。枚舉不會查詢繼續執行管理器的 Activation map、Agent 注冊表或提供方可用性；`send_message` 仍是消息送達時的權威操作，列表中的運行中可繼續 child 仍可能因所有權沖突而拒絕投遞。[已歸檔的列表身份投影記錄](../../.agents/notes/archived/architecture/2026-08-06-subagent-list-identity-projection.md)記錄了最初的讀路徑決策。

`SubagentRuntime.listDescendants(rootSessionId)` 將同一份實時優先語料與基于投影的解釋應用到根的完整后代樹，并按穩定 pre-order 輸出。普通會話和一次性 child 仍作為遍歷節點，因此其下的可繼續后代仍可發現；只有 `origin: 'subagent'` 的候選會生成條目。每個返回的 child 或 diagnostic 都從枚舉所得的持久 header 附加樹位置；冷檢查在提供身份前還會重新校驗完整生命周期：

```ts type-equiv
/**
 * One entry of a descendant listing: the interpreted subagent facts plus its
 * position in the complete session tree. `parentId` is the durable direct
 * parent from the enumerated header, and `depth` counts edges from the root.
 */
type SubagentDescendantListEntry = SubagentListEntry & {
  /** Durable direct parent of this candidate in the enumerated tree. */
  readonly parentId: SessionId
  /** Edge distance from the requested root; direct children are `1`. */
  readonly depth: number
}
```


<a id="the-terminal-result-subagentresult"></a>

## 終態結果：`SubagentResult`

單次 run 的最終產出，由 `SubagentRun.result` resolve。`structured` 僅在請求了 `outputSchema` 且成功滿足時才存在；請求 schema 不保證一定能得到它，當子 agent 失敗或結束時未產出有效 capture 時，提供方可能返回 `stopReason: 'error'`。提供方可以為非 `completed` 結果附帶安全且不屬于 assistant 內容的 `diagnostic`；在消費方將它與 `output` 分開呈現前，提供方會排除工具輸入、文件內容、環境值、憑證與原始協議載荷，并把完整值限制在 4096 個 UTF-8 字節以內。非 `completed` 的 `stopReason` 意味著 `output` 可能不完整——消費方將其映射為 `isError` 的工具結果，而非將部分輸出報告為成功。

```ts type-equiv
/**
 * The terminal outcome of a subagent run, resolved by {@link SubagentRun.result}.
 */
interface SubagentResult {
  /**
   * The child's final assistant output is the content of its last non-empty
   * assistant message. Empty-content messages, including usage-only messages,
   * are skipped. Without a non-empty message, the output is its accumulated
   * assistant text stream, or `[]` when the child produced neither.
   */
  readonly output: ContentBlock[]
  /**
   * The structured result after a requested `outputSchema` was successfully
   * satisfied. Requesting a schema does not guarantee presence: a provider can
   * end with `stopReason: 'error'` when the child fails or finishes without a
   * valid capture. The structured value is validated against the requested
   * output schema by the provider; `unknown` here because the seam is
   * schema-agnostic.
   */
  readonly structured?: unknown
  /**
   * Provider-authored, non-assistant failure detail for a non-`completed`
   * result. Providers keep this text free of tool inputs, file contents,
   * environment values, credentials, and raw protocol payloads, and limit it
   * to 4096 UTF-8 bytes. Consumers present it separately from {@link output}.
   */
  readonly diagnostic?: string
  /** Why the run ended. A non-`completed` reason means `output` may be partial. */
  readonly stopReason: SubagentStopReason
}
```

`SubagentStopReason` 是一個[可合并擴展的派生聯合類型](core.zh.md#the-map--derived-union-pattern)——后端可以添加變體，因此消費方應對已知 case 分支處理，將未知的終態原因視為失敗：

```ts type-equiv
/**
 * Why a subagent run ended. Merge-extensible (a backend may add variants);
 * consumers branch on the known cases and fall through `default`. The known
 * cases mirror the harness turn-end vocabulary so the tool layer can map a
 * non-`completed` result to an `isError` tool result.
 */
interface SubagentStopReasonMap {
  /** The child finished its turn normally. */
  completed: 'completed'
  /** Cancelled through the request signal or disposal. */
  aborted: 'aborted'
  /** Model or transport failure. */
  error: 'error'
  /** The child hit its token ceiling before finishing. */
  'max-tokens': 'max-tokens'
  /** The child declined the task. */
  refusal: 'refusal'
}
```

## 單次 run：`SubagentRun`

`SubagentRun` 是消費方持有的、指向一個已發布單次子 agent 的句柄——一次可 dispose 的前臺委派，只有一個結果，絕不是持久化子 agent handle。發布后的提示詞提交、輪次工作與基礎設施故障歸 `result` 所有。消費方 await 該結果并始終 dispose 該 run，直至完全停穩。子 agent 失敗時以非 completed 的 stop reason resolve；只有無法表示的基礎設施故障才會 reject。run 沒有 steering，也沒有恢復：可繼續對話根本沒有 run，因為繼續執行管理器直接持有它們的 `AgentHandle`，并通過子 agent 自己的收件箱為每個輪次排序。

```ts type-equiv
/**
 * ONE-SHOT child handle returned after publication. Prompt submission, turn
 * work, and infrastructure faults after that boundary belong to {@link result}.
 * Consumers await that result and must always {@link dispose} to cancel
 * remaining work and reach quiescence. A run is one disposable foreground
 * delegation with one result; continuable conversations have no run — the
 * continuation manager holds their `AgentHandle` directly and orders every
 * turn through the child's own inbox.
 */
interface SubagentRun {
  /**
   * Parent-scoped run id. For a local run, this MUST equal the published child
   * session id, whose `parentSession` records `request.parent.session.id`; a
   * remote provider mints an id unique in the parent namespace.
   */
  readonly id: SessionId
  /**
   * The exact published in-process child, or `undefined` for a remote run.
   * When present, its id is {@link id}; the provider retains no ownership
   * implication beyond the run's ordinary {@link dispose} contract.
   */
  readonly localAgent: Agent | undefined
  /**
   * Resolves with the child's terminal {@link SubagentResult} when the run
   * settles. Does NOT reject on a child-level failure — a model/transport
   * failure resolves with `stopReason: 'error'` so the consumer maps it to an
   * `isError` tool result. Rejects on an infrastructure fault the seam cannot
   * represent as a stop reason.
   */
  readonly result: Promise<SubagentResult>
  /**
   * Cancel remaining work, reach child quiescence, and release resources.
   * Idempotent.
   */
  dispose(): Promise<void>
}
```

本地單次 run 必須在 `start()` fulfill 之前發布一個普通子 agent／會話，將該子會話 id 作為 `SubagentRun.id` 返回，以 `localAgent` 暴露確切的子 agent，在子 agent 的 `parentSession` header 中記錄 `request.parent.session.id`，并在子 agent 的初始輪次內、首次請求前追加已解析的描述符。運行時所有權可以把子 agent 放在 parent、提供方或 root 作用域下。遠程提供方則返回 parent 作用域的生命周期 id 與 `localAgent: undefined`；由于沒有本地 child Session，它不會出現在持久化枚舉結果中。

<a id="the-provider-contract-subagentprovider"></a>

## 提供方約定：`SubagentProvider`

每個提供方都是一個具名的子 agent 傳輸層，多個提供方可以共存。服務在 `start()` 之前校驗請求的啟動時能力，并拒絕在沒有 `prepareContinuable` 的提供方上發起可繼續 start。`inheritsParentContext` 僅描述對話種子注入（`fork`：true；`spawn` 和 `acp`：false），使消費方能生成準確的面向模型措辭，而不暗示繼承了工具、服務或權限。如果某個提供方的一次性路由擁有靜態的提供方自有默認值，它會公開可選且不可變的 `agentRouteDefaults`，使 Consumer 能夠在預檢前以正確基線合并模型與工具覆蓋。

```ts type-equiv
/**
 * One registered transport for running child agents. Providers are trusted
 * same-process implementations; callers treat descriptors and returned values
 * as borrowed immutable data. The service may call one provider concurrently
 * for distinct children. Providers isolate operation-local mutable state; a
 * shared capacity controller may delay an operation but must not couple its
 * settlement or cleanup to a sibling.
 */
interface SubagentProvider {
  /** Unique registry name (e.g. `spawn`, `fork`, `acp`). */
  readonly name: string
  /** The start-time features this provider supports (see {@link SubagentCapabilities}). */
  readonly capabilities: SubagentCapabilities
  /**
   * Whether the child sees the parent's completed-turn prefix. This is descriptive, not a
   * service-validated start capability: the model-facing tool derives truthful wording from it.
   * It says nothing about tool registration, injected services, or authority inheritance.
   */
  readonly inheritsParentContext: boolean
  /**
   * Optional static provider-owned provider/model route for one-shot Agent
   * options. Consumers merge tool/model overrides over these values before
   * preflight; providers whose route derives from the parent omit it. The value
   * is detached immutable data and requires `agentOptions` support.
   */
  readonly agentRouteDefaults?: Readonly<{ provider: string; model: string }>
  /**
   * Establish a ONE-SHOT child and return its handle after publication.
   * The service has already validated that every requested start-time
   * capability is supported and resolved `request.descriptor`, so a
   * session-backed implementation appends that descriptor inside the child's
   * initial turn. Before fulfillment, the provider owns setup and cleans any
   * unpublished partial resources before rejecting. Ownership transfers on
   * fulfillment; subsequent turn or infrastructure failure settles through
   * the returned run. Distinct starts may overlap; cancellation, failure,
   * result settlement, and disposal remain independent for each run.
   */
  start(request: ResolvedSubagentStartRequest): Promise<SubagentRun>
  /**
   * OPTIONAL (continuable-creation capability): contribute the detached
   * creation inputs that distinguish this provider's continuable children —
   * only whether the child session is seeded with parent history. Method
   * presence IS the capability: the service rejects continuable starts on
   * providers without it, while a provider that has it may still serve
   * ordinary one-shot delegations.
   *
   * This is the provider's ONLY participation in a continuable child. The
   * continuation manager owns identity reservation, composition, Agent
   * creation, prompt delivery, cold resume, ownership, and disposal, so a
   * provider never sees the child's Agent, handle, turns, or teardown.
   * Distinct preparations may overlap; each follows its own signal and returns
   * data belonging only to `request.sessionId`.
   */
  prepareContinuable?(request: ContinuableCreateRequest): Promise<ContinuableCreateSpec>
}
```

提供方的 `start()` 會以已發布的 run fulfill。服務鑄造唯一的 `runId`，從提供方確切的 `localAgent` 快照 `local`，觀察結果，emit `subagent/start`，并返回同一個 run；`start()` rejection 意味著未發布資源已清理，且不會 emit 生命周期事件對，而發布后的結果 rejection 會結束已經 emit 的事件對。每個可繼續 Activation 都會為其駐留紀元 emit 相同的僅觀察事件對，因此一次冷恢復就是一段擁有自己 `runId` 的新紀元。配對的 `subagent/end` 攜帶相同標識與最終輸出或基礎設施失敗。兩個事件都僅用于觀察，且會隔離各自的 listener 異常。其中的 `provider` 字段標明了啟動 run 或 Activation 時段的提供方，并不聲明該 edge 發出時提供方仍處于注冊狀態。

## 進程內后端：深度與種子

spawn 和 fork 后端通過 `parent.ctx` 創建一個普通的單次 agent，將取消信號傳入核心創建流程，并通過 `AgentHandle` 進行 dispose；而可繼續子 agent 則由繼續執行管理器通過其自己的 activation-owner 作用域創建。移除提供方會阻止新的 start，但不會撤銷已接受的 run。每個子 agent 獲得一個新的扁平作用域，而非繼承父級注冊。深度與 fork 種子注入復用既有的 agent 和會話詞匯：

- **委派深度**由持久 `SessionHeader.delegationDepth` 與可合并擴展的運行時字段 `AgentOptions.subagentDepth` 共同表示；缺失表示頂層深度為零，存在的較大值具有權威性。兩個字段都歸該 seam 所有——循環既不設置也不讀取它們——因此進程內子 agent 會持久保存 parent 深度 + 1，冷恢復無法降低深度，而且每次 start 都會拒絕超出安全整數域、或高于已定義絕對 `request.maxDepth` 上限的派生深度。
- **Fork 種子注入**使用 [`CreateAgentOptions.seed`](core.zh.md#creation-and-ownership)（一個 `SessionEvent[]` 前綴，經由 `AgentLoop.createAgent` → `ctx.sessions.prepare({ seed })` 傳遞，與 `ctx.agents.resume()` 使用的原語相同）。fork 后端傳入父級日志的一段*平衡的已完成輪次前綴*——父級事件直到并包括其最后一個 `turn/end`——因此種子從 0 連續，[invariants](../../packages/runtime-diagnostics/invariants) 回放可以接受它（進行中的、未平衡的輪次被排除在外）。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxsubagentmodelselection--subagentmodelselectionconfig"></a>

### `ctx.subagentModelSelection` — `SubagentModelSelectionConfig`

Singleton settings owner read when delegation tools are composed for a Session.

```ts cordis-catalog
/**
 * Read a detached selection preference for the next eligible Session composition.
 * @returns the enabled state and exact allowed routes.
 */
current(): SubagentModelSelectionSettings
```

Source: [`packages/subagent/tool-subagent/src/model-selection-settings.ts`](../../packages/subagent/tool-subagent/src/model-selection-settings.ts)

<a id="ctxsubagents--subagentruntime"></a>

### `ctx.subagents` — `SubagentRuntime`

Named provider registry with one-shot runs, durable discovery, and continuable-child operations.

```ts cordis-catalog
/**
 * Establish one durable continuable child and deliver its initial prompt.
 * Resolves when the child's inbox accepts that prompt, without waiting for the
 * turn to start or for the message to reach the Session log; any earlier
 * failure rejects with no ids and rolls back the child entirely.
 * @param spec - provider, delegation request, and caller cancellation.
 * @returns the durable child id and the accepted prompt's message id.
 * @throws when continuation services are unavailable or materialization fails.
 */
async startContinuable(spec: ContinuableStartSpec): Promise<ContinuableStart>

/**
 * Steer one model-authored message to the sender's direct parent or direct
 * continuable child. A running target admits it at the nearest step boundary;
 * an idle target starts a turn, and an absent direct child cold-resumes from
 * persistence. The service derives durable sender attribution from the exact
 * live sender. Caller cancellation stops only pre-acceptance work.
 * @param sender - exact live Agent authorizing and originating the message.
 * @param targetId - durable direct-parent or direct-child session id.
 * @param content - model-authored content to deliver.
 * @param options - caller cancellation before inbox acceptance.
 * @returns the accepted message's inbox id.
 * @throws when continuation services are unavailable, adjacency is rejected,
 *   or the message was not admitted.
 */
async sendMessage( sender: Agent, targetId: SessionId, content: ContentBlock[], options: SubagentSendMessageOptions, ): Promise<MessageId>

/**
 * Interrupt one live continuable child's current turn under a human parent
 * address or an exact live ancestor Agent. Fire-and-return: the cancel
 * signal is issued before this returns, but the target may keep running
 * until it observes the signal. Unclaimed pending inbox work, the Activation,
 * and published descendants are preserved; claimed work is not requeued.
 * Once the interrupted driver is idle, a waking send resumes the parked FIFO
 * queue. An absent target — including a one-shot or unknown id —
 * is an accepted no-op, as is a manager-less composition, which cannot own a
 * live Activation.
 * @param targetSessionId - the durable child session id to interrupt.
 * @param authority - the human parent address or exact live ancestor Agent.
 * @throws {SubagentError} `UNAUTHORIZED` when the authority does not own the
 *   live target.
 */
interrupt(targetSessionId: SessionId, authority: SubagentInterruptAuthority): void

/**
 * Close continuable admission below exact live parent Agents, stop only their
 * visible descendant Activations synchronously, then await admitted scoped
 * materializations and release those forests child-first. The scoped cutoff
 * lasts until each exact parent leaves the registry; unrelated parent trees
 * remain live.
 * @param parents - exact host-owned parent Agents entering teardown.
 * @returns once every retained descendant Activation released its `AgentHandle`.
 * @throws an aggregate error after all branches settle when any failed.
 */
async drainContinuableDescendants(parents: readonly Agent[]): Promise<void>

/**
 * Release selected resident continuable direct children of one exact live
 * parent. Other children of the same parent remain admitted and resident.
 * Absent targets and a manager-less composition are accepted no-ops.
 * @param parent - exact live direct parent authorizing the selected release.
 * @param childIds - durable direct-child ids to release when resident.
 * @returns once every selected Activation released its `AgentHandle`.
 * @throws {SubagentError} `UNAUTHORIZED` when a resident target belongs to a
 *   different parent or the supplied parent identity is stale.
 */
async drainContinuableChildren(parent: Agent, childIds: readonly SessionId[]): Promise<void>

/**
 * Enumerate the parent's direct session-backed subagents without loading or
 * resuming an Agent. The Session query service supplies one live-preferred
 * corpus and shared point observations; the projection cache supplies
 * immutable descriptor hits without opening cold logs. The registered
 * `subagent` projection remains the sole mode/label classifier.
 *
 * Every query receives `signal`, and the listing rechecks cancellation
 * around each await. Read rejections that settle
 * after an abort become a stable `SubagentError` with code `CANCELLED`.
 * @param parentSessionId - parent session whose direct children are listed.
 * @param signal - caller-owned cancellation forwarded to Session queries
 *   and observed around every read await.
 * @returns children and per-child diagnostics ordered by `createdAt`, then id.
 * @throws {@link SubagentError} when the projection registry or the session
 *   store is not mounted, or the caller cancels the listing.
 */
listChildren(parentSessionId: SessionId, signal?: AbortSignal): Promise<SubagentListEntry[]>

/**
 * Enumerate the root's complete session-backed subagent tree in stable
 * pre-order from one live-preferred corpus, without loading or resuming an
 * Agent. Ordinary sessions and one-shot children remain traversal nodes so
 * continuable descendants below them are discovered; each returned entry
 * adds its durable `parentId` and root-relative `depth`. Identity resolution,
 * diagnostics, optional persistence, and cancellation follow the same
 * projection-backed contract as {@link listChildren}.
 * @param rootSessionId - session whose complete descendant tree is listed.
 * @param signal - caller-owned cancellation forwarded to persistence reads
 *   and observed around every read await.
 * @returns children and per-candidate diagnostics with tree position, in
 *   stable pre-order.
 * @throws {@link SubagentError} under the same conditions as {@link listChildren}.
 */
listDescendants(rootSessionId: SessionId, signal?: AbortSignal): Promise<SubagentDescendantListEntry[]>

/**
 * Remote face of {@link listChildren} for one browser: the durable listing
 * plus live Agent activity and the delivery-time parent availability hint.
 * Parent availability is a hint; {@link prompt} performs the authoritative
 * check. Named apart from the provider-name {@link list}, which owns the
 * member.
 * @param parentSessionId - parent session whose direct children are listed.
 * @param signal - carrier cancellation forwarded to Session queries.
 * @returns the catalog view for that parent.
 * @throws {RemoteError} `gateway/bad-request` for an empty parent id,
 *   `gateway/cancelled` for an aborted read, `subagent/projections-unavailable` when
 *   the deployment has no projection registry, otherwise `gateway/internal`.
 */
@Remote('list') async remoteExportList(parentSessionId: SessionId, signal: AbortSignal): Promise<SubagentCatalog>

/**
 * Deliver one browser-authored message to a continuable child through the
 * exact live direct parent, retaining the caller-minted request identity and
 * validated browser zone on the accepted message. Success identifies the
 * message the child's inbox accepted; later execution is independent of this
 * call. Queue delivery targets a later turn; steer delivery targets the
 * nearest step and retains the Agent loop's best-effort fallback semantics.
 * Image parts are admitted and persisted through the attachment store
 * before delivery, and the child's model must accept image input.
 * @param request - durable address, delivery, minted identity, content, and optional browser zone.
 * @param signal - carrier cancellation, owning the call until inbox acceptance.
 * @returns the accepted message's inbox identity.
 * @throws {RemoteError} `gateway/bad-request`, `subagent/attachment-invalid`,
 *   `subagent/invalid-time-zone`, `subagent/parent-unavailable`,
 *   `subagent/not-resumable`, `subagent/unauthorized`,
 *   `subagent/delivery-unavailable`, `gateway/cancelled`, or `gateway/internal`.
 */
@Remote('prompt') async prompt(request: SubagentPromptRequest, signal: AbortSignal): Promise<SubagentPromptReceipt>

/**
 * Remote face of {@link interrupt} under one durable parent address. No
 * catalog, history, persistence, or parent Agent lookup runs: the core
 * primitive alone authorizes the address against the live Activation, which
 * is what keeps a live child interruptible while its parent Agent is offline.
 * Absent, idle, and already-completed targets are accepted no-ops there.
 * @param childSessionId - durable child session id to interrupt.
 * @param parentSessionId - durable direct parent whose authority is claimed.
 * @param mode - required continuable-address discriminator.
 * @returns acknowledgement that the cancel signal was admitted, not that the target is quiescent.
 * @throws {RemoteError} `gateway/bad-request` for an empty id,
 *   `subagent/unauthorized` when the address does not own the live target,
 *   otherwise `gateway/internal`.
 */
@Remote('interruptByParent') interruptByParent( childSessionId: SessionId, parentSessionId: SessionId, mode: 'continuable', ): SubagentInterruptReceipt

/**
 * Register a provider under its name. Registration is effect-scoped and HMR
 * safe; removing a provider blocks new starts but does not revoke runs that
 * were already returned to their holders.
 * @param provider - the trusted provider implementation.
 * @returns the exact Cordis effect disposer.
 */
registerProvider(provider: SubagentProvider): () => void

/**
 * Look up a provider by name.
 * @param name - the provider name.
 * @returns the provider, or undefined when absent.
 */
getProvider(name: string): SubagentProvider | undefined

/**
 * List registered provider names in insertion order.
 * @returns the registered names.
 */
list(): string[]

/**
 * Establish a published child on the named provider. Capability and semantic
 * checks run before delegation. Provider ownership lasts until its promise
 * fulfills; a rejection therefore has no run for the caller to dispose and
 * emits no run lifecycle events. Post-publication turn and infrastructure
 * failures settle through the returned run.
 * A catalog append failure disposes the run and handles its result rejection;
 * the caller receives the catalog error even if disposal also fails.
 * @param name - the provider to use.
 * @param request - child label, prompt, parent, signal, and optional capabilities.
 * @returns the published holder-owned run.
 */
async start(name: string, request: SubagentStartRequest): Promise<SubagentRun>
```

Types: [Agent](core.zh.md) · [ContentBlock](llm-streaming.zh.md) · [MessageId](llm-streaming.zh.md) · [SessionId](core.zh.md)

Source: [`packages/subagent/subagent/src/index.ts`](../../packages/subagent/subagent/src/index.ts)

<a id="subagent-events"></a>

### `subagent/*` events

<a id="subagentend--emit"></a>

#### `subagent/end` — emit

A published child settled. Scope-filtered dispatch uses the same delegating parent carrier as `subagent/start`, so the lifecycle pair reaches the same scoped audience.

```ts cordis-catalog
/**
 * A published child settled. Scope-filtered dispatch uses the same delegating
 * parent carrier as `subagent/start`, so the lifecycle pair reaches the
 * same scoped audience.
 * @param info - the run identity and terminal outcome.
 * @dshScopeScan unsupported
 * @mode emit
 */
'subagent/end'(this: Scoped<SubagentRuntime>, info: SubagentRunEndInfo): void
```

Types: [Scoped](scope.zh.md)

Source: [`packages/subagent/subagent/src/index.ts`](../../packages/subagent/subagent/src/index.ts)

<a id="subagentprovider-added--emit"></a>

#### `subagent/provider-added` — emit

A provider became resolvable in the registry.

```ts cordis-catalog
/**
 * A provider became resolvable in the registry.
 * @param provider - the registered provider.
 * @mode emit
 */
'subagent/provider-added'(provider: SubagentProvider): void
```

Source: [`packages/subagent/subagent/src/index.ts`](../../packages/subagent/subagent/src/index.ts)

<a id="subagentprovider-removed--emit"></a>

#### `subagent/provider-removed` — emit

A provider left the registry. Accepted runs remain holder-owned.

```ts cordis-catalog
/**
 * A provider left the registry. Accepted runs remain holder-owned.
 * @param name - the provider name that no longer resolves.
 * @mode emit
 */
'subagent/provider-removed'(name: string): void
```

Source: [`packages/subagent/subagent/src/index.ts`](../../packages/subagent/subagent/src/index.ts)

<a id="subagentstart--emit"></a>

#### `subagent/start` — emit

A provider established a published child. For in-process providers, `ctx.agents.get(info.id)` resolves during this notification. Scope-filtered dispatch keys the carrier by the delegating parent, so a parent-scoped listener observes only its own delegations. Paired with `subagent/end`.

```ts cordis-catalog
/**
 * A provider established a published child. For in-process providers,
 * `ctx.agents.get(info.id)` resolves during this notification.
 * Scope-filtered dispatch keys the carrier by the delegating parent, so a
 * parent-scoped listener observes only its own delegations. Paired with
 * `subagent/end`.
 * @param info - the provider and published child identity.
 * @dshScopeScan unsupported
 * @mode emit
 */
'subagent/start'(this: Scoped<SubagentRuntime>, info: SubagentRunInfo): void
```

Types: [Scoped](scope.zh.md)

Source: [`packages/subagent/subagent/src/index.ts`](../../packages/subagent/subagent/src/index.ts)
<!-- END GENERATED cordis-surface -->
