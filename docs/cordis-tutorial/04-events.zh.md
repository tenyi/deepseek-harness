# 4. 事件

[English](04-events.md) | 中文

服務支持直接調用；**事件**讓插件無需知道有哪些插件正在監聽，就能發出通知。harness 使用事件處理工具結果、模型請求和審批決定等交互。

## 聲明、發出與監聽

創建 `stats.ts`，將它放在 `tmp/cordis-tutorial` 中。它是一項負責計數并在每次變化時發出通知的服務：

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    stats: StatsService
  }
  interface Events {
    'stats/report'(name: string, count: number): void
  }
}

export class StatsService extends Service {
  private counts = new Map<string, number>()

  constructor(ctx: Context) {
    super(ctx, 'stats')
  }

  bump(name: string) {
    const next = (this.counts.get(name) ?? 0) + 1
    this.counts.set(name, next)
    this.ctx.emit('stats/report', name, next)
  }
}

export const name = 'stats'

export function apply(ctx: Context) {
  ctx.plugin(StatsService)
}
```

`interface Events` 合并與第 3 章的 `interface Context` 合并在事件系統中相互對應：它聲明事件名稱及其監聽器簽名，因此 `ctx.emit` 和 `ctx.on` 都具有完整類型。`namespace/action` 命名約定讓扁平的事件命名空間保持易讀。

創建 `reporter.ts`：

```ts ignore-check
import type { Context } from '@deepseek-ai/cordis'
import type {} from './stats.ts'

export const name = 'reporter'
export const inject = ['stats']

export function apply(ctx: Context) {
  ctx.on('stats/report', (name, count) => {
    console.log(`[stats] ${name} -> ${count}`)
  })
  ctx.stats.bump('tool_call')
  ctx.stats.bump('tool_call')
  ctx.stats.bump('prompt')
}
```

`import type {} from './stats.ts'` 行不會在運行時導入任何內容；它的作用是讓 TypeScript 看到聲明合并。組合并運行：

```yaml
- name: './stats.ts'
- name: './reporter.ts'
```

```
[stats] tool_call -> 1
[stats] tool_call -> 2
[stats] prompt -> 1
```

因為 `ctx.on()` 屬于 effect，監聽器會隨插件一同消失，絕不需要手動維護 `removeListener`。

## 分發模式

`emit` 是 5 種分發模式之一。事件采用哪種模式是其約定的一部分，決定了監聽器能否返回值、能否并發運行，以及能否彼此短路：

| 模式 | 調用 | 語義 |
|---|---|---|
| emit | `ctx.emit(name, ...args)` | 同步廣播；不會等待或收集返回的 promise 與值。 |
| parallel | `await ctx.parallel(name, ...args)` | 所有監聽器并發運行，并一同等待。 |
| serial | `await ctx.serial(name, ...args)` | 監聽器按順序運行并等待；第一個非 `null`/`false`/`undefined` 返回值勝出，并停止后續監聽器。 |
| bail | `ctx.bail(name, ...args)` | serial 的同步版本。 |
| waterfall（瀑布式事件） | `ctx.waterfall(name, ...args, next)` | 環繞中間件，見下文。 |

每個 harness 事件都會在其所屬[子系統頁面](../subsystems/core.zh.md)自動生成的參考文檔中記錄其模式。

## waterfall：轉換或短路

waterfall 是實現攔截的模式。每個監聽器都會收到參數和一個 `next()` continuation；它可以轉換 `next()` 的返回值，也可以不調用 `next()` 就直接返回，從而短路鏈條的其余部分。Cordis 文檔把后一種行為稱為否決。創建 `waterfall-demo.ts`：

```ts
import type { Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Events {
    'demo/transform'(input: string, next: () => Promise<string>): Promise<string>
  }
}

export const name = 'waterfall-demo'

export function apply(ctx: Context) {
  // Listener 1: wrap the downstream result.
  ctx.on('demo/transform', async (input, next) => {
    const downstream = await next()
    return downstream.toUpperCase()
  })

  // Listener 2: short-circuit when it owns the decision.
  ctx.on('demo/transform', async (input, next) => {
    if (input.includes('blocked')) return '** blocked **'
    return next()
  })

  void (async () => {
    console.log(await ctx.waterfall('demo/transform', 'hello', async () => 'hello'))
    console.log(await ctx.waterfall('demo/transform', 'blocked words', async () => 'blocked words'))
  })()
}
```

讓 `cordis.yml` 只指向該文件并運行：

```
HELLO
** BLOCKED **
```

按順序看第二行如何產生：監聽器 1 先運行并調用 `next()`，從而調用監聽器 2；監聽器 2 看到 `blocked` 后直接返回而不調用 `next()`，因此最內層默認邏輯（傳給 `ctx.waterfall` 的函數）從未運行；返回途中，監聽器 1 再把替換消息轉換為大寫。

由此得到一項紀律：**只負責觀察或標注的 waterfall 監聽器必須調用 `next()`**；不調用就直接返回代表有意短路。如果日志監聽器忘記調用 `next()`，會悄無聲息地吞掉所有下游的默認行為。這是本倉庫的常設規則（[waterfall 語義](../cordis-primer.zh.md#cordis-waterfall-semantics)）。

harness 使用 waterfall 處理協作插件可以包裝或回答的決策：[`agent/request`](../subsystems/core.zh.md#agentrequest--waterfall) 允許插件替換模型調用配置，[`approval/request`](../subsystems/approval.zh.md#approvalrequest--waterfall) 允許策略代替用戶作答。

下一章：[配置](05-config.zh.md)：來自 `cordis.yml` 的插件選項。

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
