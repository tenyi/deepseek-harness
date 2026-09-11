---
description: "面向用戶與維護者的進程內 fork subagent 后端說明，用于選擇、配置或排查以父級已完成輪次作初始內容的子 agent（智能體）。"
kind: "package-reference"
---

# @deepseek-ai/dsh-subagent-fork-in-process

[English](README.md) | 中文

## 概述

`dsh-subagent-fork-in-process` 是一個進程內 subagent 后端：它以父級已完成的對話輪次作為每個子 agent 的初始內容——子 agent 能看到所有已完成輪次，但看不到進行中的輪次，因此后續工作可以在對話基礎上繼續，而無需重復提供對話內容。委派工具以 `fork` 提供方名稱找到它，其行為與 spawn 后端一致，唯一差異是會話初始內容。當子任務延續當前對話時選擇它；當子 agent 必須獨立運行時選擇 spawn。初始內容是 fork 時的一次性快照：此后父級記錄的任何內容都不會到達子 agent。

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

當委派的工作必須建立在父級對話之上時，掛載此后端。常用路徑與 spawn 相同：加載 subagent 服務與本后端，再把 `dsh-tool-subagent` 之類的委派工具指向 `fork` 提供方。

### 何時選擇

當子 agent 需要對話的已完成輪次時——后續分析、審查、延續——選擇 fork。當子 agent 應全新開始時選擇 spawn；當子 agent 不能共享本進程時選擇進程外后端。初始內容只傳遞對話歷史：子 agent 仍獲得全新的工具作用域，且不繼承父級的任何權限。

### 初始內容邊界

初始內容止于父級最后一個已完成的輪次。subagent 啟動時，父級當前的工具調用輪次仍在進行，因此該進行中的輪次絕不會被包含；在第一個已完成輪次之前，初始內容為空，子 agent 的行為與全新 spawn 相同。

### 最小配置

先加載 subagent 服務與本后端，再配置一個委派工具。此組合暴露由 fork 支撐的 `subagent` 工具：

