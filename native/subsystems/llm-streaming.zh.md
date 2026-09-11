# LLM（大語言模型）流式輸出

[English](llm-streaming.md) | 中文

[`packages/llm`](../../packages/llm/README.zh.md) 提供對話與流式輸出類型：每個請求和持久歷史共用的 `Message`/`ContentBlock` 變體、完整組裝的模型請求、原始 `StreamChunk` 協議、每個適配器必須實現的適配器約定（adapter contract），以及共享的 assembler。[核心包](core.zh.md)在每個輪次持有并記錄這些值；本頁聲明它們。

源碼：[`packages/llm/llm/src/types.ts`](../../packages/llm/llm/src/types.ts)

<a id="content-blocks-and-messages"></a>

## 內容塊與消息

一段對話由 `Message` 組成；一條消息是一個類型化**內容塊**的數組。塊的聯合類型從 `ContentBlockMap` 派生。

源碼：[`packages/llm/llm/src/types.ts`](../../packages/llm/llm/src/types.ts)

```ts type-equiv
/**
 * Merge-extensible content blocks keyed by `type`. New core blocks must land
 * with adapter, UI, and compaction support.
 */
interface ContentBlockMap {
  'text': TextBlock
  'reasoning': ReasoningBlock
  'image': ImageBlock
  'file': FileBlock
  'tool-call': ToolCallBlock
  'tool-result': ToolResultBlock
}
```

各塊接口（完整字段見源碼）：`TextBlock`（`text`）、`ReasoningBlock`（thinking，區別于可見文本）、`ImageBlock`（一個持久的[圖片附件](attachment.zh.md)）、`FileBlock`（一個持久的原樣[文件附件](attachment.zh.md)，請求組裝對每條路由都把它投影為 handle 文本）、`ToolCallBlock`（`id: ToolCallId`、`name`、原始 JSON `arguments`），以及 `ToolResultBlock`（`toolCallId`、嵌套 `content: ContentBlock[]`、`isError?`）。`ContentBlock = ContentBlockMap[ContentBlockType]`。僅當適配器、UI、壓縮（compaction）和持久回放路徑均支持某種新模態時，才將其納入可合并擴展的 map。

圖片訪問方式屬于請求序列化，不屬于持久附件或確定性請求圖片版本。`resolveImageAttachmentAccess()` 把附件提供方可選的宿主對象路徑，與消費方為當前工具執行文件系統提供的映射組合起來。結果只適用于本次請求，不參與 `variantId`。

源碼：[`packages/llm/llm/src/content.ts`](../../packages/llm/llm/src/content.ts)

```ts type-equiv
/** Execution-world path that model tools can use to read one normalized attachment. */
interface ImageAttachmentAccess {
  /** Absolute path to immutable normalized bytes; callers must treat it as read-only. */
  readonlyPath: string
}
```

源碼：[`packages/llm/llm/src/message.ts`](../../packages/llm/llm/src/message.ts)

`Message` 是一個帶標識且不可變的角色／來源／內容值。模型生成的 assistant 消息會在來源中記錄生成它的提供方和模型，以及可選的適配器私有回放數據：

```ts type-equiv
/** Provider/model identity and adapter-private replay data for an assistant message. */
interface AssistantProvenance {
  /** Provider route that produced the message. */
  provider: string
  /** Provider model id that produced the message. */
  model: string
  /**
   * Lossless-JSON adapter state needed to replay the provider response.
   * `LlmRuntime` exposes it to a target adapter only when that adapter instance
   * currently owns both this historical provider and the target provider.
   */
  replayState?: unknown
}
```

```ts type-equiv
/** One immutable message representation shared by delivery, durable history, and model requests. */
interface Message {
  /** Stable identity preserved across every representation boundary. */
  readonly id: MessageId
  /** Provider-neutral conversation role. */
  readonly role: 'system' | 'user' | 'assistant'
  /** Exact model-facing blocks. */
  readonly content: ContentBlock[]
  /** Required source fields supplied by the producer. */
  readonly source: MessageSource
}
```

消息來源本身也是一個可合并擴展的和類型：

```ts type-equiv
/**
 * Where a message (or injected content) came from.
 * Merge-extensible sum type — plugins add their own `kind`s.
 */
interface MessageSourceMap {
  user: { kind: 'user' }
  plugin: { kind: 'plugin'; plugin: string } & ContextFormed
  model: ModelMessageSource
  tool: ToolMessageSource
}
```

生產方標識與呈現形式相互獨立。`kind` 回答「由誰產生」；可選的 `form` 回答「這是什么類型的信息」，消費方決定如何呈現。多個生產方可以共用一種 `form`，一個生產方在一次會話中也可以發出多種 `form`。這些取值描述語義，并逐個增加；未聲明或無法識別的值使用文檔規定的默認值，按不透明內容呈現：

```ts type-equiv
/**
 * The kind of information in producer-supplied context, declared by the
 * producer beside its provenance.
 *
 * `MessageSource.kind` answers *who produced this*; `form` answers *what kind
 * of thing it is*, and the two axes are deliberately independent — several
 * producers share one form, and one producer may emit more than one form over
 * a session.
 *
 * The vocabulary is SEMANTIC, never visual: a value states that the content is
 * a file's instructions or a catalog of available items, and a consumer decides
 * what that looks like. Colors, icons, ordering, and collapse defaults are the
 * consumer's business and must not enter this union. It grows one value at a
 * time as producers gain the structured fields their form needs; an absent or
 * unknown value is the documented default, presented as opaque content.
 */
type ContextForm =
  /** Instructions read out of workspace files the model is expected to follow. */
  | 'instructions'
  /** A catalog of items available in this session, republished as it changes. */
  | 'catalog'
  /** Current state, where a later snapshot from the same producer supersedes an earlier one. */
  | 'snapshot'
  /** A one-off account of something that just happened; it supersedes nothing. */
  | 'notice'
  /** A message another agent addressed to this one. */
  | 'relay'
  /** Material lifted out of another session's log, possibly reduced on the way in. */
  | 'recall'
```

```ts type-equiv
/** One named contribution to a `snapshot`-form context, in assembly order. */
interface ContextSnapshotSection {
  /** The contributing subsystem's name. */
  readonly name: string
  /** That contribution's model-facing text, exactly as assembled. */
  readonly text: string
}
```

```ts type-equiv
/**
 * Producer-declared {@link ContextForm} and the fields that form requires,
 * mixed into the source types that carry one.
 *
 * Discriminated by `form` so a producer cannot select a form without the
 * fields needed to present it: a `notice` must record its one-line
 * account, a `snapshot` its sections. Omitting `form` stays valid — an
 * undeclared context is the documented default.
 */
type ContextFormed =
  | { readonly form?: never }
  | { readonly form: 'instructions' }
  | { readonly form: 'catalog' }
  | {
    readonly form: 'snapshot'
    /** The named contributions this snapshot assembled, in order. */
    readonly sections: readonly ContextSnapshotSection[]
  }
  | {
    readonly form: 'notice'
    /** One-line account of what happened, shown without expanding the row. */
    readonly summary: string
  }
  | { readonly form: 'relay' }
  | { readonly form: 'recall' }
```

<a id="streamchunk--the-raw-protocol"></a>

## `StreamChunk`：原始協議

