---
description: "面向選擇、組合或排查 get_goal、create_goal 與 update_goal 的用戶與維護者的模型側 goal 工具說明。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-goal

[English](README.md) | 中文

## 概述

`dsh-tool-goal` 讓模型讀取持久 goal，并根據人類直接請求推斷和創建長期 goal。創建、編輯、暫停或恢復要求該直接請求出現在頂層 agent（智能體）輪次中；完成或阻塞也可以在自主 Goal Round 中執行。更新必須使用先前讀取到的精確 goal id 和 revision。`resume` 會重新啟用 active-but-disarmed 或 blocked 的 goal，而持久的 paused goal 由用戶通過 Web 或 `/goal resume` 恢復。自主阻塞要求同一條件持續達到可配置閾值，默認是連續三個 Round。

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

當模型需要自行創建和更新持久 goal 時，把 `dsh-tool-goal` 掛在 goal 服務旁邊。這些工具是 goal 表面面向模型的一半；`/goal` 命令是面向人類的一半，續行驅動器在自主 Round 結束時使用同一套工具完成或阻塞 goal。

### 工具

三個工具都返回相同的緊湊 JSON——沒有當前 goal 時為 `{ goal: null }`，否則返回 goal 的 id、revision、目標、phase、已開始 Round、Round 上限、可選的 blocker reason 與續行是否已啟用——與 Native 調用方已經渲染的內容一致。

| 工具 | 作用 |
|---|---|
| `get_goal()` | 讀取當前 goal；沒有當前 goal 時返回 `null` |
| `create_goal(objective, max_goal_rounds?)` | 根據人類直接發起的頂層輪次創建一個 goal |
| `update_goal(goal_id, revision, action, objective?, max_goal_rounds?, blocked_reason?)` | 對精確 goal revision 執行 `edit`、`pause`、`resume`、`complete` 或 `blocked` |

在 `update_goal` 之前調用 `get_goal`，并復制精確的 `goal_id` 與 `revision`；所有調用都互斥，因此模型排序的批次能觀察到更早變更及其新 revision。替換值只屬于 `edit`；`blocked_reason` 只有在 `blocked` 時才必填，并以穩定代碼 `model-reported` 持久化。嚴格 schema 下的空字符串和零填充值視為省略，而有意義的值仍限定到各自 action。

### 配置

```yaml
- id: tool-goal
  name: '@deepseek-ai/dsh-tool-goal'
  config:
    blockedAfterConsecutiveRounds: 3
```

該值必須是正的安全整數。它既提供模型自行報告阻塞的硬下限，也決定模型指引中指明的數值。生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-goal)是每個受支持字段的窮盡式真源。

### 權限規則

工具只為活躍驅動器內、處于開放輪次中的精確活躍調用 agent 執行。`create`、`edit`、`pause` 和 `resume` 還要求運行時根 agent 的當前輪次中存在人類直接消息——subagent 或非人類生產方不能創建或編輯 goal。`resume` 會在 goal 服務執行前拒絕持久的 paused goal；該狀態只屬于面向用戶的恢復路徑。`complete` 和 `blocked` 還接受完全一致的當前 Goal Round：來源為 goal 的 Round 可以立即完成 goal，但 `blocked` 調用在達到配置的連續 Round 數量之前會被機械拒絕——模型判斷同一條件是否確實持續，并必須在 `blocked_reason` 中說明。人類直接請求可以立即停止 goal。

