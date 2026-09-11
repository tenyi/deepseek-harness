---
description: "面向注冊可信外部事件策略并創建 Workspace 會話的維護者，說明 webhook 規則運行時。"
kind: "package-reference"
---

# @deepseek-ai/dsh-webhook

[English](README.md) | 中文

## 概述

`dsh-webhook` 提供 Host 側的 `ctx.webhookRuntime`：它既是受信任程序化 webhook 規則的注冊表，也擁有唯一內置動作——在 Web Workspace 中創建普通根會話。接口只包含 `register(rule)` 和 `dispatch(delivery)`；提供方身份驗證屬于適配器包。當受信任規則必須把外部事件變成新的 agent（智能體）會話時，請使用它。

## 目錄

- [規則接口](#rule-interface)
- [會話請求](#session-request)
- [組合](#composition)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備注](#dev-note)

-----

<a id="rule-interface"></a>
## 規則接口

`WebhookRule<K>` 具有帶 brand 類型的唯一 `id`、提供方 `kind` 與 `run(delivery, signal)`。回調可以執行任意受信任代碼，并返回 `null` 或一個 `WebhookSessionRequest`。同類規則彼此獨立啟動；某個回調拋出異常或其返回的 Promise 被拒絕時，只會記錄日志，不會阻止同級規則。

`VerifiedWebhookDelivery` 攜帶提供方種類、已配置來源 id、提供方交付 id、規范化的無損 JSON 與接收時間。運行時會在共享前快照并凍結完整值。`deliveryId` 僅是來源信息；重復交付會再次運行規則。

注冊是一項 effect。它的可等待 disposer 會先隱藏規則，再中止并排空活動回調。回調必須觀察所提供的 signal；忽略取消的同進程代碼無法被安全強制停止。

<a id="session-request"></a>
## 會話請求

`WebhookSessionRequest` 要求 `workspacePath`、`title`、`prompt`、`agentPreset` 與 `permissionPreset`；可選 `model` 會指定明確的提供方／模型路由與輸出 token 上限。明確路由使用其適配器的默認推理（reasoning）強度。省略時會快照包含推理強度的完整當前部署選擇，直到首個請求記錄持久 header；之后的 Web 模型變更保留普通會話行為。

運行時會在變更狀態前驗證 preset，解析或創建規范 Workspace，以該 Workspace 路徑作為 `SessionHeader.cwd` 創建 Agent，在發布前掛載 agent preset，并在應用權限、標題與提示詞前附加會話。附加失敗會對尚未發布的動作執行 dispose（資源釋放）。之后若在提示詞前失敗，則以盡力而為方式脫離 Workspace 并對 Agent 執行 dispose。

成功的 `Agent.followup()` 是 webhook 操作的提交點。消息使用 `source.kind: "webhook"`，并攜帶提供方、來源、交付與規則來源信息。運行時不等待 idle、不執行特殊 flush、不檢查回復，也不發布完成狀態；之后完全由普通 Agent 與會話行為接管。

<a id="composition"></a>
## 組合

在 Web Host plane 上，于 Agents、模型默認值、agent presets、permission presets、標題與 Workspace 注冊表之后加載運行時。用戶編寫的規則插件注入 `webhookRuntime`，并通過自己的 effect 交出 `register()` 返回的 disposer。

[GitHub 評審指南](../../../docs/user/guide/github-review.zh.md)展示了規則模塊、專用入口端口、密鑰設置與 Workspace 路由。

<a id="model-experience"></a>
## 模型體驗

### 規則編寫的初始提示詞

#### 模型看到的內容

每個匹配規則都會讓模型看到 `WebhookSessionRequest.prompt` 返回的非空文本原文。通用運行時不增加私有框架；若規則包含外部文本，則由規則負責標明其信任屬性。隨附 GitHub 示例會把選定 PR 字段標為不受信任的 JSON 元數據。

#### Token 影響

一條依賴數據的 user-role 消息保留在新會話中，并持續貢獻 token，直到普通壓縮（compaction）替換或移除該歷史。

#### KV Cache 影響

初始提示詞開啟一個新會話，因此它建立而不是使該會話的可復用請求前綴失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **僅限進程內 fire-and-forget** — 崩潰會丟失尚未接納提示詞的規則調用；不存在隊列、回放或重試。
- **無內置去重** — 提供方重復交付可能創建重復會話；需要冪等性的規則自行負責。
- **無完成結果** — HTTP 接受與規則結算都不報告 Agent 成功、idle 或輸出。
- **受信任回調必須配合取消** — 運行時 teardown 會中止并等待回調，但無法終止任意同進程代碼。
- **Workspace 創建可能比失敗的會話嘗試更長壽** — 空 Workspace 會保留，因為另一個并發調用者可能已經使用它。


<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者工作上下文——點擊展開</summary>

無。

</details>
