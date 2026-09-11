# 工作區

[English](workspace.md) | 中文

工作區（workspace）是用戶工作目錄的持久記錄：一個建立在規范路徑之上的穩定 id、一個顯示標題，以及歸屬于它的會話的有序賬本。該子系統是單個包（package）（[dsh-workspace](../../packages/workspace/workspace)，`ctx.workspaceRegistry`）——一項宿主側可選能力，不屬于 agent loop（智能體循環）主干，并且對模型不可見（沒有工具、沒有提示詞文本、沒有會話事件）。它通過[存儲領域數據形式](storage.zh.md)存儲自己的記錄，并對照 [`SessionHeader.cwd`](persistence.zh.md#sessionheader--metadata-beside-the-log) 校驗會話成員資格，因此 `storageDomain` 與 `sessionPersistence` 是必需的啟動依賴：持久化這一依賴不可用時，插件保持 pending，而不是把這種不可用誤當作空歷史。設計記錄：[領域 KV 存儲 Agent Note（agent 決策記錄）](../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.zh.md)；引導與 GUI 順序：[Workspace UI 產品流程 Agent Note](../../.agents/notes/archived/feature/2026-07-25-workspace-ui-product-flow.md)。

源碼：[`packages/workspace/workspace/src/types.ts`](../../packages/workspace/workspace/src/types.ts)

## 標識

```ts type-equiv
/**
 * Identifies one workspace record. A generated uuid, never the path: path
 * normalization rewrites paths, and a reference anchor must stay stable.
 */
type WorkspaceId = Branded<'WorkspaceId'>
```

`WorkspaceId` 是[品牌化 id](core.zh.md#branded-ids)。路徑標識與之分離：`realpathNormalize`（`fs.realpath`；尾部斜杠、`..` 與符號鏈接全部解析）是唯一的一套唯一性規范——工作區路徑以規范化形式存儲，唯一性即規范路徑的字符串相等（指向已被擁有目錄的符號鏈接會與之沖突），attach 時的會話 cwd 檢查也走同一套規范。

## 工作區實體

消費方只看到 `Workspace` 接口；實現保持包內私有。

```ts type-equiv
/**
 * One workspace: a stable id over an existing directory, a display title, and
 * an ordered candidate account of sessions. Membership requires both an id in
 * that account and a session header whose canonical cwd equals the workspace
 * path. Consumers only see this interface; the implementation stays private.
 */
interface Workspace {
  /** Stable record id (generated uuid). */
  readonly id: WorkspaceId

  /**
   * Canonical directory path: the `fs.realpath` of the path given at create
   * time (trailing slashes, `..`, and symlinks all resolved). Never rewritten
   * afterwards, even when the directory disappears (see {@link status}).
   */
  readonly path: string

  /** Display title. Defaults to the final path segment, or a filesystem root's own spelling; duplicates are allowed. */
  readonly title: string

  /** ISO-8601 creation instant, stamped at create and never rewritten. */
  readonly createdAt: string

  /** ISO-8601 instant of the last durable mutation (create counts as one). */
  readonly updatedAt: string

  /**
   * Header-validated sessions in manually owned order: a new session is
   * prepended at attach, explicit reordering goes through
   * `insertSessionBefore`, and activity never reorders. The durable candidate
   * account is filtered synchronously: missing headers, invalid cwd values,
   * and canonical cwd mismatches are never returned. A subsequent workspace
   * mutation prunes those filtered candidates durably.
   */
  readonly sessionIds: readonly SessionId[]

  /**
   * Replace the display title durably.
   * @param title - New title; any string, duplicates across workspaces allowed.
   * @returns resolution after durability.
   */
  setTitle(title: string): Promise<void>

  /**
   * Prepend a session to this workspace's candidate account. An already
   * accounted id resolves without writing, aside from the durable
   * filtered-candidate prune every accepted mutation performs. A new id's
   * live or persisted
   * header cwd must resolve to an existing directory equal to {@link path};
   * unknown ids, missing or invalid cwd values, and mismatches reject without
   * writing.
   * @param sessionId - The session to record.
   * @returns resolution after durability.
   */
  attachSession(sessionId: SessionId): Promise<void>

  /**
   * Move an accounted session within the manual order, DOM-insertBefore-like:
   * with an anchor the session lands before it, without one it appends to the
   * end. Only the moved id changes position. A session or anchor absent from
   * the account rejects without writing; a move to the current position
   * resolves without writing, aside from the durable filtered-candidate
   * prune every accepted mutation performs; decided on the domain write
   * chain.
   * @param sessionId - The accounted session to move.
   * @param beforeSessionId - Accounted anchor to insert before; omitted appends.
   * @returns resolution after durability.
   */
  insertSessionBefore(sessionId: SessionId, beforeSessionId?: SessionId): Promise<void>

  /**
   * Remove a session from this workspace's account. Idempotent: an id not on
   * the account resolves without writing, aside from the durable
   * filtered-candidate prune every accepted mutation performs; decided on
   * the domain write chain like attach. Never touches the session's own stored log.
   * @param sessionId - The session to remove.
   * @returns resolution after durability.
   */
  detachSession(sessionId: SessionId): Promise<void>

  /**
   * Live directory check, uncached: whether {@link path} currently exists and
   * is a directory. A missing directory never mutates the record — the
   * directory may only be temporarily moved.
   * @returns `'ok'` when the directory exists, `'missing-dir'` otherwise.
   */
  status(): Promise<'ok' | 'missing-dir'>
}
```

所有權的真源是記錄中有序的 `sessionIds`，絕不從會話 cwd 派生——但成員資格要求兩者同時成立：賬本上有其 id，且 header 的規范 cwd 等于工作區路徑，因此一個會話在結構上至多屬于一個工作區。失敗的寫入會拒絕（`insertSessionBefore` 的賬本錯誤以 `WorkspaceMoveInvalidError` 拒絕，存儲失敗以普通錯誤拒絕）；每次被接受的變更都蓋上 `updatedAt` 時間戳，并持久修剪不再通過成員資格檢查的候選項。

## 注冊表：`ctx.workspaceRegistry`

`WorkspaceRegistry`（[簽名](#ctxworkspaceregistry--workspaceregistry)）擁有注冊與解析。`create(path, title?)` 要求完全限定路徑并將其規范化，拒絕不存在的路徑（原樣傳出原始 `ENOENT`）或非目錄；當規范路徑已被擁有時原樣返回既有實體；否則創建一條標題為 `title ?? defaultWorkspaceTitle(path)` 的記錄并前插到持久的注冊表順序中（不同規范路徑可以共享同一顯示標題，沒有最終路徑段時使用根路徑拼寫）。`get(id)` 與有序的 `list()` 是同步緩存讀取；`resolveByPath(path)` 應用同一套完全限定 realpath 規范但不創建。`delete(id)` 只移除注冊記錄、順序條目和會話賬本——目錄、用戶文件、實時會話和已持久化日志一概不動，因此這些會話變為 Ungrouped（[決策](../../.agents/notes/implemented/feature/2026-07-27-workspace-registration-deletion.zh.md)）；未知 id 返回 `false`。create 與 delete 會在其兩次寫入（記錄 + 順序）可能分叉之前先持久寫入一個待定變更標記；啟動時恰好解決被標記的那次變更——通過刪除被標記的表行：這會補完被中斷的 delete，并回滾被中斷的 create（注冊可以重建，因此回滾是安全方向）——而沒有標記的順序/表不一致則作為損壞大聲失敗。

會話的 cwd 在創建時由創建者賦予，而不是由本注冊表賦予——API 網關從所選工作區的 `path` 解析新會話的 cwd（回退到顯式或默認 cwd），先創建會話使 cwd 落入其不可變的 [`SessionHeader`](persistence.zh.md#sessionheader--metadata-beside-the-log)，再調用 `attachSession`，后者會把已存儲的 header cwd 與工作區路徑重新校驗一遍。首次成功啟動時，注冊表僅憑已持久化的 header（`id`、`cwd`、`createdAt`——絕不讀事件正文）引導歷史：把規范 cwd 有效的會話按目錄分組為工作區，最新的排在最前；「已初始化」標記最后寫入，因此被中斷的引導可以安全續跑。引導只發生這一次：沒有 cwd 的歷史遺留會話保持 Ungrouped，此后創建的會話只能通過 `attachSession` 加入工作區。

## 消費方

[`dsh-workspace-controller`](../../packages/api/workspace-controller) 經 `ctx.workspaceRegistry` 向 GUI 客戶端提供工作區 CRUD，[`dsh-session-controller`](../../packages/api/session-controller) 執行上文「先建會話再 attach」的流程。[dsh-agent-instructions](../../packages/context/agent-instructions) 盡管名字如此，卻**不是**消費方：它在 agent 自己的 cwd 下發現 AGENTS.md 風格的指令文件，從不觸碰 `ctx.workspaceRegistry`——兩者共用的這個詞指的是用戶的工作目錄，而非本注冊表的實體。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxdirectorypicker--directorypicker-abstract-seam"></a>

### `ctx.directoryPicker` — `DirectoryPicker` (abstract seam)

Abstract directory-picking service. Subclass, implement `capability()`, and load the subclass as a plugin — it registers as `ctx.directoryPicker` (one implementation per context; loading a second throws, cordis' standard duplicate-service behavior). The capability object must be stable for the service lifetime: consumers may capture it across calls.

```ts cordis-catalog
/**
 * The backend's interaction capability.
 * @returns the discriminated capability consumers switch on.
 */
abstract capability(): DirectoryPickerCapability
```

Source: [`packages/host/directory-picker/src/index.ts`](../../packages/host/directory-picker/src/index.ts)

<a id="ctxdirectorypickercontroller--directorypickercontroller"></a>

### `ctx.directoryPickerController` — `DirectoryPickerController`

Host service backing the generated `ctx.remote.directoryPicker` namespace. The seam it exports is abstract and therefore never a Loader entry of its own, so this controller carries the wire verbs: one composed backend serves either the native chooser or the browse primitives, and a verb the composition cannot serve is refused rather than approximated.

```ts cordis-catalog
/**
 * Open the host's OS chooser for a Remote caller.
 * @param signal - caller lifetime; abort terminates the chooser.
 * @returns the chosen absolute path, or null when the operator cancels.
 */
@Remote('pick') async pick(signal: AbortSignal): Promise<string | null>

/**
 * List one directory level for a Remote caller's in-app browser.
 * @param path - absolute directory to list; absent lists the home directory.
 * @param signal - caller lifetime; abort stops the backend's scan instead of
 *   letting it outlive a disconnected caller.
 * @returns the level's listing with its ancestry.
 */
@Remote('list') async list(path: string | undefined, signal: AbortSignal): Promise<DirectoryListing>

/**
 * Create one child directory for a Remote caller's in-app browser.
 * @param path - absolute existing parent directory.
 * @param name - single non-blank path segment.
 * @returns the created directory's absolute path.
 */
@Remote('createDirectory') async createDirectory(path: string, name: string): Promise<string>
```

Source: [`packages/api/workspace-controller/src/directory-picker.ts`](../../packages/api/workspace-controller/src/directory-picker.ts)

<a id="ctxworkspacecontroller--workspacecontroller"></a>

### `ctx.workspaceController` — `WorkspaceController`

Host service backing the generated `ctx.remote.workspace` namespace.

```ts cordis-catalog
/**
 * Create or idempotently resolve one Workspace over an existing directory.
 * @param request - directory path to register.
 * @returns the Workspace and whether this call created it.
 */
@Remote('create') create(request: WorkspaceCreateRequest): Promise<WorkspaceCreateValue>

/**
 * Rename one Workspace to a unique non-blank title.
 * @param request - Workspace identity and proposed title.
 * @returns the updated Workspace projection.
 */
@Remote('rename') rename(request: WorkspaceRenameRequest): Promise<WorkspaceValue>

/**
 * Remove one Workspace registration while retaining files and Sessions.
 * @param request - Workspace identity to remove.
 * @returns deletion confirmation.
 */
@Remote('delete') delete(request: WorkspaceDeleteRequest): Promise<WorkspaceDeleteValue>

/**
 * Move one Workspace within the registry display order.
 * @param request - moved Workspace and optional anchor.
 * @returns the complete resulting Workspace order.
 */
@Remote('insertBefore') insertBefore(request: WorkspaceInsertBeforeRequest): Promise<WorkspaceOrderValue>

/**
 * Move one accounted Session within a Workspace.
 * @param request - Workspace, Session, and optional anchor identities.
 * @returns the updated Workspace projection.
 */
@Remote('insertSessionBefore') insertSessionBefore(request: WorkspaceInsertSessionBeforeRequest): Promise<WorkspaceValue>

/**
 * Hide one known Session from Workspace grouping surfaces.
 * @param request - Session identity to archive.
 * @returns the complete resulting archive set.
 */
@Remote('archiveSession') archiveSession(request: WorkspaceArchiveSessionRequest): Promise<WorkspaceArchiveValue>

/**
 * Stream a complete Workspace baseline followed by ordered increments.
 * @param signal - generation cancellation.
 * @returns baseline followed by ordered Workspace increments.
 */
@Remote({ mode: 'stream' }) follow(signal: AbortSignal): AsyncIterable<WorkspaceFollowFrame>
```

Source: [`packages/api/workspace-controller/src/index.ts`](../../packages/api/workspace-controller/src/index.ts)

<a id="ctxworkspacefiles--workspacefiles"></a>

### `ctx.workspaceFiles` — `WorkspaceFiles`

Host Remote file reads and workspace directory observations over the composed filesystem.

```ts cordis-catalog
/**
 * Read one page of lines from a UTF-8 file readable by the filesystem backend.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param path - absolute path or path relative to the workspace root; files outside it are allowed.
 * @param range - the line window; omitted fields take the page defaults.
 * @param signal - caller cancellation.
 * @returns the page, the file's version at the stat before it, and whether it reaches the last line.
 */
@Remote async read( workspaceFileScope: WorkspaceFileScope, path: string, range: WorkspaceFileRange, signal: AbortSignal, ): Promise<WorkspaceFileText>

/**
 * Read one byte window of a regular file readable by the filesystem backend: raw
 * bytes, no text decoding and no binary rejection.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param path - absolute path or path relative to the workspace root; files outside it are allowed.
 * @param range - the byte window; omitted fields take the window defaults.
 * @param signal - caller cancellation.
 * @returns the window in base64, the file's version and size at the stat before it, and whether it reaches the last byte.
 */
@Remote async readBytes( workspaceFileScope: WorkspaceFileScope, path: string, range: WorkspaceByteRange, signal: AbortSignal, ): Promise<WorkspaceFileBytes>

/**
 * Read a complete regular file as bytes, subject to the configured full-file cap.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param path - absolute or workspace-relative file path.
 * @param signal - caller cancellation.
 * @returns one complete base64 window with offset zero and eof true; oversized files fail with too-large.
 */
@Remote async readAll(workspaceFileScope: WorkspaceFileScope, path: string, signal: AbortSignal): Promise<WorkspaceFileBytes>

/**
 * Read a complete file relative to another file's directory, including outside the workspace.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param path - base file, absolute or workspace-relative.
 * @param relativePath - relative filesystem path, not a URL or absolute path.
 * @param signal - caller cancellation.
 * @returns the complete related file using the ordinary file-size and access checks.
 */
@Remote async readRelated( workspaceFileScope: WorkspaceFileScope, path: string, relativePath: string, signal: AbortSignal, ): Promise<WorkspaceFileBytes>

/**
 * Report one regular file's identity, version, and size without its content.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param path - absolute path or path relative to the workspace root; files outside it are allowed.
 * @param signal - caller cancellation.
 * @returns the file's absolute path, current version, and byte size.
 */
@Remote async stat(workspaceFileScope: WorkspaceFileScope, path: string, signal: AbortSignal): Promise<WorkspaceFileStat>

/**
 * List the direct children of one directory inside the Session's workspace.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param path - workspace path, absolute or relative to the workspace root.
 * @param signal - caller cancellation.
 * @returns the directory's children in the backend's stable name order, bounded by the entry cap.
 */
@Remote async list(workspaceFileScope: WorkspaceFileScope, path: string, signal: AbortSignal): Promise<WorkspaceDirectoryListing>

/**
 * Stream every `fs/observed` observation of a file inside the Session's
 * workspace. Only instrumented filesystem operations report here; the OS is
 * not watched.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param signal - generation cancellation.
 * @returns `ready` once the Host observation queue is active and the workspace
 *   root is resolved, then queued and live observations in emission order.
 */
@Remote({ mode: 'stream' }) changes(workspaceFileScope: WorkspaceFileScope, signal: AbortSignal): AsyncIterable<WorkspaceFileWatchFrame>
```

Source: [`packages/api/workspace-files/src/index.ts`](../../packages/api/workspace-files/src/index.ts)

<a id="ctxworkspaceregistry--workspaceregistry"></a>

### `ctx.workspaceRegistry` — `WorkspaceRegistry`

Durable workspace registry. Startup waits for `sessionPersistence`, builds one canonical-cwd header index, and completes the one-time history bootstrap before the service becomes active. The persistence dependency is mandatory so an unavailable peer can never be mistaken for an empty history and commit the initialized marker.

```ts cordis-catalog
/**
 * Create or reuse a workspace for an existing directory. The fully qualified
 * path is canonicalized through `fs.realpath`; a relative, nonexistent, or
 * non-directory path rejects. Repeated calls for the same canonical path
 * return the existing entity without changing its title.
 * A newly created workspace is prepended to the durable registry order.
 * Different canonical paths may share a display title.
 * @param path - Existing directory to own, in a fully qualified path spelling.
 * @param title - Display title used only when a new record is created.
 * @returns the existing or newly durable workspace.
 */
async create(path: string, title?: string): Promise<Workspace>

/**
 * Look up a workspace by id.
 * @param id - Workspace id.
 * @returns the workspace, or `undefined` when unknown.
 */
get(id: WorkspaceId): Workspace | undefined

/**
 * Synchronous workspace projection in durable registry order. Every
 * entity's `sessionIds` getter is already filtered by the startup/live
 * canonical-cwd header index; this method performs no persistence reads.
 * @returns a fresh ordered array of workspace entities.
 */
list(): Workspace[]

/**
 * Delete one workspace registration while retaining its directory and every
 * session log. The durable order is updated before the table deletion; a
 * failed table write restores the prior order and keeps the entity
 * published. Unknown ids are an idempotent no-op for domain callers.
 * @param id - Workspace registration to remove.
 * @returns `true` when a record was deleted, `false` when it was unknown.
 */
delete(id: WorkspaceId): Promise<boolean>

/**
 * Move one workspace within the durable display order, DOM-insertBefore-like.
 * With an anchor it lands before that workspace; without one it appends.
 * @param id - Workspace to move.
 * @param beforeId - Workspace anchor; omitted appends.
 * @returns the complete committed workspace order.
 */
insertBefore(id: WorkspaceId, beforeId?: WorkspaceId): Promise<readonly WorkspaceId[]>

/**
 * Archive one session durably. The session must exist (live or in session
 * persistence); its workspace accounting — or lack of one — is irrelevant.
 * An already archived id resolves without writing.
 * @param sessionId - The session to archive.
 * @returns resolution after durability.
 */
archiveSession(sessionId: SessionId): Promise<void>

/**
 * Resolve by canonical directory path without creating or mutating a
 * workspace. A missing path rejects during `realpath`; an existing unowned
 * directory returns `undefined`.
 * @param path - Existing directory path in a fully qualified spelling.
 * @returns the workspace owning the canonical path, when one exists.
 */
async resolveByPath(path: string): Promise<Workspace | undefined>
```

Types: [SessionId](core.zh.md)

Source: [`packages/workspace/workspace/src/index.ts`](../../packages/workspace/workspace/src/index.ts)
<!-- END GENERATED cordis-surface -->
