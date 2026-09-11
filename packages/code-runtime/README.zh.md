---
description: "代碼執行能力族的包映射：程序執行能為你做什么，以及每個部分由哪個包負責。"
kind: "package-group"
---

# code-runtime/——代碼執行能力族

[English](README.md) | 中文

## 概述

`code-runtime/` 組讓模型編寫一個程序，以普通異步調用的方式調用宿主提供的函數，然后只返回程序的打印輸出和返回值。如需在隔離的 Node Worker 中執行，請選擇 TypeScript 后端；如需 CPython 進程，請選擇實驗性 Python 后端。每次運行都不會保留之前程序的狀態。失敗會作為結果返回，供調用方診斷或提供給模型。

## 目錄

- [包](#packages)
- [相關文檔](#related-documentation)
- [開發備注](#dev-note)

-----

<a id="packages"></a>
## 包

這三個包共同提供程序執行能力；每個 README 描述其各自部分做什么。

| 包 | 角色 | ctx 鍵 |
|---|---|---|
| [`code-runtime/`](code-runtime/README.zh.md) | 定義代碼運行時做什么：針對宿主提供的綁定運行一個程序，并報告其打印和返回的內容 | `ctx.codeRuntime` |
| [`code-runtime-worker-thread/`](code-runtime-worker-thread/README.zh.md) | 在全新的 Node Worker 線程中執行 TypeScript 程序 | 注冊 `ctx.codeRuntime` |
| [`experimental/code-runtime-python/`](../experimental/code-runtime-python/README.zh.md) | 實驗性 Python 后端：負責 Node 宿主與 CPython 子進程之間的 fd-3 協議，以及 CPython 運行時實現 | — |

-----

<a id="related-documentation"></a>
## 相關文檔

先從子系統參考了解服務約定，再看消費此能力的 PTC mode 設計，以及它所遵循的能力 seam 模型。

- [代碼運行時子系統參考](../../docs/subsystems/code-runtime.zh.md)——請求／結果詞匯、綁定與 `ctx.codeRuntime` 的 Cordis 接口面。
- [PTC mode Agent Note](../../.agents/notes/implemented/feature/2026-06-15-ptc.zh.md)——工具注冊表如何把 `run_code` 呈現給模型。
- [能力 seam](../../docs/capability-seams.zh.md)——本家族遵循的 Service Definition / Service Provider / Consumer 拆分。

<a id="dev-note"></a>
## 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
