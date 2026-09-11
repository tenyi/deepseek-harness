---
description: "建議性循環衛生 guard：當 agent（智能體）重復完全相同的工具調用時提醒模型，供選擇、配置或排查此插件的用戶與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-repeat-tool-reminder

[English](README.md) | 中文

## 概述

本包幫助模型跳出以相同參數反復調用同一工具卻沒有進展的循環。達到配置的重復次數時，它會要求模型檢查上一次結果并改變方法或結束任務。提醒只是建議，絕不會阻止或延遲合理的重復調用。每個 agent 的重復分別跟蹤，新的用戶消息會清除計數。`dsh` 基礎組合包默認啟用本包，并在重復 3、5、8 次時提醒。

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

當模型應當自行發現自己在相同工具調用上循環時，掛載此插件。無需學習或接線：`dsh` 基礎組合包已經運行它，默認值適用于大多數會話——想更早、更晚或在更少的工具上收到提醒時，調優下面的閾值與工具范圍即可。

### 何時選擇

當模型長時間自主工作、且卡住的循環是你想用建議而非強制來打破的失敗模式時，選擇它。當相同的重復是合理且必須不受打擾地運行時——guard 只會提醒，提醒只是重復調用之后的一條小消息——以及必須捕獲近似變體時（因為只有精確重復——同一工具、同一參數且與屬性順序無關——才會被檢測到），避免使用它。

### 設置閾值與范圍

想改變提醒何時觸發或覆蓋哪些工具時，用配置掛載插件：

