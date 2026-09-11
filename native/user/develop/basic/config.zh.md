# 插件配置

[English](config.md) | 中文

讓你的插件接受用戶在 `cordis.yml` 中傳入的配置。

## 定義 Config 類型

在插件中導出一個 `Config` 類型和同名的 Schemastery schema；默認值直接寫在 schema 中：

```ts
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

export const name = 'my-plugin'

export interface Config {
  greeting: string
  maxRetries: number
  verbose?: boolean
}

export const Config: Schema<Config> = Schema.object({
  greeting: Schema.string().default('Hello'),
  maxRetries: Schema.number().default(3),
  verbose: Schema.boolean().default(false),
})

export function apply(ctx: Context, config: Config) {
  console.log(config.greeting)  // User value or schema default.
}
```

在 `scratch-plugin/cordis.yml` 新插入的本地插件行中添加配置：

```yaml
- insert:
    - id: hello
      name: './src/my-plugin.ts'
      config:
        greeting: 'Hi there'
        maxRetries: 5
```

插件加載時，Cordis 會通過導出的 schema 校驗配置，并填充未提供字段的默認值。不要導出普通對象作為 `Config`，因為它不滿足 Cordis 要求的 Standard Schema 接口。

## Schema 校驗

對于需要嚴格校驗的場景，使用 Schemastery 定義 schema：

```ts
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

export const name = 'validated-plugin'

export interface Config {
  apiKey: string
  timeout: number
  mode: 'fast' | 'accurate'
}

export const Config = Schema.object({
  apiKey: Schema.string().required(),
  timeout: Schema.number().default(30000),
  mode: Schema.union(['fast', 'accurate']).default('fast'),
})

export function apply(ctx: Context, config: Config) {
  // config is validated and type-safe.
}
```

Schema 在插件加載時執行校驗。如果配置不合法，插件會加載失敗并給出明確錯誤信息。

## 設計原則

### 無硬編碼可調參數

Harness 的約定：**凡是不同部署可能需要采用不同值的參數，都必須定義為配置字段**。

```ts
// Wrong: hardcoded timeout.
const TIMEOUT = 30000

// Correct: configurable.
export interface Config {
  timeoutMs: number  // Defaults to 30000.
}
```

檢驗標準：能否在 `cordis.yml` 中改變這個值，而不需要修改代碼？

### 配置錯誤要響亮

在 schema 中表達自身完備的約束，使無效配置在插件加載時失敗。對服務或已注冊資源的引用需要依賴注入；[服務教程](../framework/service.zh.md) 會介紹這項約定。

## 配合 HMR

配置變更會觸發插件熱替換：修改 `cordis.yml` 中某個插件的 `config` 后，框架會卸載舊實例并加載新實例。由于注冊都屬于 effect 并會自動清理，替換后不會保留舊實例的注冊。

## 下一步

- [打包與安裝插件](./publish.zh.md) — 把插件以可安裝包的形式交付
- [插件與生命周期](../framework/index.zh.md) — 深入了解插件的完整生命周期
- [服務與依賴](../framework/service.zh.md) — 讓你的插件對外提供服務
