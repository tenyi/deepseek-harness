---
description: "context 組概覽：不定義工具、為每次請求添加持久且模型可見上下文的插件，供瀏覽本組的用戶與維護者閱讀。"
kind: "package-group"
---

# context/ — 請求上下文插件

[English](README.md) | 中文

## 概述

context 組提供不定義任何工具、為每次請求添加模型可見上下文的插件：工作區指令文件成為指引，`@file` 提及提供路徑補全，其他會話可以作為有界快照被引用，模型還能看到當前時間與 agent（智能體）的 tmux 位置。除 `agent-instructions`（`dsh-base` 默認包含它，profile patch 可以禁用）外，其余全部需主動啟用。上下文是持久的：注入的指令與引用以用戶角色消息的形式進入會話歷史，因此與其他對話內容一樣持久保留、可回放、可壓縮。本頁概述本組；包級約定由各包 README 負責。

## 目錄

- [包](#packages)
- [相關文檔](#related-documentation)
- [開發備注](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 職責 | ctx key |
|---|---|---|
| [`agent-instructions/`](agent-instructions/README.zh.md) | 將 `AGENTS.md`、`CLAUDE.md` 工作區指令加載到上下文，并在文件編輯后刷新 | — |
| [`session-reference/`](session-reference/README.zh.md) | 引用其他會話：提及一個會話，其有界只讀快照即成為上下文 | `ctx.sessionReferenceResolver` |
| [`file-reference/`](file-reference/README.zh.md) | 發現 `@file` 提及，并提供由宿主支持的 UI 共用的提及語法 | `ctx.fileReferences` |
| [`file-reference-local/`](file-reference-local/README.zh.md) | `@file` 提及的本地工作區補全提供方 | — |
| [`time-context/`](time-context/README.zh.md) | 每個步驟的當前時間、瀏覽器時區與經過時長 | — |
| [`tmux-context/`](tmux-context/README.zh.md) | agent 所在的 tmux 會話、窗口與窗格位置 | — |

-----

<a id="related-documentation"></a>
## 相關文檔

- [會話引用子系統](../../docs/subsystems/session-reference.zh.md)——規范的提及 URI、快照語義與穩定的錯誤分類體系。
- [工作區上下文決策記錄](../../.agents/notes/archived/feature/2026-06-24-workspace-context.md)——指令上下文為何按 agent 和會話兩個維度隔離并持久記錄。
- [生成的配置目錄](../../docs/config-catalog.zh.md)——本組各包接受的全部配置字段。

-----

<a id="dev-note"></a>
## 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
