# 5. 配置

[English](05-config.md) | 中文

`cordis.yml` 中的每個 Cordis 配置項都可以攜帶 `config` 塊，插件則聲明一個 schema，在運行 `apply` 前驗證該塊。錯誤配置會導致加載失敗，并給出準確的錯誤：插件絕不會在配置不完整時啟動。

## 可配置插件

創建 `config-demo.ts`，并將其放在 `tmp/cordis-tutorial` 中：

```ts
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

export const name = 'config-demo'

export interface Config {
  greeting: string
  targets: string[]
}

export const Config: Schema<Config> = Schema.object({
  greeting: Schema.string().default('Hello'),
  targets: Schema.array(String).default(['world']),
})

export function apply(ctx: Context, config: Config) {
  for (const target of config.targets) {
    console.log(`${config.greeting}, ${target}!`)
  }
}
```

導出的 `Config` 既是 TypeScript 接口，也是同名的運行時 schema：消費方獲得類型，Cordis 獲得驗證器。本倉庫使用 [Schemastery](https://github.com/shigma/schemastery) 定義 schema；Cordis 本身接受任意 [Standard Schema](https://standardschema.dev/) 驗證器，因此將普通對象導出為 `Config` 無法工作。

對其進行配置：

```yaml
- name: './config-demo.ts'
  config:
    targets: ['alpha', 'beta']
```

運行：

```
Hello, alpha!
Hello, beta!
```

未提供 `greeting`，因此 schema 默認值會將其補齊：`apply` 始終會收到完整且經過驗證的配置。

## 明確報錯

現在向它傳入無效內容：

```yaml
- name: './config-demo.ts'
  config:
    targets: 'not-an-array'
```

```
ValidationError: invalid config:
  - $.targets expected array but got not-an-array (at targets)
```

插件的 fiber 進入 FAILED 狀態，本教程的啟動器打印錯誤后以狀態碼 1 退出。如果某個插件的配置通過了 schema 驗證，但其中指定的資源或提供方不可用，該插件也應當在能解析該引用時立即拒絕。

## 計算得到的配置值

本倉庫使用的 loader 支持 `!!js` 標簽，用于必須在加載時計算的配置值：

```yaml
- name: './config-demo.ts'
  config:
    greeting: !!js process.env.DEMO_GREETING ?? 'Hello'
```

`!!js` 僅在 `config` 與條目 `disabled` 字段內有效。`disabled: !!js ...` 在每次掛載決策時基于 loader 上下文求值（本倉庫的擴展），可以按平臺或環境門控一行；其余元數據（`name`、`id`、`inject` 等）保持靜態，其中的表達式是普通真值數據。詳見 [loader 配置](../cordis-primer.zh.md#loader-configuration)。

下一章：[組合與 HMR（熱模塊替換）](06-composition-and-hmr.zh.md)：將 `cordis.yml` 視為應用。

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
