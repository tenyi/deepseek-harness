---
description: "面向插件、UI 與編排器的 Agent 句柄、實時注冊表、進程本地發起方作用域，以及 agent/* 事件詞匯。"
kind: "package-reference"
---

# @deepseek-ai/dsh-agent

[English](README.md) | 中文

## 概述

使用 `dsh-agent` 創建或恢復實時 agent（智能體）、發送后續或 steering（中途引導）輸入、注入面向模型的上下文、取消工作，并等待 agent 進入空閑狀態。插件、UI、鉤子與編排器還可以觀察或攔截 agent 活動，并僅為一個 agent 應用能力而不影響其他 agent。當代碼需要通過公開 `Agent` API 控制或擴展實時 agent 時，請選擇本包。請將它與 `dsh-agent-loop` 等 agent 驅動器配合使用；本包本身不會創建模型請求。發起方歸因僅存在于進程內，跨 worker、進程、持久隊列與重啟時必須顯式傳遞。

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

在存在實時 agent 的任何地方掛載 `dsh-agent`：它提供 `ctx.agents` 以及插件、UI、鉤子和編排器所面向編程的 `Agent` 句柄。在沒有驅動器注冊工廠之前，該服務保持惰性——隨附驅動器是 `dsh-agent-loop`，因此最小的可用組合需要同時加載兩者。

### 創建或恢復 agent

`ctx.agents.create()` 在一個身份下構建全新 agent 與會話；`ctx.agents.resume()` 加載持久化會話并在此基礎上重建 agent。兩者都委托給已注冊工廠，并返回 `AgentHandle`——唯一能拆除該 agent 的對象。在任一操作的 options 中設置 `parentAgent`，可使結果成為運行時子級；省略它則得到運行時根級。`get(id)`、`list()` 與 `roots()` 用于查找實時 agent；`isOwnedBy(id, parent)` 用于檢驗這項確切的實時所有權關系。

```text
const handle = await ctx.agents.create({
  sessionId,
  agentOptions: { provider: 'deepseek', model: 'deepseek-chat' },
})
// later:
await handle.dispose()   // stops the loop, unregisters, removes the session, unwinds the scope
```

`AgentOptions` 提供初始提供方／模型路由、可選的由適配器定義的 `reasoningEffort`，以及可選的正數 `maxTokens` 輸出上限。循環會校驗確切模型的推理（reasoning）支持、解析適配器默認值、把生效值記錄在請求頭中，并將它們應用到每個對話請求。可選的 `setup(agentCtx, agent)` 回調會在 agent 發布之前組合其作用域世界：`agentCtx` 擁有注冊，顯式的未發布 Agent 則提供其 Session；Context 不含反向 Agent 屬性。作用域工具、提示詞段與監聽器在任何創建公告之前就已存在。Setup 只做組合：創建完成后才能驅動 agent。

### 驅動 agent 的對話

句柄的方法把帶標識的 user 角色消息路由進 agent 的收件箱。`followup()` 排隊一條普通的下一個輪次提示詞并喚醒驅動器；`steer()` 提交下一步輸入并喚醒它；`inject()` 添加面向模型的上下文但不喚醒驅動器，因此它落在下一個被接納的步驟中。`cancel(cause)` 中止當前活動，并在未設置 `keepInbox` 時清除待處理工作；`whenIdle()` 會在整個 agent 達到完全停穩后完成。

```text
handle.agent.followup({
  content: [{ type: 'text', text: 'Summarize this workspace.' }],
  source: { kind: 'user' },
})
handle.agent.steer({
  content: [{ type: 'text', text: 'Focus on the tests.' }],
  source: { kind: 'plugin', plugin: 'my-plugin' },
})
await handle.agent.whenIdle()
```

### 將注冊限定到單個 agent

`Agent.ctx` 是該 agent 的作用域上下文：通過它進行的注冊（工具、提示詞段、變量、事件監聽器、限制）只對該 agent 生效，并在 dispose（資源釋放）時全部撤銷。同一機制也是 agent preset 用來讓一個會話獲得不同能力集、同時不影響其鄰居的方式。

### 攔截或觀察進行中的工作

