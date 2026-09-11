---
description: "會話檢索能力家族的包映射：搜索、追蹤與讀取實時和持久會話歷史，以及 Web 端會話日志導出。"
kind: "package-group"
---

# session-query/：會話檢索能力家族

[English](README.md) | 中文

## 概述

`session-query/` 組提供對實時與持久會話歷史的檢索，且獨立于壓縮（compaction）：程序化調用方通過一個統一服務查詢精確日志、過濾后的列表、關系追蹤與全文搜索；SQLite 后端支撐搜索；模型獲得五個經工作區授權的工具；Web 界面獲得下載會話 ZIP 的 `/export` 命令。搜索結果與模型看到的對話歷史一致。本頁概述該組；各包的 README 分別說明各自的包級約定。

## 目錄

- [包](#packages)
- [相關文檔](#related-documentation)
- [開發備注](#dev-note)

-----

<a id="packages"></a>
## 包

每個包的 README 都會說明該包在此組中的用途。

| 包 | 職責 | ctx 鍵 |
|---|---|---|
| [`session-query/`](session-query/README.zh.md) | 統一的會話歷史查詢服務：精確讀取、關系追蹤與過濾 | `ctx.sessionQuery` |
| [`session-query-sqlite/`](session-query-sqlite/README.zh.md) | 基于 SQLite FTS5 索引的會話歷史全文搜索 | 注冊到 `ctx.sessionQuery` |
| [`session-log-export/`](session-log-export/README.zh.md) | Web `/export` 命令與瀏覽器下載會話 ZIP | `ctx.sessionLogDownload`（瀏覽器） |
| [`tool-session-query/`](tool-session-query/README.zh.md) | 面向模型的搜索、追蹤與讀取會話歷史工具 | 注冊到 `ctx.tools` |

-----

<a id="related-documentation"></a>
## 相關文檔

先從子系統參考了解共享的查詢詞匯，再看追蹤與搜索背后的設計記錄。

- [會話查詢子系統參考](../../docs/subsystems/session-query.zh.md)——邏輯記錄、過濾器、搜索頁、血緣、有界讀取與事件關系。
- [會話查詢關系追蹤](../../.agents/notes/archived/feature/2026-07-13-session-query-tracing.md)——追蹤語義與校驗邊界。
- [SQLite FTS5 會話搜索](../../.agents/notes/archived/feature/2026-07-10-sqlite-session-query-provider.md)——搜索語義、對賬與 tokenizer 決策。

<a id="dev-note"></a>
## 開發備注

無。