一個流式響應交錯包含多種類型的塊（文本、推理（reasoning）、多個工具調用）。`index` 將每個 delta 關聯到其所屬塊；`block-end` 攜帶完整組裝好的 `ContentBlock`，消費方無需自行重新組裝 delta。這是一個**封閉的**可辨識聯合類型：對 `type` 的 `switch` 以 `assertNever` 結尾，因此新增變體會在每個必須處理它的消費方處觸發編譯錯誤。

```ts type-equiv
/**
 * Adapter-private lossless-JSON state for replaying a successful response,
 * carried by a terminal `finish` chunk and stored on the assembled assistant
 * message's model source. Both halves stay opaque to the harness; only the
 * split is shared vocabulary, so assembly can keep stored metadata aligned
 * with stored content without reading either half.
 */
interface ReplayEnvelope {
  /** Response-level adapter-private metadata (ids, native stop reason). */
  response: unknown
  /**
   * Per-block adapter-private metadata, one entry per emitted block in
   * first-seen stream order. When assembly drops a block it drops the entry at
   * the same position; entries whose length does not match the emitted block
   * count discard the whole envelope. An adapter whose metadata is independent
   * of block structure omits this field and the envelope passes through
   * assembly unchanged.
   */
  blocks?: readonly unknown[]
}
```

```ts type-equiv
/**
 * Raw streaming protocol emitted by adapters.
 * Block indexes correlate interleaved deltas, and `block-end` carries the
 * assembled block. Adapters emit usage before the terminal finish and nothing
 * afterward; tool arguments remain raw JSON strings. An adapter implementation
 * may throw, but `LlmRuntime.stream()` normalizes that failure to a terminal
 * `error` or `aborted` finish before exposing it to consumers.
 */
type StreamChunk =
  | { type: 'block-start'; index: number; blockType: ContentBlockType }
  | { type: 'text-delta'; index: number; text: string }
  | { type: 'reasoning-delta'; index: number; text: string }
  | { type: 'tool-call-delta'; index: number; id: ToolCallId; name?: string; argumentsDelta: string }
  | { type: 'block-end'; index: number; block: ContentBlock }
  | { type: 'usage'; usage: TokenUsage }
  | {
    type: 'finish'
    reason: FinishReason
    /** Replay metadata for a successful response; see {@link ReplayEnvelope}. */
    replayState?: ReplayEnvelope
  }
```

<a id="compact-assistant-streams"></a>

## 緊湊 Assistant stream

`AssistantStreamAccumulator` 把每個 `StreamChunk` 與其原始安全整數時間戳配對，并生成 `AssistantStreamRecord[]`。同一 block 的連續 text、reasoning 或 tool argument delta 會變成一個 record，使用 `time0`、精確時間戳間隔和每個原始 delta 對應的一個數組成員；其他 chunk 保留為帶時間戳的 raw record。該表示會移除重復 event envelope，但不會合并 token 邊界，也不會丟棄 terminal、usage、block、failure 或 replay 事實。

`snapshot()` 返回分離且不可變的 stream。`expandAssistantStream()` 會嚴格檢查 record key、成員數、index、時間戳、tool-call identity 與無損 JSON，再重建精確的帶時間 chunk 序列。Session 日志會把該 stream 嵌入作為 surface result 的 `assistant/message`，或嵌入沒有 surface message 的 `assistant/attempt`。

進程本地 `agent/assistant-stream` frame 承載實時呈現。持久回放與恢復校驗仍會展開內嵌 settlement；遙測、token 記賬與 Host 折疊直接讀取緊湊記錄。記錄級讀取器（`assistantStreamFirstTokenTime`、`assistantStreamHasVisibleContent`、`assistantStreamHasVisibleText`、`lastAssistantStreamChunk`、`assistantStreamChunks`、`joinAssistantStreamText`、`assembleAssistantStream` 以及按 run 的 `runFirstTokenTime` 與 `runFirstVisibleTime`）以提前退出在一次掃描內回答消費方問題，因此大歷史每次結算的代價為 O(records) 而非 O(members) 展開（[折疊決策](../../.agents/notes/implemented/architecture/2026-09-06-embedded-stream-record-readers.zh.md)）。`expandAssistantStream()` 仍是持久邊界讀取記錄與需要每個成員的消費方的校驗路徑。

<a id="llmfailure"></a>

## `LlmFailure`

每個拋出的失敗或最終適配器的帶內失敗都會規范化為一種可序列化、提供方無關的 payload。`providerRetryAfterMs` 是經校驗、由提供方請求的正數延遲，而不是重試決策；`ProviderRequestId` 是用于診斷的不透明品牌字符串。

```ts type-equiv
/** Serializable provider or transport failure facts; policy decides whether they are retryable. */
interface LlmFailure {
  /** Human-readable provider or transport failure. */
  readonly message: string
  /** Stable provider-neutral machine-routing code. */
  readonly code: string
  /** HTTP status returned by the provider, when available. */
  readonly status?: number
  /** Provider-requested delay in milliseconds, when valid and available. */
  readonly providerRetryAfterMs?: number
  /** Opaque provider-issued request identifier for diagnostics. */
  readonly requestId?: ProviderRequestId
}
```

## 請求圖片定價

提供方對請求圖片收取視覺 token 的適配器通過覆寫 `LlmAdapter.imageRequestPricing` 聲明按路由的定價，消費方經 `ctx.llm.imageRequestPricing(provider, model)` 同步解析。token 計量服務在每次計量時解析路由模型的定價，使 compaction 的壓力、保留與選段都按路由請求實際發送的形式為圖片歷史計價；DeepSeek 適配器復現自身的請求投影（按模型的像素預算、最舊優先 offload），并用官方公布的視覺計量為保留圖片定價，已完成請求仍以 provider usage 為權威錨點。

```ts type-equiv
/**
 * Request price of one ordered image occurrence under one exact model route's
 * request projection. Every occurrence resolves to the pair the wire actually
 * carries: provider visual tokens for a retained image, plus the model-visible
 * text sent with or instead of it (request-preview handle, offload placeholder,
 * or text-only substitution). The caller prices `text` with its own text
 * estimator so provider pricing never fixes a text tokenization.
 */
interface LlmImageRequestPrice {
  /** Provider visual tokens for the retained request image; 0 when only text represents this occurrence. */
  visualTokens: number
  /** Model-visible text sent for this occurrence, to be priced by the caller's text estimator. */
  text: string
}
```

```ts type-equiv
/**
 * Provider-side request-image pricing for one exact model route. Implemented
 * by adapters whose provider charges visual tokens; consumers (the token
 * meter) resolve it synchronously per measurement, so implementations must not
 * perform I/O.
 */
interface LlmImageRequestPricing {
  /**
   * Price every image occurrence of one request projection.
   * @param images - durable image references in request order, one entry per occurrence.
   * @returns one price per occurrence, aligned by index with `images`.
   */
  priceImages(images: readonly ImageAttachmentRef[]): readonly LlmImageRequestPrice[]
}
```

## 適配器約定

每個適配器必須遵守以下規則，每個消費方可以依賴它們：

