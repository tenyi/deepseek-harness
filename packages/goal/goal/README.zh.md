---
description: "面向選擇、配置或排查同會話持久 goal 服務的用戶與維護者：每會話一個持久的完成目標。"
kind: "package-reference"
---

# @deepseek-ai/dsh-goal

[English](README.md) | 中文

## 概述

`dsh-goal` 讓一個長期完成目標在多輪、會話恢復、fork 與進程重啟后持續存在。用戶與 agent（智能體）可以 create、edit、pause、resume、complete、block 或 clear 該目標；比較并設置的更新會拒絕陳舊視圖。可配置的 Round 上限（默認 256）約束自動續行，被阻塞的 goal 會保留穩定的策略代碼和面向人的說明。本包存儲 goal 狀態但不調度工作，續行權限是進程本地的而非持久狀態。單個目標需要橫跨多輪時選擇本包；常規單輪工作或并行目標不要使用。

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

當會話需要在多輪與多次重啟之間記住一個長期完成目標時，掛載 `dsh-goal`。本包是服務：模型工具、`/goal` 命令與續行驅動器都是消費同一 goal 狀態的獨立包，因此只掛載本包只會存儲和提供 goal，不會啟動任何工作。

### 何時使用

goal 適合一個需要跨自動 Goal Round 持續的長期完成目標——例如完成一次遷移，或修復所有失敗的文檔門禁。常規單輪工作不應創建 goal。服務每會話至多保留一個當前 goal：未完成的 goal 必須先 edit、pause、resume、block 或 clear，才能被另一個替代；已完成的 goal 可以直接被替換。

### 配置服務

通過組合配置項加載本包；唯一的部署選擇是默認 Round 上限，應用于未自行指定上限的 create。

