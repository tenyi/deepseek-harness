---
description: "ACP（Agent Client Protocol）包組：通過 JSON-RPC stdio 將全新 harness agent（智能體）暴露給程序化客戶端的僅面向自動化的服務器。"
kind: "package-group"
---

# acp/：Agent Client Protocol 自動化

[English](README.md) | 中文

## 概述

acp 組提供一個包：一個服務器，讓程序與自動化流程可以通過標準 Agent Client Protocol 運行持久 DeepSeek Harness agent。客戶端可以創建、列出、恢復與關閉會話，掛載標準 MCP 服務器，選擇模型選項，發送文本與圖片提示詞，接收語義更新，響應權限提示并取消工作——無需人類參與。從另一個 harness 啟動這種服務器的配套客戶端位于 `subagent/subagent-acp`。本頁概述該包組；各包的具體約定由其 README 規定。

## 目錄

- [包](#packages)
- [相關文檔](#related-documentation)
- [開發備注](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 職責 |
|---|---|
| [`acp/`](acp/README.zh.md) | 讓程序通過 ACP 管理持久 agent、掛載 MCP 服務器、選擇模型選項、發送提示詞、取消工作并接收語義更新 |

-----

<a id="related-documentation"></a>
## 相關文檔

- [dsh-subagent-acp](../subagent/subagent-acp/README.zh.md)——spawn 并驅動本服務器的進程外 ACP 客戶端。
- [ACP 作為僅面向自動化的協議](../../.agents/notes/implemented/simplification/2026-07-23-acp-automation-only-protocol.zh.md)——自動化約定及其協議邊界的決策記錄。
- [在單個連接上多路復用并發 ACP 會話](../../.agents/notes/archived/feature/2026-06-14-acp-multi-session.md)——按會話隔離、歸屬與清理決策。

<a id="dev-note"></a>
## 開發備注

無。
