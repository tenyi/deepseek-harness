---
description: "jobs 組地圖：后臺任務控制——注冊表約定、進程本地存儲與面向模型的任務工具，供瀏覽本組的用戶與維護者閱讀。"
kind: "package-group"
---

# jobs/：后臺任務能力家族

[English](README.md) | 中文

## 概述

jobs 組是后臺工作能力家族：運行長時間工作的工具把工作注冊為任務，擁有它的 agent（智能體）可以在不阻塞自身輪次的情況下讀取、等待、列出或取消任務。任務屬于啟動它的 agent 會話，因此一個 agent 永遠不會看到另一個 agent 的工作；任務完成時以會話內通知送達給擁有它的 agent，無需輪詢。本組拆分為注冊表約定（`jobs`）、其進程本地存儲（`jobs-local`）以及帶完成通知的模型側控制工具（`tool-jobs`）。

## 目錄

- [包](#packages)
- [相關文檔](#related-documentation)
- [開發備注](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 職責 | ctx 鍵 |
|---|---|---|
| [`jobs`](jobs/README.zh.md) | 定義后臺任務約定：id、歸屬、生命周期與完成監聽器 | `ctx.jobs` |
| [`jobs-local`](jobs-local/README.zh.md) | 在本進程中運行并存儲任務，按所有者隔離 | 注冊到 `ctx.jobs` |
| [`tool-jobs`](tool-jobs/README.zh.md) | 讓模型讀取、列出和終止任務，并投遞完成通知 | 注冊到 `ctx.tools` |

-----

<a id="related-documentation"></a>
## 相關文檔

- [后臺任務運行時子系統](../../docs/subsystems/jobs.zh.md)——任務類型、快照字段與 `ctx.jobs` API。
- [通用長時間運行工具運行時 Agent Note](../../.agents/notes/implemented/architecture/2026-06-20-generic-long-running-tool-runtime.zh.md)——后臺任務運行時背后的設計。
- [任務注冊表 seam Agent Note](../../.agents/notes/archived/architecture/2026-07-26-job-registry-seam.md)——按所有者隔離的注冊表約定及其理由。

-----

<a id="dev-note"></a>
## 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
