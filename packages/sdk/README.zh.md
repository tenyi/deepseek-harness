---
description: "SDK 家族的包映射：JSON-RPC 協議，以及供進程外 SDK 使用的 TypeScript 客戶端與服務器。"
kind: "package-group"
---

# sdk/：從另一進程驅動 Harness 運行時

[English](README.md) | 中文

## 概述

SDK 家族讓另一進程通過按換行分幀的 JSON-RPC 驅動完整的 DeepSeek Harness 運行時。協議包定義公開消息，TypeScript 客戶端用具名 profile 和有序 patch 啟動 `dsh`，服務器則通過 stdio 接受 SDK 請求。客戶端可以打開會話、發送提示詞，并觀察會話事件、agent（智能體）狀態變化與 subagent 完成事件。TypeScript 客戶端與 [Python SDK](../../python/README.zh.md) 使用同一種協議，而這些包不會創建開發者項目，也不定義其他應用。

## 目錄

- [包](#packages)
- [相關文檔](#related-documentation)
- [開發備注](#dev-note)

-----

<a id="packages"></a>
## 包

每個包的 README 都介紹了其所對應棧組件的用途。

| 包 | 職責 |
|---|---|
| [`protocol/`](protocol/README.zh.md) | 協議格式（wire format）：按換行分幀的 JSON-RPC 傳輸，以及具名的請求、結果與通知類型 |
| [`client/`](client/README.zh.md) | TypeScript 客戶端：啟動運行時子進程，通過高層與協議層 API 驅動 agent 輪次 |
| [`server/`](server/README.zh.md) | `jsonrpc` 插件：通過 stdio 為進程外 SDK 客戶端提供服務 |

-----

<a id="related-documentation"></a>
## 相關文檔

先從 Python SDK（客戶端約定的姊妹實現）開始，再看可運行應用與組邊界背后的決策記錄。

- [Python SDK](../../python/README.zh.md)——采用同一種協議并附帶打包運行時的 Python 對應實現。
- [SDK 應用組合包](../bundle/sdk-app/README.zh.md)——啟動 JSON-RPC 服務器的 `dsh --profile sdk` 應用。
- [架構](../../docs/architecture.zh.md) — 打包后的 Python 客戶端為何啟動相同的具名 profile。
- [SDK 項目工具鏈移除](../../.agents/notes/archived/simplification/2026-08-11-remove-sdk-project-toolchain.md) — 本組為何從不創建、配置或構建開發者項目。
- [SDK subagent 提供方](../subagent/subagent-dsh-sdk/README.zh.md) — harness 內部使用 TypeScript 客戶端的提供方。

<a id="dev-note"></a>
## 開發備注

無。