```yaml
- name: '@deepseek-ai/dsh-subagent'
- name: '@deepseek-ai/dsh-subagent-fork-in-process'
- name: '@deepseek-ai/dsh-tool-subagent'
  config:
    provider: fork
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `providerName` | `fork` | 注冊到 `ctx.subagents` 的提供方名稱 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-subagent-fork-in-process)是每個受支持字段及其 JSDoc 的窮盡式真源。

### 一次 fork 委派會做什么

一次工具調用啟動一個以已完成輪次為初始內容的子 agent，并等待其結果：子 agent 能看到截至父級最后一個已完成輪次的對話，在自有會話中工作，父級只接收其最終輸出——取消、拒絕、token 上限截斷或啟動被拒時則收到出錯的工具結果。初始內容在啟動時只捕獲一次；此后的父級輪次絕不會到達子 agent。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋后端背后的設計決策，以及[使用本包](#use-this-package)中行為的來源。

### 設計理念

與 spawn 的差異只有一處，且以數據表達：后端計算父級日志的已配平已完成輪次前綴，并把它作為子 agent 的會話初始內容交給共享進程內驅動器。由于實際序號等于數組下標，前綴始終是自序號零開始的合法初始內容；驅動器記錄其長度，使結果讀取器不會把作為初始內容的父級消息誤認為子 agent 輸出。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 提供方注冊：前綴計算、`Config` schema、能力聲明 |
| — | 不發布運行時不變式伴生入口；本包沒有獨立事件序列或可變數據關系，相關約定在所屬 seam 強制執行。 |

### 運行流程

`start` 時，從父級事件日志中截取截至最后一個 `turn/end` 的前綴；共享驅動器隨后以該初始內容創建子 agent，應用相同的 persona、工具過濾器與結構化輸出設置，驅動一項任務，讀取子 agent 自身的最終輸出，并執行 dispose（資源釋放）以等待所有工作完全停穩。該提供方聲明 `agentOptions`，以及與 spawn 相同的輸出、深度、過濾與 persona 能力。`prepareContinuable` 在創建時只捕獲一次前綴，因為該前綴會成為子 agent 自身持久保存的 transcript（文本記錄）的一部分。

### 生命周期綁定

base 組合包與 ACP（Agent Client Protocol）/headless 示例在委派工具上把本提供方綁定為 `backgroundMode: one-shot`，CLI（命令行界面）預設則選擇 `continuable`。兩者都保留繼承的請求前綴：父級與子級獲得定義和順序相同的消息工具，可繼續子級的父級 ID 與返回指導位于繼承歷史之后的初始用戶任務中（見[保持 fork 緩存的 Agent Note](../../../.agents/notes/implemented/architecture/2026-08-10-fork-children-stay-one-shot.zh.md)）。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面；它們從共享 subagent 模型進入兄弟后端，以及一次性綁定的設計證據。

- [Subagent 子系統](../../../docs/subsystems/subagent.zh.md)——啟動請求、結果、提供方約定與進程內深度和初始內容。
- [dsh-subagent-in-process-driver](../subagent-in-process-driver/README.zh.md)——本后端調用的共享運行驅動器。
- [dsh-subagent-spawn-in-process](../subagent-spawn-in-process/README.zh.md)——全新子級的兄弟后端。
- [dsh-tool-subagent](../tool-subagent/README.zh.md)——指向該提供方的面向模型委派工具。
- [生成配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-subagent-fork-in-process)——每個受支持配置字段及其源聲明。
- [fork 保持 one-shot](../../../.agents/notes/implemented/architecture/2026-08-10-fork-children-stay-one-shot.zh.md)——隨附組合為何把 fork 綁定為 one-shot。

-----

<a id="model-experience"></a>
## 模型體驗

### 子 agent 歷史與包絡

#### 模型看到什么

子 agent 先接收由父級已配平的已完成輪次構成的前綴，再逐字接收新的任務內容。配置的 persona 會在子 agent 的全新作用域中遮蔽提示詞文本；工具限制會過濾其全局協議 schema、可執行工具查找與 PTC mode SDK 綁定，但不影響獨立指導內容。父級的工具視圖與權限不會被繼承；可選的結構化輸出請求會添加僅屬于子 agent 的約定；父級當前進行中的輪次會被排除。

#### Token 影響

fork 會把保留的已完成歷史復制到子 agent 的請求中，子 agent 隨后獨立累積自己的 token。persona 會改變重復提示詞的成本；過濾會改變 schema 或生成 SDK 的成本；首輪 fork 沒有繼承歷史。

#### KV Cache 影響

在提供方與模型相同的前提下，子 agent 可以復用繼承的逐字節相同前綴。persona、工具過濾、生成 SDK 或路由變化可能在繼承歷史之前使復用失效；后續子 agent 歷史僅追加。可繼續消息不會增加子級專屬的系統提示詞區段或工具 schema；父級 ID 與返回指導在初始用戶任務中位于繼承歷史之后（見[保持 fork 緩存的 Agent Note](../../../.agents/notes/implemented/architecture/2026-08-10-fork-children-stay-one-shot.zh.md)）。

### 父級工具結果（間接）

#### 模型看到什么

父級只通過 `dsh-tool-subagent` 接收子 agent 自身的最終輸出，不接收繼承的前綴或中間工作。

#### Token 影響

父級輸入增加一個取決于數據的最終結果，并保留到上下文壓縮（context compaction）為止。

#### KV Cache 影響

僅追加；新增可見內容位于可復用請求前綴之后，不會使現有 KV Cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明何時選擇該后端是錯誤的；它們是當前包約束。

- **初始內容是一次性快照**——子 agent 只能看到 fork 時父級已完成的輪次，看不到父級此后記錄的任何內容；不會實時共享上下文。
- **fork 生命周期策略因組合而異**——base 組合包與 ACP/headless 示例使用一次性 fork，CLI 預設使用可繼續 fork。兩者都因父級與子級的消息定義逐字節相同而讓繼承前綴保持可復用；顯式 persona、工具過濾、生成 SDK 或路由變化仍可破壞相等性。理由見[保持 fork 緩存的 Agent Note](../../../.agents/notes/implemented/architecture/2026-08-10-fork-children-stay-one-shot.zh.md)。
- **隨附 fork 工具不公開子級 LLM（大語言模型）路由選擇**——它們繼承父級提供方與模型，使復制的歷史仍有資格復用 KV Cache。在某項改動能保留復用或公開有界重算成本前，路由選擇保持禁用；[模型選擇路由 Agent Note](../../../.agents/notes/implemented/feature/2026-08-18-model-selected-subagent-routes.zh.md)說明這項限制。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
