---
description: "MCP 包組：掛載外部 Model Context Protocol 服務器，讓它們的工具可以作為原生工具調用。"
kind: "package-group"
---

# MCP — 模型上下文協議

[English](README.md) | 中文

## 概述

`mcp/` 組把 harness 連接到 Model Context Protocol（MCP）工具服務器生態。本組的唯一一個包掛載外部服務器——文件系統、GitHub、數據庫或記憶服務器——使該服務器的工具以穩定的服務器限定名稱提供給模型，并可作為原生工具調用。每個服務器對應一個配置項；默認不啟用任何服務器，因此按需逐個啟用。只橋接 Tools 能力：MCP resources 與 prompts 不受支持。本頁提供該組的索引；具體包的約定由其 README 說明。

## 目錄

- [包](#packages)
- [相關文檔](#related-documentation)
- [開發備注](#dev-note)

-----

<a id="packages"></a>
## 包

本組只包含一個包；詳細信息以該包的 README 和下方鏈接為準。

| 包 | 提供的能力 |
|---|---|
| [`mcp-client/`](mcp-client/README.zh.md) | 掛載一臺外部 MCP 服務器，讓模型可以把它的工具當作原生工具調用 |

-----

<a id="related-documentation"></a>
## 相關文檔

先用可運行的示例配置體驗插件，再閱讀 Agent Note 了解其背后的行為決策。

- [MCP 客戶端插件 Agent Note](../../.agents/notes/implemented/feature/2026-07-07-mcp-client-plugin.zh.md)——橋接的設計：服務器限定命名、發現、執行與環境清洗。
- [第三方記憶 MCP 指南](../../docs/user/guide/mcp-memory.zh.md)——可運行的 overlay 配置行與設置說明。
- [工具子系統參考](../../docs/subsystems/tools.zh.md)——接收已注冊工具的 `ToolRuntime`。

<a id="dev-note"></a>
## 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
