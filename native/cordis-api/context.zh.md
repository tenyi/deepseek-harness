<!-- 英文源文件由 scripts/gen-cordis-catalog.ts 生成；本中文文件是通過雙語配對維護的經評審對側。
     更新時先運行 `pnpm run gen-cordis-catalog` 更新英文，再更新本文件并運行 `pnpm run verify-translation-pairing --write docs/cordis-api/context.md` 重新記錄配對。 -->

# 上下文

[English](context.md) | 中文

上下文是 Cordis 的核心對象：所有服務、事件和生命周期 API 都通過 `ctx` 訪問。事件方法見[事件](events.zh.md)，副作用與當前 fiber 見 [Fiber](fiber.zh.md)，插件加載見[注冊表](registry.zh.md)。

Cordis 插件的根依賴容器和子依賴容器。

上下文是一個代理：普通屬性讀取通過服務解析器進行，而 `extend()`、`isolate()` 和 `intercept()` 會創建有作用域的子上下文，且不修改其父上下文。

[源碼](../../vendor/cordis/src/context.ts#L42)

### ctx.extend(meta?)

```ts cordis-catalog
/**
 * Create a child context with extra metadata on top of the current scope.
 *
 * The child prototypally inherits every property of this context; own
 * properties of `meta` shadow the inherited ones. The parent is not mutated.
 *
 * @param meta — own properties (including symbol keys) to define on the child.
 * @returns a child context inheriting from this one.
 */
extend(meta = {}): this
```

在當前作用域之上創建一個帶有額外元數據的子上下文。

子上下文通過原型繼承當前上下文的所有屬性；`meta` 的自有屬性會遮蔽繼承的同名屬性。父上下文不會被修改。

- `meta`：要在子上下文上定義的自有屬性，包括以 symbol 為鍵的屬性。

**返回**繼承自當前上下文的子上下文。

[源碼](../../vendor/cordis/src/context.ts#L99)

### ctx.isolate(name, label?)

```ts cordis-catalog
/**
 * Create a child context with an independent service scope for `name`.
 *
 * Below the returned context, reads and writes of the service `name`
 * resolve against the new label instead of the parent's, so a different
 * implementation can be provided without affecting the parent scope.
 * Passing the same `label` to two `isolate()` calls joins their scopes.
 *
 * @param name — the service name to isolate.
 * @param label — scope label to join; defaults to a fresh unique symbol.
 * @returns a child context whose `name` service resolves in the new scope.
 */
isolate(name: string, label?: symbol)
```

創建一個子上下文，使 `name` 擁有獨立的服務作用域。

在返回的上下文之下，對服務 `name` 的讀寫會根據新標簽解析，而不再根據父上下文的標簽解析，因此可以提供不同的實現而不影響父作用域。將同一個 `label` 傳給兩次 `isolate()` 調用，可使二者加入同一作用域。

- `name`：要隔離的服務名稱。
- `label`：要加入的作用域標簽；默認為一個新建的唯一 symbol。

**返回**一個子上下文，其 `name` 服務在新作用域中解析。

[源碼](../../vendor/cordis/src/context.ts#L121)

### ctx.intercept(name, config)

```ts cordis-catalog
/**
 * Add service-specific intercept config for plugins started below this
 * context.
 *
 * Plugins loaded under the returned context see `config` merged into the
 * service's resolved config (ancestor entries first; see
 * `Service[symbols.resolveConfig]`). The parent context is not affected.
 *
 * @param name — the service name whose config to intercept.
 * @param config — the intercept config to merge for that service.
 * @returns a child context carrying the additional intercept entry.
 */
intercept<K extends InjectKey>(name: K, config: Context[K] extends { [symbols.config]: infer T } ? T : never): this
intercept(name: string, config: any): this
```

為在此上下文之下啟動的插件添加服務專屬的攔截配置。

在返回的上下文下加載的插件會看到 `config` 已合并到服務解析后的配置中（祖先條目在前；見 `Service[symbols.resolveConfig]`）。父上下文不受影響。

- `name`：要攔截其配置的服務名稱。
- `config`：要為該服務合并的攔截配置。

**返回**一個攜帶額外攔截條目的子上下文。

[源碼](../../vendor/cordis/src/context.ts#L139)

### ctx.root

```ts cordis-catalog
/** The root context of the application (every child context shares it). @experimental */
root: this
```

應用的根上下文，所有子上下文均共享它。@experimental

[源碼](../../vendor/cordis/src/context.ts#L22)

### ctx.baseUrl

```ts cordis-catalog
/** Base URL used to resolve relative plugin/module specifiers, if the runtime sets one. */
baseUrl?: string
```

用于解析相對插件／模塊說明符的基礎 URL，前提是運行時設置了該值。

[源碼](../../vendor/cordis/src/context.ts#L24)

### ctx.events

```ts cordis-catalog
/** The event bus. Its methods are also mixed onto `ctx` (`ctx.on`, `ctx.emit`, ...). */
events: EventsService
```

事件總線。它的方法也會混入 `ctx`（`ctx.on`、`ctx.emit` 等）。

[源碼](../../vendor/cordis/src/context.ts#L26)

### ctx.logger

```ts cordis-catalog
/** The logging service. Call `ctx.logger(name)` for a named logger. */
logger: LoggerService
```

日志服務。調用 `ctx.logger(name)` 可獲取具名 logger。

[源碼](../../vendor/cordis/src/context.ts#L28)

### ctx.reflect

```ts cordis-catalog
/** The reflection layer backing the context proxy (`ctx.get`, `ctx.provide`, ...). */
reflect: ReflectService
```

為上下文代理提供支持的反射層（`ctx.get`、`ctx.provide` 等）。

[源碼](../../vendor/cordis/src/context.ts#L30)

### ctx.registry

```ts cordis-catalog
/** The plugin registry. Its methods are mixed onto `ctx` (`ctx.plugin`, `ctx.inject`). */
registry: RegistryService
```

插件注冊表。它的方法會混入 `ctx`（`ctx.plugin`、`ctx.inject`）。

[源碼](../../vendor/cordis/src/context.ts#L32)

## 靜態成員

### Context.effect

```ts cordis-catalog
/** Symbol key under which a disposer exposes its {@link EffectMeta} diagnostics tree. */
static readonly effect: unique symbol
```

資源釋放函數用于公開其 EffectMeta 診斷樹的 symbol 鍵。

[源碼](../../vendor/cordis/src/context.ts#L44)

### Context.filter

```ts cordis-catalog
/** Symbol key for a context's listener filter, consulted on every event dispatch. */
static readonly filter: unique symbol
```

上下文監聽器過濾器的 symbol 鍵，每次分派事件時都會查詢該過濾器。

[源碼](../../vendor/cordis/src/context.ts#L46)

### Context.isolate

```ts cordis-catalog
/** Symbol key of the isolation map (see the `Context[symbols.isolate]` property). */
static readonly isolate: unique symbol
```

隔離映射的 symbol 鍵（見 `Context[symbols.isolate]` 屬性）。

[源碼](../../vendor/cordis/src/context.ts#L48)

### Context.intercept

```ts cordis-catalog
/** Symbol key of the intercept map (see the `Context[symbols.intercept]` property). */
static readonly intercept: unique symbol
```

攔截映射的 symbol 鍵（見 `Context[symbols.intercept]` 屬性）。

[源碼](../../vendor/cordis/src/context.ts#L50)

### Context.is(value)

```ts cordis-catalog
/**
 * Returns true for Cordis context proxies and context prototypes.
 *
 * Works across realms and across multiple copies of cordis, because the
 * brand is keyed by a global symbol rather than by `instanceof`.
 *
 * @param value — the value to test.
 * @returns `true` if `value` is a Cordis context, narrowing its type.
 */
static is(value: any): value is Context
```

對于 Cordis 上下文代理和上下文原型，返回 true。

此方法可跨 realm 和多個 cordis 副本工作，因為其品牌標識以全局 symbol 為鍵，而不是通過 `instanceof` 判斷。

- `value`：要測試的值。

**返回** `true` 時，`value` 是 Cordis 上下文，并會收窄其類型。

[源碼](../../vendor/cordis/src/context.ts#L61)

## 服務存儲與混入

### ctx.get(name, strict?)

```ts cordis-catalog
/**
 * Read a service from the store without the inject requirement.
 *
 * @param name — the service name.
 * @param strict — when `true` (default), only return implementations
 * whose providing fiber is currently active.
 * @returns the service value, or `undefined` when not (yet) provided.
 */
get<K extends string & keyof this>(name: K, strict?: boolean): undefined | this[K]
get(name: string, strict?: boolean): any
```

從存儲中讀取服務，無需滿足注入要求。

- `name`：服務名稱。
- `strict`：設為 `true`（默認值）時，僅返回其提供方 fiber 當前處于活動狀態的實現。

**返回**服務值；如果尚未提供，則返回 `undefined`。

[源碼](../../vendor/cordis/src/reflect.ts#L17)

### ctx.set(name, value)

```ts cordis-catalog
/**
 * Overwrite a provided service's value.
 *
 * Only the fiber that provided the service may set it; setting an
 * unprovided name throws.
 *
 * @param name — the service name.
 * @param value — the new service value.
 */
set<K extends string & keyof this>(name: K, value: undefined | this[K]): void
set(name: string, value: any): void
```

覆蓋已提供服務的值。

只有提供該服務的 fiber 才能設置它；設置尚未提供的名稱會拋出異常。

- `name`：服務名稱。
- `value`：新的服務值。

[源碼](../../vendor/cordis/src/reflect.ts#L29)

### ctx.provide(name, value)

```ts cordis-catalog
/**
 * Register a service implementation owned by the current fiber.
 *
 * The service becomes visible to dependents in the same isolation scope
 * once the fiber is active; it is unregistered (waking dependents) when
 * the returned disposer runs or the fiber unloads. Throws if the name is
 * already provided in this scope or declared as an accessor.
 *
 * @param name — the service name.
 * @param value — the service value.
 * @returns a disposer that unregisters the service.
 */
provide<K extends string & keyof this>(name: K, value: undefined | this[K]): () => void
provide(name: string, value?: any): () => void
```

注冊一個歸當前 fiber 所有的服務實現。

fiber 激活后，該服務對同一隔離作用域內的依賴方可見；當返回的資源釋放函數運行或 fiber 卸載時，該服務會被取消注冊，并喚醒依賴方。如果該名稱已在此作用域中被提供，或已聲明為訪問器，則拋出異常。

- `name`：服務名稱。
- `value`：服務值。

**返回**一個用于取消注冊該服務的資源釋放函數。

[源碼](../../vendor/cordis/src/reflect.ts#L44)

### ctx.accessor(name, options)

```ts cordis-catalog
/**
 * Define a computed context property backed by get/set hooks.
 *
 * The accessor is removed when the current fiber unloads. Throws if the
 * name is already declared.
 *
 * @param name — the context property name.
 * @param options — the `get` hook and optional `set` hook.
 */
accessor(name: string, options: Omit<Property.Accessor, 'type'>): void
```

定義一個由 get/set 鉤子支持的計算型上下文屬性。

當前 fiber 卸載時會移除該訪問器。如果該名稱已被聲明，則拋出異常。

- `name`：上下文屬性名稱。
- `options`：`get` 鉤子和可選的 `set` 鉤子。

[源碼](../../vendor/cordis/src/reflect.ts#L56)

### ctx.mixin(name, mixins)

```ts cordis-catalog
/**
 * Expose selected members of a service directly on `ctx`.
 *
 * Each mixed-in key becomes an accessor that forwards to the service
 * (binding methods to it), so e.g. `ctx.on` forwards to `ctx.events.on`.
 * Mixins are removed when the current fiber unloads.
 *
 * @param name — the context property holding the source service.
 * @param mixins — keys to forward, or a source-key → ctx-key map.
 */
mixin<K extends string & keyof this>(name: K, mixins: (keyof this & keyof this[K])[] | Dict<string>): void
mixin<T extends {}>(source: T, mixins: (keyof this & keyof T)[] | Dict<string>): void
```

直接在 `ctx` 上公開服務的指定成員。

每個混入的鍵都會成為一個轉發到該服務的訪問器，并將方法綁定到該服務。例如，`ctx.on` 會轉發到 `ctx.events.on`。當前 fiber 卸載時會移除這些混入。

- `name`：存放源服務的上下文屬性。
- `mixins`：要轉發的鍵，或從源鍵到 ctx 鍵的映射。

[源碼](../../vendor/cordis/src/reflect.ts#L67)
