---
description: "面向用戶與維護者的進程內 spawn subagent 后端說明，用于選擇、配置或排查全新子級委派。"
kind: "package-reference"
---

# @deepseek-ai/dsh-subagent-spawn-in-process

[English](README.md) | 中文

## 概述

`dsh-subagent-spawn-in-process` 是一個進程內 subagent 后端：它在當前進程中運行每個委派任務，子 agent（智能體）是一個全新子 `Agent`，復用宿主的 agent 工廠及 LLM（大語言模型）/工具服務。子 agent 以空對話開始，因此任務提示詞必須自足；除非 `request.agentOptions` 覆蓋，否則它繼承父 agent 的工作目錄、會話譜系、提供方、模型、推理強度與輸出 token 上限。委派工具或 API 調用以 `spawn` 提供方名稱找到它。需要成本最低的委派傳輸時選擇它；需要子 agent 建立在父級已完成對話輪次之上時，請選擇 fork 后端。

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

在需要把工作委派給全新進程內子 agent 的組合中掛載此后端。常用配置路徑很明確：加載 subagent 服務與本后端，再把 `dsh-tool-subagent` 之類的委派工具指向 `spawn` 提供方。

### 何時選擇

當子 agent 不需要父級對話、且可以接受在本進程內運行時，選擇 spawn 后端。當子 agent 必須建立在已完成父級輪次之上時——fork 后端會提供這些歷史——或必須在本進程之外運行時（進程外后端提供此能力），請避免使用它。由于子 agent 默認繼承父級的工作目錄與 LLM 選擇，自足的提示詞會按原樣生效。

### 最小配置

先加載 subagent 服務與本后端，再為每個目標配置一個委派工具。這是暴露由 spawn 支撐的 `subagent` 工具的最小組合：

```yaml
- name: '@deepseek-ai/dsh-subagent'
- name: '@deepseek-ai/dsh-subagent-spawn-in-process'
- name: '@deepseek-ai/dsh-tool-subagent'
  config:
    provider: spawn
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `providerName` | `spawn` | 注冊到 `ctx.subagents` 的提供方名稱 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-subagent-spawn-in-process)是每個受支持字段及其 JSDoc 的窮盡式真源。

### 一次委派會做什么

一次工具調用啟動一個子 agent 并等待其結果：子 agent 在自有會話中工作，父級只接收其最終輸出；若運行被取消、拒絕、被 token 上限截斷或在啟動時被拒，則收到出錯的工具結果。被拒絕的啟動不會留下已發布的子 agent；完成的運行在結果收集后即被 dispose（資源釋放）。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋后端的構建方式以及[使用本包](#use-this-package)中行為的來源；共享機制屬于進程內驅動器。

### 設計理念

職責劃分如下：本后端只貢獻提供方注冊與「全新開始」的決定，其余全部運行機制——深度檢查、子 agent 創建、按子 agent 定制、結構化輸出、取消、結果讀取與 dispose——都在 `dsh-subagent-in-process-driver` 中。agent 工廠的創建事務擁有未發布設置窗口及其回滾；發布之后，調用方擁有該運行。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 提供方注冊：`Config` schema、能力聲明、`start()` |
| — | 不發布運行時不變式伴生入口；本包沒有獨立事件序列或可變數據關系，相關約定在所屬 seam 強制執行。 |

### 運行流程

啟動請求先由 subagent 服務解析，然后共享驅動器校驗深度、生成子會話 id、通過宿主 agent 工廠以調用方信號創建子 agent、在創建窗口內應用 persona、工具過濾器與結構化輸出、發布子 agent、驅動一項任務、讀取子 agent 自身的最終輸出，最后完全停穩地 dispose 句柄。

### 所有權與作用域

子 agent 獲得全新的扁平注冊作用域：父級工具限制與權限絕不會被導入，工具所施加的過濾屬于組合而非父級派生授權。后端聲明包括 `agentOptions` 在內的全部五項啟動時能力，因為它控制子 agent 的創建窗口，可以逐一強制執行。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面；它們從共享 subagent 模型進入兄弟后端與窮盡式配置。

- [Subagent 子系統](../../../docs/subsystems/subagent.zh.md)——啟動請求、結果、實時運行與提供方約定。
- [dsh-subagent-in-process-driver](../subagent-in-process-driver/README.zh.md)——本后端調用的共享運行驅動器。
- [dsh-subagent-fork-in-process](../subagent-fork-in-process/README.zh.md)——以已完成父級輪次作初始內容的兄弟后端。
- [dsh-tool-subagent](../tool-subagent/README.zh.md)——指向該提供方的面向模型委派工具。
- [生成配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-subagent-spawn-in-process)——每個受支持配置字段及其源聲明。

-----

<a id="model-experience"></a>
## 模型體驗

### 子 agent 請求

#### 模型看到什么

全新子 agent 逐字接收任務內容，作為新空對話中的唯一用戶消息，默認使用父級提供方、模型、推理強度、輸出 token 上限與工作目錄。配置的 persona 會在子 agent 作用域中遮蔽全局提示詞文本；工具過濾器會從其 schema、可執行工具查找與 PTC mode SDK 綁定中移除指定的全局工具，但保留獨立注冊的指導內容。不包含任何父級對話消息；過濾屬于組合，而非繼承的權限授予。

#### Token 影響

子 agent 會為全新的獨立上下文與歷史消耗 token，不復制任何父級歷史 token。persona 會改變該子 agent 反復使用的提示詞成本；工具過濾器會改變其 schema 或生成 SDK 的成本。

#### KV Cache 影響

子 agent 的請求緩存與父級相互獨立。子 agent 歷史僅追加；persona、工具過濾、生成 SDK、提供方或模型變化會建立不同的子 agent 前綴。

### 父級工具結果（間接）

#### 模型看到什么

通過 `dsh-tool-subagent`，父級只接收子 agent 的最終輸出，或非完成終止原因對應的出錯結果；子 agent 的中間工作絕不會到達父級。

#### Token 影響

父級輸入增加一個取決于數據的結果，并保留到上下文壓縮（context compaction）為止。

#### KV Cache 影響

僅追加；新增可見內容位于可復用請求前綴之后，不會使現有 KV Cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明何時選擇該后端是錯誤的；它們是當前包約束。

- **全新表示不含父級 transcript（文本記錄）**——子 agent 繼承 cwd、譜系、提供方、模型、推理強度、輸出 token 上限及顯式配置的 persona/工具限制，但不繼承父級的任何對話；需要已完成輪次上下文時，請使用 fork 后端。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
