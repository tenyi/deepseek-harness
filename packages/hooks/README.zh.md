---
description: "hooks 組地圖：在 agent（智能體）運行期間使用現有的 Claude Code 與 Codex shell 鉤子配置，供瀏覽本組的用戶與維護者閱讀。"
kind: "package-group"
---

# packages/hooks

[English](README.md) | 中文

## 概述

hooks 組讓 agent 運行可以復用為 Claude Code 或 Codex 編寫的 shell 鉤子。把對應集成指向現有的 `hooks.json`，即可在會話開始、提示詞到達、工具運行或運行停止時執行受支持的 command hook。這些鉤子可以用模型可見消息阻止提示詞或工具調用、向對話添加上下文，或要求運行繼續。當你需要保留現有鉤子配置時，選擇本組；每項集成只支持其來源工具所記錄的 command hook 子集。

## 目錄

- [包](#packages)
- [相關文檔](#related-documentation)
- [開發備注](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 職責 | 形態 |
|---|---|---|
| [`hook-protocol`](hook-protocol/README.zh.md) | 兩個橋接共享的鉤子引擎；不得直接配置 | 庫 |
| [`hooks-claude-code`](hooks-claude-code/README.zh.md) | 在 agent 運行期間運行你現有的 Claude Code `hooks.json` 鉤子 | 插件 |
| [`hooks-codex`](hooks-codex/README.zh.md) | 在 agent 運行期間運行你現有的 Codex `hooks.json` 鉤子 | 插件 |

-----

<a id="related-documentation"></a>
## 相關文檔

- [攔截擴展點 Agent Note](../../.agents/notes/implemented/feature/2026-06-30-interception-extension-points.zh.md)——橋接所面向的類型化 Decision 接口面。
- [鉤子橋接 Agent Note](../../.agents/notes/archived/feature/2026-06-30-hook-bridges.md)——橋接設計及其決策映射。
- [鉤子協議庫 Agent Note](../../.agents/notes/archived/feature/2026-06-30-hook-protocol-lib.md)——共享庫負責的內容及其原因。

-----

<a id="dev-note"></a>
## 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
