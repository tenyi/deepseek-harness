---
description: "持久終端能力家族的包映射：限定所有者范圍的 ctx.terminals 服務、啟動交互式 bash 或 pwsh 的 shell 后端，以及 6 個面向模型的工具。"
kind: "package-group"
---

# terminal/：持久 PTY 能力家族

[English](README.md) | 中文

## 概述

`terminal/` 家族讓 agent（智能體）的交互式 shell 和 REPL 會話跨工具調用持續存在，包括工作目錄、環境變量和運行中的子進程。使用 `terminal/` 管理所有者隔離的會話，使用 `terminal-bash/` 啟動受沙箱約束的交互式 bash 或 pwsh 會話，使用 `tool-terminal/` 獲得 6 個結果有界的面向模型終端操作。任務需要交互式輸入或需要保留單次 bash 命令無法保存的狀態時，選擇這個家族。會話僅存在于一個 harness 進程中，重啟后不會恢復。

## 目錄

- [包](#packages)
- [相關文檔](#related-documentation)
- [開發備注](#dev-note)

-----

<a id="packages"></a>
## 包

該家族包含一個會話服務、一個 shell 后端與一組面向模型的工具。完整約定由各子級 README 負責；共享詞匯與生成的服務接口面由子系統參考負責。

| 包 | 角色 | ctx 鍵 |
|---|---|---|
| [`terminal/`](terminal/README.zh.md) | 會話服務：限定所有者范圍的會話、不透明 id、精確到所有者的限制與等待完成的清理 | `ctx.terminals` |
| [`terminal-bash/`](terminal-bash/README.zh.md) | shell 后端：在共享沙箱策略下啟動交互式 bash 或 pwsh，帶就緒檢測與有界輸出 | 注冊后端到 `ctx.terminals` |
| [`tool-terminal/`](tool-terminal/README.zh.md) | 6 個面向模型的工具，帶所有者隔離與可選后臺發送 | 注冊到 `ctx.tools` |

-----

<a id="related-documentation"></a>
## 相關文檔

先從子系統參考了解共享類型與服務接口面，再從 Agent Note 了解設計理由與暫緩邊界。

- [終端子系統參考](../../docs/subsystems/terminal.zh.md)——id、后端與會話約定、發送就緒、有界讀取，以及生成的 `ctx.terminals` API。
- [持久 PTY Agent Note](../../.agents/notes/implemented/feature/2026-07-16-persistent-pty-sessions.zh.md)——設計決策、備選方案與延期工作。
- [能力 seam](../../docs/capability-seams.zh.md)——本家族遵循的 Service Definition / Service Provider / Consumer 拆分。

<a id="dev-note"></a>
## 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
