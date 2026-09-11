---
description: "workspace 組地圖：持久工作區實體家族、用戶目錄的持久記錄與經會話頭驗證的會話歸屬關系，供瀏覽本組的用戶與維護者閱讀。"
kind: "package-group"
---

# packages/workspace

[English](README.md) | 中文

## 概述

workspace 家族讓宿主產品持久保存命名且有序的項目列表，并按目錄歸組每個項目的會話。用戶可以瀏覽這些項目與會話、將會話從分組中隱藏而不刪除該會話，以及移除項目而不刪除其文件夾或會話歷史。被隱藏或從項目中移除的會話仍可作為未分組的歷史記錄使用。需要持久項目界面時選用此家族；它需要會話存儲和持久化后端，且不會向模型公開工具、提示詞或會話事件。

## 目錄

- [包](#packages)
- [相關文檔](#related-documentation)
- [開發備注](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 職責 | ctx 鍵 |
|---|---|---|
| [`workspace`](workspace/README.zh.md) | 提供命名且有序的項目，并按目錄歸組在其中運行的會話 | `ctx.workspaceRegistry` |

-----

<a id="related-documentation"></a>
## 相關文檔

- [Workspace 子系統](../../docs/subsystems/workspace.zh.md)——項目及其會話的權威功能約定。
- [領域 KV 存儲 Agent Note](../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.zh.md)——項目記錄背后的存儲設計。
- [Workspace UI 產品流 Agent Note](../../.agents/notes/archived/feature/2026-07-25-workspace-ui-product-flow.md)——首次啟動如何從會話歷史構建項目，以及 GUI 如何排序。
- [刪除 Workspace 注冊記錄決策](../../.agents/notes/implemented/feature/2026-07-27-workspace-registration-deletion.zh.md)——為什么移除項目絕不會刪除其文件夾或會話。

-----

<a id="dev-note"></a>
## 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
