---
description: "面向模型的 subagent 委派工具，供用戶與維護者配置、組合或排查基于 subagent 提供方的委派。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-subagent

[English](README.md) | 中文

## 概述

使用本包可為 agent 提供一個具名工具，把工作委派給已配置的子 agent 后端。`one-shot` 模式下，調用默認等待子 agent；`continuable` 模式下，調用默認在后臺啟動持久化子 agent，并返回可用于后續消息的 id。受支持的后端還可公開獲準的子級 LLM 提供方、模型與推理等級供模型選擇。每個實例均可設置子 agent 的 persona、工具權限與深度限制，失敗的運行會返回錯誤，而非部分成功。

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

每個委派目標掛載一個實例，且每個實例的 `toolName` 必須不同。工具與其提供方同時存在、同時消失，因此同級加載順序與提供方重新加載都不會讓工具懸空。

### 最小配置

先加載 subagent 服務、一個進程內或遠程后端與本工具，然后指定提供方名稱。此組合暴露一個委派給 `spawn` 后端的 `subagent` 工具：

```yaml
- name: '@deepseek-ai/dsh-subagent'
- name: '@deepseek-ai/dsh-subagent-spawn-in-process'
- name: '@deepseek-ai/dsh-tool-subagent'
  config:
    provider: spawn
    toolName: subagent
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `provider` | 必填 | `ctx.subagents` 上的提供方名稱（如 `spawn`、`fork`、`acp`） |
| `toolName` | `subagent` | 面向模型的工具名稱；每個已加載實例必須不同 |
| `modelSelectionSettings` | `false` | 為每個頂層 Session 讀取宿主的精確路由授權偏好；常駐 preset 觀察匹配 Session，直接 Agent setup 則顯式傳入其 Session；要求提供方支持 `agentOptions` |
| `enableRunInBackground` | `true` | 公開 `run_in_background`；禁用時也會拒絕強制后臺調用 |
| `backgroundMode` | `one-shot` | 后臺策略：`one-shot` 默認前臺調用；`continuable` 默認后臺調用，并要求提供方具備 `prepareContinuable` 能力 |
| `agentOptions` | — | 配置的子級 `provider`、`model`、適配器所有的 `reasoningEffort` 與正整數 `maxTokens` 默認值；要求提供方支持 `agentOptions`，并會覆蓋提供方持有的路由默認值 |
| `persona` | — | 每個子 agent 獨立的 persona；要求提供方具備 `persona` 能力 |
| `toolFilter` | — | 每個子 agent 獨立的全局工具限制；要求提供方具備 `toolFilter` 能力 |
| `maxDepth` | `3` | 絕對委派深度上限（`0` 禁止委派）；`'provider-managed'` 不向進程外提供方發送上限 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-subagent)是每個受支持字段及其 JSDoc 的窮盡式真源。

### 前臺與后臺模式

`one-shot` 策略下，省略 `run_in_background` 會在前臺等待并返回子 agent 的最終文本；`run_in_background: true` 會啟動一個歸父級所有的普通后臺任務，并返回 `started background subagent job <id>`，可用 `job_output` 收集、用 `job_kill` 停止。

`continuable` 策略下，省略或為 `true` 的 `run_in_background` 會啟動一個持久化子 agent，并返回 `started subagent <childId>`，不等待結果；子 agent 的 Activation 結束時，運行時投遞一條結算通知，可選的 `send_message` 工具會向它發送更多工作。把 `run_in_background` 設為 `false` 可在前臺等待結果。

`maxDepth` 限制遞歸深度（默認 `3`；`0` 禁止委派），并要求提供方具備 `depthLimit` 能力；`'provider-managed'` 把預算留給進程外提供方。當提供方支持時，`persona` 與 `toolFilter` 會配置每個子 agent；工具在達到上限時仍然可見——每次嘗試啟動都會檢查調用 agent 的當前深度，被拒絕時返回出錯的工具結果。

### 選擇子級 LLM

設置 `modelSelectionSettings: true`，即可在組合每個全新頂層 Session 時讀取宿主的 `subagent-model-selection` 偏好。沒有已記錄策略的恢復 Session 會保持禁用，包括顯式為空的恢復。啟用后，非空的精確 provider/model 路由列表會記錄進 Session、由子 Session 繼承，后續設置編輯不會改變它。工具隨后公開可選的 `provider`、`model` 與 `reasoning_effort` 字段，并注冊共享的 `list_subagent_models` 工具。此模式要求后端聲明 `agentOptions`；兩個進程內后端和 DSH SDK 支持該能力，而 ACP、Codex 與 Claude Code 會拒絕它，而不是忽略它。

一次調用需同時提供 `provider` 與 `model`；當配置值、父 agent 值或提供方持有的默認值能提供路由時，也可只提供推理等級。靜態的 `provider.agentRouteDefaults` 在存在時構成提供方／模型基線；工具配置與模型字段會在路由相關強度合并和確切路由預檢前覆蓋它。沒有這些默認值的提供方會使用父 agent 最新已記錄請求中的兼容值，再使用父級首次請求前的創建選項，并保留配置的 `maxTokens`。更改路由但未顯式提供推理等級時，會清除繼承的路由自有等級，使所選模型解析自己的默認值。實時 LLM 適配器在創建子 agent 前校驗有效路由。目錄成員資格只提供建議，因此適配器接受時，模型可以使用未列出的 id。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋工具如何鏡像提供方生命周期并結算運行；可觀察行為已在[使用本包](#use-this-package)中說明。

### 設計理念

一個實例就是一個提供方加一個工具名稱。插件鏡像提供方生命周期：具名提供方出現時注冊工具，提供方離開時釋放工具，因此同級加載順序與 HMR 替換不會讓工具懸空。直接 Agent setup 顯式傳入尚未發布的 Session，并在發布前等待安裝完成。由設置控制的常駐 preset 從生命周期事件接收每個匹配 Agent，從其 Session 選擇策略，并通過其 Context 安裝。提供方無法執行的數值型 `maxDepth` 或已配置 LLM 選擇會在掛載時失敗，而不是在首次委派時失敗。每個工具作用域內最多一個實例可以擁有模型選擇，因為 `list_subagent_models` 使用全局名稱。

### 前臺結算

前臺調用會等待 `run.result`，把每個非完成終止原因映射為錯誤標題，追加提供方診斷與任何保留下來的部分 assistant 文本，并在返回前始終等待 `run.dispose()`；當結果收集與 dispose（資源釋放）都 reject 時，出錯結果會保留兩項失敗。

### 后臺路由

一次性后臺模式會注冊一個歸父級所有的普通 Task，其 done 通道結算啟動，并在 detail 中保留終止原因與可選提供方診斷。可繼續后臺模式調用 `ctx.subagents.startContinuable()`，該調用在 inbox 接受時結算：子 agent 自此擁有自己的輪次，因此該調用既不等待也不收集結果。

### 隨上下文變化的措辭

工具描述源自 `provider.inheritsParentContext`：全新子 agent 得到「it does not see this conversation」措辭，fork 子 agent 得到「it does not see the current in-flight turn」措辭，因此模型既不會復述、也不會省略并不存在的上下文。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 工具注冊、生命周期鏡像、模式解析、結果結算 |
| [`src/model-selection.ts`](src/model-selection.ts) | 請求／配置合并與實時 LLM 路由預檢 |
| [`src/model-selection-settings.ts`](src/model-selection-settings.ts) | 為新 Session 讀取的宿主所有 opt-in 設置 |
| [`src/model-selection-state.ts`](src/model-selection-state.ts) | 記錄并繼承已讀取決定的 Session 事件 |
| [`src/list-models.ts`](src/list-models.ts) | `list_subagent_models` 運行時發現工具 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面；它們從工具運行時行為進入它所委派其上的 seam，以及相鄰的子 agent 工具。

- [Subagent 子系統](../../../docs/subsystems/subagent.zh.md)——提供方、一次性啟動請求、可繼續子 agent 與 Activation。
- [dsh-tool-subagent-control](../tool-subagent-control/README.zh.md)——可繼續子 agent 的消息、中斷與列表工具。
- [生成工具目錄](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-subagent)——默認 schema 與各模式的措辭。
- [生成配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-subagent)——每個受支持配置字段。
- [后臺優先的可繼續委派](../../../.agents/notes/archived/feature/2026-08-11-background-first-continuable-delegation.md)——可繼續工作為何默認在后臺運行。
- [模型選擇 subagent 路由](../../../.agents/notes/implemented/feature/2026-08-18-model-selected-subagent-routes.zh.md)——選擇策略、繼承、發現與 fork 限制。

-----

<a id="model-experience"></a>
## 模型體驗

### 工具 schema

#### 模型看到什么

當提供方存在時，以當前實例配置的名稱公開已生成的默認 [`subagent` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-subagent)。啟用的 Session 策略會添加 `provider`、`model` 與 `reasoning_effort`，以及繼承和選擇指引；提供方必須支持 `agentOptions`。提供方是否繼承上下文會改變工具描述和提示詞描述。啟用后臺模式會添加 `run_in_background`：可繼續模式會記錄其默認值為 `true`、運行時結算通知與顯式前臺覆蓋；一次性模式會記錄其默認值為 `false`，以及用 `job_output` 收集或用 `job_kill` 停止的 job id。當工具在本次組裝的作用域中可見時，一個 `tool:<toolName>` 系統提示詞 section 會指示模型同時啟動相互獨立的可繼續委派、在它們運行時繼續工作，并且僅當下一步動作依賴結果時選擇前臺；工具限制會同時移除其 schema 和這段指引。

#### Token 影響

每個父級請求支付固定的 schema 成本；模型選擇會增加三個參數。每個提供方實例增加一個 schema，每個可繼續實例還增加一個簡短的系統提示詞 section。

#### KV Cache 影響

只要提供方實例及其配置不變，前綴就保持穩定。適配器目錄變化不會改變定義；子級路由覆蓋可能使 fork 子 agent 無法復用繼承的父級前綴。

### 模型選擇與發現

#### 模型看到什么

Session 攜帶策略的 settings 控制實例會公開子級 LLM 選擇字段與 `list_subagent_models`。可選 `ctx.llm` 服務不可用時，調用會失敗。發現只返回精確路由策略中的已注冊提供方與已公布模型；未授權提供方會在調用其適配器目錄前被拒絕，精確查詢也必須先獲準，才會解析模型的推理強度與默認值。執行階段會獨立強制同一策略。

#### Token 影響

啟用的組合中存在一個固定發現 schema。只有模型調用工具時，目錄內容才進入 transcript。

#### KV Cache 影響

適配器注冊與目錄變化不會改變 schema 前綴。每個發現結果都追加在可復用前綴之后。

### 系統提示詞

#### 模型看到什么

當 `enableRunInBackground` 與 `backgroundMode: continuable` 同時設置時，模型還會讀到 `tool:<toolName>` 系統提示詞 section，指示它把相互獨立的可繼續委派一起啟動，并在它們運行時繼續工作。使用默認工具名 `subagent` 時，section 文本為：

##### 工具指導 section

```markdown
Use subagent in the background by default. Start independent delegations together in one assistant message and continue useful work while they run. Set `run_in_background: false` only when your next action depends on that subagent's result. When a background run settles, the runtime sends you a notice containing its outcome and any final assistant message.
```

#### Token 影響

每個可繼續實例一個簡短固定 section，只要工具在作用域內，就由每個父級請求支付。

#### KV Cache 影響

只要 section 文本與工具存在性不變，前綴就保持穩定；移除工具或更改 section 會建立不同的父級前綴。

### 前臺結果

#### 模型看到什么

調用會保留描述與提示詞。成功時只包含子 agent 的最終文本；其他結果變為 `Error: <stop reason>`，隨后在存在時附上安全的提供方診斷，再附上任何部分 assistant 文本。子 agent 中間步驟不會進入父級。

#### Token 影響

提示詞與結果保留在父級歷史中，直到上下文壓縮（context compaction）；子 agent 工作上下文留在子 agent 中。

#### KV Cache 影響

僅追加；新增可見內容位于可復用請求前綴之后，不會使現有 KV Cache 條目失效。

### 后臺結果

#### 模型看到什么

在配置的可繼續模式下，啟動時返回內容恰為 `started subagent <childId>`；在配置的一次性模式下，則返回 `started background subagent job <id>`。一次性模式下，通用 Task 接口提供后續狀態、最終輸出、取消響應與通知；若結果攜帶提供方診斷，失敗狀態的 detail 會包含它。可繼續模式下，本工具不返回自己的結果：子 agent 的結算以服務負責的通知到達父級，獨立加載的 `send_message` 工具投遞后續消息，而通過其 id 查看子 agent 的 transcript（文本記錄）即是其詳細輸出來源。

#### Token 影響

確認消息會被保留；一次性最終輸出只在收集或注入時進入父級歷史，而可繼續子 agent 的輸出絕不會通過本工具返回——其結算通知獨立于任何工具結果到達。

#### KV Cache 影響

僅追加；新增可見內容位于可復用請求前綴之后，不會使現有 KV Cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本工具不返回或不強制執行什么；它們是當前包約束。

- **后臺運行不通過本工具公開結果**——一次性任務的最終輸出通過通用 Task 接口收集，可繼續子 agent 的輸出留在其自身會話中，按其 subagent id 讀取。結算通知會說明該子 agent 如何結束，并攜帶可能存在的最終 assistant 消息，但它不是本次調用的返回值，也無法在此等待。
- **等待中的一次性實例較晚才發現重復名稱**（`TODO(subagent-dup-toolname)`）——可繼續實例會在插件應用期間預留提示詞 section 名稱，但若要阻止等待中的一次性實例回滾提供方注冊，仍需要一份預期名稱注冊表。
- **隨附 fork 工具不能選擇子級 LLM 路由**——它們繼承父級提供方與模型，使復制的對話前綴仍有資格復用 KV Cache。僅當路由變更能保留復用或公開有界重算成本時，才重新啟用選擇。
- **非路由子 agent 策略按實例固定**——另一個 persona、工具過濾器或深度上限需要另一個名稱不同的工具。LLM 選擇要求啟用逐 Session 偏好，且提供方必須聲明 `agentOptions`；兩個進程內提供方和 DSH SDK 會聲明該能力，而 ACP、Codex 與 Claude Code 會拒絕它，而不是忽略它。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
