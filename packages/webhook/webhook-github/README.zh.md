---
description: "面向把已認證 JSON 事件路由到 webhook 運行時的部署，說明帶簽名的 GitHub webhook 適配器。"
kind: "package-reference"
---

# @deepseek-ai/dsh-webhook-github

[English](README.md) | 中文

## 概述

`dsh-webhook-github` 會在注入的 `ctx.webServer` 上注冊一條精確 HTTP 路由。它限制并驗證 GitHub 原始 JSON body，投影提供方無關的交付，調用 `ctx.webhookRuntime.dispatch()`，并在不等待規則或會話的情況下返回 `202`。部署需要為通用 webhook 運行時提供經過身份驗證的 GitHub 入口時，請使用它。

## 目錄

- [配置](#configuration)
- [HTTP 約定](#http-contract)
- [專用監聽器組合](#dedicated-listener-composition)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備注](#dev-note)

-----

<a id="configuration"></a>
## 配置

| Key | 含義 |
|---|---|
| `source` | 攜帶給規則的非空適配器實例，例如 `primary-github`。 |
| `path` | 不帶尾隨斜杠、查詢或片段的精確非根路徑。 |
| `secretEnv` | 包含 GitHub webhook 密鑰的憑據引用。 |
| `maxBodyBytes` | 未改動請求 body 的正安全整數上限。 |

所有字段均為必填。每次請求都會重新解析密鑰引用，因此輪換會在下一次交付生效，而無需重新加載插件。

<a id="http-contract"></a>
## HTTP 約定

只接受 `POST application/json`。適配器讀取有界 UTF-8 body，要求 `X-Hub-Signature-256`、`X-GitHub-Delivery` 與 `X-GitHub-Event`，解析密鑰，在 JSON 解析前驗證 HMAC，并要求頂層是無損 JSON 對象。它絕不記錄密鑰、簽名或 payload。

| 狀態 | 含義 |
|---|---|
| `202` | 已驗證 JSON 已在內存中分發。 |
| `400` | 必需 header、UTF-8、JSON 或頂層對象無效。 |
| `401` | 簽名無效。 |
| `405` | 方法不是 `POST`。 |
| `413` | 聲明或流式 body 超過 `maxBodyBytes`。 |
| `415` | media type 不是 `application/json`。 |
| `503` | 憑據或 webhook 運行時不可用。 |

`202` 不表示任何規則已經匹配，也不表示已創建會話。GitHub 事件特定字段的驗證屬于各規則；適配器只保證通過身份驗證的通用 JSON。

<a id="dedicated-listener-composition"></a>
## 專用監聽器組合

普通 Web profile 已經擁有 `ctx.webServer`。把另一個 `dsh-host-webserver` 和此適配器掛載到僅隔離 `webServer` 的 group 內；適配器仍會繼承憑據與 `webhookRuntime`。[GitHub 評審指南](../../../docs/user/guide/github-review.zh.md)在 TLS 反向代理后使用 `127.0.0.1:3081/github`，而 UI 繼續位于端口 3080。

<a id="model-experience"></a>
## 模型體驗

通過 `dsh-webhook` 間接產生影響：此適配器不貢獻提示詞或工具 schema；匹配規則擁有會話請求與模型可見文本。

#### KV Cache 影響

相互獨立。身份驗證與 HTTP 分發不觸碰模型請求；任何新會話前綴都屬于消費它的規則與運行時。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **無 TLS**：注入的開發 WebServer 通常只監聽 loopback，并位于 TLS 反向代理或 tunnel 后。
- **僅通用 payload 驗證**：規則負責驗證自己消費的 GitHub 事件字段。
- **不向提供方確認下游工作**：`202` 先于任意規則調用與會話創建。
- **不支持表單編碼**：GitHub 必須發送 `application/json`；`application/x-www-form-urlencoded` 會被拒絕。


<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。authentication 與 input validation 在對應 HTTP 操作中完成；route/disposer 對稱性由 `dsh-host-webserver` 負責。
