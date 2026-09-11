---
description: "面向提供方插件的官方 DeepSeek 請求擴展注冊表，用于貢獻具有生命周期歸屬的頂層 API 字段。"
kind: "package-reference"
---

# @deepseek-ai/dsh-deepseek-llm-api-extensions

[English](README.md) | 中文

## 概述

用于向 DeepSeek 官方 LLM（大語言模型）API 請求添加頂層字段的提供方特定注冊表。`DeepSeekLlmApiExtensionRegistry` 注冊 `ctx.deepseekLlmApiExtensions`；貢獻插件分別認領一個經聲明合并的字段，`dsh-llm-deepseek` 則在序列化基礎請求后準備當前貢獻。當插件必須添加經過驗證的提供方特定字段且不能修改基礎適配器時，請使用它。

## 目錄

- [服務](#service)
- [模型體驗](#model-experience)
- [已知限制與暫緩事項](#known-limitations-and-deferred-work)
- [開發備注](#dev-note)

-----

<a id="service"></a>
## 服務

- `register(field, provider)` 為調用 fiber 保留一個字段。重復或格式錯誤的名稱會同步失敗；dispose（資源釋放）該注冊后，后續提供方可以再次認領。
- `prepare(request)` 對已注冊提供方取快照，并發準備貢獻，克隆并凍結返回的 JSON 值，然后返回 `{ fields, accept }`。準備失敗會在 HTTP 分發前拒絕請求；請求取消后，即使某個提供方忽略信號，注冊表也會停止等待。
- `accept()` 對每個捕獲的 2xx 后回調只運行一次。并發調用會等待同一次結算，所有回調都在報告失敗前完成，多個失敗會合并為一個 `AggregateError`。

每個提供方都會看到確切的已序列化基礎請求體、請求 `AbortSignal`，以及可選的 `sessionId` 與輔助調用 `purpose`。提供方必須在取消后迅速停止自身工作；字段不適用于當前請求時返回 `undefined`。即使 HMR（熱模塊替換）在 HTTP 接受前移除了注冊，已準備的操作仍會保留其捕獲的提供方。

注冊表擁有字段添加與生命周期，不擁有字段語義。`@deepseek-ai/dsh-session-log-deepseek` 擁有 `dsh_session_log`；`@deepseek-ai/dsh-plugin-package-inventory-deepseek` 擁有 `dsh_plugin_packages`。提供方無關的 LLM seam 與 `llm-pi-ai` 都不消費該注冊表。

<a id="model-experience"></a>
## 模型體驗

通過 `@deepseek-ai/dsh-llm-deepseek` 間接生效；該包在模型的 `messages`、系統提示詞與工具 schema 之外發送已注冊字段。

#### KV Cache 影響

無；注冊表字段是模型不可見的提供方元數據，不改變已序列化的模型輸入前綴。

## 已知限制與暫緩事項

<a id="known-limitations-and-deferred-work"></a>

- **僅限 DeepSeek 官方請求**——該注冊表刻意不提供提供方無關的路由，也不集成 pi-ai 適配器。
- **不約定字段順序**——JSON 對象成員順序取決于注冊準備順序，但接收方按名稱尋址字段。


<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。重復所有權、detached output 與單次 acceptance settlement 都在擁有該決策的注冊表操作中強制。
