---
description: "面向 DeepSeek Harness 會話日志的模型側 todo_write 工具：整表替換、單一會話歸屬與 todos 投影，供選擇、配置或排查該工具的用戶與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-todo

[English](README.md) | 中文

## 概述

`dsh-tool-todo` 為 agent（智能體）提供一份可用于規劃的結構化任務列表：把多步工作拆成具體任務、標記正在進行的任務、完成后逐項勾掉。列表跨輪次、跨重新打開的會話持續存在，agent 與 UI 始終看到最新計劃。一個配置開關決定是否允許多個任務同時處于進行中，適用于并行開展工作的 agent。凡是希望 agent 維護可見任務列表的場景都可以使用它；每次更新整體替換列表，只有擁有該列表的 agent 會話才能修改。

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

當你希望 agent 在工作時維護一份可見的任務列表時使用本包：規劃多步工作、展示當前進行中的任務、記錄完成情況。掛載它并設置并行開關是唯一的配置步驟；此后每次計劃變化，agent 都會通過它自己的規劃工具更新列表。

### 何時選擇

當某個 agent 會話應當擁有任務列表、且整表更新即可滿足需求時選擇它——這是規劃工具的常見形態。當多個 agent 必須共享同一份列表、或需要逐項編輯時，請避開：列表只屬于一個 agent，每次更新都會替換整個列表。它要求環境中確實存在 agent 會話；從不運行 agent 的純自動化入口無法使用它。

### 最小配置

`allowParallelInProgress` 是必填項、沒有默認值：省略它的組合會在加載時失敗，非布爾值也會被拒絕。可能并發運行工作的 agent（subagent、后臺命令、工作流扇出）設為 `true`，需要單活躍項紀律的設為 `false`。

