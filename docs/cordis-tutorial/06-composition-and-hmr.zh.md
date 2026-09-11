# 6. 組合與 HMR（熱模塊替換）

[English](06-composition-and-hmr.md) | 中文

到目前為止構建的每項能力都是插件，`cordis.yml` 則選擇應用的插件樹。本章會改變這種組合、熱重載一個插件，并診斷始終無法加載的插件。

## Cordis 配置項不只有名稱

Cordis 配置項除了 `name` 和 `config`，還接受其他元數據：

```yaml
- id: greeter          # stable identity for this entry
  name: './greeter.ts'
- id: consumer
  name: './consumer.ts'
  disabled: true       # keep the entry, skip mounting it
```

`id` 為 Cordis 配置項提供穩定標識，使 loader 能區分修改現有 Cordis 配置項與先刪除再添加。`disabled: true` 會卸載插件而不刪除其 Cordis 配置項；改回原值后，插件以及所有因依賴其服務而處于 PENDING 的插件都會再次加載。

組可以嵌套一份 Cordis 配置項子列表，并將其作為一個單元加載和卸載；`isolate` 則為一個組提供某項服務名稱的獨立實例，因此兩個組可以各自看到配置不同的 `shell` 提供方，互不影響。[Cordis 入門](../cordis-primer.zh.md)和[服務隔離示例](../user/develop/framework/service.zh.md#service-isolation)介紹了詳細內容。

## 熱模塊替換

卸載會釋放 effect（[第 2 章](02-lifecycle-and-effects.zh.md)），加載則遵循依賴關系（[第 3 章](03-services.zh.md)），因此 HMR 可以先卸載、再加載，以替換正在運行的插件。`@deepseek-ai/cordis-plugin-hmr` 插件會監視文件，并在保存時執行這一過程。

在 `tmp/cordis-tutorial` 中編寫 `cordis.yml`：

```yaml
- id: logger
  name: '@deepseek-ai/cordis-plugin-logger-console'
- id: timer
  name: '@deepseek-ai/cordis-plugin-timer'
- id: hmr
  name: '@deepseek-ai/cordis-plugin-hmr'
  config:
    root: ['.']
- id: hello
  name: './hello.ts'
```

列表中增加了兩個輔助插件：HMR 通過 Cordis logger 服務記錄日志，因此沒有控制臺導出器時看不到其消息；它還會 `inject` `timer` 服務來實現去抖，如果沒有 `@deepseek-ai/cordis-plugin-timer`，它就會永遠停在 PENDING，而且不發出任何提示。下一節就討論這種靜默狀態。

HMR 通過 Loader 的原生輔助工具讀取 Node 的 loader 內部結構。請在 tsx 下運行 Cordis：

```sh
node --import tsx ../../vendor/cordis/bin.js
```

現在編輯 `hello.ts`，修改日志消息并保存：

```
hello from my first plugin
2026-07-22 15:44:36 [I] hmr watching [ '.' ]
2026-07-22 15:44:39 [I] hmr reload plugin at hello.ts
hello from my EDITED plugin
```

舊實例先卸載（其所有 effect 都會回卷），新代碼隨后加載，`apply` 再次運行。按 Ctrl-C 停止進程。編輯 `cordis.yml` 本身也會觸發更新：loader 按 `id` 比較 Cordis 配置項，只掛載、卸載或重新配置發生變化的部分。這就是上述 Cordis 配置項顯式攜帶 `id` 的原因：不帶該字段的 Cordis 配置項在每次讀取時都會獲得一個新生成的 id，所以只要配置文件發生任何編輯，即使自身文本未變，它也會被視為先刪除再添加并重新掛載。

## 診斷始終無法加載的插件

依賴驅動加載也有另一面：如果插件的 `inject` 指定了無人提供的服務，它就會一直等待，不輸出任何內容。這不是錯誤，因為 PENDING 是合法狀態，提供方可能稍后才掛載。

你可以直接查看這些狀態。每個上下文都能枚舉插件注冊表；創建 `diagnose.ts`：

```ts
import { FiberState, type Context } from '@deepseek-ai/cordis'

export const name = 'diagnose'

export function apply(ctx: Context) {
  setTimeout(() => {
    for (const runtime of ctx.registry.values()) {
      for (const fiber of runtime.fibers) {
        if (fiber.state === FiberState.PENDING) {
          console.log(`${fiber.name} is PENDING — a required service is missing`)
        }
      }
    }
  }, 500)
}
```

再創建一個依賴無法滿足的插件 `needs-timer.ts`：

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'needs-timer'
export const inject = ['timer']

export function apply(ctx: Context) {
  console.log('needs-timer loaded')
}
```

```yaml
- name: './needs-timer.ts'
- name: './diagnose.ts'
```

運行它（直接執行 `node --import tsx ../../vendor/cordis/bin.js`，按 Ctrl-C 停止）：

```
needs-timer is PENDING — a required service is missing
```

`inject: ['timer']` 沒有提供方。向列表添加 `- name: '@deepseek-ai/cordis-plugin-timer'` 后，插件就會加載。如果插件既不執行任何操作，也不報告任何內容，請檢查其 fiber 狀態。不加 PENDING 過濾條件進行迭代時，還會看到 loader 自身的插件（Loader、Include）處于 ACTIVE，因為配置文件本身也是通過插件掛載的。

下一章：[進入 harness](07-into-the-harness.zh.md)：把相同模式用于真實的 harness 服務。

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