- **`usage` 在 `finish` 之前，`finish` 之后不再有任何分片。** 將兩者都推遲到提供方的流結束標記，這樣尾部的 usage-only 分片就不會違反順序。
- **工具調用的 `arguments` 全程保持原始 JSON 字符串。** 部分片段通過 `argumentsDelta` 流式傳輸；如果提供方返回的是已解析的對象，適配器在 `block-end` 時重新序列化為字符串。
- **兩條受支持的錯誤路徑，共用一個 `LlmFailure` 類型。** 失敗可以從 `stream()` 拋出（傳輸／協議錯誤），**或者**以 `finish {kind:'error'|'aborted', failure}` 結束流（無法在流中途拋異常的適配器用它表示提供方帶內錯誤）。`LlmError.failure` 攜帶同一個 `LlmFailure`。調用選定適配器后，流會保留被拋出的確切 `Error` 對象，并將不可變事實以及實際服務注冊所對應的不可變重試策略關聯到該調用；agent loop（智能體循環）先把 attempt stream 提交為 `assistant/attempt`，再關閉失敗步驟，并把錯誤、事實、不可變的先前已重試失敗事實、實際服務策略和輪次信號提供給 `agent/request-error`。處理該錯誤的 listener 在其 await 的修復完成后返回 `{ kind: 'retry' }`；若未恢復，結構化失敗會成為輪次錯誤，并且該次 attempt 不會提交 surface Assistant message 或工具副作用。
- **一次適配器調用就是一次提供方嘗試。** 適配器禁用庫重試。agent 層恢復會打開另一個持久、帶編號的輪次；直接調用 `ctx.llm.stream()` 的調用方仍然只嘗試一次。
- **提供方停頓在傳輸層受到時限約束。** 兩個已交付的遠程適配器都暴露正數且有限的 `streamIdleTimeoutMs`，默認五分鐘。watchdog 只在 iterator `next()` 尚未完成時啟動，整個請求使用同一個穩定 signal，把自身到期映射為 `TIMEOUT`，并把更早發生的調用方中止保留為 `ABORTED`。
- **上下文溢出只有一個規范 code。** 兩個 DeepSeek 適配器都通過 `isContextWindowExceededError()` 對提供方的顯式細節分類并暴露 `CONTEXT_WINDOW_EXCEEDED`，無論失敗以拋出的 HTTP `LlmError` 還是帶內 finish error 到達。消費方按 code 路由，絕不依賴提供方文本。
- **空 completion 是可重試錯誤，而不是靜默的成功結果。** 兩個適配器都把沒有攜帶任何內容塊的終止性 `stop` 結束映射為攜帶規范 `EMPTY_RESPONSE` code 的 `finish {kind:'error'}`，`dsh-llm-retry` 默認會重試它。
- **每個提供方 HTTP 請求都攜帶應用歸屬頭。** 適配器發送 `attributionHeaders()`（見下文）作為 `User-Agent` 基線，并通過協議級測試加以證明。
- **回放狀態歸適配器所有；其切分是共享詞匯。** 成功的 `finish` 可以攜帶一個 `ReplayEnvelope`：不透明的響應級元數據，加上與發射塊序列對齊的可選逐塊條目。對齊關系是 harness 的詞匯——組裝丟棄某個塊時，同一位置的條目一并丟棄，因此存儲的元數據始終描述存儲的內容。循環把裁剪后的數據與組裝后的 assistant 消息一起存儲。后續請求中，僅當歷史提供方與目標提供方當前注冊到完全相同的適配器實例時，`LlmRuntime` 才會傳遞該狀態。該適配器負責校驗狀態并擁有所有跨模型或跨提供方轉換；其他適配器只會收到提供方無關的內容以及提供方／模型字段，不會收到私有狀態。持久化內容保持權威：讀取適配器無法使用的已存狀態只會把這一條消息降級為提供方無關轉換并帶出診斷，而不是讓請求失敗。

## `ResolvedRetryPolicy`

重試配置會在路由注冊前解析為不可變的可辨識聯合。normal mode 攜帶 `mode: 'normal'`、有限的 `maxRetries`、`retryableCodes`，以及必填的 `initialDelayMs`、`maxDelayMs` 與 `jitterRatio`；always mode 攜帶 `mode: 'always'` 和相同的必填退避字段，但沒有有限上限。省略提供方策略時使用重試五次的 normal 默認值。分層 settings 在切換到 always 模式后可能保留僅屬于 normal 的 `maxRetries` 或 `retryableCodes`；解析器會忽略這些未啟用字段，并捕獲純 always 策略。`LlmRuntime.providerRetryPolicy(provider)` 返回注冊值；調用選定實際提供服務的注冊后，`llmRetryPolicyOf(stream)` 返回從中捕獲的值，因此之后釋放或替換路由都無法改變進行中失敗的恢復策略。可選配置輸入字段由[生成的配置目錄](../config-catalog.zh.md)列出。

## `AppIdentity`：應用歸屬

每個適配器都會向提供方發送的靜態公開應用標識（[`packages/llm/llm/src/attribution.ts`](../../packages/llm/llm/src/attribution.ts)）。`attributionHeaders(identity?)` 只把它映射到標準 `User-Agent` header；該約定有意不支持 OpenRouter 特有的應用歸屬 header。默認 `APP_IDENTITY` 從包 manifest（元數據清單）獲取版本；每個字段都是公開產品事實——不含 secret、路徑、會話 id 或逐用戶標識，且任何逐請求信息都不得影響這些值。設計理由見[強制 `User-Agent` 歸屬](../../.agents/notes/implemented/architecture/2026-06-21-mandatory-app-attribution-headers.zh.md)。

```ts type-equiv
/**
 * Static public application identity sent to LLM providers.
 *
 * Every field is a public product fact, safe on every request: no secrets,
 * local paths, session ids, prompt text, or per-user identifiers belong here,
 * and nothing per-request may influence the values.
 */
interface AppIdentity {
  /** `User-Agent` product token (lowercase, hyphenated). */
  product: string
  /** Product version; sourced from package metadata, never hand-copied. */
  version: string
  /** Repository home URL of the app, used as the `User-Agent` comment. */
  url: string
}
```

<a id="tokenusage"></a>

## `TokenUsage`

逐調用 token 記賬。各計數**互不重疊**：`inputTokens` 只包含未緩存輸入；緩存輸入單獨報告，計費輸入是三者之和。若提供方把緩存命中折入單一提示詞總數（如 DeepSeek 的 `prompt_tokens`），適配器會再將其扣除。可選的 `totalTokens` 是精確的提示詞與輸出聚合計數，由適配器保留提供方原值或從權威聚合計數重建；不可用或不一致時省略。`reasoningTokens` 存在時只是信息性細節，已經包含在 `outputTokens` 中；匯總時不得重復相加。

```ts type-equiv
/**
 * Token accounting for one model call (cache fields are optional).
 *
 * Counts are DISJOINT: `inputTokens` is uncached input only; cached input is
 * reported separately as `cacheReadTokens`/`cacheWriteTokens` (billed input =
 * sum of the three). Adapters whose providers fold cache hits into a total
 * prompt count (DeepSeek's `prompt_tokens`) subtract them out.
 */
interface TokenUsage {
  inputTokens: number
  outputTokens: number
  /**
   * Exact full-call total including aggregate prompt and output tokens.
   *
   * Adapters preserve a provider total or derive it from authoritative
   * aggregate prompt/output counters; they omit it when unavailable or
   * inconsistent.
   */
  totalTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  reasoningTokens?: number
}
```

<a id="blockassembler"></a>

## `BlockAssembler`

