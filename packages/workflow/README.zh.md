---
description: "workflow 組地圖：由模型編寫的、可扇出 subagent 的編排腳本，供瀏覽本組的用戶與維護者閱讀。"
kind: "package-group"
---

# packages/workflow

[English](README.md) | 中文

## 概述

workflow 組讓 agent（智能體）可以運行一段由模型編寫的編排腳本，把工作扇出到多個 subagent 并返回最終值。`workflow` 包提供運行服務，worker-thread 包在隔離線程中執行腳本，兩個面向模型的工具公開編排能力：通用的 `workflow` 工具用于腳本化扇出，固定的 `ralph` 工具用于全新 agent 迭代循環。腳本用鉤子協調 agent，實際工作由 agent 完成。引擎把腳本的同步工作移出宿主事件循環，但這只是隔離，不是安全邊界。

## 目錄

- [包](#packages)
- [相關文檔](#related-documentation)
- [開發備注](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 職責 | ctx 鍵 |
|---|---|---|
| [`workflow`](workflow/README.zh.md) | 運行由模型編寫的、扇出 subagent 的編排腳本 | `ctx.workflowEngine` |
| [`workflow-worker-thread`](workflow-worker-thread/README.zh.md) | 在獨立 worker thread 中執行每個工作流腳本，移出宿主事件循環 | 注冊到 `ctx.workflowEngine` |
| [`tool-workflow`](tool-workflow/README.zh.md) | 把 `workflow` 工具交給模型，用于腳本化多 agent 編排 | 注冊到 `ctx.tools` |
| [`tool-ralph`](tool-ralph/README.zh.md) | 把 `ralph` 工具交給模型，用于全新 agent 迭代循環 | 注冊到 `ctx.tools` |

-----

<a id="related-documentation"></a>
## 相關文檔

- [工作流子系統](../../docs/subsystems/workflow.zh.md)——seam 的類型、啟動請求與 `workflow/*` 事件。
- [生成的工具目錄](../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-workflow)——模型接收的 `workflow` 工具 schema。
- [生成的工具目錄](../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-ralph)——模型接收的 `ralph` 工具 schema。
- [生成的配置目錄](../../docs/config-catalog.zh.md#deepseek-aidsh-workflow-worker-thread)——每個受支持的引擎配置字段。
- [動態工作流 Agent Note](../../.agents/notes/implemented/feature/2026-07-05-dynamic-workflows.zh.md)——seam 設計及其決策。
- [Harness 層目標式執行 Agent Note](../../.agents/notes/implemented/feature/2026-07-16-harness-level-loop.zh.md)——固定全新 agent 循環的設計與暫緩事項。

-----

<a id="dev-note"></a>
## 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
