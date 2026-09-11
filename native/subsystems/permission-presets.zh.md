# 權限預設

[English](permission-presets.md) | 中文

[dsh-permission-presets](../../packages/interaction/permission-presets) 的權限預設層（`ctx.permissionPresets`，`PermissionPresetService`）把兩個相互獨立的強制執行 knob，即[沙箱模式](sandbox.zh.md)（`sandbox/mode`）與[審批策略](approval.zh.md)（`approval/policy`），捆綁成具名預設，供客戶端作為單個權限（Permissions）選擇器提供。它是一項可選能力，不屬于 agent loop（智能體循環）主干，也不擁有任何強制執行：執行、提示詞敘述與回放仍然讀取各自 knob的折疊結果，預設切換只記錄意圖，并通過每個 knob各自的規范 setter 寫入。[包 README](../../packages/interaction/permission-presets/README.zh.md) 負責組合狀態與限制；[沙箱切換設計](../../.agents/notes/implemented/feature/2026-07-06-sandbox.zh.md)負責決策依據。

源碼：[`packages/interaction/permission-presets/src/index.ts`](../../packages/interaction/permission-presets/src/index.ts)

## 預設表

預設是一個表鍵，映射到一個沙箱／審批組合，外加可選的客戶端展示信息；默認預設表自帶 `workspace-write`（`workspace-write` + `ask`）和 `danger-full-access`（`danger-full-access` + `never`）。

```ts type-equiv
/** One preset's sandbox/approval bundle and optional client presentation. */
interface PresetSpec {
  /** The `sandbox/mode` value the preset writes through. */
  sandbox: SandboxMode
  /** The `approval/policy` value the preset writes through. */
  approval: ApprovalPolicy
  /** The display label a client shows for this preset; the raw table key when omitted. */
  name?: string
  /** One user-facing sentence on what the preset means; omitted when not configured. */
  description?: string
}
```

```ts type-equiv
/** The {@link PermissionPresetService} config: preset table and composition default. */
interface Config {
  /**
   * The preset table: name → knob bundle. Defaults to `workspace-write`
   * (workspace-write + ask) and `danger-full-access` (danger-full-access +
   * never). The name `custom` is reserved for the derived not-a-preset state.
   */
  presets?: Record<string, PresetSpec>
  /**
   * Default for new sessions. When omitted, the preset matching the composed
   * sandbox and approval defaults is used.
   */
  defaultPreset?: string
}
```

該服務要求一個施加隔離的 `ctx.shell` 執行器和 `ctx.approval`，配置錯誤在插件加載時即失敗：名為 `custom` 的表項會拋出異常（該名稱保留給派生的「非預設」狀態）；在不施加隔離的 bash 執行器（沒有 `sandboxMode` 能力事實）之上組合同樣拋出異常，因為預設捆綁了一個沙箱模式。

## 當前預設與派生的 `custom`

`current(session)` 從可選注冊的 `permissions` 投影派生實際生效的預設。該單元折疊會話的沙箱模式、審批策略和已記錄選擇；狀態內部的缺失值回退到執行器配置的模式與審批服務配置，最后回退到 `ask`。注冊表或投影 key 缺失時會顯式失敗。服務優先取仍然匹配的選擇，其次取聲明順序中第一個匹配的表項，否則返回 `CUSTOM_PRESET`（`'custom'`）。`custom` 只是派生值：客戶端可以把它顯示為當前值，但它絕不是切換目標，也絕不出現在事件 payload 中。

`names` 按預設表聲明順序列出可切換的預設；`optionOf(name)` 為某個表鍵（label 回退為該鍵）或 `custom` 構建客戶端渲染的選項，傳入其他任何名稱都會拋出異常。

```ts type-equiv
/** The select-option shape a presentation layer advertises for one preset (or for the derived `custom` state). */
interface PresetOption {
  /** Stable option value: the table key, or `custom`. */
  value: string
  /** The display label. */
  name: string
  /** One user-facing sentence on what the value means; omitted when not configured. */
  description?: string
}
```

## 切換與 `permission/preset` 事件

`set(session, name)` 解析預設（未知名稱拋出異常），在 `name` 尚不是生效預設時追加一條僅記日志的 `permission/preset` 事件，然后通過各旋鈕自己的 setter（[dsh-sandbox-policy](../../packages/sandbox/sandbox-policy) 的 `setSandboxMode` 與 [dsh-user-approval](../../packages/interaction/user-approval) 的 `setApprovalPolicy`）寫入，且僅當該 knob的生效值發生變化時才寫。同一輪次內，選擇事件先于旋鈕事件出現；重新選擇當前生效的預設則什么都不追加。

`permission/preset` 是持久、僅記日志的用戶意圖：它不進入模型 transcript（文本記錄），模型可見的后果由 knob 事件經各自消費方承擔；它存在是為了在兩個預設共享同一個旋鈕組合時，讓 `current()` 仍能保住用戶選擇的究竟是哪一個預設。`permissions` 投影把該選擇與兩個 knob 事件一同折疊，并保留用于區分空恢復 seed 與新會話的 `session/end-seed` 邊界；回放不需要任何追趕狀態或原始日志重掃。完整事件聲明見[持久化日志事件目錄](../persistence-catalog.zh.md)；方法簽名見生成的[服務目錄](#ctxpermissionpresets--permissionpresetservice)。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxpermissionpresets--permissionpresetservice"></a>

### `ctx.permissionPresets` — `PermissionPresetService`

Owns the deployment's permission presets and their write path. Requires a confining `ctx.shell` executor and `ctx.approval`; unmatched knob values are reported as CUSTOM_PRESET, not an error.

```ts cordis-catalog
/**
 * Resolve the preset matching the effective knob values. A still-matching
 * last selection wins shared-bundle ties; otherwise the first table match
 * wins, or {@link CUSTOM_PRESET} when no entry matches.
 * @param session - the session whose knob state is read.
 * @returns the effective preset name, or `custom` when nothing matches.
 */
current(session: Session): string

/**
 * Build the whole select value for one folded knob state: every table
 * option in declaration order, `custom` appended exactly while derived.
 * @param state - the folded knob overrides.
 * @returns the `permissions` projection payload.
 */
selectFor(state: KnobState): PermissionSelect

/**
 * Resolve a preset's knob bundle.
 * @param name - the preset name to resolve.
 * @returns the configured bundle.
 * @throws when `name` is not in the table.
 */
resolve(name: string): PresetSpec

/**
 * Build the client option for a table entry or {@link CUSTOM_PRESET}. A
 * missing label falls back to the table key.
 * @param name - a table key, or `custom`.
 * @returns the option a client renders.
 * @throws when `name` is neither a table key nor `custom`.
 */
optionOf(name: string): PresetOption

/**
 * Record a changed preset, then update each changed knob through its own
 * setter. Selecting the effective preset again appends nothing.
 * @param session - the session the switch belongs to.
 * @param name - the preset to switch to; unknown names throw.
 */
set(session: Session, name: string): void
```

Types: [Session](session.zh.md)

Source: [`packages/interaction/permission-presets/src/index.ts`](../../packages/interaction/permission-presets/src/index.ts)
<!-- END GENERATED cordis-surface -->
