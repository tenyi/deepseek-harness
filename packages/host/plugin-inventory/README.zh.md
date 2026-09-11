---
description: "當前 Cordis Loader 插件狀態的只讀投影，并附帶每個 agent preset（智能體預設）的組合：面向 web GUI 宿主客戶端的 pluginInventory 服務及其 pluginInventory/list Remote。"
kind: "package-reference"
---

# @deepseek-ai/dsh-host-plugin-inventory

[English](README.md) | 中文

## 概述

客戶端可以調用 `pluginInventory/list`，按加載順序展示宿主的當前插件，包括每個條目的標識符、模塊標識、有效啟用狀態與存活階段。部署組合了 agent preset roster 時，還會報告各預設的元數據、健康狀態與壓平后的插件組合；沒有 roster 時，預設數據缺席。每次響應都是供展示和診斷使用的只讀即時快照：它不能修改插件，也不提供歷史、來源信息或變更訂閱。

## 目錄

- [使用本包](#use-this-package)
- [理解實現](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

當客戶端或設置頁需要展示宿主當前組合了什么——哪些插件已加載、已啟用、是否存活，以及每個 agent preset 會給會話什么——時調用 `pluginInventory/list`。Remote 是唯一入口：該服務僅供 Remote 使用，刻意不聲明同進程 Cordis `Context` 合并。

### 快照包含什么

每一行是一個非組 Loader 條目：其條目 id、精確模塊標識、有效啟用狀態（含被禁用的祖先組）與當前根 Fiber 階段。`pending` 表示條目等待加載，`loading` 表示正在讀取，`active` 表示正在運行，`failed` 表示其 fiber 被拒絕，`unloading` 表示正在拆除；`null` 表示完全不存在存活的根 Fiber。結構性的 group 行會被跳過。

### 每個預設的組合

組合了 roster 時，`agentPresets` 按 roster 順序攜帶每個預設一組：其 id、隨部署內置還是用戶自建（`trust`，客戶端據此本地化內置預設名）、發布的顯示名、未指名預設的會話是否組合它，以及壓平后的插件行——條目 id（文件行未聲明時為 null）、模塊標識、有效啟用狀態、行自帶的 `!!js` disabled 表達式（如有），以及組合存活時的根 Fiber 階段。已有會話組合過的預設由其最新仍存續的世代作答——即使其文件事后損壞也是如此，因為掛載才是這些會話實際運行的組合；開機以來從未被組合的預設由其組合文件作答，disabled 門用 Loader 上下文求值，且讀取從不掛載預設。`conditional` 表示宿主無法求值的門；無人組合的壞預設保留在列表中，攜帶原因且沒有行。沒有 roster 時該字段缺席。

### 你能用它做什么、不能做什么

該清單是供展示與診斷的快照：客戶端可以渲染名單、標出失敗條目，并通過比較快照檢測變化。它不能啟用、停用、添加或移除插件，也不攜帶歷史——已經失敗并被移除的 fiber 缺席。由于服務每次調用都讀取 Loader，答案總是反映當前組合，而不是緩存視圖。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

### 設計理念

網關是一層沒有第二個生命周期真源的直接投影：每次 `list()` 調用都讀取 `ctx.loader.entries()`，并把每個非組條目映射為公共行。Cordis 內部的 `plugin/status` 事件已經維護了 `Entry.fiber` 與 `Fiber.state`，因此再加緩存只會多出一個需要同步的生命周期真源。agent preset roster 是每次調用經 `ctx.get('agentPresets')` 解析的可選伙伴：所有預設讀取都由它的 `compositionInventory()` 負責，本包只把根 Fiber 狀態映射到公共階段詞匯。

### 階段映射

Fiber 狀態映射到公共階段詞匯，其中 `disposed` 折疊為 `null`——fiber 已消失的條目沒有可報告的存活根。因此階段從不區分為什么沒有存活根：條目可能從未啟動，也可能其 fiber 已被釋放。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | `PluginInventoryGateway`：`pluginInventory` Remote 服務與 Loader 投影 |
| [`src/types.ts`](src/types.ts) | 公共 payload 類型：`PluginInventoryEntry`、`PluginInventorySnapshot`、`PluginFiberPhase` |
| — | 不發布運行時不變式配套項；每個快照都投影 Loader 持有的狀態。 |

Typert 生成由 `./typert` 與 `./remote` 導出的 Host 和 Client Remote 產物。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當清單約定不夠用時閱讀以下內容：先看 Remote 如何到達客戶端，再看它所投影的 Loader 與渲染它的界面。

- [Remote 組合](../../api/remotes/README.zh.md)——客戶端如何在不導入 Host 實現的情況下消費 `pluginInventory/list`。
- [Cordis 插件 loader](../../../vendor/loader/README.md)——本包所投影條目的那個 Loader。
- [插件清單設置界面](../../client/ui-settings-plugin-inventory/README.zh.md)——渲染該清單的瀏覽器側投影。

-----

<a id="model-experience"></a>
## 模型體驗

無。這個僅限 Host 的只讀 Loader 投影不注冊任何面向模型的內容。

#### KV Cache 影響

無；該包既不組裝也不發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明即時清單無法向客戶端提供哪些信息。它們是當前包約束，不是任務積壓。

- **僅表示調用當下**——結果不包含持久的失敗歷史或訂閱；只要不存在存活的根 Fiber，就會報告 `null`，而不區分其原因。
- **無來源與修改能力**——服務不識別條目由哪個 bundle、profile 或 override 引入，也不能在任一平面啟用、停用、添加或移除插件。
- **預設僅隨 roster 出現**——未裝 `dsh-agent-presets` 的部署只提供 Loader 條目；`agentPresets` 字段缺席而非為空。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
