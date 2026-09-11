# 開發一個工具

[English](tool.md) | 中文

本教程會在 Web UI 中添加一個 `greet` 工具。請先完成[第一個插件](./index.zh.md)，并保留其中的 `scratch-plugin` 目錄。

## 創建工具插件

將 `scratch-plugin/src/my-plugin.ts` 替換為：

```ts
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'greet-tool'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'greet',
    description: 'Greet someone by name.',
    parameters: {
      name: { type: 'string', required: true, description: 'The name to greet' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return `Hello, ${args.name}!`
    },
  }))
}
```

`inject` 讓 Cordis 等待工具注冊表就緒。`defineTool` 根據 `parameters` 推導并校驗 `args`；`execute` 返回 `output.schema` 聲明的規范值，`output.render` 再將該值轉換為面向模型的內容。

## 運行并調用工具

如果開發命令未在運行，請重新啟動：

```sh
pnpm dsh web --patch ./scratch-plugin/cordis.yml
```

打開 `http://127.0.0.1:3080`，然后輸入：`Use the greet tool to greet Ada.` 模型可以調用 `greet`，并收到 `Hello, Ada!` 這一工具結果。

## 下一步

- [插件配置](./config.zh.md) — 讓問候語可配置。
- [工具編寫參考](../../../cookbook/adding-a-tool.zh.md) — 查閱嵌套 schema、規范值、后臺工作、策略鉤子、PTC mode 和 UI 卡片。
- [能力分層](../practice/index.zh.md) — 將可替換能力拆分為 Service Definition、Service Provider 和 Consumer 三類包。
