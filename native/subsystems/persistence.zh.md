# 會話持久化

[English](persistence.md) | 中文

事件日志的**持久性 seam**。[session.md](session.zh.md) 描述了內存中的 `Session`：僅追加的 `SessionEvent` 日志即為真源。本頁描述如何使該日志持久化：抽象的 `SessionPersistence` 服務、它的提供方模型與隨產品交付的 JSONL 后端、flush 檢查點、崩潰恢復，以及隨日志一同存儲的元數據頭。日志承載的事件詞匯在生成的[持久化日志事件目錄](../persistence-catalog.zh.md)中逐項列舉。

該 seam 是一個[能力 seam](../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.zh.md)：一個抽象服務（[dsh-session-persistence](../../packages/session/session-persistence)，`ctx.sessionPersistence`）在現有 `SessionEvent` 上暴露 `create`/`open`/`stat`/`list`——**沒有平行的持久化事件類型**——其中 `create` 與 `open` 返回逐會話的 `SessionHandle`（`read`/`append`/`flush`/`close`），它承載全部日志訪問與單寫者所有權。倉庫隨產品交付 [dsh-session-persistence-jsonl](../../packages/session/session-persistence-jsonl) 作為其 provider；倉庫外 provider 可以實現同一服務約定。見[基于句柄的持久化 Agent Note](../../.agents/notes/implemented/architecture/2026-08-27-handle-based-session-persistence.zh.md)與 [session-persistence Agent Note](../../.agents/notes/implemented/architecture/2026-06-14-session-persistence.zh.md)。

## `SessionHandle`——通向已存儲會話的一條打開通道

每一次日志讀寫都經由句柄流動，絕不經由按 id 尋址的服務方法：句柄是跨進程寫租約把守的唯一入口。讀取會返回調用方獨占的外層 slice，以及由生產者建立的 event value 別名狀態。一種句柄類型同時服務兩種訪問——在 `read` 句柄上執行修改是運行時的 `SessionReadOnlyError`，而非類型層面的拆分——而進程內單寫者所有權使得在已有活躍持有者時第二次 `open(id, 'write')` 以 `SessionAlreadyOwnedError` 拒絕。

```ts type-equiv
/** One persistence event slice returned by {@link SessionHandle.read}. */
interface SessionHandleReadResult {
  /**
   * Whether event values are exclusively owned or shared only after deep
   * freezing. Slicing preserves the producer's state even when no events remain.
   */
  readonly eventState: SessionSeedEventState
  /** Event values in a caller-owned outer array. */
  readonly events: readonly SessionEvent[]
}
```

```ts type-equiv
/**
 * One open channel onto a stored session. A handle is single-owner state, not
 * a shared service: `read` never backtracks below what this handle already
 * observed, a `write` handle reads its own successful appends, and `close()`
 * is the one teardown (idempotent, uncancellable; `Symbol.asyncDispose`
 * delegates to it). Every operation on a closed handle rejects with
 * `SessionHandleClosedError`.
 *
 * Freshness across handles: once an `append` or `flush` resolves on a write
 * handle, every read STARTED afterwards on the same backend instance — on any
 * handle, or through `stat`/`list` — observes at least that prefix.
 * Reads concurrent with a mutation carry no ordering promise beyond the valid
 * contiguous prefix.
 */
interface SessionHandle extends AsyncDisposable {
  /** The stored session this handle addresses. */
  readonly id: SessionId
  /** The immutable stored header, fixed at `create`/`open`. */
  readonly header: SessionHeader
  /**
   * Exact fork-inherited prefix length stored with the log; `0` when
   * `header.isSeeded` is false. Storage metadata paired with the header for
   * every body read, never part of the replayable event log.
   */
  readonly inheritedEventCount: SessionLogOffset
  /** Whether this handle may mutate the log. */
  readonly access: SessionAccess

  /**
   * Read a slice of the valid contiguous logical log. The slice is a legal log
   * prefix segment: a torn physical tail is never returned, and repeated reads
   * on this handle never observe an older state than a prior read.
   * @param offset - first logical event seq to include; defaults to `0`.
   * @param length - maximum number of events to return; defaults to the rest
   *   of the log. An offset at or past the end returns an empty list.
   * @param options - optional cancellation.
   * @returns the caller-owned outer slice plus the ownership state of its event values.
   */
  read(offset?: number, length?: number, options?: SessionHandleReadOptions): Promise<SessionHandleReadResult>

  /**
   * Append a contiguous batch continuing the current logical end. The first
   * event's `seq` MUST equal the stored next-seq; committed events are never
   * rewritten. Persistence is best-effort: on resolution the batch is
   * accepted, ordered, and visible to reads on this backend instance, but
   * only a resolved {@link flush} promises it survives a crash — a backend
   * may buffer or batch physical writes behind append. Rejects with
   * `SessionReadOnlyError` on a read handle and `SessionOwnershipLostError`
   * when write ownership is gone.
   * @param events - the contiguous batch, in seq order.
   * @param options - optional cancellation observed before the write starts.
   */
  append(events: readonly SessionEvent[], options?: SessionHandleAppendOptions): Promise<void>

  /**
   * The durability barrier — the one operation that promises storage: on
   * resolution every acknowledged append is durable and the session is
   * materialized for other processes; an empty created session becomes
   * durably listable here. Callers that must survive a crash flush; a backend
   * whose `append` already persists on resolution treats this as
   * materialize-if-needed. Rejects with `SessionReadOnlyError` on a read
   * handle.
   * @param options - optional cancellation observed before the barrier starts.
   */
  flush(options?: SessionHandleFlushOptions): Promise<void>

  /**
   * Release the handle: a read handle frees local resources; a write handle
   * completes pending durability and releases write ownership. Idempotent,
   * asynchronous, and deliberately not cancellable.
   */
  close(): Promise<void>
}
```

