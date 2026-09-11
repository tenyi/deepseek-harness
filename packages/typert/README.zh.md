---
description: "Typert 組地圖：構建時類型圖生成器、運行時注冊表、Loader 集成與共享 Remote 協議，它們共同支撐類型化的 Host 到 Client 調用。"
kind: "package-group"
---

# packages/typert

[English](README.md) | 中文

## 概述

借助 Typert 組，Client 環境能以類型化方法調用 Host 能力，并在無需手寫協議代碼的情況下共享生成的 schema 與反射信息。構建時生成器把源代碼類型聲明轉換為與編譯器無關的模型與運行時產物，運行時注冊表保存這些產物，Loader 集成則在 Loader 組合中自動注冊它們。共享的協議包提供 Remote 調用聲明——裝飾器、wire 描述符、編解碼器與提供方約定——供業務包、生成產物、Host Gateway 與 Client API 共同消費。本頁是四個包的索引；每個包的 README 負責各自的配置、用法與限制。

## 目錄

- [包](#packages)
- [相關文檔](#related-documentation)
- [開發備注](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 職責 | ctx 鍵 |
|---|---|---|
| [`generator/`](generator/README.zh.md) | 在構建時分析源代碼類型，并生成運行時加載所需的反射、schema 與 Remote 描述符 | — |
| [`loader/`](loader/README.zh.md) | 把 Loader 組合中已生成的 Typert 產物自動注冊到運行時注冊表 | 消費 `ctx.loader` 與 `ctx.typert` |
| [`protocol/`](protocol/README.zh.md) | 聲明 Host 與 Client 共享的 Remote 裝飾器、wire 描述符、編解碼器與提供方約定 | — |
| [`registry/`](registry/README.zh.md) | 在運行時保存生成的包反射與實時 Zod schema，并提供 lookup 與 Context 提供方注冊表 | `ctx.typert` |

-----

<a id="related-documentation"></a>
## 相關文檔

- [Typert 子系統參考](../../docs/subsystems/typert.zh.md)——從協議與注冊表類型中原樣記錄的公共約定。
- [API Gateway 參考](../../docs/api-gateway.zh.md)——生成的 Remote 描述符如何成為實際的 Host 到 Client 調用。
- [Remote 調用 Agent Note](../../.agents/notes/implemented/architecture/2026-08-02-typert-remote-method-calls.zh.md)——Remote 調用背后的架構與傳輸決策。
- [包工作區地圖](../README.zh.md)——工作區中的每個組及其職責。

-----

<a id="dev-note"></a>
## 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
