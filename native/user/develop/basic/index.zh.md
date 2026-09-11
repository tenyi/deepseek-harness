# 第一個插件

[English](index.md) | 中文

本教程會創建一個最小的 Harness 插件，并將其加載到 Web UI 中。請從已完成[從源碼運行路徑](../../../../README.zh.md#run-from-source)的倉庫檢出開始。

## 創建本地項目

在倉庫根目錄創建本教程使用的臨時項目：

```sh
mkdir -p scratch-plugin/src
```

## 插件是什么

在 Harness 中，插件是一個導出 `apply` 函數的 TypeScript 模塊。框架在加載時調用 `apply`，傳入一個 `ctx`（上下文對象），你通過 `ctx` 注冊能力：

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'my-plugin'

export function apply(ctx: Context) {
  // Register capabilities here.
}
```

這就是完整配置。

## 創建插件文件

創建 `scratch-plugin/src/my-plugin.ts`：

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'hello-plugin'

export function apply(ctx: Context) {
  // Required dependencies are ready before apply runs.
  console.log('[hello-plugin] plugin loaded!')
}
```

## 注冊到 cordis.yml

在倉庫根目錄運行 `pwd`，然后創建 `scratch-plugin/cordis.yml`，作為插入本地插件的 Web 覆蓋層。請將下文的 `/absolute/path/to/deepseek-harness` 替換為命令打印的路徑：

```yaml
- insert:
    - id: hello
      name: '/absolute/path/to/deepseek-harness/scratch-plugin/src/my-plugin.ts'
```

插件路徑必須是絕對路徑。patch 文件只貢獻配置，不會改變 loader 解析模塊路徑時使用的 profile 目錄。

使用該覆蓋層啟動 Web UI：

```sh
pnpm dsh web --patch ./scratch-plugin/cordis.yml
```

打開 `http://127.0.0.1:3080`。啟動期間，終端會打印 `[hello-plugin] plugin loaded!`。

## 自動清理

通過 `ctx` 注冊的任何東西——事件監聽、工具、定時器——在插件卸載時都會被自動清理。你不需要手動 removeListener 或 clearInterval。

如果你有需要手動清理的資源（比如一個網絡連接），用 `ctx.effect()` 告訴框架怎么清理：

```ts
import type { Context } from '@deepseek-ai/cordis'

export function apply(ctx: Context) {
  ctx.effect(() => {
    const timer = setInterval(() => {
      console.log('heartbeat')
    }, 5000)

    // The returned function runs when the plugin unloads.
    return () => clearInterval(timer)
  })
}
```

## 聲明依賴

如果你的插件需要使用其他服務（如 `tools`、`llm`），需要聲明 `inject`：

```ts ignore-check
import type { Context } from '@deepseek-ai/cordis'

export const name = 'my-tool-plugin'
export const inject = ['tools']

export function apply(ctx: Context) {
  // ctx.tools is ready here.
  ctx.tools.register(/* ... */)
}
```

框架會確保依賴的服務就緒后才加載你的插件。

## 插件的三種形態

除了函數形式，插件還支持對象形式和類形式：

### 對象形式

```ts
import type { Context } from '@deepseek-ai/cordis'

export default {
  name: 'my-plugin',
  inject: ['tools'],
  apply(ctx: Context) {
    // ...
  },
}
```

### 類形式

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

export default class MyService extends Service {
  static inject = ['tools']

  constructor(ctx: Context) {
    super(ctx, 'myService')
    // Perform synchronous initialization in the constructor.
  }
}
```

大多數情況下，函數形式足夠了。當插件需要向其他插件提供服務時，可使用類形式（見 [服務與依賴](../framework/service.zh.md)）。

## 下一步

- [開發一個工具](./tool.zh.md) — 了解工具定義 DSL
- [插件配置](./config.zh.md) — 讓插件接受用戶配置
- [Cordis 框架教程](../../../cordis-tutorial/index.zh.md) — 底層的插件框架，在臨時目錄中動手構建，無需 API 密鑰
