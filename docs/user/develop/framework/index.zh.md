# 插件與生命周期

[English](index.md) | 中文

本頁介紹 Cordis 插件模型和生命周期狀態機。

## Fiber 狀態機

每個被加載的插件都擁有一個 **Fiber** 作用域，其狀態如下：

```
PENDING → LOADING → ACTIVE
                 ↘ FAILED
ACTIVE → UNLOADING → DISPOSED
```

| 狀態 | 含義 |
|------|------|
| PENDING | 已聲明，但所需依賴未就緒 |
| LOADING | 依賴就緒，正在執行 `apply` |
| ACTIVE | 插件運行中 |
| FAILED | `apply` 拋出異常 |
| UNLOADING | 插件正在卸載并釋放資源 |
| DISPOSED | 已完全卸載 |

## 依賴驅動的加載

聲明了 `inject` 的插件會等待所有必需服務就緒：

```ts ignore-check
export const inject = ['tools', 'llm']

export function apply(ctx: Context) {
  // ctx.tools and ctx.llm are ready here.
}
```

如果依賴的服務消失（例如提供方被替換時），插件會被自動卸載（ACTIVE → DISPOSED），待服務恢復后重新加載。

## 自動清理機制

通過 `ctx` 做的任何注冊，在插件卸載時都會自動撤銷：

```ts ignore-check
export function apply(ctx: Context) {
  // Event listener: removed automatically on unload.
  ctx.on('some-event', handler)

  // Custom resource: the returned disposer runs on unload.
  ctx.effect(() => {
    const connection = createConnection()
    return () => connection.close()
  })
}
```

以下操作都會被自動追蹤和清理：
- `ctx.on(event, handler)` — 事件監聽
- `ctx.tools.register(tool)` — 工具注冊
- `ctx.llm.registerAdapter(names, adapter)` — LLM（大語言模型）適配器注冊
- `ctx.effect(() => cleanup)` — 自定義資源

插件卸載時，處置器按注冊順序的逆序開始調用，但多個異步處置器會并發執行，不保證逐個完成。存在順序依賴的清理步驟必須放進同一個 `ctx.effect()` 返回的處置器中，由該處置器負責串行等待。

## 嵌套上下文

`ctx.plugin()` 創建子 Fiber，它繼承父上下文但有獨立的生命周期：

```ts ignore-check
export function apply(ctx: Context) {
  // Register a child plugin.
  ctx.plugin(childPlugin)

  // The child has its own Fiber and unloads with its parent.
}
```

## dispose（資源釋放）語義

當你需要提前終止一個插件實例：

```ts
import type { Context } from '@deepseek-ai/cordis'

declare const ctx: Context
declare function myPlugin(ctx: Context): void

const fiber = ctx.plugin(myPlugin)

// Dispose it manually later.
await fiber.dispose()
```

`dispose` 保證：
1. 該插件擁有的所有注冊均被移除
2. 它的子插件也被遞歸卸載
3. 返回的 Promise 會在所有異步清理完成后兌現

## HMR（熱模塊替換）

通過 `cordis.yml` 加載 `@deepseek-ai/cordis-plugin-hmr` 后，修改插件源文件會觸發：

1. 卸載舊插件（清理所有注冊）
2. 重新加載新代碼
3. 執行新的 `apply`

因為插件注冊會被自動清理，所以熱替換不會保留舊實例的注冊。

## 生命周期示例

```ts ignore-check
export function apply(ctx: Context) {
  console.log('plugin loading')

  ctx.effect(() => {
    console.log('effect registered')
    return () => console.log('effect cleaned up')
  })
}
```

加載時輸出：
```
plugin loading
effect registered
```

卸載時輸出：
```
effect cleaned up
```

## 下一步

- [服務與依賴](./service.zh.md) — 讓插件向其他插件提供能力
- [事件系統](./events.zh.md) — 在插件之間通信
- [Cordis 框架教程](../../../cordis-tutorial/index.zh.md) — 在 Cordis 運行時上逐步搭出同一套生命周期、服務與事件
