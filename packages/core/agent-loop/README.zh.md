---
description: "面向用戶與維護者的默認 agent（智能體）驅動器說明，用于選擇、配置或調試 agent 的創建方式以及輪次與步驟的運行方式。"
kind: "package-reference"
---

# @deepseek-ai/dsh-agent-loop

[English](README.md) | 中文

## 概述

`dsh-agent-loop` 創建全新 agent 或恢復持久化會話，隨后通過模型請求、流式響應、工具執行和持久會話歷史驅動每個輪次。標準 agent 組合應掛載本包；聲明式條目會在啟動時啟動 agent，公開的 `ctx.agents` API 則支持以編程方式創建和恢復 agent。`maxParallelToolCalls` 限制同時運行的并行安全調用數量，獨占調用保留順序。取消會保留已經流式交付給用戶的文本。只有標準的「調用模型、運行工具、重復」生命周期無法滿足需求時，才應選擇自定義 `Agent` 實現。

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

在任何應運行 agent 的組合中掛載 `dsh-agent-loop`。它提供 `ctx.agents` 背后的驅動器，并啟動你在配置中聲明的 agent；[`dsh-base`](../../bundle/base/README.zh.md) 與 [`dsh-sdk-minimal`](../../bundle/sdk-minimal/README.zh.md) 都將它作為顯式配置行掛載。

### 配置聲明式 agent

配置中聲明的 agent 會在插件加載時自動啟動。每個條目需要一個 `id` 標簽；模型調用還同時需要 `provider` 與 `model`（`agent/request` 可以在分發前補齊缺失的這一對值）。