`agent/*` 事件讓插件無需依賴循環包即可作用于實時工作。`agent/pre-step` 可以拒絕擬進入的步驟或替換進入它的消息；`agent/request-error` 讓監聽器重試失敗的模型請求；`agent/turn-stopping` 在本可完成的輪次關閉前運行，并可通過 steer 使其保持打開。`agent/assistant-stream` 攜帶一個進程本地 Assistant attempt 的有序 start、瞬態分片與 end frame。start 給出該 attempt 的輪次與步驟，分片索引從零開始密集遞增，`end.index` 則是下一個分片位置。loop 會在 committed end frame 前把完整緊湊流提交為一個 `assistant/message` 或 `assistant/attempt`，因此實時事件仍是呈現數據而非回放來源。`agent/status`、`agent/created` 與 `agent/disposed` 驅動 UI 與協調狀態，逐消息的 `agent/inbox/*` 通知則讓收件箱投影保持同步。確切簽名、分發 mode 與 payload 約定見 [core 子系統頁](../../../docs/subsystems/core.zh.md#cordis-surface) 的生成區塊。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋該包如何實現上述行為；可觀察約定已在[使用本包](#use-this-package)中完整說明。

### 設計理念

該包建立在一項職責分離之上：公開的 `Agent` 接口與注冊表位于本包，構造與驅動則位于循環包，并通過已注冊工廠提供。消費方因此依賴 `dsh-agent` 而不依賴 `dsh-agent-loop`，從而保持驅動器可替換。第二個理念是發起方作用域：一條 `AsyncLocalStorage` 鏈把確切的實時 `Agent` 攜帶經過它啟動的異步驅動器工作，使驅動器之下的輔助函數無需逐調用轉發 agent 即可歸因自己的工作。

### 步驟準入

`PreStepDecision` 要么是 `{ kind: 'reject' }`，要么是 `{ kind: 'enter', messages, startsRequestSeries? }`。enter 分支包含完整、帶標識且凍結的消息批次。接納不等于提交：組裝與 `step/start` 之后，`agent/request` 和 `prepareCall()` 先解析路由，循環隨后才提交系統提示詞與用戶批次。在任一異步階段取消都不會提交這兩者。`startsRequestSeries: true` 聲明一個獨立的模型消息序列；包裝下游 enter 的監聽器會保留該聲明與批次，除非有意替換其中一項。領取會從 inbox 移除候選消息，領取后插入的消息則等待后續邊界。

### 持久 inbox

`Agent.inbox` 只暴露結構型 `Inbox` 接口，投影詞匯仍位于本包。dsh-agent-loop 持有包內部的 `ReactLoopInbox` 與標準 `inbox` 投影；構造具體 inbox 時會確保投影注冊表為持久 `agent/inbox/spliced` fold 持有一份注冊。注冊表繼續作為實時 `{ 'next-turn', 'next-step' }` 狀態的唯一所有者。重建過程會拒絕不安全或越界的 splice 坐標，以及跨兩份待處理列表重復的 `MessageId`，并報告出錯事件的 seq。

`Inbox` 暴露待處理的 `nextTurn` 與 `nextStep` 消息，并通過 `append`、`prepend`、`replace`、`remove`、`clear` 與 `splice` 變更它們。普通刪除和 `clear()` 都是持久取消。在步驟邊界，循環的內部實現會通過純刪除 splice 領取待處理輸入。實時通知刻意采用逐消息的最小載荷：`agent/inbox/inserted { message }`、`agent/inbox/claimed { message, turn }` 與 `agent/inbox/discarded { message }`。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`AgentRegistry`、工廠槽位、發起方作用域、`CreateAgentOptions`/`ResumeAgentOptions` |
| [`src/runtime-types.ts`](src/runtime-types.ts) | `Agent`、結構化 `Inbox`、`AgentStatus` 與 `agent/*` 事件聲明 |
| [`src/types.ts`](src/types.ts) | `AgentOptions`、取消原因與收件箱投影詞匯 |
| [`src/dispatch.ts`](src/dispatch.ts) | `agentEvents` 融合分發器與 `assembleContextFor(agent)` |
| [`src/consumed-work.ts`](src/consumed-work.ts) | `foldConsumedWork(events)`：日志消費掉的工作最終怎樣了 |
| [`src/model-selection.ts`](src/model-selection.ts) | `installModelSelection`：把一個選擇耦合到組裝與路由 |
| [`src/invariant.ts`](src/invariant.ts) | 不變式配套：無操作的 `agent/status` 轉換會失敗 |

### 注冊表與生命周期

`AgentRegistry` 為每個實時 agent 保留一個條目，含其載體與創建者關系。`register()` 記錄一個已構造完成的 agent；異步工廠使用拆分的 `enter()`/`announce()` 對，使 setup 與發布始終處于回滾保護之下。創建分發期間請求的 detach 會等待該次分發退棧，且每次 detach 都綁定到確切條目，因此陳舊 disposer 無法移除之后出現的同 id 替代項。Teardown 順序是停止并排空循環、撤銷作用域、detach agent、detach 會話；私有清理完成后該 id 即可復用。

### 發起方作用域

每個驅動器在 `ctx.agents.withInitiator(agent, ...)` 內運行其完整生命周期，因此繼承的異步鏈會觀察到該 agent；`withoutInitiator()` 為共享定時器等無關的進程本地工作隱藏它。該邊界只是進程本地歸因——環境中的身份既不是存活證明，也不是授權，顯式身份在 worker、進程、持久化與 wire 邊界保持權威。Teardown 拒絕新邊界，讓返回 Promise 的邊界排空，然后禁用底層存儲。[發起方作用域決策](../../../.agents/notes/implemented/architecture/2026-07-15-agent-initiator-scope.zh.md) 擁有詳細約定。

### 所有權不變式

`AgentHandle` disposer 是一項能力：在消費方中，只有其持有者能拆除該 agent。已注冊的工廠提供方是結構化共同擁有者，因為作用域 agent 依賴該提供方的服務 API；提供方卸載會停止并排空它創建的每個實時句柄。`ctx.agents.get(id)` 仍返回裸 `Agent`——句柄只暴露給創建它的消費方。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

包級約定對大多數消費方已經足夠；需要周邊領域與設計原理時再閱讀以下頁面。

- [Core 子系統](../../../docs/subsystems/core.zh.md)——循環圖、`Agent` 句柄、攔截決策與生成的服務 API。
- [agent-loop 包](../agent-loop/README.zh.md)——創建、驅動并拆除 agent 的默認驅動器。
- [會話子系統](../../../docs/subsystems/session.zh.md)——句柄背后的持久日志與派生歷史。
- [發起方作用域 Agent Note](../../../.agents/notes/implemented/architecture/2026-07-15-agent-initiator-scope.zh.md)——邊界與 teardown 約定。
- [core 分組地圖](../README.zh.md)——core 各包如何組合。

-----

<a id="model-experience"></a>
## 模型體驗

### 用戶、steering 與注入消息

#### 模型看到什么

`followup`、`steer` 與 `inject` 以帶標識的 user 角色消息饋送所屬會話；被接納的內容成為模型在后續步驟中讀取的派生歷史的一部分。`agent/pre-step` 與其他已聲明事件讓插件能夠拒絕擬進入的步驟或添加持久請求材料。`installModelSelection` 會在首次為不同提供方／模型路由組裝且原本會發出模型請求的步驟中加入 `[model changed: assistant turns above this point were generated by <previous>; the session continues with <next>]`；僅跨提供方切換時顯示提供方名稱，只改變推理強度時不添加消息。第一個決策為空時，以及某個決策移除候選消息后為空時，都不會產生請求。如果請求步驟在記錄請求頭前失敗，持久記錄中的先前路由沒有變化，所以下一個請求步驟會再次收到提示。

#### Token 影響

被接納內容成為保留歷史，或成為每次請求重復的會話前綴；被阻止內容不貢獻請求 token。每條實際發出的模型切換提示都會把對應文本加入保留歷史。大小取決于調用方與插件。

#### KV Cache 影響

被接納歷史與 steering 只追加；被阻止的提交不發送請求。會話前綴在循環實例內保持穩定，而新建或恢復的實例可能建立不同前綴。

### Agent 作用域的請求組合

#### 模型看到什么

通過 `agent.ctx` 進行的注冊可以遮蔽提示詞段或工具，也可以在未發布 setup 期間安裝僅適用于該 agent 的攔截器，因此一個 agent 看到的提示詞與工具集會與其鄰居不同。模型選擇會在提示詞組裝前捕獲一次提供方／模型／推理強度值，并將其應用到同一步驟的請求；之后發生的并發變更等待下一個步驟。

#### Token 影響

每次提供方／模型切換會增加一條簡短且保留在歷史中的 user 角色提示。其他帶作用域貢獻只影響該 agent，并在 dispose 時消失。

#### KV Cache 影響

切換提示追加在先前歷史之后，因此保留該前綴；路由變更可能使新的提供方或模型無法復用此前綴。改變提示詞段、工具定義或請求監聽器的 setup 或 reload，可能從第一個受影響的請求 token 起使復用失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本包何時需要特別留意。它們是當前包約束，不是任務積壓。

- **發起方作用域只存在于進程內**：worker、子進程、HTTP、持久隊列和重啟必須顯式傳遞所需身份。
- **環境身份可能比存活狀態更久**：消費方在生命周期敏感工作前，仍要檢查 `agent.status`、取消狀態和所屬能力約定。
- **`agent/session-start` 不能為啟動設置門禁**：它仍是同步且不可 veto 的通知；必須在發布前完成的異步組合屬于工廠的 `setup(agentCtx, agent)` 事務。
- **`cancel()` 默認清空收件箱**：它會中止正在處理的輪次以及排隊和 steering 工作；`cancel(cause, { keepInbox: true })` 只中止輪次并保留待處理項，且不存在讓輪次繼續運行、只中止步驟的操作。
- **每條附加 `UserMessage` 恰好攜帶一個 `MessageSource`**：多個插件合并到一條消息上的貢獻會歸入同一來源，因此該消息無法列出多個生產者。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文；它明確不具權威性。尚未決定的開放方向：委派之外的 agent 間通道——共享狀態、流式子輸出以及后臺或輪詢語義仍不在當前委派 seam 之內；以及 `SessionStartSource` 的 `'clear'`/`'compact'` 值已保留但尚無發出方，待驅動子系統落地。

</details>
