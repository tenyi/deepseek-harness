---
description: "文本 spill 能力家族的包映射：存儲服務、本地后端與結果策略各自提供什么。"
kind: "package-group"
---

# spill/：文本 spill 能力家族

[English](README.md) | 中文

## 概述

`spill/` 組在模型上下文之外保存全文，并返回定位信息與取回指引。該家族拆分為 `spill/` 中的存儲服務、`spill-local/` 中的本地文件系統后端，以及 `spill-policy/` 中的工具結果策略。工具結果 spill 通過 `maxInlineBytes` 按需啟用，存儲失敗時保留原始結果。[會話引用](../context/session-reference/README.zh.md)也直接使用存儲來保存已捕獲但被截斷的 transcript（文本記錄），并自行提供預覽和失敗通知；它不需要工具結果策略。

## 目錄

- [包](#packages)
- [相關文檔](#related-documentation)
- [開發備注](#dev-note)

-----

<a id="packages"></a>
## 包

三個包分別承擔 spill 相關角色；完整的詞匯定義和約定以子系統參考文檔為準。

| 包 | 職責 | ctx 鍵 |
|---|---|---|
| [`spill/`](spill/README.zh.md) | 存儲服務：保存超大文本并返回定位信息與取回指引 | `ctx.spillStore` |
| [`spill-local/`](spill-local/README.zh.md) | 將 spill 文本保存到本機的私有會話級文件 | 注冊到 `ctx.spillStore` |
| [`spill-policy/`](spill-policy/README.zh.md) | 用預覽和定位信息替換過大的純文本工具結果 | 監聽 `ctx.tools` |

-----

<a id="related-documentation"></a>
## 相關文檔

先從子系統參考文檔了解共享詞匯，再看設計決策。

- [spill 子系統](../../docs/subsystems/spill.zh.md)——`SaveTextSpill`/`SpillRef` 詞匯、歸屬與后端關系。
- [工具輸出 spill 決策](../../.agents/notes/implemented/architecture/2026-07-08-tool-output-spill-files.zh.md)——存儲、保留與工具自有輸出處理之間的能力邊界。

<a id="dev-note"></a>
## 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
