---
description: "LLM（大語言模型）能力包組：一個提供方無關的模型調用服務、DeepSeek 與 pi-ai 提供方適配器、請求重試執行，以及具備回放感知的 token 計量。"
kind: "package-group"
---

# llm/ — LLM 能力家族

[English](README.md) | 中文

## 概述

llm 組提供 harness 的模型調用能力：一個提供方無關的服務，任何組合都可以通過它向模型提供方發起流式請求，外加適配器、提供方專用請求元數據、重試執行與計量。核心 `llm` 包定義所有插件與會話日志使用的消息、內容塊與流式分片詞匯；提供方適配器把某個提供方的協議格式（wire format）翻譯為該詞匯；DeepSeek 請求擴展插件在模型輸入之外貢獻具有生命周期歸屬的元數據；`llm-retry` 在持久化的 agent（智能體）步驟邊界上重跑失敗的請求；`token-meter` 從持久化日志測量請求與上下文壓力。本頁列出該包組的組成；每個包 README 負責各自的包級約定。

## 目錄

- [包](#packages)
- [相關文檔](#related-documentation)
- [開發備注](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 職責 | ctx key |
|---|---|---|
| [`llm/`](llm/README.zh.md) | 通過已注冊的提供方適配器流式發起一次模型調用，并共享 harness 的消息、塊與分片詞匯 | `ctx.llm` |
| [`llm-deepseek/`](llm-deepseek/README.zh.md) | 以 DeepSeek chat-completions 直連、thinking 與圖片輸入服務 `deepseek-official` 路由 | 注冊到 `ctx.llm` |
| [`llm-pi-ai/`](llm-pi-ai/README.zh.md) | 通過 pi-ai 目錄與協議格式服務配置的提供方路由，包括手工聲明的網關 | 注冊到 `ctx.llm` |
| [`deepseek-llm-api-extensions/`](deepseek-llm-api-extensions/README.zh.md) | 在官方 DeepSeek 請求上注冊具有生命周期歸屬的頂層字段 | `ctx.deepseekLlmApiExtensions` |
| [`plugin-package-inventory-deepseek/`](plugin-package-inventory-deepseek/README.zh.md) | 為官方 DeepSeek 請求貢獻當前啟用的 Loader 包清單 | 貢獻 `dsh_plugin_packages` |
| [`llm-retry/`](llm-retry/README.zh.md) | 在持久 agent 步驟邊界上按各提供方策略重試失敗的模型請求 | 監聽 `agent/request-error` |
| [`token-meter/`](token-meter/README.zh.md) | 用固定啟發式規則從持久會話日志測量請求與上下文壓力 | `ctx.tokenMeter` |

-----

<a id="related-documentation"></a>
## 相關文檔

- [LLM 流式子系統](../../docs/subsystems/llm-streaming.zh.md)——消息與塊類型、組裝后的模型請求、`StreamChunk` 協議與適配器約定（adapter contract）。
- [Token 計量子系統](../../docs/subsystems/token-meter.zh.md)——`ctx.tokenMeter` 背后的測量語義。
- [孿生 LLM 適配器](../../.agents/notes/implemented/architecture/2026-06-13-twin-llm-adapters.zh.md)——為什么 DeepSeek 路由交付兩個結構不同的適配器。
- [按路由的模型上下文](../../.agents/notes/implemented/architecture/2026-07-20-routed-model-context-and-compaction-policy.zh.md)——loop 如何路由模型請求并壓縮上下文。

<a id="dev-note"></a>
## 開發備注

無。