已創建的會話自 `create` 完成之刻起即可在本進程內被觀察到，而后端可以把物理實體化（純粹的優化）推遲到第一次 `append` 或 `flush`；其他進程只能看到已實體化的會話，一個在崩潰前從未實體化的會話等于從未存在。

## flush 檢查點

`session/event` 是一個*同步*通知；掛載的后端按會話 id 把它路由進活躍寫句柄的有界 write-behind 窗口，而不阻塞生產方（后端一次性安裝這些監聽器，因為持久化已保證每個 id 只有一個活躍寫句柄）。第一個待處理事件會開啟固定的內部批處理窗口，后續事件會加入但不會重置其截止時間。窗口到期后會通過該會話的寫句柄啟動一次持久化 `append`；該次寫入期間接納的事件會獲得自己的截止時間，并形成后續批次。`session/flush` 會取消等待并排空至完全停穩，因此循環仍將其用作在領取下一個普通輪次之前的順序與錯誤觀察檢查點。后臺寫入被拒絕時會按序保留對應事件、暫停自動路徑，并通過 logger 報告；下一次顯式 flush 會重試，并向其調用方響亮地拒絕。`session/disposed` 會執行同樣的最終排空并關閉句柄，而 `close()` 本身會經由仍然打開的存儲排空已路由的緩沖，因此后端 teardown 的關閉清掃不丟任何數據。該窗口只限制有意的批處理等待，不限制事件循環調度或后端完成持久化的延遲。

## 崩潰恢復保留被中斷的輪次

