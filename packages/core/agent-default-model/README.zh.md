---
description: "面向用戶與維護者的部署默認模型選擇說明，用于選擇、配置或調試新創建的 agent（智能體）初始使用哪個模型。"
kind: "package-reference"
---

# @deepseek-ai/dsh-agent-default-model

[English](README.md) | 中文

## 概述

`dsh-agent-default-model` 在會話未指定模型時，為新創建的 agent 提供共享的默認提供方與模型。使用它可以為所有受支持的 agent 入口統一選擇起始模型，其中包括 `dsh --profile headless`。設置可用時，用戶可以覆蓋已配置的選擇（包括推理（reasoning）強度），保存的更改會在后續讀取中生效。該默認值作用于整個進程；按會話選擇模型仍由創建 agent 的入口負責。

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

在創建 agent 且未顯式給出模型路由的任何地方掛載本包。該服務回答一個問題——新 agent 應該使用哪個模型？——因此創建 agent 的入口查詢它，而不必重新實現默認值。

### 配置默認值

組合配置項是默認值的基礎：它要求提供方與模型，并且不依賴任何設置提供方也能使用。

```yaml
- name: '@deepseek-ai/dsh-agent-default-model'
  config:
    provider: deepseek
    model: deepseek-chat
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `provider` | 必填 | 新 agent 使用的已注冊提供方路由 |
| `model` | 必填 | 新 agent 使用的、由提供方持有的模型 id |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-agent-default-model)是所有受支持字段的完整參考。`reasoningEffort` 刻意不是配置字段：它屬于設置層，因此完整保存的選擇可以在下一個選定的模型沒有推理強度時清除舊值，而組合配置值會再次被繼承。

### 讀取與更改默認值

`currentSelection()` 為新創建的 agent 返回一份獨立的 `{ provider, model, reasoningEffort? }`；`saveSelection()` 為后續 agent 保存完整選擇。

```text
const selection = ctx.agentDefaultModel.currentSelection()
await ctx.agentDefaultModel.saveSelection({ provider, model, reasoningEffort: 'high' })
```

未掛載設置提供方時，`saveSelection()` 不執行任何操作，組合配置項仍為當前值。該服務不校驗目錄成員關系：提供方路由可以服務未在目錄中公布的模型；發起模型請求的消費方負責可用性診斷。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋該服務如何實現上述行為；可觀察約定已在[使用本包](#use-this-package)中完整說明。

### 設計理念

該服務是一個組合配置項，帶有由設置支撐的數據源。插件配置提供基礎 `{ provider, model }`；掛載設置提供方后，`agent-default-model` 設置分節成為實時數據源，所有消費方都通過 `currentSelection()` 讀取，因此寫入設置后無需在注冊層面重建。`reasoningEffort` 只存在于設置 schema 中：配置不能攜帶它，因為新選擇清除推理強度后，該值必須保持清除，而不能再次從組合配置中繼承。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`AgentDefaultModelConfig` 服務、設置分節安裝、`currentSelection`/`saveSelection` |
| — | 未發布運行時不變式配套項；唯一的可變值關系由設置校驗負責。 |

### 行為說明

兩個公開方法都只是對該數據源進行簡單讀寫：`currentSelection()` 返回一個全新、獨立的對象，因此調用方可以持有它，而不會與服務狀態共享引用；`saveSelection()` 在存在 `ctx.settings` 時寫入完整選擇。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

包級約定對大多數消費方已經足夠；需要周邊領域時再閱讀以下頁面。

- [Core 子系統](../../../docs/subsystems/core.zh.md)——`Agent` 句柄與 `AgentOptions` 路由選擇。
- [agent-loop 包](../agent-loop/README.zh.md)——agent 在請求時如何解析提供方與模型。
- [生成配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-agent-default-model)——每個受支持配置字段及其源聲明。
- [core 分組地圖](../README.zh.md)——core 各包如何組合。

-----

<a id="model-experience"></a>
## 模型體驗

通過該服務提供給入口的 `ModelSelection` 間接影響；模型可見請求由請求組裝與提供方適配器負責。

#### KV Cache 影響

更改默認值只影響之后從它解析選擇的 agent。請求日志已經指明選擇的現有會話仍沿用該選擇，因此本服務不會使其已建立的前綴失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制界定該服務的范圍。它們是當前包約束，不是任務積壓。

- **單一的進程級默認值**——該服務只擁有一個默認值；按會話的模型選擇仍由入口負責。
- **沒有設置提供方時無法保留**——未掛載設置提供方時，`saveSelection()` 無法為后續 agent 保留選擇。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