`BlockAssembler`（[`packages/llm/llm/src/assembler.ts`](../../packages/llm/llm/src/assembler.ts)）是唯一的共享實現，負責把 `StreamChunk` 流折疊回 `ContentBlock`、usage、結束原因與回放狀態。循環在記錄原始分片的同時，把同一批分片送入 assembler，再將組裝后的 assistant 內容連同生成它的提供方和模型一起存儲。需要組裝結果、又不想重新實現 fold 的消費方使用它。

內容與元數據共用同一次保留/丟棄決定：`max-tokens` 結束會丟棄每個工具調用，因為被截斷的調用不能安全執行，而同一決定會在每個被丟棄的位置裁剪回放數據的逐塊條目。無論組裝移除什么，`blocks()` 與 `replayState` 都不可能不一致。

```ts public-api
/**
 * Incrementally assembles raw {@link StreamChunk}s into complete
 * {@link ContentBlock}s and a final assistant {@link Message}.
 *
 * The agent loop feeds it while logging raw chunks for replay fidelity, then
 * reads `blocks()` / `message()` / `usage` / `finish` once the stream ends,
 * or `interruptedBlocks()` when cancellation cut the stream short.
 *
 * Tolerant of delta-only protocols (no block-start/end); deltas arriving for
 * an index already closed by `block-end` are ignored (malformed stream) so a
 * misbehaving adapter cannot grow memory or corrupt a completed block.
 */
declare class BlockAssembler {
  /**
   * Feed one chunk into the assembly state.
   * @param chunk - the next raw chunk, in stream order.
   */
  push(chunk: StreamChunk): void;
  /**
   * Assemble all blocks seen so far, in stream order.
   * @returns one block per seen index, except that max-token truncation drops
   *   tool calls that cannot be executed safely; an open block assembles from
   *   its accumulated deltas (an unknown block type never closed by `block-end` throws).
   */
  blocks(): ContentBlock[];
  /**
   * Assemble the prefix an interrupted stream can safely finalize: closed and
   * open text/reasoning blocks with non-whitespace content, in stream order.
   * Tool calls are omitted because interruption precedes dispatch; retaining
   * one would require a fabricated result. Open unknown blocks are also omitted.
   * @returns the kept blocks; empty when nothing streamed before the interruption.
   */
  interruptedBlocks(): ContentBlock[];
  /** Usage from the `usage` chunk; undefined until one arrives. */
  get usage(): TokenUsage | undefined;
  /** Finish reason from the `finish` chunk; `{kind: 'stop'}` when the stream ended without one. */
  get finish(): FinishReason;
  /**
   * Replay metadata from the terminal finish chunk, if any, with per-block
   * entries pruned in step with {@link blocks}. Undefined when the envelope's
   * entries do not align with the emitted blocks.
   */
  get replayState(): ReplayEnvelope | undefined;
  /**
   * The assembled assistant message.
   * @param source - producer attribution for the assembled message.
   * @returns a frozen assistant-role message over `blocks()` (same open-block assembly rules).
   */
  message(source: MessageSource = { kind: 'plugin', plugin: 'dsh-llm/assembler' }): Message;
}
```

<a id="the-model-request-and-result"></a>

## 模型請求