一個在輪次中途崩潰的日志以打開的 `turn/start` 而無 `turn/end` 結束。持久化**不會**截斷或修復它：在長周期任務中，單個輪次可能非常龐大（許多步驟、大量工具輸出），而這些事件在崩潰前已被持久追加。它返回物理上有效的連續日志；只有撕裂物理尾部——屬于一次從未完成的 append——中不完整的碎片會被丟棄：從中恢復的完整記錄（JSONL 后端會部分解碼撕裂的 Zstandard 幀）由寫路徑在句柄的第一次新 append 之前持久重寫。修復是讀方的職責：resume（agent-loop）通過其寫句柄讀取已存儲的日志，計算 `interruptedTurnClosers`——缺失的工具錯誤、任何未閉合的 `step/end`，以及一個合成的 `turn/end { reason: { kind: 'interrupted' } }`——并在發布 Session 之前把它們作為普通批次通過同一句柄追加。`interrupted` 是唯一一個不由循環發出的 `TurnEndReason`（見 [session.md](session.zh.md#why-a-turn-ended-turnendreasonmap)）。

因此修復只在寫所有權之下寫入：活躍會話的寫句柄由其生命周期所有者持有，故并發的 `open(id, 'write')` 會以 `SessionAlreadyOwnedError` 拒絕，而不是讓修復與活躍輪次競速。只讀觀察方（session-query）僅在內存中用同樣的閉合事件配平被中斷的冷日志，不回寫任何內容。

只讀觀察即 `open(id, 'read')`：句柄提供經過驗證的連續前綴切片，絕不返回撕裂尾部，且同一句柄上的重復讀取絕不會觀察到比先前讀取更舊的狀態。持久化側不存在已準備 Session 緩存：session-query 擁有自己的冷讀緩存，按 `stat().revision` 變更令牌為每個 id 緩存一個已配平的冷 Session，僅在令牌變化時重新讀取。該生命周期由[基于句柄的持久化 Agent Note](../../.agents/notes/implemented/architecture/2026-08-27-handle-based-session-persistence.zh.md)定義；已歸檔的 [Session 準備階段記錄](../../.agents/notes/archived/architecture/2026-08-05-session-preparation.md)記載了發布邊界 `SessionPreparation` 最初的決策。

## `SessionLocation`——拒絕診斷的產物目標

`SessionLocation` 不是面向消費者的查詢：日志訪問走會話句柄的 `read`。它僅作為拒絕診斷存在，使 `SessionFormatUnsupportedError` 能指出本構建拒絕解讀的原始日志。JSONL 提供其項目/會話目錄內 transcript（文本記錄）的絕對路徑；沒有逐會話工件的后端則不提供。

```ts type-equiv
/**
 * A backend-resolved, per-session local artifact location. Carried only by
 * refusal diagnostics ({@link SessionFormatUnsupportedError}) so a user can
 * find the raw log a build refused to interpret; it is not a consumer-facing
 * query — log access goes through a session handle's `read`.
 */
interface SessionLocation {
  /** Backend-specific artifact kind, for example `jsonl`. */
  readonly kind: string
  /** Absolute path to this session's backend-owned artifact. */
  readonly path: string
}
```

<a id="sessionheader--metadata-beside-the-log"></a>

## `SessionHeader`：日志旁的元數據

每個會話的元數據與事件日志**分開**存儲：header 攜帶格式版本、cwd 與 `isSeeded` 譜系 bit，含正文的存儲值則在其旁邊單獨攜帶精確 inherited cut。二者都不進入 `SessionEventMap`，也不會到達 `deriveMessages()`。logical header 通過 `session.header` 附加，Session 則以 `inheritedEventCount` 暴露其 cut。

源碼：[`packages/core/session/src/types.ts`](../../packages/core/session/src/types.ts)

```ts type-equiv
/**
 * Immutable validated storage metadata, kept outside the conversation event log.
 */
interface SessionHeader {
  /**
   * Current logical format version, stamped from {@link SESSION_FORMAT_VERSION}.
   * Historical physical headers are translated before entering this interface.
   */
  readonly version: typeof SESSION_FORMAT_VERSION
  /** The session's id (mirrors the {@link Session}'s id). */
  readonly id: SessionId
  /** Non-negative safe-integer Unix epoch milliseconds when the session was created. */
  readonly createdAt: number
  /** Absolute working directory the session was created in (if any). */
  readonly cwd?: string
  /** The session this one was forked from (seed lineage), if any. */
  readonly parentSession?: SessionId
  /**
   * Whether this Session contains a fork-inherited event prefix. The exact prefix
   * length is Session state rather than ordinary header metadata.
   */
  readonly isSeeded: boolean
  /**
   * Coarse product classification for a session created as a subagent child.
   * This is presentation metadata, not proof that the child is continuable.
   */
  readonly origin?: 'subagent'
  /**
   * Delegation depth: absent (zero) for a top-level session, parent depth + 1
   * for a subagent child. Persisted so a recursion budget survives restart and
   * resume — a runtime-only depth would reset a resumed child to top-level.
   */
  readonly delegationDepth?: number
  /**
   * Id of the agent preset this session's agent was composed from, when the
   * deployment composes per session. Durable because the preset decides the
   * session's tools and prompt: a resume that restored a different composition
   * would replay history the model can no longer act on.
   */
  readonly agentPreset?: string
}
```

## 格式拒絕：本構建無法可靠讀取的日志

后端用 `SessionFormatUnsupportedError` 拒絕無法可靠解讀的日志，它與 `SessionPersistenceCorruptionError` 區分，因為數據沒有損壞。`stat` 與 `list` 會對最高規范 generation 分類，并在不讀取或改變正文的前提下轉換受支持的歷史 header。歷史 `open` 會共享每個 Session 唯一的一次 migration preparation，再返回當前邏輯值，并保持每個源路徑、字節與 inode 不變。JSONL provider 直接從該內存結果返回讀句柄而不發布；寫 open 則在持有單寫者 claim 與文件 lease 時復用 preparation、排他發布最終 current generation，隨后才返回可寫句柄。即使仍有較舊的可讀 generation，最高的未來 generation 仍會導致拒絕。當前格式恢復會保留已安裝擴展和帶 `ignorable: true` 的未知事件；歷史 v0/v1/v2 遷移則會拒絕未知類型，即使它帶有 ignorable 標記。后端為每個會話保留獨立文件時，消息附上選定的原始日志路徑。倉庫外后端必須在自己的物理格式入口提供等價的僅當前句柄值與方向感知拒絕。[已發布格式遷移決策](../../.agents/notes/implemented/architecture/2026-08-31-released-session-format-migrations.zh.md)負責遷移鏈與不可變發布規則。

## `CreateSessionOptions`：seed 與元數據

通過 store 創建 `Session` 時會接收 `seed`（初始回放或 fork 歷史）、可選的精確 `inheritedEventCount` 與 `meta`（store 整合進 `SessionHeader` 的存儲層字段）。store 填充 `version`/`id` 并為 `createdAt` 提供默認值；調用方可以提供已校驗的絕對 `cwd`、`parentSession` 譜系、`isSeeded` 譜系標記、可選的粗粒度 `origin`、`delegationDepth`、用于組裝該 agent（智能體）的 `agentPreset` 以及已有的 `createdAt`。seeded 創建必須顯式提供與 inherited prefix 完全相等的 seed 和精確 cut；constructor 會先在該 cut 追加 child-owned tagged end-seed marker，setup 再添加 child-owned event。`origin: 'subagent'` 讓產品導航能夠隱藏重復的 child 行；它不證明描述符有效，也不證明 child 可以恢復。

```ts type-equiv
/**
 * Options for creating a {@link Session} via the store. `seed` replays/forks
 * an existing event log; `meta` carries the caller-supplied storage fields the
 * store folds into a {@link SessionHeader}.
 */
interface CreateSessionOptions {
  /** Initial replay or fork history supplied at construction. */
  readonly seed?: readonly SessionEvent[]
  /**
   * Exact fork-inherited prefix length when `meta.isSeeded` is true. The
   * constructor seed is exactly this inherited prefix; the constructor
   * appends the child-owned tagged marker at the cut.
   */
  readonly inheritedEventCount?: SessionLogOffset
  /**
   * Storage metadata read once before publication. `isSeeded` marks fork
   * lineage; supplying replay history alone does not make it inherited.
   */
  readonly meta?: {
    readonly cwd?: string
    readonly parentSession?: SessionId
    readonly createdAt?: number
    readonly isSeeded?: boolean
    readonly origin?: 'subagent'
    readonly delegationDepth?: number
    readonly agentPreset?: string
  }
}
```

因此，回放/fork 的調用方式為 `ctx.agents.create({ sessionId, seed, meta })`——fork 還會隨 `meta.isSeeded: true` 提供 `inheritedEventCount`，且只有經 agent-loop 發布的會話才會持久化，且循環會在發布之前通過新會話的寫句柄存儲 seed；將一個*持久化*會話恢復為活躍 agent 的調用方式為 `ctx.agents.resume({ resumeSessionId })`。

## 準備與恢復所有權

`SessionStore.prepare()` 接收普通創建選項，或通過 `RestoredSessionOptions` 接收可直接接管的 seed。它的 `eventState` 表明 event value 是獨占對象，還是只有深度凍結后的共享對象；生產者負責建立該狀態，slice 不會根據結果長度推斷其他狀態。恢復流程會校驗并直接接管這些值，不再復制或凍結。`SessionPreparation` 隨后持有該精確的未發布 Session，直至發布或回滾；dispose 是同步且冪等的。agent-loop 的 resume 通過該會話的寫句柄讀取這份結果，并在準備之前追加獨占的 `interruptedTurnClosers`。

```ts type-equiv
/**
 * Aliasing state of an adoptable Session seed. `shared-frozen` permits deeply
 * frozen aliases plus independently owned unfrozen values in the same seed.
 */
type SessionSeedEventState = 'detached' | 'shared-frozen'
```

```ts type-equiv
/**
 * Adoptable storage values transferred to {@link SessionStore.prepare}
 * without another copy or freeze pass.
 */
interface RestoredSessionOptions {
  /** Events that are independently owned or already deeply frozen. */
  readonly seed: SessionEvent[]
  /** Independently owned storage metadata to validate and freeze in place. */
  readonly meta: SessionHeader
  /** Exact number of fork-inherited leading events decoded from storage. */
  readonly inheritedEventCount: SessionLogOffset
  /** Aliasing state carried from the operation that produced the seed. */
  readonly eventState: SessionSeedEventState
}
```

```ts type-equiv
/** Inputs accepted while constructing an unpublished Session. */
type PrepareSessionOptions =
  | (CreateSessionOptions & { readonly eventState?: undefined })
  | RestoredSessionOptions
```

```ts type-equiv
/** Options for a preparation whose provider retains unpublished state. */
interface SessionPreparationOptions {
  /** Release provider-owned state when the Session was not published. */
  readonly release?: () => void
}
```

```ts public-api
/**
 * One exact unpublished Session and the provider state that keeps it usable.
 * Disposal is synchronous and idempotent. Providers decide whether release
 * returns the Session to a cache or discards it; publication may consume that
 * state before disposal, making the callback a no-op.
 */
declare class SessionPreparation implements Disposable {
  /** The exact Session to use for setup and publication. */
  readonly session: Session;
  /**
   * Wrap an unpublished Session in one preparation lifetime.
   * @param session - exact unpublished Session.
   * @param options - optional provider release behavior.
   * @returns a preparation disposed after publication or rollback.
   */
  static create(session: Session, options?: SessionPreparationOptions): SessionPreparation;
  /** Release provider state once when this preparation leaves its caller. */
  [Symbol.dispose](): void;
}
```

## 輕量源修訂號

派生讀取模型的消費方會在加載完整事件日志之前比較一個低開銷的不透明修訂號。該修訂號是來自 `stat`/`list` 的逐后端實例變更令牌：修訂號相等可視為日志未變；不相等則不作任何承諾，且寫所有權的變動絕不會改變修訂號。session-query 以它為鍵管理冷讀緩存；該令牌在 open、read 或 resume 中不起任何作用。

```ts type-equiv
/**
 * Backend-owned token that identifies both one storage source and one revision
 * of a persisted session log.
 */
type SessionPersistenceRevision = Branded<'SessionPersistenceRevision'>
```

```ts type-equiv
/**
 * Lightweight stored-session observation returned by {@link SessionPersistence.stat}
 * and {@link SessionPersistence.list} without reading the full event log.
 */
interface SessionPersistenceSnapshot {
  /** Detached metadata for one stored session. */
  readonly header: SessionHeader
  /** Opaque change token; see {@link SessionPersistence.stat}. */
  readonly revision: SessionPersistenceRevision
  /** Logical event count, when the backend can provide it cheaply from metadata; otherwise absent. */
  readonly eventCount?: number
  /** Physical artifact byte size, when the backend can provide it cheaply (JSONL); otherwise absent. */
  readonly sizeBytes?: number
}
```

可選的 `eventCount`/`sizeBytes` 字段仍是供明確需要它們的 consumer 使用的低成本 backend observation。Session 列表不借助這兩個字段打開冷日志，只讀取 header 與經過 identity 校驗的 projection cache hint，因此 cache 或 Session format 升級不會把啟動變成 body scan。

## 后端

隨產品交付的 provider 實現抽象 `SessionPersistence` 約定（`create`/`open`/`stat`/`list`，逐會話 `SessionHandle` 承載 `read`/`append`/`flush`/`close`，全程可選支持取消），并通過共享的持久化契約套件：

- **[dsh-session-persistence-jsonl](../../packages/session/session-persistence-jsonl)**——逐會話僅追加的邏輯 JSONL 日志，默認存儲為帶 checksum 的連續 Zstandard frame，也可配置為原始行；具備崩潰安全的原子實體化、逐批 `fsync` 的 append，以及在第一次新 append 之前截斷撕裂尾部。`stat`/`list` 攜帶 `sizeBytes` 與盡力而為的、由 `fs.stat` 派生的修訂號。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxsessionpersistence--sessionpersistence-abstract-seam"></a>

### `ctx.sessionPersistence` — `SessionPersistence` (abstract seam)

Durable append-only session storage addressed through per-session handles.

Storage semantics shared by every backend: events are contiguous from seq 0 and never rewritten; a torn physical tail is never returned to a reader and is truncated by the write path before its first append; reads validate current-format records only and refuse unknown vocabulary fail-closed. `append` persists best-effort; `flush` — per handle or service-wide — is the durability barrier.

Visibility: a created session is observable through `stat`/`list`/`open` in this process from the moment `create` resolves, even while a backend defers physical materialization (a pure optimization); other processes see the session only once it materializes, and a session that never materialized before a crash never existed. `SessionHandle.flush` forces materialization.

Freshness: once an `append` or `flush` resolves, reads started afterwards on this backend instance observe at least that prefix.

```ts cordis-catalog
/**
 * Create a new stored session and take its write ownership.
 * @param header - the immutable header (id, version, cwd, lineage) to store.
 * @param options - optional cancellation.
 * @returns a `write` handle owned by the caller; close it to release ownership.
 * @throws {SessionAlreadyExistsError} when the id already exists.
 */
abstract create(header: SessionHeader, options?: SessionPersistenceCreateOptions): Promise<SessionHandle>

/**
 * Open an existing stored session.
 *
 * `read` never takes ownership and works while another handle (or process)
 * holds write ownership. `write` atomically claims single-writer ownership;
 * an existing active owner rejects.
 * @param id - the stored session to open.
 * @param access - `read` or `write`.
 * @param options - optional cancellation.
 * @returns the open handle.
 * @throws {SessionPersistenceNotFoundError} when the session does not exist.
 * @throws {SessionAlreadyOwnedError} for `write` when ownership is taken.
 */
abstract open(id: SessionId, access: SessionAccess, options?: SessionPersistenceOpenOptions): Promise<SessionHandle>

/**
 * Flush every active write handle owned by this service instance in one
 * durability barrier: each handle's routed live events drain durably and
 * its session materializes, exactly as that handle's own
 * `SessionHandle.flush` would. Read handles buffer nothing and are
 * untouched. A handle closed concurrently counts as flushed — close itself
 * drains durably.
 * @returns resolution once every write handle active at the call has flushed.
 * @throws {AggregateError} naming each session whose flush failed; the
 *   remaining handles still flush.
 */
abstract flush(): Promise<void>

/**
 * Observe one stored session without reading its event log or taking
 * ownership.
 *
 * The snapshot's `revision` is an opaque change token comparable only
 * against revisions from the same service instance and session id: equal
 * revisions may be treated as an unchanged log; unequal revisions promise
 * nothing. Write-ownership churn does not change a revision. It exists for
 * derived read-model caches keyed off `stat`/`list`; it plays no part in
 * open, read, or resume.
 * @param id - the stored session to observe.
 * @param options - optional cancellation.
 * @returns the snapshot, or `undefined` when the session does not exist.
 */
abstract stat(id: SessionId, options?: SessionPersistenceStatOptions): Promise<SessionPersistenceSnapshot | undefined>

/**
 * List every stored session visible to this process, in no promised order.
 * @param options - optional cancellation.
 * @returns one snapshot per stored session.
 */
abstract list(options?: SessionPersistenceListOptions): Promise<readonly SessionPersistenceSnapshot[]>
```

Types: [SessionId](core.zh.md)

Source: [`packages/session/session-persistence/src/index.ts`](../../packages/session/session-persistence/src/index.ts)
<!-- END GENERATED cordis-surface -->
