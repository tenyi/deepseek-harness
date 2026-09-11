---
description: "skill（技能）組地圖：由提供方發現并經會話目錄與 skill 工具加載的可復用 agent（智能體）指令，供瀏覽本組的用戶與維護者閱讀。"
kind: "package-group"
---

# skill/ — skill 能力家族

[English](README.md) | 中文

## 概述

skill 家族讓 agent 和用戶僅在需要時發現并加載可復用的任務指令。使用 `skill/` 合并目錄并為每個名稱提供一組指令；需要從項目、自定義或用戶目錄發現 skill 時選擇 `skill-filesystem`，需要可選的官方徽章時選擇 `skill-badge`。需要讓模型獲得排序且持久的會話目錄、通過 `skill` 工具加載完整指令，或接受 `/name` 直接調用時，請添加 `tool-skill`。不同來源生成相同的模型可見格式，啟用模型訪問前必須配置至少一個來源。

## 目錄

- [包](#packages)
- [相關文檔](#related-documentation)
- [開發備注](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 職責 | ctx 鍵 |
|---|---|---|
| [`skill/`](skill/README.zh.md) | 合并任意提供方的 skill 目錄、并按名稱解析出勝出 skill 的注冊表 | `ctx.skills` |
| [`skill-filesystem/`](skill-filesystem/README.zh.md) | 從項目、自定義與用戶目錄發現 skill，并監視其變更 | 注冊到 `ctx.skills` |
| [`skill-badge/`](skill-badge/README.zh.md) | 隨包附帶官方「powered by dsh」徽章 skill，默認禁用 | 注冊到 `ctx.skills` |
| [`tool-skill/`](tool-skill/README.zh.md) | 發布會話 skill 目錄與面向模型的 `skill` 加載工具 | 注冊到 `ctx.tools` |

-----

<a id="related-documentation"></a>
## 相關文檔

先從子系統參考了解共享詞匯，再閱讀 Agent Note 了解設計依據。

- [skill 子系統參考](../../docs/subsystems/skills.zh.md)——注冊表、提供方約定、本地發現優先級，以及目錄與工具。
- [skill 調用策略 Agent Note](../../.agents/notes/implemented/feature/2026-07-28-skill-invocation-policy.zh.md)——模型與用戶調用控制。

-----

<a id="dev-note"></a>
## 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
