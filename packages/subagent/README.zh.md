---
description: "subagent 包組：委派 seam、其進程內與進程外后端，以及面向模型的委派工具。"
kind: "package-group"
---

# subagent/：subagent 能力家族

[English](README.md) | 中文

## 概述

subagent 包家族讓 agent（智能體）將任務委派給子 agent、繼續其工作，并發現自己創建的每個子級。隔離工作可選擇全新的進程內子級；需要既有對話時可選擇帶父級歷史的進程內子級；也可選擇由 ACP（Agent Client Protocol）、Codex、Claude Code 或另一 Harness 運行時支持的進程外子級。面向模型的工具還讓 agent 能夠向相鄰 agent 發送消息、中斷工作并列出子級狀態。無論子級正在運行還是已存儲，父級都能看到它；各包 README 說明各提供方特定的設置與限制。

## 目錄

- [包](#packages)
- [相關文檔](#related-documentation)
- [開發備注](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 職責 | ctx 鍵 |
|---|---|---|
| [`subagent/`](subagent/README.zh.md) | 定義委派服務：提供方注冊表、一次性運行、可繼續子級與發現 | `ctx.subagents` |
| [`subagent-in-process-driver/`](subagent-in-process-driver/README.zh.md) | 提供共享的進程內運行驅動器 | 無 |
| [`subagent-spawn-in-process/`](subagent-spawn-in-process/README.zh.md) | 運行全新的進程內子 agent | 注冊到 `ctx.subagents` |
| [`subagent-fork-in-process/`](subagent-fork-in-process/README.zh.md) | 運行從父級已完成歷史派生的進程內子 agent | 注冊到 `ctx.subagents` |
| [`subagent-acp/`](subagent-acp/README.zh.md) | 經 Agent Client Protocol 運行進程外子 agent | 注冊到 `ctx.subagents` |
| [`subagent-codex/`](subagent-codex/README.zh.md) | 經官方 app-server 協議運行真實 Codex 子 agent | 注冊到 `ctx.subagents` |
| [`subagent-claude-code/`](subagent-claude-code/README.zh.md) | 經官方 Agent SDK 運行真實 Claude Code 子 agent | 注冊到 `ctx.subagents` |
| [`subagent-dsh-sdk/`](subagent-dsh-sdk/README.zh.md) | 經 TypeScript SDK 運行進程外 Harness 子 agent | 注冊到 `ctx.subagents` |
| [`tool-subagent/`](tool-subagent/README.zh.md) | 向模型公開委派 | 注冊到 `ctx.tools` |
| [`tool-subagent-control/`](tool-subagent-control/README.zh.md) | 向模型提供向相鄰 agent 發送消息、中斷工作和列出子級狀態的操作 | 注冊到 `ctx.tools` |

-----

<a id="related-documentation"></a>
## 相關文檔

- [Subagent 子系統](../../docs/subsystems/subagent.zh.md)——服務約定、提供方約定與終態結果語義。
- [Subagent 能力 seam](../../.agents/notes/implemented/feature/2026-06-21-subagent-capability-seam.zh.md)——委派能力家族的設計記錄。
- [可繼續的 subagent](../../.agents/notes/implemented/feature/2026-07-28-continuable-subagent-conversations.zh.md)——接受后續輪次的持久子級。
- [tool-subagent-control README](tool-subagent-control/README.zh.md)——后續消息、中斷與列舉接口。

<a id="dev-note"></a>
## 開發備注

無。
