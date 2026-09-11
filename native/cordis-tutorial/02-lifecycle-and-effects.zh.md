# 2. 生命周期與 effect

[English](02-lifecycle-and-effects.md) | 中文

Cordis 插件可能因修改配置、熱重載、顯式資源釋放或所需服務消失而卸載。通過 Cordis API 建立的注冊屬于 effect，會在所屬插件卸載時撤銷；在這些 API 之外管理的資源必須包裝在 `ctx.effect()` 中。

## Effect

對于 Cordis 尚未管理的資源，例如定時器、連接或 watcher，應將其包裝在 `ctx.effect()` 中并返回 disposer（資源釋放函數）：

創建 `lifecycle.ts`，將它放在 `tmp/cordis-tutorial` 中：

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'lifecycle-demo'

function heartbeat(ctx: Context) {
  console.log('heartbeat plugin loading')
  ctx.effect(() => {
    const timer = setInterval(() => console.log('tick'), 200)
    return () => {
      clearInterval(timer)
      console.log('heartbeat cleaned up')
    }
  })
}

export function apply(ctx: Context) {
  // Mount a child plugin and keep its fiber to dispose it later.
  const fiber = ctx.plugin(heartbeat)
  // The demo timer is itself an effect: if THIS plugin is unloaded first,
  // the pending callback is cancelled instead of firing on a dead app.
  ctx.effect(() => {
    const timer = setTimeout(async () => {
      await fiber.dispose()
      console.log('disposed')
      process.exit(0)
    }, 700)
    return () => clearTimeout(timer)
  })
}
```

讓 `cordis.yml` 指向該文件：

```yaml
- name: './lifecycle.ts'
```

運行（`node --import tsx ../../vendor/cordis/bin.js`）后會得到：

```
heartbeat plugin loading
tick
tick
tick
heartbeat cleaned up
disposed
```

請留意三點：

- `ctx.plugin(heartbeat)` 會把一個**來自代碼**的函數掛載為插件，這與 YAML loader 為每個配置項執行的操作相同。函數插件不需要 `apply` 方法：Cordis 會直接調用該函數，其名稱只用于診斷。只有對象形態才要求 `apply` 方法，例如 `ctx.plugin({ apply(ctx) { /* ... */ } })`。調用會返回一個 **fiber**，即一個已加載插件實例的運行時句柄。
- effect 主體在加載期間運行；它返回的 disposer 在卸載期間運行。對于生命周期與插件一致的資源，你絕不需要自行調用 disposer。
- `fiber.dispose()` 會等該插件的所有清理工作（包括異步 disposer）完成后才結束，并遞歸卸載它掛載的所有子插件。

## Fiber 狀態機

每個已加載插件實例都擁有一個 fiber，并在以下狀態之間轉換：

```
PENDING → LOADING → ACTIVE → UNLOADING → DISPOSED
                 ↘ FAILED
```

- **PENDING**：已經聲明，但所需服務（第 3 章）尚不可用。
- **LOADING / ACTIVE**：`apply` 正在運行／已經完成。
- **FAILED**：`apply` 或配置校驗拋出異常。
- **UNLOADING / DISPOSED**：disposer 正在運行／一切均已拆除。

你會在[第 6 章](06-composition-and-hmr.zh.md)再次遇到 PENDING，它通常就是「為什么我的插件沒有輸出」的答案。

## 已經屬于 effect 的操作

你很少需要親自編寫 `ctx.effect()`，因為內置注冊 API 本身已經是 effect：

- `ctx.on(event, listener)`：監聽器會在卸載時移除（[第 4 章](04-events.zh.md)）。
- `ctx.plugin(child)`：子插件會隨父插件一同 dispose（資源釋放）。
- 服務注冊屬于 effect。`ctx.tools.register(...)` 等 harness 注冊表也會把返回的 disposer 附著到調用插件上，因此會自動撤銷（[第 7 章](07-into-the-harness.zh.md)）。

對于 Cordis 不管理的資源，應在 `ctx.effect()` 內獲取它，并返回用于釋放資源的 disposer。此后 Cordis 會在卸載期間調用該釋放邏輯，熱重載時也不例外。

有一項順序注意事項：disposer 會按注冊順序的逆序啟動，但多個**異步** disposer 會并發運行。如果拆除步驟必須按順序執行，請把它們放在同一個 disposer 中，并在其中依次等待每步完成。

下一章：[服務](03-services.zh.md)：插件如何共享功能。

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
