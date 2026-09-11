<!-- 英文源文件由 scripts/gen-cordis-catalog.ts 生成；本中文文件是通過雙語配對維護的經評審對側。
     更新時先運行 `pnpm run gen-cordis-catalog` 更新英文，再更新本文件并運行 `pnpm run verify-translation-pairing --write docs/cordis-api/service.md` 重新記錄配對。 -->

# Service

[English](service.md) | 中文

上下文服務的基類。以插件形式加載的子類會將自身注冊為 `ctx.<name>`。

用于在 `ctx` 上公開具名 API 的服務基類。

子類在構造函數中調用 `super(ctx, name)`。服務會立即注冊，并隨所屬 fiber 自動移除。

[源碼](../../vendor/cordis/src/service.ts#L11)

### service.name

```ts cordis-catalog
/** The service name this instance is registered under. */
public name!: string
```

此實例注冊時使用的服務名稱。

[源碼](../../vendor/cordis/src/service.ts#L30)

## 靜態成員

### Service.init

```ts cordis-catalog
/** Symbol key of an instance method run after construction (class plugins). */
static readonly init: unique symbol
```

構造完成后運行的實例方法所使用的符號鍵（類插件）。

[源碼](../../vendor/cordis/src/service.ts#L13)

### Service.check

```ts cordis-catalog
/** Symbol key of the availability predicate passed to `ctx.provide()`. */
static readonly check: unique symbol
```

傳給 `ctx.provide()` 的可用性謂詞所使用的符號鍵。

[源碼](../../vendor/cordis/src/service.ts#L15)

### Service.config

```ts cordis-catalog
/** Symbol key of the phantom intercept-config type parameter. */
static readonly config: unique symbol
```

虛設攔截配置類型參數所使用的符號鍵。

[源碼](../../vendor/cordis/src/service.ts#L17)

### Service.invoke

```ts cordis-catalog
/** Symbol key of the call body making a service callable (e.g. `ctx.logger()`). */
static readonly invoke: unique symbol
```

使服務可被調用的調用體所使用的符號鍵（例如 `ctx.logger()`）。

[源碼](../../vendor/cordis/src/service.ts#L19)

### Service.extend

```ts cordis-catalog
/** Symbol key of the helper deriving an extended service instance. */
static readonly extend: unique symbol
```

用于派生擴展服務實例的輔助方法所使用的符號鍵。

[源碼](../../vendor/cordis/src/service.ts#L21)

### Service.tracker

```ts cordis-catalog
/** Symbol key of the tracker metadata used for context tracing. */
static readonly tracker: unique symbol
```

上下文追蹤所用跟蹤器元數據的符號鍵。

[源碼](../../vendor/cordis/src/service.ts#L23)

### Service.resolveConfig

```ts cordis-catalog
/** Symbol key of the intercept-config resolution helper below. */
static readonly resolveConfig: unique symbol
```

下述攔截配置解析輔助方法所使用的符號鍵。

[源碼](../../vendor/cordis/src/service.ts#L25)