成功報告 `complete` 或 `blocked` 的自主 Round 還會在該步驟后結束物理輪次，模型會收到一條結束指令，要求向用戶寫出最終消息。人類直接變更絕不會觸發這種停止：assistant 可以確認變更，循環仍可接收并發的人類 steering（中途引導）。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋工具如何強制執行權限并渲染輸出；可觀察約定已在[使用本包](#use-this-package)中說明。

### 設計

- **執行時權限。** 每次調用都解析精確活躍 agent、其繼承的 `AgentRegistry` initiator、running 狀態與開放輪次；`create`、`edit`、`pause` 和 `resume` 還要求運行時根 agent 的當前輪次中存在已接受的 `{ kind: 'user' }` 消息或 steering 事件。持久的 paused goal 會讓 `resume` 以 `GOAL_TOOL_RESUME_PAUSED` 失敗；面向用戶的命令或 Web 控件擁有該轉換。持久 fork 譜系不會降低已恢復根 agent 的等級；活躍 subagent 所有權會降低。
- **人類輸入的宿主證明。** `Agent.followup()` 與 `steer()` 會在調用方省略 source 時分配 `{ kind: 'user' }`，因此插件、調度器與其他非人類生產方必須傳入自己的 source，不能繼承人類權限。
- **帶配置閾值的系統提示詞指引。** 本包注冊一個 `tool:goal` 系統提示詞章節，其固定文本插入 `blockedAfterConsecutiveRounds`；同一數值就是執行時強制執行的硬下限。
- **終局 Round 的結束上下文。** 成功的自主 `complete` 或 `blocked` 會延后一條 `<goal_complete>` 或 `<goal_blocked>` 結束指令，讓模型在輪次結束前向用戶做一次交代；人類直接變更絕不會延后該上下文。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：工具注冊、配置、系統提示詞章節、結果渲染 |
| [`src/authority.ts`](src/authority.ts) | 執行時權限檢查與 Goal Round 接受 |
| [`src/wrapup.ts`](src/wrapup.ts) | 終局自主更新的結束消息指令 |
| — | 不發布運行時不變式伴生入口；此面向模型的適配器不擁有獨立狀態或事件協議；已接受的變更由 goal 領域檢查，權限行為則由本包測試驗證。 |

### 工具輸出

三個工具共用一種規范輸出：緊湊 JSON `{ goal: null }`，或 `{ goal: { id, revision, objective, phase, roundsStarted, maxGoalRounds, blockedReason? }, activation }`。結果中的 `activation` 是實時觀察值，絕不會成為回放權限依據。UI 客戶端收到純通用卡片——`get_goal` 為 read，變更使用 other。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

這些工具是 goal 表面面向模型的一半；如需了解它們變更的狀態及其所遵循的策略，請閱讀以下頁面。

- [goal 服務](../goal/README.zh.md)——工具變更的 goal 狀態與生命周期。
- [goal 組地圖](../README.zh.md)——goal 各包及其組合方式。
- [生成的工具目錄](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-goal)——模型接收的精確 schema。
- [goal 工具 Agent Note](../../../.agents/notes/implemented/feature/2026-07-19-model-facing-goal-tools.zh.md)——權限拆分與 UX 決策。

-----

<a id="model-experience"></a>
## 模型體驗

### 系統提示詞

#### 模型看到的內容

固定 goal 策略說明何種用戶語義意圖值得創建 goal，要求更新前先精確讀取 ref，解釋會話 resume／fork 后如何重新啟用續行，并限制完成／阻塞聲明。持久 paused 的 resume 會在執行時以 `GOAL_TOOL_RESUME_PAUSED` 拒絕；面向用戶的 goal 控件擁有該轉換。配置的閾值會插入該指引。

##### Goal 策略

```markdown
Use goal tools for one long-running completion objective in the current session. create_goal may infer goal intent from a direct human request in any language; do not create a goal for routine single-turn work. Call get_goal before update_goal and copy its exact goal_id and revision. After session resume or fork, an active goal is disarmed: when a human asks to continue or resume in any wording or language, use update_goal action resume to rearm it. Mark complete only when the objective is actually achieved. Mark blocked only after the same blocking condition persists for at least 3 consecutive goal rounds, and report that concrete condition in blocked_reason; difficulty, uncertainty, or useful remaining work is not blocked.
```

#### Token 影響

此插件的提示詞注冊位于請求范圍內時，每次請求都會產生少量固定輸入成本。

#### KV Cache 影響

插件范圍、配置閾值和指引文本不變時，前綴保持穩定。啟用、dispose（資源釋放）或配置變更可能使此提示詞章節的復用失效。

### 工具 schema 與結果

#### 模型看到的內容

生成的 [`get_goal`、`create_goal` 和 `update_goal` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-goal)。成功結果是緊湊 JSON。變更會追加 goal 領域的持久 `goal/change` 事件，而不會將模型上下文加入隊列。結果中的 `activation` 是實時觀察值，絕不會成為回放權限依據。

#### Token 影響

固定 schema 成本，加上每次調用的一條緊湊結果。持久變更不會增加單獨的模型可見上下文。

#### KV Cache 影響

schema 的定義與可見性不變時，前綴保持穩定。調用和結果會追加到可復用請求前綴之后，不會使更早條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明 goal 工具何時不合適或需要特別注意。它們是當前包約束，不是任務積壓。

- **語義意圖仍由模型判斷**——執行只能證明當前輪次包含一條人類直接發送的消息，無法證明請求是否足夠重大而值得創建 goal。
- **阻塞條件是否相同仍由模型判斷**——運行時強制統計互不重復的已準入 Goal Round，而不判斷障礙在語義上是否等價；獨立評估器的實現暫緩。
- **不負責調度或直接面向人類呈現**——這些工具只變更狀態；同會話驅動器與 `dsh-command-goal` 是同一領域的獨立消費方。
- **Goal Round 權限需要驅動器**——除非續行驅動器準入 goal 來源的用戶輪次，否則自主 `complete`／`blocked` 路徑不會啟用；只掛載這個包不會創建這些輪次。
- **提示詞注冊與過濾相互獨立**——某個范圍可能隱藏工具，卻保留指引，除非部署將兩項注冊限定在同一范圍。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文，明確不具權威性。開放問題：goal 策略章節是否應與工具注冊獨立限定范圍，避免某個范圍隱藏工具卻保留指引。

</details>
