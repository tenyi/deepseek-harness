---
description: "會話壓縮（compaction）功能家族的包映射：自動壓縮、按需 /compact 命令與工具輸出修剪。"
kind: "package-group"
---

# compaction/ — 壓縮能力家族

[English](README.md) | 中文

## 概述

`compaction/` 組讓長時 agent（智能體）會話在接近模型上下文上限時仍能正常工作：token 壓力上升時自動把較早歷史壓縮為摘要，可用 `/compact` 按需壓縮，超大工具輸出也可以先被修剪，從而減少需要壓縮的內容。隨附 `dsh` 基礎配置默認啟用該功能——顯式掛載各包即可調整壓縮發生的時機與方式。決定何時壓縮的 token 測量屬于獨立的 LLM（大語言模型）家族服務。

## 目錄

- [包](#packages)
- [相關文檔](#related-documentation)
- [開發備注](#dev-note)

-----

<a id="packages"></a>
## 包

以下每個包提供該功能的一個環節；打開對應包頁面了解如何使用。

| 包 | 職責 | ctx key |
|---|---|---|
| [`compaction/`](compaction/README.zh.md) | 共享的壓縮約定：所有后端與觸發器使用的操作與摘要格式 | `ctx.compaction` |
| [`compaction-basic/`](compaction-basic/README.zh.md) | 隨 token 壓力上升自動把較早歷史壓縮為摘要 | 注冊 `ctx.compaction` |
| [`compaction-tool-result-pruner/`](compaction-tool-result-pruner/README.zh.md) | 修剪超大工具輸出，減少需要壓縮的歷史 | `ctx.toolResultPruner` |
| [`command-compact/`](command-compact/README.zh.md) | 按需壓縮歷史的 `/compact` 命令 | 注冊到 `ctx.commands` |

-----

<a id="related-documentation"></a>
## 相關文檔

先從子系統參考了解共享詞匯，再閱讀兩份 Agent Note 了解設計依據。

- [壓縮子系統參考](../../docs/subsystems/compaction.zh.md)——壓縮詞匯、結果與服務行為。
- [壓縮能力 seam Agent Note](../../.agents/notes/implemented/feature/2026-06-18-compaction-capability-seam.zh.md)——家族如何拆分，以及為何依賴會話與 LLM 詞匯。
- [排隊手動壓縮 Agent Note](../../.agents/notes/implemented/feature/2026-07-30-queued-manual-compaction.zh.md)——按需 `/compact` 如何與運行中的輪次串行化。
- [能力 seam](../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.zh.md)——本家族遵循的 Service Definition / Service Provider / Consumer 拆分。

<a id="dev-note"></a>
## 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
