---
description: "經驗證的外部事件、程序化規則與即發即棄 DSH 會話創建的包映射。"
kind: "package-group"
---

# webhook/ — 從已驗證外部事件到 DSH 會話

[English](README.md) | 中文

## 概述

Webhook 系列接收通過身份驗證的提供方事件，并運行受信任的程序化規則。規則可以在 Web Workspace 中創建普通根會話。分發僅存在于進程內并采用 fire-and-forget，不擁有交付數據庫、隊列、重試、去重或 agent（智能體）完成狀態。

## 目錄

- [包](#packages)
- [相關文檔](#related-documentation)
- [開發備注](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 角色 | ctx key |
|---|---|---|
| [`webhook/`](webhook/README.zh.md) | 規則注冊表、回調生命周期與基于 Workspace 的會話創建 | `ctx.webhookRuntime` |
| [`webhook-github/`](webhook-github/README.zh.md) | GitHub HTTP 簽名驗證適配器 | 消費 `ctx.webhookRuntime` 與 `ctx.webServer` |

<a id="related-documentation"></a>
## 相關文檔

提供方適配器負責驗證身份并規范化交付。規則擁有任意條件和外部調用，隨后返回 `null` 或一個會話請求。[Webhook 子系統參考](../../docs/subsystems/webhook.zh.md)擁有共享類型與時序保證。

<a id="dev-note"></a>
## 開發備注

無。