```yaml
- name: '@deepseek-ai/dsh-repeat-tool-reminder'
  config:
    thresholds: [3, 5, 8]        # remind at 3, 5, and 8 consecutive repeats
    include: []                  # track every tool; list patterns to track only some
    exclude: [todo_write]        # never track these tools
    argumentsPreviewChars: 500   # cap on arguments shown in the detailed reminder
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `thresholds` | `[3, 5, 8]` | 觸發提醒的重復次數 |
| `include` | `[]` | 只跟蹤這些工具；空表示所有工具 |
| `exclude` | `[]` | 絕不跟蹤這些工具；對它們的調用既不計數也不重置 |
| `argumentsPreviewChars` | `500` | 詳細提醒中顯示多少字符的重復參數 |

無效配置會在啟動時以清晰錯誤失敗——空的 `thresholds` 列表、小于 2 的重復次數或重復值——絕不會靜默改變行為。生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-repeat-tool-reminder)記錄每個受支持的值。

### 你會得到什么

按默認值，以相同參數重復同一調用的模型會在第三次重復時收到簡短提醒——先分析上一次結果再調用——并在第五次和第八次收到詳細提醒，列出工具與重復參數，使其決定改變方法、收集更多證據還是結束任務。新的用戶消息會清零計數，因此全新指令絕不會被當作循環。提醒出現在重復調用的結果之后、歸屬于插件，模型像閱讀任何其他消息一樣閱讀它。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋 guard 如何檢測重復并投遞提醒，并指出實現它的代碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

guard 建立在四項承諾之上：

- **僅建議，不否決。** guard 用模型上下文豐富 post-execute 決策；它從不阻止或改寫調用，因此 `PostToolDecision` 阻止仍是后續監聽器的事。
- **在 post-execute 中計數。** 檢測運行在 `tools/post-execute` 上，被拒絕的調用同樣會經過它；在那里計數讓一個監聽器即可覆蓋所有嘗試，無需跨事件狀態。
- **精確匹配規范化。** 參數以循環的 `JSON.parse` 輸出（或畸形參數 JSON 的原始字符串回退）到達 guard，因此 JSON 的值域就是全部輸入域，深度鍵排序加 `JSON.stringify` 是完整、確定性的同一性判定——不存在 bigint、循環引用或 `undefined` 處理，因為沒有輸入路徑能產生它們。
- **加載時快速失敗。** `thresholds` 與 `argumentsPreviewChars` 在 `apply` 中校驗并拋出錯誤，絕不回退到默認值。

### 檢測：重復鏈

每個 agent 的鏈以「`(tool name, canonical arguments)`」為鍵——同一工具且規范化后參數相同（忽略屬性順序）的兩次調用計為連續，換成另一條受跟蹤調用則把計數重置為 1。鏈保存在 `WeakMap<Agent, Chain>` 中。

- **不受跟蹤的調用對鏈透明。** 被 `include`／`exclude` 排除的調用既不遞增也不重置計數器，因此 `grep X → todo_write → grep X` 在 `todo_write` 被排除時仍算作連續兩次 `grep X`——穿插進循環的記錄類工具不能掩蓋循環。
- **被拒絕的調用也計數。** 檢測位于 `tools/post-execute`，被 `tools/pre-execute` 監聽器拒絕的調用同樣會經過它；模型反復嘗試被拒絕的調用，恰恰是需要打破的循環。
- **忽略沒有 agent 的調用。** 直接調用 `ctx.tools.execute()` 的調用方沒有需要提醒的模型，也沒有可作為鍵的活躍 agent 對象。
- **按 agent 分鍵，用戶提示詞時重置。** 一個 agent 的重復絕不會觸發另一個 agent 的提醒；用戶提示詞（`agent/pre-step`）會刪除提交該提示詞的 agent 鏈，對象生命周期限制弱引用條目的壽命，無需 dispose（資源釋放）監聽器。
- **僅駐留內存。** 從持久化恢復的會話以全新鏈開始——guard 是啟發式提醒，而非記錄在案的不變量，因此恢復后的提醒延后是可接受的代價。

### 提醒傳遞

提醒隨 post-execute 決策的 `additionalContexts`（來源為 `{kind: 'plugin', plugin: 'repeat-tool-reminder', form: 'notice', summary: '<tool> × <count>'}`）傳遞，絕不替換 `content`：用于審計的 `tool/result` 事件仍保留工具自己的輸出。循環會緩沖這段上下文，并在該步驟的工具結果之后作為注入的 `user/message` 追加，會話將其渲染為普通的合成用戶消息——模型可見、帶有來源歸屬，且無需新會話事件即可從會話日志重建。guard 始終通過 `next()` 委派，并把提醒放在下游決策的上下文數組之前，因此兩種決策變體（包括被阻止的調用）都會收到提醒，同時每個條目保留自己的來源與元數據。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`Config` schema、快速失敗校驗、鏈監聽器 |
| — | 不發布運行時不變式配套組件；重復鏈私有于一個 post-execute 監聽器，且不公開任何可供獨立配套組件觀察的包自有事件或快照。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從工具 waterfall（瀑布式事件）逐步進入窮盡式配置與 guard 組映射。

- [工具子系統參考](../../../docs/subsystems/tools.zh.md)——本 guard 消費的 `tools/execute` waterfall、`additionalContexts` 與決策形態。
- [生成配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-repeat-tool-reminder)——每個受支持配置字段及其源聲明。
- [guard 組映射](../README.zh.md)——同組的 guard 包與循環衛生家族。

-----

<a id="model-experience"></a>
## 模型體驗

### 首個閾值的上下文消息

#### 模型看到什么

達到第一個配置的連續重復閾值時，對應 agent 會收到下面的提醒。不會添加工具 schema 或正常調用文本。

##### 首個閾值提醒

```markdown
You are repeating the exact same tool call with identical arguments. Carefully analyze the previous result before calling again: if the task is not complete, try a different approach or different arguments instead of repeating the call.
```

#### Token 影響

達到閾值前為零 token。提醒會作為該 agent 的歷史記錄保留。

#### KV Cache 影響

僅追加；新出現的內容位于可復用請求前綴之后，不會使現有 KV Cache 條目失效。

### 后續閾值的上下文消息

#### 模型看到什么

達到后續閾值時，agent 會收到下面的詳細提醒模板。受上限約束的參數預覽嚴格以 `… (+<omitted> more chars)` 結尾。

##### 后續閾值提醒

```markdown
Repeated tool call detected:
- tool: <toolName>
- consecutive_calls: <count>
- arguments: <canonicalArguments>
The repeated calls are not making progress. Do not call this tool with these exact arguments again. Inspect the latest result and choose a different action, different arguments, or finish the task if enough evidence has been gathered.
```

#### Token 影響

每條提醒都會作為歷史記錄保留；`argumentsPreviewChars` 限制隨數據變化的參數文本長度，而各 agent 仍使用獨立計數器。

#### KV Cache 影響

僅追加；新出現的內容位于可復用請求前綴之后，不會使現有 KV Cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明 guard 何時不合適。它們是當前包約束，不是任務積壓。

- **僅精確匹配檢測**——規范化是深度鍵排序，因此近似變體（稍作修改的路徑、值內多余的空白）會繞過鏈；在沒有需求證據前，不采用模糊匹配。
- **壓縮（compaction）不會重置鏈**——跨越壓縮檢查點的鏈會繼續計數。
- **僅提供建議**——尚未實現高閾值時升級為阻止形式，但 `PostToolDecision` 已支持阻止。
- **subagent 之間不共享鏈**——鏈始終按 agent 隔離；父 agent 與其 subagent 重復相同調用也絕不合并。
- **合理的冪等輪詢超過閾值后仍會收到提醒**——可通過 `thresholds`／`exclude` 配置釋放壓力。
- **超過最高閾值后鏈不再提醒**——提醒只在精確達到所配置的次數時觸發，超過后不會繼續發送。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文：開放問題與尚未決定的探索方向。它明確不具權威性——已交付的行為、限制與既定理由以上文、包代碼和相關 Agent Note 為準。

[repeat-tool-guard Agent Note](../../../.agents/notes/archived/feature/2026-07-08-repeat-tool-guard.md) 以舊包名記錄了原始設計與備選方案；[改名臺賬](../../../.agents/notes/archived/architecture/2026-08-11-repository-naming-contract-and-rename-ledger.md) 記錄了改名為 `repeat-tool-reminder` 及其原因。

</details>
