# 3. 服務

[English](03-services.md) | 中文

**服務**是一個插件提供、其他插件通過 `ctx` 消費的具名能力。在 harness 中，`ctx.tools`、`ctx.llm` 和 `ctx.agents` 都是服務。消費方只指定 `'tools'` 之類的能力，而不導入其提供方，因此配置可以選擇提供方，無需修改消費方。

## 提供服務

創建 `greeter.ts`，將它放在 `tmp/cordis-tutorial` 中：

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    greeter: GreeterService
  }
}

export class GreeterService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'greeter')
  }

  greet(who: string) {
    return `Hello, ${who}!`
  }
}

export const name = 'greeter'

export function apply(ctx: Context) {
  ctx.plugin(GreeterService)
}
```

兩部分協同工作：

- **運行時**：`super(ctx, 'greeter')` 以名稱 `greeter` 注冊該實例。此后，任何插件都可以通過 `ctx.greeter` 訪問它。注冊屬于 effect，卸載提供方時會移除該服務。
- **編譯時**：`declare module '@deepseek-ai/cordis'` 塊使用 TypeScript 聲明合并，把 `greeter` 加入 `Context` 接口，使 `ctx.greeter` 在各處都能通過類型檢查。它不會生成代碼；沒有該聲明時，服務在運行時仍能工作，但消費方會失去類型安全。

`Service` 子類本身就是插件（第 1 章介紹的類形態），因此 `ctx.plugin(GreeterService)` 會像掛載其他插件一樣掛載它。

## 使用 `inject` 消費服務

創建 `consumer.ts`：

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'consumer'
export const inject = ['greeter']

export function apply(ctx: Context) {
  console.log(ctx.greeter.greet('world'))
}
```

`inject` 列出該插件需要的服務。Cordis 會讓插件保持 PENDING，直到列出的每項服務都存在，因此在 `apply` 內可以保證 `ctx.greeter` 已經就緒。`cordis.yml` 中的加載順序無關緊要：決定插件何時啟動的是依賴關系，而不是文件順序。

組合并運行：

```yaml
- name: './greeter.ts'
- name: './consumer.ts'
```

```
Hello, world!
```

交換 `cordis.yml` 中兩行的順序后重新運行，輸出仍然相同。嘗試徹底移除 `./greeter.ts`：消費方會保持 PENDING，不輸出任何內容，既不崩潰，也不會只運行一部分。處于 PENDING 的 fiber 也不會讓 Node 的事件循環保持活躍，因此如果組合中沒有其他運行項，進程會靜默地以狀態碼 0 退出。[第 6 章](06-composition-and-hmr.zh.md)介紹如何診斷這種狀態。

## 加載后仍會跟蹤依賴關系

`inject` 并非一次性的啟動檢查。如果應用運行期間所需服務消失，例如提供方被卸載或熱替換，每個依賴插件也會隨之卸載，并在服務恢復后再次加載。結合 effect（[第 2 章](02-lifecycle-and-effects.zh.md)），這能防止運行中的消費方保留對不可用服務的引用：依賴消失時，它自己的注冊也會撤銷。

這也是配置中可以替換服務的原因：卸載 Cordis 配置項 `dsh-bash-local`，掛載另一個 `shell` 提供方，所有注入 `'shell'` 的插件都會重新啟動并使用新實現。

## 可選依賴

`inject` 用于硬性依賴。如果某項功能缺失時插件仍可運行，請跳過 `inject`，并在使用處探測：

```ts ignore-check
export function apply(ctx: Context) {
  // undefined when no provider is loaded; the plugin still runs.
  const greeter = ctx.get('greeter')
  console.log(greeter?.greet('maybe') ?? 'no greeter available')
}
```

## 命名

每個應用中的服務名稱共用一個扁平命名空間。請為自有服務添加有辨識度的前綴或命名空間（harness 已占用 `tools` 和 `llm` 等普通名稱）；[子系統頁面](../subsystems/core.zh.md)上生成的 `cordis-surface` 區塊列出 harness 注冊的每個名稱。

下一章：[事件](04-events.zh.md)：無需共享服務即可通信。

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