```yaml
- name: '@deepseek-ai/dsh-tool-todo'
  config:
    allowParallelInProgress: true
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `allowParallelInProgress` | 必填 | 是否允許多個 todo 同時處于 `in_progress`；同時選擇模型描述中的活躍狀態條款 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-todo)是每個受支持字段的窮盡式真源。

### 每次調用做什么

agent 每次更新都發送完整列表；新列表替換舊列表，因此沒有部分更新或逐項編輯。每個條目是一句簡短的任務描述，外加 `pending`、`in_progress` 或 `completed` 狀態。成功的更新會返回新的計數——`Updated todo list: <pending> pending, <inProgress> in progress, <completed> completed.`——UI 隨即展示新計劃。任務描述為空或重復、條目帶有描述與狀態之外的字段、或（禁用并行時）多個任務被標記為進行中，這些情況下更新都會明確失敗。

### 單一所有者

任務列表屬于創建它的那一個 agent 會話——subagent 與其他 agent 各自維護自己的列表，不存在跨 agent 共享列表的方式。來自 agent 會話之外的調用會被拒絕，因此 agent 會得知更新失敗，而不是被靜默丟棄。如果你需要多個 agent 共享同一份列表，本包不提供該能力。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋工具背后的設計決策，并指出實現它們的代碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

本工具建立在四項承諾之上：

- **整表替換、日志承載狀態。** 模型重新發送整個列表；`todo/write` 快照存放在事件溯源的會話日志上，持久性、回放與恢復重建都來自日志而非服務。
- **單一所有者。** 列表屬于調用 agent 會話；不存在共享或 swarm 作用域，非 agent 調用方會被拒絕。
- **部署策略，而非編碼規則。** `allowParallelInProgress` 是必填組合選擇，因為工具無法觀測運行時并發；持久日志不變式刻意不跟隨它，因此一種策略下寫入的日志在切換到另一種策略后仍可回放。
- **校驗確保日志快照如實反映輸入。** schema 層拒絕未知鍵、`execute` 層拒絕空或重復 content，使持久快照與模型自認為寫入的內容一致。

[todo_write 工具 Agent Note](../../../.agents/notes/archived/feature/2026-06-29-todo-write-tool.md) 記錄原始設計與備選方案；[并行 in-progress Agent Note](../../../.agents/notes/archived/feature/2026-07-26-todo-parallel-in-progress.md) 記錄該策略決策。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`Config` schema、工具注冊、`todos` 投影單元 |
| [`src/types.ts`](src/types.ts) | `todos` 投影鍵聲明及其載荷類型的唯一歸屬地 |
| [`src/client.ts`](src/client.ts) | 客戶端命名空間對類型出口的再導出 |
| [`src/invariant.ts`](src/invariant.ts) | 不變式伴生插件：校驗持久整表快照與開放輪次歸屬 |

### 導出形狀

本插件是函數／命名空間插件：導出 `name`、`inject`、`apply`，沒有默認導出。多余的 `export default` 會讓 Loader 的 `unwrapExports` 折疊模塊并丟棄 `inject`（參見 [postmortem 0001](../../../docs/postmortem/0001-acp-default-export-drops-inject.zh.md)）。

### 會話投影

當組合掛載 `ctx.sessionProjections`（[`@deepseek-ai/dsh-session-projection`](../../session/session-projection/README.zh.md)）時，本包在注入的子插件中注冊 `todos` 單元：投影即有效計劃——最新的整份 `todo/write` 列表，首次寫入前為 `null`，下一輪次開始時清空，而 `turn/end` 保留剛完成的清單。該鍵在此處合并進 `SessionProjectionMap`；載體通過歷史尾頁與 `session/projection` 推送幀提供該值。未掛載注冊表的組合不受影響；單元注冊見 [src/index.ts](src/index.ts)。

### 持久日志不變式

不變式伴生插件注冊到 `ctx.invariants`，先分別校驗既有會話與新公布會話一次，再為實時追加推進按會話提交的輪次軌跡。它會拒絕畸形條目、空或重復 content、未知狀態，以及開放輪次之外的持久 `todo/write`；核心 session 通用處理聲明合并事件，而本生產包擁有 todo 專用規則。它刻意不約束有多少條目處于 `in_progress`，因為那是工具按部署制定的策略，而非持久數據規則。

### 調用機制

每次調用都會先校驗提交的列表是否符合 schema，拒絕不一致的輸入，成功后把完整快照作為 `todo/write` 會話事件追加并返回新的計數；當前列表始終是日志中最近一次 `todo/write`（回放時后寫覆蓋先寫）。確切的校驗與追加步驟見 [src/index.ts](src/index.ts)。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從會話子系統逐步進入生成的目錄，以及工具背后的決策記錄。

- [Todo 子系統](../../../docs/subsystems/todo.zh.md)——`todo/write` 事件載荷、歸屬規則與 `TodoItem`。
- [todo 組映射](../README.zh.md)——同級組頁面及其包表格。
- [生成的工具目錄](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-todo)——模型接收的 `todo_write` schema。
- [生成的配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-todo)——每個受支持配置字段及其源聲明。
- [todo_write 工具 Agent Note](../../../.agents/notes/archived/feature/2026-06-29-todo-write-tool.md)——原始設計、備選方案與未采納的字段。
- [并行 in-progress Agent Note](../../../.agents/notes/archived/feature/2026-07-26-todo-parallel-in-progress.md)——為何活躍計數上限成為部署策略。

-----

<a id="model-experience"></a>
## 模型體驗

### 工具 schema

#### 模型看到什么

模型會看到生成的 [`todo_write` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-todo)：一個對象，含一個必填的 `todos` 數組，元素為 `{ content, status }`，其中 `status` 為 `pending`、`in_progress` 或 `completed`。描述是組合后的整表指令，其活躍狀態條款跟隨 `allowParallelInProgress`。

#### Token 影響

工具可見的每個請求都有固定 schema 開銷；在給定配置下描述與 schema 保持穩定。

#### KV Cache 影響

定義與可見性不變時前綴保持穩定。插件生命周期或作用域限制可能使從此 schema 起的復用失效。

### 工具調用歷史與結果

#### 模型看到什么

每次 assistant 工具調用都會在參數中保留整個替換列表。成功時原樣返回 `Updated todo list: <pending> pending, <inProgress> in progress, <completed> completed.`。穩定失敗文本為 ``Error: invalid todo: `content` must be a non-empty string``、`Error: invalid todos: duplicate content "<content>"`、`Error: todo_write requires an owning agent session`，以及——僅在部署設置 `allowParallelInProgress: false` 時——`Error: invalid todos: at most one task may be in_progress (got <n>)`。完整的 `todo/write` 會話事件是 UI 與回放狀態，而非第二條模型消息。

#### Token 影響

token 用量隨模型每次提交的完整列表增長，這些調用參數會保留到壓縮（compaction）。結果本身很小且形狀固定。

#### KV Cache 影響

僅追加；新可見內容位于可復用請求前綴之后，不會使既有 KV-cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明工具何時不合適。它們是當前包約束，不是任務積壓。

- **僅單一所有者作用域**——列表屬于唯一調用 agent 會話；subagent、共享與 swarm 作用域是有意設置的限制，非 agent 調用方會被拒絕。
- **條目形狀刻意保持最小**——`content` 加三態 `status`；整表替換不需要穩定 id、優先級或 active-form 字段。
- **整表替換是唯一操作**——沒有部分更新、沒有回讀工具、沒有逐項編輯；模型每次調用都必須重新發送完整列表。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文：未決問題與尚未決定的方向。它明確不具權威性——已交付行為、限制與既定理由以上文、包代碼和相關 Agent Note 為準。

#### 未來：跨 agent 與共享列表

單一所有者作用域是有意設置的限制，跨 agent 或共享列表仍是獨立的未來設計：它們需要逐項日志增量與顯式作用域選擇，并會改變模型可見約定。目前尚不存在設計。

</details>