一次模型調用是一個完全組裝好的 `GenerateOptions`。適配器以原始 [`StreamChunk`](#streamchunk--the-raw-protocol) 流作答；消費方用 [`BlockAssembler`](#blockassembler) 組裝它。

源碼：[`packages/llm/llm/src/types.ts`](../../packages/llm/llm/src/types.ts)

提供方與模型發現使用小型、提供方無關的描述符。模型目錄僅供參考：路由仍以已注冊提供方為鍵。

注冊適配器會返回一個句柄：既是釋放器，也帶有原子的路由替換——路由集合由用戶配置決定的插件正需要它。

```ts type-equiv
/**
 * What {@link LlmRuntime.registerAdapter} returns: the disposer, plus an
 * atomic route replacement for the same adapter instance.
 */
interface AdapterRegistrationHandle {
  /** Release every route this registration currently holds. */
  (): void
  /**
   * Replace this registration's routes with `providers`, keeping the same
   * adapter instance. The candidate set is validated in full first — a
   * conflict with another adapter, an invalid name, or bad provider metadata
   * throws and leaves the current routes untouched — and the swap itself is
   * one synchronous section, so no request can observe a gap. An empty array
   * is legal here (a settings section that emptied holds zero routes while
   * staying registered), unlike an empty initial registration.
   *
   * Throws `LlmError` with code `REGISTRATION_DISPOSED` once the registration
   * has been released: its routes are gone and its disposer has already run,
   * so anything registered afterwards would have no owner left to release it.
   * @param providers - the complete next route set for this registration.
   */
  replace(providers: string[]): void
}
```

```ts type-equiv
/** Display metadata for one registered provider route. */
interface LlmProviderInfo {
  /** Provider route key used by {@link GenerateOptions.provider}. */
  id: string
  /** Human-readable provider name for selectors and diagnostics. */
  name: string
}
```

適配器插件還會通過 `registerConfigurableProviders()` 聲明哪些路由*可以*運行，并指明每條路由的用戶設置分節，使配置界面能在任何路由注冊之前就呈現休眠的提供方。

```ts type-equiv
/**
 * One provider route an adapter plugin can activate through configuration,
 * whether or not the route is currently registered. Configuration surfaces
 * merge this directory with `listProviders()` to offer every configurable
 * provider alongside its live/dormant state.
 */
interface LlmConfigurableProvider {
  /** Provider route key this entry activates when configured. */
  provider: string
  /** Human-readable provider name for configuration surfaces. */
  displayName: string
  /** User-settings namespace whose section configures this provider. */
  settingsNs: string
  /**
   * Path from that namespace's section root to this provider's profile
   * object; empty when the whole section is the profile.
   */
  settingsPath: readonly string[]
  /**
   * Whether the owning adapter knows this route only because configuration
   * declared it — a gateway or self-hosted server it ships nothing about.
   * Absent means the adapter draws no such distinction; false means it does
   * and this route is one of its own. Only the adapter can answer: a stored
   * profile is how a user-added route AND a corrected shipped one both look
   * from outside.
   */
  declared?: boolean
  /** Configuration diagnostic for repair; unaffected models may remain serviceable. */
  error?: string
}
```

```ts type-equiv
/** One adapter-discovered model; catalog membership is advisory, not request validation. */
interface LlmModelInfo {
  /** Provider route that owns this model entry. */
  provider: string
  /** Model id passed to {@link GenerateOptions.model}. */
  id: string
  /** Human-readable model name for selectors. */
  name: string
  /** Optional user-facing distinction from otherwise similar models. */
  description?: string
  /** Accepted request modalities; absent means unknown, while an explicit omission is negative capability. */
  inputModalities?: readonly ModelModality[]
}
```

對正確性敏感的元數據與參考目錄分開解析，并歸服務該確切路由的適配器所有。上下文容量、適配器調用默認值、推理選項和系統提示詞更新模式共用同一個確切模型結果，消費方因而無需重復執行權威模型解析。`SystemPromptUpdate` 只有一個值 `'in-history'`：模型把 `messages` 中任意位置最新的 `system` 消息讀作完整的有效系統提示詞，因此 agent loop 可以把變化后的提示詞追加到已緩存歷史之后，而不是改寫第 0 條消息（[決策規則](../../packages/core/agent-loop/README.zh.md#understand-the-implementation)）；模式缺失表示只讀取開頭的 system 消息，`normalizeModelInfo` 以 `INVALID_MODEL_INFO` 拒絕任何其他值。

```ts type-equiv
/** Provider-owned context capacity for one exact provider/model route. */
interface LlmModelContext {
  /** Maximum combined request and response context in tokens. */
  contextWindow: number
}
```

推理強度是另一項針對確切路由的能力。核心為標識符添加品牌類型，但不枚舉其值；有序集合、展示名稱和可選的部署默認值均由各適配器持有。

```ts type-equiv
/** Adapter-owned identifier for one model's selectable reasoning effort. */
type ReasoningEffortId = Branded<'ReasoningEffortId'>
```

```ts type-equiv
/** Display metadata for one adapter-owned reasoning effort. */
interface LlmReasoningEffortInfo {
  /** Opaque stable value accepted by {@link GenerateOptions.reasoningEffort}. */
  id: ReasoningEffortId
  /** Human-readable effort name for selectors and diagnostics. */
  name: string
  /** Optional user-facing distinction from otherwise similar efforts. */
  description?: string
}
```

```ts type-equiv
/** Selectable reasoning efforts for one exact provider/model route. */
interface LlmModelReasoningInfo {
  /** Supported efforts in adapter-preferred display order. */
  efforts: readonly LlmReasoningEffortInfo[]
  /**
   * Adapter-configured default materialized into requests when callers omit
   * an effort. Absence preserves the provider's own default.
   */
  defaultEffort?: ReasoningEffortId
}
```

```ts type-equiv
/** Exact-route model metadata resolved by its owning adapter. */
interface LlmResolvedModelInfo extends LlmModelInfo {
  /** Provider-owned context capacity when known. */
  context?: LlmModelContext
  /** Adapter-configured per-request output cap materialized when callers omit one. */
  defaultMaxTokens?: number
  /** Adapter-owned selectable reasoning levels when exposed. */
  reasoning?: LlmModelReasoningInfo
  /** Declared mid-conversation system prompt handling; absent means only a leading system message is read. */
  systemPromptUpdate?: SystemPromptUpdate
}
```

```ts type-equiv
/** A single model request, fully assembled. */
interface GenerateOptions {
  /** Registered provider route selecting the adapter instance. */
  provider: string
  model: string
  /** Adapter-owned reasoning effort selected for this exact model. */
  reasoningEffort?: ReasoningEffortId
  /**
   * Ordered conversation messages, exactly as the provider sees them. A
   * loop-built request passes the derived history (dsh-agent-loop), whose
   * leading system-role message carries the system prompt; a hand-built
   * one-shot passes any list.
   */
  messages: Message[]
  /**
   * System prompt text for one-shot callers; adapters map it to the provider's
   * system slot ahead of `messages`. Loop-built requests leave it undefined.
   */
  system?: string
  /** Tool schemas (adapters map to the provider's `tools` field). */
  tools?: ToolSchema[]
  temperature?: number
  maxTokens?: number
  /**
   * Stop sequences: generation halts as soon as the model produces any one of
   * these strings (adapters map to the provider's stop field, e.g. OpenAI
   * `stop`). The stop string itself is not included in the output.
   */
  stop?: string[]
  signal?: AbortSignal
  /**
   * Session identity stamped by the loop for request routing. Replay uses it
   * to separate cursors; adapters may map it to model-hidden transport metadata.
   */
  sessionId?: Branded<'SessionId'>
  /**
   * Provider-neutral classification for an auxiliary model call. Adapters may
   * map the purpose to model-hidden transport metadata or purpose-specific
   * generation policy. Ordinary conversation requests leave it unset.
   */
  purpose?: 'compaction' | 'session-title'
}
```

模型響應為何停止由可合并擴展的原因表示。提供方終態失敗攜帶流式約定的 [`LlmFailure`](#llmfailure)：

```ts type-equiv
/**
 * Why a model response stopped.
 * Merge-extensible so adapters can surface provider-specific reasons.
 */
interface FinishReasonMap {
  'stop': { kind: 'stop' }
  'tool-calls': { kind: 'tool-calls' }
  'max-tokens': { kind: 'max-tokens' }
  'aborted': { kind: 'aborted'; failure: LlmFailure }
  'error': { kind: 'error'; failure: LlmFailure }
}
```

`FinishReason = FinishReasonMap[keyof FinishReasonMap]`。`TokenUsage`（逐調用計量，含不相交的緩存字段）詳見[下文](#tokenusage)。

`GenerateOptions.tools` 攜帶 `ToolSchema`——工具的 JSON Schema 描述，發送給模型。它聲明在 dsh-llm（而非 dsh-tools）中，正是因為它是循環每一步組裝請求的一部分：

```ts type-equiv
/**
 * JSON-schema description of a tool, as sent to the model.
 *
 * Declared here (not in dsh-tools) because it is part of {@link GenerateOptions};
 * dsh-tools' ToolDefinition and dsh-system-prompt's PromptAssembly both import
 * it from this package.
 */
interface ToolSchema {
  name: string
  description: string
  /** JSON Schema object for the arguments. */
  parameters: Record<string, unknown>
}
```

面向模型的 `ToolSchema` 是協議類型；產出它的已注冊 `ToolDefinition`（schema + `execute`）在 [tools.md](tools.zh.md) 中。

界面正在起草的提供方既沒有路由也沒有 catalog，因此詢問被單獨描述：請求攜帶用戶正在編輯的草稿，回復是界面可以采納的候選，而不是它必須服務的 catalog。

```ts type-equiv
/**
 * One interrogation of a provider endpoint that configuration has not stored
 * yet. Configuration surfaces send the draft a user is still editing, so the
 * request carries the endpoint and credential directly instead of naming a
 * route: a provider being added has no route to name.
 */
interface LlmModelDiscoveryRequest {
  /**
   * Route the draft is editing, when it edits an existing one. A route whose
   * adapter already knows its models answers from that knowledge instead of
   * asking the endpoint — the adapter's own registry is the better answer, and
   * it costs no network call.
   */
  provider?: string
  /**
   * Endpoint to interrogate. Optional because a route the adapter already
   * describes needs none; a route it does not must supply one.
   */
  baseURL?: string
  /** Wire protocol the endpoint speaks, when the draft names one. */
  api?: string
  /** Credential for this interrogation alone; the harness never stores it. */
  apiKey?: string
}
```

```ts type-equiv
/**
 * One model an endpoint reports about itself. Every field but the id is
 * optional because most provider listings disclose an id and nothing else;
 * a surface adopting one of these still owes the capacities its adapter needs.
 */
interface LlmDiscoveredModel {
  /** Model id the endpoint accepts. */
  id: string
  /** Human-readable name when the endpoint supplies one. */
  name?: string
  /** Maximum combined request and response context, when disclosed. */
  contextWindow?: number
  /** Maximum output tokens, when disclosed. */
  maxTokens?: number
}
```

### 請求信封：`LlmCallConfig` 與記錄的 header

循環從已記錄狀態構建每個請求。`EpochHeader` 記錄調用配置，標記由適配器默認值提供的字段，并通過完整的 `request/header` 快照記錄權威返回工具順序（由 `toolOrder` 配置；未配置時按字典序）。渲染后的提示詞是派生歷史——surface 第 0 號節點上的 `system/message`，加上 `in-history` 路由追加的任何后續系統節點——因此請求頭與派生歷史共同使請求可由會話日志重建。見 [session.md](session.zh.md#the-request-header-event-requestheader) 與[可重建性 Agent Note](../../.agents/notes/implemented/architecture/2026-07-05-reconstructable-requests.zh.md)。

`agent/request` 接收凍結的調用配置種子，并可返回替代值以切換提供方、模型、推理強度或采樣參數。waterfall（瀑布式事件）開始前，循環會移除標記為適配器默認值的值，使確切模型準備過程填入所選路由的當前值；未帶標記的顯式設置仍保留在提議中。waterfall 結束后，準備過程會在輪次信號控制下拒絕顯式指定但不受支持的推理強度 ID（不自動調整），并記錄生效配置以及由適配器默認值提供的字段。步驟準入時，該 waterfall 與準備過程在組裝和 `step/start` 之后、系統提示詞與已接納用戶批次提交之前運行；在任一階段取消都不會提交這兩者。已準備調用的能力決定提示詞協調，調用直至分派完成始終持有同一項適配器注冊。到達 `llm/stream` 的請求會被深度凍結，因此變更會拋異常；請求還攜帶進程本地循環標識，使觀察者不會把單獨記錄的凍結輔助調用誤認成對話請求。

在協議中，循環構建的請求只有派生歷史：渲染后的提示詞作為開頭的 `system` 角色消息（surface 第 0 號節點，即一個 `system/message` 事件）傳輸，并且當已準備調用聲明 `systemPromptUpdate: 'in-history'` 時，變化后的非空提示詞可以作為后續的 `system` 角色消息跟在已緩存歷史之后，由模型讀作有效提示詞；請求的 `system` 字段不設置——`GenerateOptions.system` 服務于標題提供方等直接單次調用方。空渲染文本使派生歷史不包含任何系統消息，即使先前請求保留了多個提示詞版本。已記錄的請求會以最新的 `user/message`（輪次首步）或上一步的工具結果（后續步驟）結尾。開發不變式針對每個循環構建的請求精確重算此等式，并拒絕攜帶 `system` 字段的循環請求。

FIXME(call-config-shape)：重新審視其余哪些字段出于緩存目的確實屬于 epoch 層級（`model` 和模型持有的推理強度已明確屬于；采樣標量目前出于謹慎保留在此）。

```ts type-equiv
/**
 * Provider, model, reasoning effort, and sampling scalars of one conversation's
 * requests. Every field maps 1:1 onto the same-named `GenerateOptions` field;
 * the loop builds requests from the logged header rather than accepting these
 * per call.
 */
interface LlmCallConfig {
  provider: string
  model: string
  reasoningEffort?: ReasoningEffortId
  temperature?: number
  maxTokens?: number
  stop?: string[]
}
```

```ts type-equiv
/**
 * Effective config fields supplied by exact-model adapter resolution rather
 * than by the caller's request proposal.
 */
interface LlmCallConfigAdapterDefaults {
  reasoningEffort?: true
  maxTokens?: true
}
```

## DeepSeek 官方請求擴展

`ctx.deepseekLlmApiExtensions` 是用于向 `deepseek-official` 請求添加頂層字段的提供方特定注冊表。貢獻插件通過 `register(field, provider)` 認領一個字段；適配器在序列化基礎正文后調用 `prepare(request)`，并在 HTTP 前合并返回字段。已準備的 `accept()` 事務會在 2xx 后運行，因此貢獻方可以提交交付狀態，而不會把傳輸失敗或提供方拒絕當作接受。準備、沖突與接受失敗會使用 `REQUEST_EXTENSION`，并使模型請求失敗。

[協議參考](../deepseek-llm-api-wire-extensions.zh.md)定義確切的請求標頭、擴展事務、字段版本和接收方義務。隨附組合會將 [`dsh_session_log`](../../packages/session/session-log-deepseek/README.zh.md) 注冊為無損增量權威日志后綴，并將 [`dsh_plugin_packages`](../../packages/llm/plugin-package-inventory-deepseek/README.zh.md) 注冊為完整存活 Loader 包集合。這些字段仍位于模型消息之外，也不會進入 pi-ai 適配器路徑。

## 服務與提供方約定

`LlmAdapter` 是提供方約定：創建子類、實現 `stream()`，再用 `ctx.llm.registerAdapter(providers, adapter)` 注冊一個適配器實例。`GenerateOptions.provider` 選擇已注冊適配器；`GenerateOptions.model` 會傳給該適配器，無需在生命周期啟動時注冊。重復提供方路由會原子失敗。可選的 `providerRetryPolicy()` 會按路由捕獲并填入 normal 默認值，`providerInfo()` 與異步 `listModels()` 方法則為 `LlmRuntime.listProviders()` / `listModels()` 提供分離的 selector 元數據。該目錄僅供參考，不是請求白名單：適配器仍是權威，并可接受未列出的模型 id。單次異步 `resolveModel()` 查詢返回確切模型身份，以及可選的對正確性敏感的上下文容量、適配器配置的 `defaultMaxTokens`、由模型持有的有序推理強度 ID 和可選的部署默認值；字段缺失表示元數據不可用或保留提供方持有的行為，而不表示目錄成員關系無效。解析器會接收可選的取消信號，并且必須在信號中止后迅速完成結算。`LlmRuntime.resolveModelInfo()` 會校驗聚合結果并返回分離值。在最終適配器邊界，`resolveCallConfig()` 僅在 `maxTokens` 缺失時填入輸出默認值，并校驗和填入推理強度，因此直接調用也無法繞過任何一項已配置行為；直接分派會在等待解析前捕獲一項適配器注冊。agent loop 則使用 `prepareCall()`，使模型解析、請求頭持久記錄和分派全程使用同一項注冊，保留來自同一次查詢的分離上下文元數據，并報告適配器填入的配置字段。適配器查找發生在 `llm/stream` waterfall 的終端 continuation，因此 listener 可以在查找前短路調用，或路由一個可變的一次性請求。AgentLoop 在外層 waterfall 返回流句柄時觀察到一次請求嘗試；這個有限邊界不能證明惰性終端適配器已構造完成或開始提供方 I/O。`block-start` / `block-end` 的 `index` 關聯與 assembler 共同意味著適配器只需 emit 格式正確的分片——塊重組不是每個適配器各自的問題。`ctx.llm.stream()` 與 `llm/stream` waterfall 在一個輪次中的位置見 [architecture.md](../architecture.zh.md#turn-flow)。

```ts type-equiv
/** One model call whose config and adapter registration were resolved together. */
interface PreparedLlmCall {
  /** Detached, deep-frozen config with any adapter-owned default materialized. */
  readonly config: LlmCallConfig
  /** Immutable retry policy captured with the adapter registration. */
  readonly retryPolicy: ResolvedRetryPolicy
  /** Detached context metadata resolved with the registration-bound call. */
  readonly context?: LlmModelContext
  /** Exact model modalities captured with the adapter dispatch generation. */
  readonly inputModalities?: readonly ModelModality[]
  /** Exact model system prompt update mode captured with the adapter dispatch generation. */
  readonly systemPromptUpdate?: SystemPromptUpdate
  /** Config fields materialized by the captured adapter rather than proposed by the caller. */
  readonly adapterDefaults: LlmCallConfigAdapterDefaults
  /**
   * Dispatch this call once through the registration captured during
   * preparation. The request's call-config fields must match {@link config};
   * reuse or mismatch fails with `INVALID_PREPARED_CALL`.
   * @param options - fully assembled request carrying the prepared config.
   * @returns the chunk stream, including the `llm/stream` waterfall.
   */
  stream(options: GenerateOptions): AsyncIterable<StreamChunk>
}
```

```ts public-api
/**
 * Provider-wire adapter for the harness message and stream vocabulary. Register implementations
 * with `ctx.llm.registerAdapter(providers, adapter)`. Every provider HTTP request must include
 * `attributionHeaders()`; prove the headers are added in the wire request or library header hook. The direct-fetch
 * DeepSeek and library-backed pi-ai adapters meet this contract through different internals.
 */
declare abstract class LlmAdapter {
  /**
   * Describe one provider route owned by this adapter.
   * @param provider - a route passed to `registerAdapter()` for this instance.
   * @returns detached display metadata whose id must equal `provider`.
   */
  providerInfo(provider: string): LlmProviderInfo;
  /**
   * Return the provider-owned retry policy captured with this route.
   * @param _provider - a route passed to `registerAdapter()` for this instance.
   * @returns a resolved policy, or `undefined` to use the normal defaults.
   */
  providerRetryPolicy(_provider: string): ResolvedRetryPolicy | undefined;
  /**
   * Resolve provider-side request-image pricing for one exact model route.
   * The default declares none, so consumers fall back to their own neutral
   * estimate. Implementations must answer synchronously without I/O; the
   * token meter resolves this per measurement.
   * @param _provider - a route passed to `registerAdapter()` for this instance.
   * @param _model - exact model id passed to {@link GenerateOptions.model}.
   * @returns route-owned image pricing, or `undefined` when the route declares none.
   */
  imageRequestPricing(_provider: string, _model: string): LlmImageRequestPricing | undefined;
  /**
   * List models this adapter can currently advertise for one owned provider.
   * The result is advisory: an adapter may accept unlisted model ids, and
   * consumers must not turn absence into request rejection.
   * @param _provider - one provider route owned by this adapter.
   * @returns discoverable models in adapter-preferred order.
   */
  listModels(_provider: string): Promise<readonly LlmModelInfo[]>;
  /**
   * Resolve all metadata available for one exact model. This query is
   * independent of the advisory catalog and does not validate request routing.
   * @param provider - one provider route owned by this adapter.
   * @param model - exact model id passed to {@link GenerateOptions.model}.
   * @param _signal - cancellation for this exact-model lookup; asynchronous
   *   implementations must settle promptly after it aborts.
   * @returns provider/model identity plus any context, call-default, and reasoning metadata.
   */
  resolveModel(
    provider: string,
    model: string,
    _signal?: AbortSignal,
  ): Promise<LlmResolvedModelInfo>;
  /**
   * Bind exact model metadata and the eventual request dispatch to one adapter generation.
   * Dynamic adapters override this so settings changes between preparation and
   * dispatch cannot combine one generation's capabilities with another's endpoint.
   * @param provider - registered provider route.
   * @param model - exact model id.
   * @param signal - cancellation for model resolution.
   * @returns model metadata and a one-generation stream entry point.
   */
  async prepareCall(provider: string, model: string, signal?: AbortSignal): Promise<PreparedAdapterCall>;
  /**
   * Stream one model call as raw chunks. The only required method.
   * @param options - the fully-assembled request; implementations must honor `options.signal`.
   * @returns the chunk stream, obeying the adapter contract documented on `StreamChunk`.
   */
  abstract stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
}
```

`ContentBlockType`（帶 `index` 關聯的塊所攜帶的鍵集合）從上文的 [`ContentBlockMap`](#content-blocks-and-messages) 派生。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxdeepseekllmapiextensions--deepseekllmapiextensionregistry"></a>

### `ctx.deepseekLlmApiExtensions` — `DeepSeekLlmApiExtensionRegistry`

Registry of independently owned top-level fields for official DeepSeek requests.

```ts cordis-catalog
/**
 * Register the sole provider of one top-level request field. Registration is effect-scoped.
 * @param field - declaration-merged field owned by the provider.
 * @param provider - request-time field preparation and optional acceptance behavior.
 * @returns disposer that releases the field.
 */
register<K extends keyof DeepSeekLlmApiExtensionMap>( field: K, provider: DeepSeekLlmApiExtensionProvider<DeepSeekLlmApiExtensionMap[K]>, ): () => Promise<void>

/**
 * Prepare every currently registered field from one immutable base request.
 * Preparation failures reject before HTTP dispatch. Field values are cloned and frozen;
 * providers retain no mutable alias to the outgoing request.
 * @param request - exact serialized request facts before extension fields.
 * @returns detached fields and their idempotent joint acceptance transaction.
 */
async prepare(request: DeepSeekLlmApiExtensionRequest): Promise<PreparedDeepSeekLlmApiExtensions>
```

Source: [`packages/llm/deepseek-llm-api-extensions/src/index.ts`](../../packages/llm/deepseek-llm-api-extensions/src/index.ts)

<a id="ctxllm--llmruntime"></a>

### `ctx.llm` — `LlmRuntime`

The abstract `llm` service: an adapter registry plus a streaming model-call API, interceptable via the `llm/stream` waterfall.

```ts cordis-catalog
/**
 * Register an adapter for the given provider routes. Throws `LlmError` with code
 * `DUPLICATE_ADAPTER` if any provider already has an adapter (all-or-nothing).
 * Disposed with the fiber.
 * @param providers - every provider route this adapter should serve.
 * @param adapter - the adapter that streams calls for those providers.
 * @returns the disposer, carrying {@link AdapterRegistrationHandle.replace}.
 */
registerAdapter(providers: string[], adapter: LlmAdapter): AdapterRegistrationHandle

/**
 * Describe provider routes with a registered adapter.
 * @returns detached provider metadata in registration order.
 */
@Remote listProviders(): LlmProviderInfo[]

/**
 * Declare provider routes an adapter plugin can activate through
 * configuration. Registration is all-or-nothing: an empty list, invalid
 * entry, or a provider already declared by any registration throws
 * `LlmError` without registering the rest. Disposed with the fiber.
 * @param entries - every configurable provider this plugin owns.
 * @returns a handle that withdraws all of them, and can atomically replace them.
 */
registerConfigurableProviders(entries: readonly LlmConfigurableProvider[]): DirectoryRegistrationHandle

/**
 * List every declared configurable provider, registered or dormant.
 * @returns detached directory entries in declaration order.
 */
@Remote listConfigurableProviders(): LlmConfigurableProvider[]

/**
 * Offer to interrogate provider endpoints on behalf of the settings
 * namespace this plugin owns. The namespace is the key because that is what
 * a configuration surface already holds from the configurable-provider
 * directory, and because a provider being *added* has no route to name yet.
 * Disposed with the fiber.
 * @param settingsNs - the namespace whose profiles this discovery serves.
 * @param discover - interrogates one endpoint and must honor the supplied signal.
 * @returns the disposer that withdraws the offer.
 */
registerModelDiscovery( settingsNs: string, discover: ( request: LlmModelDiscoveryRequest, signal?: AbortSignal, ) => Promise<readonly LlmDiscoveredModel[]>, ): () => void

/**
 * Interrogate one provider endpoint for the models it advertises. The
 * request describes a draft, not a stored route, so nothing here reads or
 * writes settings or credentials — the caller owns both, and the reply is
 * candidate metadata a surface may offer for adoption.
 * @param settingsNs - namespace whose registered discovery serves this draft.
 * @param request - the endpoint, protocol, and one-shot credential to use.
 * @param signal - caller cancellation.
 * @returns the advertised models, deduplicated in endpoint order.
 */
async discoverModels( settingsNs: string, request: LlmModelDiscoveryRequest, signal?: AbortSignal, ): Promise<LlmDiscoveredModel[]>

/**
 * Remote adapter for one draft provider interrogation.
 * @param settingsNs - namespace whose registered discovery serves this draft.
 * @param request - endpoint, protocol, and one-shot credential to use.
 * @param signal - caller cancellation supplied by the Remote carrier.
 * @returns advertised models in endpoint order.
 * @throws RemoteError with `llm/model-discovery-rejected` when discovery refuses or fails.
 */
@Remote('discoverModels') async remoteDiscoverModels( settingsNs: string, request: LlmModelDiscoveryRequest, signal: AbortSignal, ): Promise<LlmDiscoveredModel[]>

/**
 * Resolve the retry policy captured when one provider route was registered.
 * @param provider - registered provider route to inspect.
 * @returns the provider-owned policy, with normal defaults already resolved.
 */
providerRetryPolicy(provider: string): ResolvedRetryPolicy

/**
 * Resolve provider-side request-image pricing for one exact route, or
 * `undefined` when the provider is unregistered or declares none. Unknown
 * providers degrade to `undefined` rather than throwing because callers
 * price durable history whose route may no longer be mounted.
 * @param provider - provider route named by a request header.
 * @param model - exact model id named by the same header.
 * @returns the owning adapter's image pricing for the route, when declared.
 */
imageRequestPricing(provider: string, model: string): LlmImageRequestPricing | undefined

/**
 * Resolve the exact text one durable file occurrence contributes to every
 * provider request in the current execution environment.
 * @param ref - durable verbatim file reference from model history.
 * @returns the same deterministic handle text used at adapter dispatch.
 */
fileRequestText(ref: FileAttachmentRef): string

/**
 * Discover models advertised by one registered provider. Catalog membership
 * is advisory and never changes routing or request validation.
 * @param provider - registered provider route to inspect.
 * @returns detached model metadata in adapter-preferred order.
 */
async listModels(provider: string): Promise<LlmModelInfo[]>

/**
 * Resolve and validate all metadata from the adapter that owns one exact
 * route. The result is detached from adapter-owned objects; catalog
 * membership remains advisory and does not control request routing.
 * @param provider - registered provider route to inspect.
 * @param model - exact model id passed to the adapter.
 * @param signal - optional cancellation for adapter-owned asynchronous lookup.
 * @returns exact model identity plus available context and reasoning metadata.
 */
async resolveModelInfo( provider: string, model: string, signal?: AbortSignal, ): Promise<LlmResolvedModelInfo>

/**
 * Validate a conversation call config against its exact model capability and
 * materialize adapter-configured defaults. Unsupported explicit efforts
 * reject before provider I/O; no clamping or aliasing is performed. This
 * standalone query does not bind a later dispatch; use {@link prepareCall}
 * when logging and streaming must share one adapter registration.
 * @param config - provider/model route and optional request controls.
 * @param signal - optional cancellation for adapter-owned capability lookup.
 * @returns a detached config only when a default must be materialized.
 */
async resolveCallConfig(config: LlmCallConfig, signal?: AbortSignal): Promise<LlmCallConfig>

/**
 * Resolve one call under its current adapter registration. The returned
 * one-shot handle keeps that registration across header logging and dispatch,
 * so HMR cannot combine one adapter's capability result with another adapter.
 * @param config - provider/model route and optional request controls.
 * @param signal - optional cancellation for adapter-owned capability lookup.
 * @returns a prepared config and its registration-bound stream entry point.
 */
async prepareCall(config: LlmCallConfig, signal?: AbortSignal): Promise<PreparedLlmCall>

/**
 * Stream one model call as raw chunks (token-level deltas). Replay state is
 * retained only when the same adapter instance owns its historical provider
 * and the target provider. Final adapter selection remains fixed through
 * asynchronous exact-model resolution and dispatch. Adapter selection,
 * dispatch, and iteration failures become terminal `error` or `aborted`
 * finish chunks; middleware, nested-call, cleanup, and consumer failures
 * remain thrown.
 * @param options - the full request; `options.provider` selects the adapter.
 * @returns the chunk stream, possibly wrapped by `llm/stream` listeners.
 */
stream(options: GenerateOptions): AsyncIterable<StreamChunk>
```

Types: [FileAttachmentRef](attachment.zh.md)

Source: [`packages/llm/llm/src/index.ts`](../../packages/llm/llm/src/index.ts)

<a id="llm-events"></a>

### `llm/*` events

<a id="llmadapters-updated--emit"></a>

#### `llm/adapters-updated` — emit

The provider topology changed: an adapter registered or unregistered routes, or the configurable-provider directory gained or lost entries. This payload-free registry notification fires at each commit point (including registration disposal); consumers re-read `listProviders()`, `listModels()`, or `listConfigurableProviders()` for the new state. Observer failures are contained and cannot veto the registry mutation.

```ts cordis-catalog
/**
 * The provider topology changed: an adapter registered or unregistered
 * routes, or the configurable-provider directory gained or lost entries.
 * This payload-free registry notification fires at each commit point
 * (including registration disposal); consumers re-read `listProviders()`,
 * `listModels()`, or `listConfigurableProviders()` for the new state.
 * Observer failures are contained and cannot veto the registry mutation.
 * @mode emit
 */
'llm/adapters-updated'(): void
```

Source: [`packages/llm/llm/src/types.ts`](../../packages/llm/llm/src/types.ts)

<a id="llmstream--waterfall"></a>

#### `llm/stream` — waterfall

Waterfall around every streaming model call (retry, replay, routing). Bound to the LlmRuntime; call `next()` to reach the resolved adapter's stream, or yield your own chunks to short-circuit.

```ts cordis-catalog
/**
 * Waterfall around every streaming model call (retry, replay, routing).
 * Bound to the {@link LlmRuntime}; call `next()` to reach the resolved
 * adapter's stream, or yield your own chunks to short-circuit.
 * @param options - the full request. A LOOP-built request carries the
 *   process-local {@link markAgentLoopRequest} identity and arrives deep-frozen
 *   (mutation throws): its content is a pure function of the session log (the
 *   reconstructability Agent Note), so listeners read it, never rewrite it.
 *   Hand-built calls do not carry that marker; their messages already obey
 *   the immutable creation contract.
 * @mode waterfall
 */
'llm/stream'(this: LlmRuntime, options: GenerateOptions, next: () => AsyncIterable<StreamChunk>): AsyncIterable<StreamChunk>
```

Source: [`packages/llm/llm/src/index.ts`](../../packages/llm/llm/src/index.ts)
<!-- END GENERATED cordis-surface -->