```yaml
- name: '@deepseek-ai/dsh-goal'
  config:
    defaultMaxGoalRounds: 256
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `defaultMaxGoalRounds` | `256` | 當 create 請求省略上限時應用的 Round 上限 |

`defaultMaxGoalRounds` 必須是正的安全整數；指定了自身上限的 create 請求會覆蓋它。生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-goal)是每個受支持字段的窮盡式真源。

### 會話投影

`GoalService` 要求組合提供 `ctx.sessionProjections`（[`@deepseek-ai/dsh-session-projection`](../../session/session-projection/README.zh.md)），并在啟動時注冊 `goal` 投影單元；未組合投影注冊表的組合無法激活 `ctx.goals`。該單元版本為 6，其宿主狀態保留最新的有效當前 goal、所有曾使用的 goal id，以及第一次嚴格回放失敗。客戶端視圖提供當前 goal；首次 create 前與 clear tombstone 后為 `null`。該鍵同時合并到 `SessionProjectionStateMap` 與 `SessionProjectionMap`；載體通過歷史尾頁和 `session/projection` 推送幀提供客戶端值。

### 驅動生命周期

goal 經歷四種持久 phase——`active`、`paused`、`blocked`、`complete`——外加一個進程本地標志，表示自動續行是否已啟用。動詞如下：

| 操作 | 作用 |
|---|---|
| `create` | 以目標和 Round 上限啟動一個 active goal |
| `edit` | 修改目標和/或 Round 上限，不改變 phase |
| `pause` | 停止自動續行并保留狀態 |
| `resume` | 重新開始續行；也用于會話恢復或 fork 后重新啟用 active goal |
| `complete` | 標記 goal 已完成并停止續行 |
| `block` | 記錄穩定的 blocker 代碼與說明 |
| `clear` | 移除當前 goal；其歷史保留在會話日志中 |

pause、complete、block 和 clear 都會停用續行。block 是唯一保留策略自有 lower-kebab-case 代碼與自由文本說明的 phase，因此提供方限制、預算耗盡、執行錯誤與請求人工輸入共用一種持久 phase，而不是擴增生命周期狀態。resume 只在 Round 上限仍有剩余容量時接受已停止的 goal，或 active 但已停用續行的 goal，并清除任何先前的 blocker reason。

### 什么會保留，什么不會

每項被接受的變更都會持久記錄到會話日志——goal 狀態的唯一存儲——因此 goal 狀態絕不依賴臨時消息投遞。會話恢復或 fork 后，goal、其 phase、其 revision 與已準入 Round 數量都仍然存在。自動續行是例外：任何會話開始邊界之后，`active` 的 goal 都會被停用續行——在有人顯式 resume 之前，agent 不會自行繼續。

### 觀察 goal

消費方用 `ctx.goals.get(agent)` 讀取當前 goal，獲得脫離內部狀態的視圖：目標、phase、已開始與上限 Round 數量、被阻塞時的 blocker reason，以及續行是否已啟用。變更必須攜帶該視圖中的精確 `{ id, revision }`，因此持有舊狀態的消費方會收到清晰的陳舊 revision 錯誤，而不是靜默覆蓋更新的狀態：

```text
const view = ctx.goals.get(agent)      // undefined when no goal is current
view.phase                             // 'active' | 'paused' | 'blocked' | 'complete'
view.roundsStarted, view.maxGoalRounds // continuation progress
view.activation                        // 'armed' | 'disarmed' — not persisted
```

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋服務如何實現上述行為；可觀察約定已在[使用本包](#use-this-package)中說明。

### 設計

- **事件溯源狀態。** 每次變更都追加持久的 `goal/change` 事件（版本 1），攜帶變更后的完整快照；clear 寫入帶 revision 的 tombstone。會話日志是唯一的持久權威。
- **比較并設置的變更。** `ctx.goals` 只接受以對應 id 注冊的完全相同的活躍 `Agent` 實例。`get()` 返回脫離狀態的 `GoalView`；變更攜帶 `GoalRef { id, revision }` 并拒絕陳舊引用。創建在提交前于內部解析部署默認值。
- **續行啟用狀態是進程本地的。** `armed` 與 `disarmed` 保存在每會話緩存中，絕不持久化。新緩存與每次 `agent/session-start` 邊界都會停用續行，即使回放發現持久 phase 為 active；`disarm()` 移除續行權限，不寫入 revision 也不發出變更事件。
- **嚴格回放。** 折疊只從 `goal/change` 派生生命周期變更，并拒絕形狀錯誤、不連續 revision、非法 phase 轉換、每目標時間戳非單調，以及不連續的已準入 Round。只有已準入的來源為 goal 的 `user/message` 事件會推進正數 Round；掛鐘時間倒退時，變更時間戳會限制在不早于上一次更新的值。
- **投影單元。** 本包要求提供投影注冊表，并注冊一個嚴格的 `goal` 單元。其宿主狀態保留回放校驗數據與第一次失敗，客戶端視圖提供最新有效的完整 goal 或 `null`；保留回放失敗后，`GoalService` 會拒絕訪問。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`GoalService`、配置 schema、變更、續行啟用緩存、投影單元 |
| [`src/domain.ts`](src/domain.ts) | 持久變更載荷、`goal/changed` 事件、goal 消息來源歸屬 |
| [`src/types.ts`](src/types.ts) | 純客戶端安全類型：`GoalView`、`GoalSnapshot`、`GoalActivationChanged`、投影鍵聲明 |
| [`src/fold.ts`](src/fold.ts) | 持久 goal 變更的嚴格回放折疊與解碼器 |
| [`src/runtime.ts`](src/runtime.ts) | `GoalId` 品牌、`GoalError` 代碼、變更版本常量 |
| [`src/invariant.ts`](src/invariant.ts) | 不變式配套模塊：對每個已掛接會話的獨立增量折疊 |

### 事件與歸屬

`goal/changed` 在持久事件提交后觸發，監聽器失敗會被隔離；載荷攜帶操作、精確 ref 與最新視圖（clear tombstone 時省略）。`goal/activation-changed` 在不改變持久狀態的情況下，轉發攜帶精確當前 ref 的進程本地 `armed`／`disarmed` 邊界；clear 后則不攜帶 goal。已準入的續行 Round 通過 `user/message` 事件上的 `GoalMessageSource { goalId, revision, round }` 歸屬，嚴格折疊會將其驗證為當前 goal 的下一個已準入 Round。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

包級約定對大多數消費方已經足夠；需要了解周邊領域與設計理由時閱讀以下頁面。

- [goal 子系統](../../../docs/subsystems/goal.zh.md)——goal 類型、持久的變更載荷與生成的服務 API。
- [goal 組地圖](../README.zh.md)——goal 各包及其組合方式。
- [生成的配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-goal)——每個受支持配置字段及其源聲明。
- [goal 領域 Agent Note](../../../.agents/notes/implemented/feature/2026-07-19-persisted-same-session-goal-domain.zh.md)——領域設計、備選方案與決策。

-----

<a id="model-experience"></a>
## 模型體驗

### 目標狀態變更

#### 模型看到什么

Goal 變更不會注入模型上下文。`get_goal` 等工具返回當前狀態；續行消費方可以在調度模型工作時渲染目標與 Round 狀態。

#### Token 影響

Goal 變更事件本身不增加模型 token。工具結果與續行調度提示詞各自暴露的狀態會分別計入 token 用量。

#### KV Cache 影響

在其他組件把 goal 狀態暴露為模型可見輸入之前，不會影響 KV Cache。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明 goal 服務何時不合適或需要特別注意。它們是當前包約束，不是任務積壓。

- **只負責狀態，不負責任務調度**——本包不決定已啟用續行的 goal 何時繼續，不重試異常失敗，也不取消活躍輪次；這些策略屬于 `dsh-goal-round-driver` 等消費方包。
- **只有 Round 數量預算**——`maxGoalRounds` 不計量 token、貨幣、掛鐘時間或提供方配額。
- **沒有獨立評估器**——記錄完成或阻塞的調用方擁有最終決定權；由評估器支持的認證暫緩到獨立策略層。
- **只有一個當前 goal**——系統有意不支持并行目標或獨立 goal 數據庫；替換或清除后，歷史仍可在會話日志中讀取。
- **信任進程內生產方**——能直接訪問 `Session` 的插件可以追加偽造的 `goal/change` 數據。嚴格回放會檢測格式錯誤或不一致的記錄，并使 goal 訪問從該記錄起失敗，直到日志修復；這是完整性檢測，不是插件隔離。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文，明確不具權威性。開放且未決的方向：為需要在每個模型請求中看到目標的部署提供始終可見的 goal 上下文插件，以及由評估器支持的完成與阻塞認證。

</details>