```yaml
- name: '@deepseek-ai/dsh-agent-loop'
  config:
    maxParallelToolCalls: 10
    agents:
      - id: 'main'
        provider: deepseek
        model: deepseek-chat
        reasoningEffort: high
        cwd: /workspace
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `maxParallelToolCalls` | `10` | 每個步驟同時在途的并行安全工具調用數；`1` 為串行 |
| `agents[].id` | 必填 | 穩定標簽；未設置 `sessionId` 時，全新會話會生成 `${id}-session-<uuid>` |
| `agents[].provider` / `agents[].model` | — | 模型路由；分發前兩者都必須存在 |
| `agents[].reasoningEffort` | — | 非空的初始推理強度；`agent/request` 可以覆蓋它 |
| `agents[].maxTokens` | — | 正數的逐請求輸出 token 上限 |
| `agents[].cwd` | — | 全新會話的工作目錄 |
| `agents[].sessionId` | — | 確切身份：首次使用創建，重新掛載時恢復已實體化的歷史 |
| `agents[].resumeSessionId` | — | 加載這個持久化會話而不是創建新會話；與 `sessionId` 互斥 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-agent-loop)是每個受支持字段的窮盡式真源。適配器會校驗有效推理強度，循環則把它記錄在請求頭中。`maxParallelToolCalls` 也是整個 `agent-loop` 設置分節，因此疊加在該條目之上的用戶層無需重啟即可限制下一組工具調用。

### 以編程方式創建或恢復 agent

插件與宿主通過 `ctx.agents.create()` 創建 agent，通過 `ctx.agents.resume()` 恢復持久化會話；兩者都返回 `AgentHandle`，其 `dispose()`（資源釋放）負責精確拆除對應的 agent。循環會把每個創建的 agent 運行到完成——只有調用方需要自行拆除 agent 時才需要句柄。

```text
const handle = await ctx.agents.create({
  sessionId,
  agentOptions: { provider: 'deepseek', model: 'deepseek-chat' },
  setup: (agentCtx, agent) => { /* scoped registrations plus explicit unpublished Agent */ },
})
```

每次 inbox 變更都會提交一條規范化的 `agent/inbox/spliced` 事件。投影注冊表會同步折疊該事件，因此 `Session.append()` 返回時，實時投影已經反映該 splice。插入、編輯、移除、領取與取消都通過同一組標準 splice 坐標回放。普通刪除攜帶 `outcome: 'canceled'` 并發出 `agent/inbox/discarded { message }`；領取使用不帶 outcome 的純刪除，并發出 `agent/inbox/claimed`。每次插入都會發出 `agent/inbox/inserted { message }`。`MessageId` 在兩個待處理列表之間保持唯一。需要被移除消息的消費方應使用 claimed 或 discarded 通知，而不依賴 splice 前的 `session/event` 投影視圖。

### 一個步驟做什么

每個步驟都會發送會話的派生歷史——最新的非空 `system/message` 節點是有效提示詞，渲染提示詞為空時則沒有系統消息——及其可見工具 schema；模型的工具調用經過受守衛的工具流水線，每個被接納的事實都會在下一步據此派生之前追加到會話日志。并行安全調用最多可重疊 `maxParallelToolCalls` 個；獨占調用單獨運行并構成排序屏障。取消是協作式的：`agent.cancel()` 中止當前活動，并在未設置 `keepInbox` 時清除待處理工作；被取消的流會終結已送達用戶的文本。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋該包如何實現上述行為；可觀察約定已在[使用本包](#use-this-package)中完整說明。

### 設計理念

該包是公開 `Agent` 約定的唯一具象實現。它在 `ctx.agents` 上把自身注冊為 `AgentFactory`，因此消費方從不導入本包；每個創建 agent 的所有權歸屬于調用方 fiber 與循環提供方，并匯合到同一個記憶化的完全停穩邊界。每個可觀察效果都通過會話事件與 `agent/*` 分類體系發生——包內部實現絕不屬于公開接口。

### 請求 header 與適配器默認值

`agent/request` 返回后，`ctx.llm.prepareCall()` 會在活躍輪次信號下校驗適配器持有的字段，并解析推理強度和輸出 token 默認值。循環會在解析、`request/header` 記錄與分派期間保留同一個適配器。循環會為首次請求、變化的 envelope（配置或工具——提示詞不屬于 header）、顯式消息序列起點、surface 替換（原地替換提示詞或壓縮（compaction））后的請求及恢復寫入完整 header；同一序列內內容未變的步驟、重試與普通后續輪次繼承最新 header，歷史內追加提示詞不是替換，因此緊隨其后的請求同樣繼承 header。在 header 之外，循環還會記錄 `request/context`——提供方、模型、`contextWindow` 以及來自 `prepareCall()` 的路由 `systemPromptUpdate` 模式——且僅在其中任何一項與最新快照不同時記錄。下一次 waterfall 分發前，循環移除適配器默認字段，使當前路由重新解析它們；顯式設置則保留。未處理的路由仍以 `NO_ADAPTER` 失敗。

循環在每個派生消息對象首次進入請求時執行深凍結，并且僅在同一 agent 內復用該證明。恢復的消息保留對象身份；構造請求不會凍結包含消息的事件包裝對象。每個請求都會凍結本地規范化 header、新消息數組和請求封裝，同時保留取消信號的可變性。[請求凍結決策](../../../.agents/notes/implemented/simplification/2026-09-06-agent-request-freeze-provenance.zh.md)解釋了所有權與測量依據。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`AgentLoop` 服務、配置 schema、聲明式 agent 啟動、工廠注冊 |
| [`src/agent.ts`](src/agent.ts) | 具體 `ReactLoopAgent` 驅動器：收件箱、輪次／步驟狀態機、取消 |
| [`src/inbox.ts`](src/inbox.ts) | 包內部的 `ReactLoopInbox`：持久投影、結構化命令與僅供循環使用的領取狀態 |
| [`src/tool-calls.ts`](src/tool-calls.ts) | 工具調度：獨占屏障與有界并行池 |
| [`src/runtime-context.ts`](src/runtime-context.ts) | 逐步驟運行時上下文快照處理 |
| [`src/constants.ts`](src/constants.ts) | `DEFAULT_MAX_PARALLEL_TOOL_CALLS` |
| [`src/invariant.ts`](src/invariant.ts) | 不變式配套：從會話日志重建請求 |

### 創建與拆除

創建是同一個受回滾保護的事務：構造私有會話、具象 agent 與帶作用域上下文；等待分別傳入上下文與 Agent 的可選 setup；進入兩個注冊表；依次宣告 `session/created` 與 `agent/created`；發出 `agent/session-start`；此后才啟動驅動器。創建運行時子 Agent 的調用方設置 `options.parentAgent`；調用方 Context 則單獨擁有事務和存活句柄。Setup 拋出、commit 失敗或所有者 dispose 都會回滾事務而不發布任一 id。Teardown 順序是停止并排空、關閉會話的寫路徑、撤銷作用域、detach agent、再 detach 會話，且每次 detach 都綁定到確切進入的對象，因此陳舊 disposer 無法移除之后出現的同 id 替代項。

### 持久化集成

循環是會話寫句柄在生產環境中的獲取點。掛載 `ctx.sessionPersistence` 后，`create`/`createAgent` 調用 `persistence.create(header)`——在發布之前存儲持久身份并取得寫所有權——并通過句柄追加構造 seed；`resume` 先調用 `persistence.open(id, 'write')`（排除同 id 的并發恢復），通過句柄讀取物理上有效的日志，并為在輪次中途崩潰的日志把 `interruptedTurnClosers` 作為普通批次追加——語義崩潰修復是 agent 層的職責，而非存儲入口。發布前的最后一刻，`appendUnstoredSuffix` 存儲 setup 窗口期間追加的事件（seed 標記、委派策略記錄），它們絕不會經由 `session/event` 重新發出。發布之后，掛載的后端按會話 id 把該會話的 `session/event` 批次、`session/flush` 屏障與 `session/disposed` 退役路由進活躍寫句柄；循環只通過它擁有的句柄觸碰存儲。記憶化的 teardown 在循環提交會話的收尾事件之后關閉句柄——close 會排空任何已路由的緩沖——可證明地釋放寫所有權。沒有后端時，會話只存在于內存中，其余一切不變。

### 輪次與步驟流程

驅動器在其整個生命周期內擁有一個 agent，并在 `ctx.agents.withInitiator(agent, ...)` 內運行。其包內部 `ReactLoopInbox` 構造函數在 agent 作用域上注冊標準 `inbox` 投影，隨后將該投影用于結構化命令與僅供 loop 使用的領取操作。注冊表引用計數會使共享 key 持續有效，直至最后一個 agent 作用域卸載。在輪次邊界，它先打開持久輪次，再原子領取待處理的 next-step 輸入與一條排隊提示詞；在步驟之間則只領取 next-step 輸入。驅動器組裝提示詞與工具、投影運行時上下文，并運行 `agent/pre-step`。被拒絕的決定或空的首批輸入不打開步驟。接納后的首次嘗試先記錄 `step/start`，再運行 `agent/request` waterfall 與 `prepareCall()`；這兩個異步階段都看不到待提交的系統提示詞與已接納用戶消息進入歷史，在任一階段取消都不會提交這兩者。每次嘗試時，循環隨后依據已準備調用的能力，同步將渲染后的提示詞與存活的 `system/message` 節點協調一致、僅在首次嘗試追加已接納的 `user/message` 批次、按需記錄 header 與 context，再派生并凍結請求，通過該綁定的已準備調用發起流式請求。重試復用同一份已渲染組裝結果，不重復組裝、`agent/pre-step` 或用戶消息準入。協調過程可見 pre-step 與重試中的壓縮；序列中斷時將提示詞歸并到頭部，而非在已提交用戶消息之后追加更新。請求由 `header.config`、`deriveMessages()` 與 `header.tools` 構成，不攜帶 `system` 字段。每次模型嘗試會發出一個進程本地 `start`，僅在匹配的持久 assistant-frame 結算之后發出各個 `chunk`，并恰好發出一個終態 `end`；最終組裝或消息追加失敗時以 `aborted` 結算，`committed` 則出現在持久 `assistant/message` 之后。每次成功的模型調用都恰好追加一個 message 錨點，被取消的流則追加帶 `interrupted: true` 的錨點并攜帶已交付前綴，使下一次請求包含用戶看到的內容。在步驟內，獨占調用形成屏障，并行安全調用使用有界滾動池；策略、持久結果與結果上下文保持模型順序。

提示詞準入依據實際的 `prepareCall()` 結果，而非先前的 `request/context`。沒有系統節點時，即使提示詞為空也追加（預留第 0 號節點，但不產生協議消息）。在不具備能力的路由上或新請求序列開始時，非空渲染文本歸并到首個系統節點：每個非空的后續系統節點分別收到有日志記錄的空內容替換，隨后按需重寫頭節點。未生效的空尾節點無需替換，也不決定有效文本。即使最新有效文本未變，也執行歸并。延續中的 `in-history` 序列在有效提示詞不變時不產生事件，非空變更則追加。無論路由或序列狀態如何，空渲染文本都會通過有日志記錄的逐節點空內容替換清除每個非空的后續系統節點，再按需清空頭節點。模型不會繼續看到舊指令。空頭節點且沒有生效的后續系統節點表示沒有提示詞；重復清除與恢復會話都保持為空。重新提供的非空提示詞遵循同一路由／序列規則：延續中的具備能力路由可以追加它，不具備能力的路由或新序列則重新填充頭節點。以下情況開啟序列：pre-step 決定聲明 `startsRequestSeries`、surface 替換 generation 自附接或上次請求以來發生變化（壓縮或任何替換）、可見工具 schema 變化。恢復與單純的提供方或模型切換都延續序列；準入仍由已準備的路由決定。逐節點的空內容替換保留其間歷史，無需 surface 刪除操作。

### 失敗與取消

最終適配器選擇、分發與迭代失敗以終止結束的形式到達并進入 `agent/request-error`；處理該失敗的監聽器返回 `{ kind: 'retry' }` 且不調用 `next()`，未被處理的失敗則是終態。Middleware、結果處理、工具及其他擴展失敗仍會拋出并直接關閉輪次——插件失敗結束的是輪次，不是循環。取消后未分發的模型工具調用會收到合成的 `tool/call` 加 `ABORTED_BEFORE_DISPATCH` 結果對。[顯式取消決策](../../../.agents/notes/implemented/architecture/2026-07-16-explicit-turn-cancellation.zh.md)擁有信號生命周期。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

包級約定對大多數消費方已經足夠；需要周邊領域與設計原理時再閱讀以下頁面。

- [agent 包](../agent/README.zh.md)——本循環實現的 `Agent` 句柄、注冊表與 `agent/*` 事件。
- [Core 子系統](../../../docs/subsystems/core.zh.md)——輪次流與攔截決策。
- [會話子系統](../../../docs/subsystems/session.zh.md)——循環寫入并據此派生的持久日志。
- [工具子系統](../../../docs/subsystems/tools.zh.md)——循環分發所經過的流水線。
- [顯式取消 Agent Note](../../../.agents/notes/implemented/architecture/2026-07-16-explicit-turn-cancellation.zh.md)——信號生命周期與取消競態。
- [core 分組地圖](../README.zh.md)——core 各包如何組合。

-----

<a id="model-experience"></a>
## 模型體驗

### 完整對話請求

#### 模型看到什么

每個步驟中，循環會發送會話的派生消息與可見工具 schema。非空的 `system/message` 節點承載提示詞，最新一條是有效版本；空渲染文本會從派生歷史中清除所有提示詞版本。它提供 `provider`、`model` 與 `cwd` 變量值，但不添加固定文案。

#### Token 影響

系統文本與 schema 在每個步驟都會再次計入，在 `in-history` 路由上，每個保留的提示詞版本都會持續計入，直到壓縮將其遮蔽或提示詞協調將其清空。逐 agent 作用域決定貢獻，而權威組裝 waterfall 可以改變最終請求，并使其監聽器負責保持協議連貫。

#### KV Cache 影響

只有在同一提供方與模型路由下，且系統文本、schema 與此前歷史都保持逐字節一致時，請求才保持僅追加。渲染后的提示詞未變時，緩存前綴得以保留，除非不具備能力的路由或新請求序列必須歸并保留的歷史內系統節點。原地替換某個系統節點的提示詞變更會使請求從該節點的第一個 token 起就不同——該節點是第 0 號節點時則整個請求都不同——因此提供方前綴緩存從那里開始未命中；當已準備調用聲明 `systemPromptUpdate: 'in-history'` 時，同一請求序列延續期間的非空提示詞變更會追加到已緩存歷史之后，因此直到該歷史末尾的前綴仍可復用。schema 或組合變更則從第一個改變的請求 token 起使復用失效。

### 保留的消息歷史

#### 模型看到什么

已接納的 user 消息、assistant 消息、工具調用與結果、注入上下文與 steering（中途引導）都會記錄，并在后續步驟中發送。原始流分片、生命周期邊界與其他僅寫入日志的事件會被排除。

#### Token 影響

輸入會隨每條表層消息增長，直到壓縮替換遮蔽較舊節點；包含多個步驟的工具輪次會在每個步驟重新發送累積的歷史。

#### KV Cache 影響

普通歷史增長僅追加，并保留可復用條目。表層替換或壓縮會從第一個被遮蔽的歷史 token 起使復用失效。

### 取消后未分發的調用

#### 模型看到什么

如果后續請求回放一個中止的步驟，取消所阻止分發的每個工具調用都有錯誤碼 `ABORTED_BEFORE_DISPATCH`，結果文本為 `Error: tool call aborted before dispatch`。

#### Token 影響

每個跳過的調用都會在歷史中保留一個固定錯誤結果，直到壓縮將其遮蔽。

#### KV Cache 影響

僅追加；每個合成結果都位于可復用請求前綴之后，不會使現有 KV Cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明循環何時需要特別留意。它們是當前包約束，不是任務積壓。

- **分類是一元的**：安全性取決于比較同級調用或資源的調用必須保持獨占（[原理](../../../.agents/notes/implemented/feature/2026-07-10-parallel-tool-call-execution.zh.md)）。
- **配置標簽默認對應新會話**：省略 `sessionId` 時，每次啟動都會創建新的 `${id}-session-<uuid>`；如需確切的恢復或創建行為，必須顯式提供穩定的 `sessionId`，而 `resumeSessionId` 要求已有持久化歷史。
- **配置 agent 沒有逐 agent persona 字段或 setup 鉤子**：它們使用部署 persona；只有編程式 `ctx.agents.create()` / `resume()` 工廠選項支持帶作用域的 persona 與工具組合。
- **沒有內置輪次預算**：工具調用或 steering 會讓當前輪次繼續；限制失控輪次的策略必須從既有生命周期擴展點（如 `agent/turn-stopping`）執行取消。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
