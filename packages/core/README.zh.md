---
description: "core 分組地圖：構成產品 API 主干的會話日志、系統提示詞組裝、工具注冊表、agent（智能體）詞匯與默認循環。"
kind: "package-group"
---

# packages/core

[English](README.md) | 中文

## 概述

使用 core 包可以構建或擴展能夠記錄持久會話歷史、組裝系統提示詞、提供工具、選擇默認模型并運行模型輪次的 agent。這些包定義每個組合都會使用的共享 API，而可執行的產品組合位于 [`packages/bundle`](../bundle/README.zh.md)。開發 agent 行為或替換其中一項能力時請選擇本分組；需要默認可運行組合時，請從 [`dsh-base`](../bundle/base/README.zh.md) 開始。

## 目錄

- [包](#packages)
- [相關文檔](#related-documentation)
- [開發備注](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 職責 | ctx key |
|---|---|---|
| [`scope/`](scope/README.zh.md) | 隔離單個 agent 貢獻的作用域注冊與事件路由 | 庫，不使用 ctx key |
| [`session/`](session/README.zh.md) | 每個 agent 的歷史均派生自該僅追加會話事件日志 | `ctx.sessions` |
| [`system-prompt/`](system-prompt/README.zh.md) | 由有序段、工具 schema 與變量進行的系統提示詞組裝 | `ctx.systemPrompt` |
| [`tools/`](tools/README.zh.md) | 供循環分發使用的工具注冊表與帶防護機制的執行流水線 | `ctx.tools` |
| [`agent-tool-presentation/`](agent-tool-presentation/README.zh.md) | 為 preset 提供按 agent 的工具呈現方式選擇器 | 無 ctx key |
| [`agent/`](agent/README.zh.md) | 供插件編程使用的 `Agent` 句柄，以及其實時注冊表與事件 | `ctx.agents` |
| [`agent-default-model/`](agent-default-model/README.zh.md) | 入口對全新 agent 應用的部署默認模型選擇 | `ctx.agentDefaultModel` |
| [`agent-loop/`](agent-loop/README.zh.md) | 默認 agent 驅動器：創建 agent 并運行輪次與步驟生命周期 | `ctx.agentLoop` |

`scope` 提供共享作用域原語；`agent` 負責公開的 `Agent` 約定，而 `agent-loop` 是其默認實現，因此擴展插件依賴 `agent`，驅動器保持可替換。`agent-default-model` 負責入口在會話自身沒有選擇時應用的部署選擇。可運行組合位于 [`packages/bundle`](../bundle/README.zh.md)；本分組只負責可替換的主干組件。

-----

<a id="related-documentation"></a>
## 相關文檔

- [Core 子系統](../../docs/subsystems/core.zh.md)——逐包循環圖與 `Agent` 句柄約定。
- [會話子系統](../../docs/subsystems/session.zh.md)——會話事件詞匯與派生歷史。
- [系統提示詞子系統](../../docs/subsystems/system-prompt.zh.md)——提示詞段、動態上下文與工具 schema 類型。
- [工具子系統](../../docs/subsystems/tools.zh.md)——工具執行流水線與呈現詞匯。
- [作用域注冊子系統](../../docs/subsystems/scope.zh.md)——這些注冊表所依賴的作用域層原語。
- [架構](../../docs/architecture.zh.md)——輪次流與新行為歸屬。
- [基礎組合包](../bundle/base/README.zh.md)——默認產品組合。
- [SDK 最小組合包](../bundle/sdk-minimal/README.zh.md)——完整、獨立且功能集經過刻意精簡的組合。

-----

<a id="dev-note"></a>
## 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
