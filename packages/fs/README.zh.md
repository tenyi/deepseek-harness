---
description: "文件系統包組：`ctx.fs` 提供方約定、本地與沙箱強制后端、編輯前讀取策略插件，以及面向模型的文件與搜索工具。"
kind: "package-group"
---

# packages/fs

[English](README.md) | 中文

## 概述

`fs/` 組為 agent（智能體）提供持久、受策略約束的文件訪問：`fs/` 定義 `ctx.fs` 服務約定，`fs-local/` 與 `fs-sandbox/` 提供宿主文件系統與沙箱強制后端，`fs-observation-policy/` 提供編輯前讀取策略，`tool-fs/`（`read`、`read_image`、`write`、`edit`）與 `tool-fs-search/`（`glob`、`grep`）提供面向模型的工具。部署掛載一個后端，加載策略以獲得新鮮度防護的變更，并注冊模型應看到的工具包；后端可以更換，無需改動工具或策略。文件 I/O 有意不設超時：deadline 只會殺掉操作系統仍會完成的工作，因此取消只是系統調用邊界的盡力而為信號。

## 目錄

- [包](#packages)
- [相關文檔](#related-documentation)
- [開發備注](#dev-note)

-----

<a id="packages"></a>
## 包

八個包加上遠程同級 `fs-e2b` 承擔文件系統角色；子系統參考文檔完整收錄各項約定與錯誤分類體系。

| 包 | 職責 | ctx 鍵 |
|---|---|---|
| [`fs/`](fs/README.zh.md) | `ctx.fs` 服務約定：執行世界路徑、有界文本 I/O，以及帶可選版本防護的原子變更 | `ctx.fs` |
| [`fs-local/`](fs-local/README.zh.md) | 宿主文件系統后端：讀取、寫入并編輯本機上的真實文件 | 注冊到 `ctx.fs` |
| [`fs-sandbox/`](fs-sandbox/README.zh.md) | 沙箱強制后端：按每次調用的沙箱模式約束寫入與編輯，讀取直接通過 | 注冊到 `ctx.fs` |
| [`e2b/fs-e2b`](../e2b/fs-e2b/README.zh.md) | 以 E2B 為后端：文件狀態位于與 E2B 子進程提供方共享的遠程執行世界 | 注冊到 `ctx.fs` |
| [`fs-observation-policy/`](fs-observation-policy/README.zh.md) | 編輯前讀取策略：記錄觀測到的存在或缺失，并通過 `fs/*` 事件防護寫入/編輯 | `fs/*` 監聽器 |
| [`tool-fs/`](tool-fs/README.zh.md) | 面向模型的 `read`、`read_image`、`write` 與 `edit` 工具及其執行器 | 注冊到 `ctx.tools` |
| [`tool-fs-search/`](tool-fs-search/README.zh.md) | 由打包 ripgrep 二進制支持的面向模型 `glob` 與 `grep` 發現工具 | 注冊到 `ctx.tools` |
| [`tool-str-replace-editor/`](tool-str-replace-editor/README.zh.md) | 獨立的 `str_replace_editor` 工具：基于 `ctx.fs` 的 `view`、`create`、`str_replace` 與 `insert` | 注冊到 `ctx.tools` |
| [`tool-present/`](tool-present/README.zh.md) | 顯式保存交付文件的不可變快照 | 注冊到 `ctx.tools` |

策略是插件，不是工具注入的服務：移除它會留下裸提供方的無條件變更行為，而不會破壞工具。`fs-sandbox` 的模式圍欄與編輯前讀取門禁可以組合。`tool-fs-search` 有意不擴展提供方約定——搜索是由進程支持的 ripgrep 工作流，因此文件系統后端無需承擔通用搜索 API。

-----

<a id="related-documentation"></a>
## 相關文檔

先從子系統參考文檔了解共享詞匯與錯誤分類體系，再看塑造該家族的設計決策。

- [文件系統子系統](../../docs/subsystems/filesystem.zh.md)——目標、結果、防護、策略事件與錯誤分類體系。
- [跨能力族 fs 沙箱決策](../../.agents/notes/implemented/feature/2026-07-14-cross-family-fs-sandbox.zh.md)——文件系統 seam 上共享的沙箱模式圍欄。
- [可移植執行世界消費方決策](../../.agents/notes/implemented/architecture/2026-07-28-portable-execution-world-consumers.zh.md)——E2B 后端為何共享遠程執行世界。

<a id="dev-note"></a>
## 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
