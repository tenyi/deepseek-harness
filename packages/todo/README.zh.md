---
description: "todo 組地圖：基于會話日志的模型側 todo_write 工具，供瀏覽本組的用戶與維護者閱讀。"
kind: "package-group"
---

# packages/todo

[English](README.md) | 中文

## 概述

todo 組為 agent（智能體）提供可用于規劃的會話級任務列表：添加任務、標記進行中、逐項完成，同一份列表跨輪次、跨重新打開的會話持續存在。它只包含一個產品包，提供 `todo_write` 工具；列表屬于創建它的 agent 會話，每次更新都會整體替換。交互式宿主會從列表展示當前計劃，組本身不附帶任何 UI。

## 目錄

- [包](#packages)
- [相關文檔](#related-documentation)
- [開發備注](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 職責 | ctx 鍵 |
|---|---|---|
| [`tool-todo`](tool-todo/README.zh.md) | 讓 agent 維護會話任務列表：規劃任務、更新狀態、跟蹤進度 | 注冊到 `ctx.tools` |

-----

<a id="related-documentation"></a>
## 相關文檔

- [Todo 子系統](../../docs/subsystems/todo.zh.md)——`todo/write` 事件載荷、歸屬規則與 `TodoItem`。
- [生成的工具目錄](../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-todo)——模型接收的 `todo_write` schema。
- [生成的配置目錄](../../docs/config-catalog.zh.md#deepseek-aidsh-tool-todo)——每個受支持配置字段。
- [todo_write 工具 Agent Note](../../.agents/notes/archived/feature/2026-06-29-todo-write-tool.md)——原始設計及其備選方案。

-----

<a id="dev-note"></a>
## 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
