---
description: "面向用戶與維護者的 subagent 委派 seam，用于選擇提供方后端、組裝委派工具或排查子 agent（智能體）運行問題。"
kind: "package-reference"
---

# @deepseek-ai/dsh-subagent

[English](README.md) | 中文

## 概述

使用 `dsh-subagent` 把工作委派給具名子 agent、收集結果，并跨輪次繼續受支持的子級對話。一個組合可以并排提供進程內、ACP（Agent Client Protocol）、SDK、Codex 或 Claude Code 子級。需要單個結果時選擇一次性子級；需要后續消息與中斷能力時選擇可繼續子級。你還可以檢查可用子級及其模式、活動狀態與譜系，而無需加載或恢復它們。啟用時需要至少一個受支持的子級后端和一個委派工具。

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

本包是每個委派組合都共享的約定。你通過把服務與一個或多個提供方后端以及面向模型的委派工具一起掛載來啟用它；此后 agent 即可委派工作，服務會把每個請求路由到具名提供方。

### 啟用委派

把服務與一個提供方和委派工具一起掛載。提供方以你配置的名稱注冊（進程內 spawn 后端默認為 `spawn`）；工具行指名該提供方，讓模型看到一個靜態工具。一個最小的一次性配置：

```yaml
- name: '@deepseek-ai/dsh-subagent'
- name: '@deepseek-ai/dsh-subagent-spawn-in-process'
- name: '@deepseek-ai/dsh-tool-subagent'
  config:
    provider: spawn
    toolName: subagent
```

調用該工具的 agent 會把子 agent 的最終答案作為工具結果收到。只掛載服務本身不會改變任何行為：在組合出提供方和工具之前，什么都不能委派。

### 一次性與可繼續子級

一次性子 agent 只運行一次，并以單個結果結算，可附帶可選的結構化輸出與失敗時的安全診斷。啟動請求可以通過 `agentOptions` 覆蓋子 Agent 的提供方、模型、推理強度與輸出 token 上限；每個請求的選項都要求提供方聲明對應能力。可繼續子 agent 保留持久會話并按順序接受后續消息：調用方收到穩定的子 agent id、發送相鄰 Agent 消息，并可中斷當前輪次而不銷毀子 agent。工具行的 `backgroundMode` 選擇形態（默認 `one-shot`，或在支持的提供方上使用 `continuable`）。

### 消息、中斷與發現

每個確切在線 Agent 都可以對直接可繼續 child 使用 `sendMessage()`；駐留的可繼續 child 還可以對自己的直接 parent 使用它。正在工作的目標通過 Steer 在最近 step 接收 Agent 消息；空閑目標啟動輪次，且只有直接 child 可以冷恢復。parent 也可以隨時中斷正在運行的后代或列舉自己的子級。瀏覽器發出的繼續執行提示詞會獨立選擇 Queue 或 Steer，并且可以攜帶圖片部分：Host 先通過附件存儲完成整批圖片的準入與持久化，子級 inbox 才接受這條消息；當子級聲明的模型不接受圖片輸入時拒絕投遞。發現覆蓋兩種形態：服務列舉直接子級與完整后代樹——模式、活動狀態與譜系——直接讀取在線會話狀態與可選持久化，不加載任何子 agent。

### 失敗與恢復

需要所選提供方不具備的能力的請求會在啟動時明確報錯，而不會被靜默忽略。失敗的子 agent 運行會返回停止原因，提供方后端還會附加安全診斷；被取消的請求以 `aborted` 結算。子 agent 相互隔離：崩潰或行為異常的子 agent 無法破壞父級會話。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋服務的構建方式以及可觀察行為從何而來；完整約定見[使用本包](#use-this-package)。

### 設計理念

- **一個服務，多個提供方。** 服務是具名提供方注冊表；每個后端以唯一名稱注冊，請求按名稱選擇一個。
- **兩種子級形態。** 一次性運行在發布時轉移所有權；可繼續子級保留持久 Session，且同一時刻至多一個進程內 Activation。
- **兌現即發布。** 提供方的 `start()` 只有在真實子 agent 存在后才兌現，因此調用方要么擁有一段在線運行，要么一無所有。
- **同進程值可信。** 請求、描述符與結果按不可變約定借用；序列化與不可信輸入校驗屬于進程與協議邊界。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 服務入口：提供方注冊表、啟動與繼續 API、生命周期事件 |
| [`src/continuation.ts`](src/continuation.ts) | 可繼續子級編排：身份預留、提供方準備、冷恢復、授權與路由 |
| [`src/continuation-activation.ts`](src/continuation-activation.ts) | 進程內 Activation 圖、準入、結算與子級優先釋放 |
| [`src/continuation-messages.ts`](src/continuation-messages.ts) | 相鄰 Agent 消息、返回指引與結算通知 |
| [`src/internal.ts`](src/internal.ts) | Host 專用 Queue 與 Steer 適配器，以及標準相鄰 Agent 消息標記 |
| [`src/inbox.ts`](src/inbox.ts) | Activation 局部的 Queue 和 Steer 準入，以及同步 closing cutoff |
| [`src/types.ts`](src/types.ts) | 公開的請求、結果與提供方約定 |
| [`src/descriptor.ts`](src/descriptor.ts) | 版本化的 `subagent/descriptor` 會話事件詞匯 |
| [`src/child-agent.ts`](src/child-agent.ts) | 子級組裝、委派策略、深度輔助函數 |
| [`src/list-children.ts`](src/list-children.ts) | 基于在線會話存儲與可選持久化的發現 |
| [`src/control.ts`](src/control.ts) | 瀏覽器控制面組裝：目錄活性采樣、瀏覽器時區校驗、失敗分碼 |
| [`src/control-types.ts`](src/control-types.ts) | client-safe 的目錄行、控制面請求、回執與失敗 |

### 一次性流程

請求先對照提供方聲明的能力進行校驗，隨后對持久化描述符做快照，再由提供方構建子 agent。兩個進程內提供方都聲明 `agentOptions`：創建子級時把請求字段疊加到父級最新已記錄請求的提供方、模型與推理強度之上；父級還沒有請求時回退到創建選項，并保留配置的 token 上限。更改路由而不顯式指定推理強度時，會清除繼承的路由自有推理強度，使所選模型解析自己的默認值。DSH SDK 也聲明該能力并公開不可變的 `agentRouteDefaults`，使其實例持有的提供方／模型默認值在確切路由預檢前成為基線；`start()` 仍負責直接調用方與輸出上限。ACP、Codex 與 Claude Code 會拒絕 agent 路由覆蓋，而不是靜默忽略。成功時運行被發布、所有權轉移給調用方；失敗時提供方回滾每個尚未發布的資源。結果攜帶子 agent 的最終輸出、可選的結構化值、停止原因與可選的安全診斷。

### 可繼續流程

管理器預留 child 身份、解析持久化描述符、創建（或冷恢復）child、把它安裝進 Activation 并提交提示詞。模型編寫的消息通過固定 Steer 調度跨一條 parent/child 邊；瀏覽器人類 prompt 通過內部適配器選擇 Queue 或 best-effort Steer，其他 host 協議仍可保留 Queue 以創建獨立輪次。Session queue command 僅根據 child 自身的 continuable descriptor 準入在線 subagent-owned Agent。Settlement 會等待 Agent 活動結束、Inbox 為空且沒有所擁有子級，再在準入開放時 flush 最終 Session 狀態。管理器隨后在 child lock 內重新驗證 wake generation、Session 序號、Inbox 與所擁有子級；`Agent.runMaintenance()` 的同步 task 入口會占用 idle 階段，并在同一個 JavaScript turn 內關閉私有 subagent Inbox，然后才釋放句柄。直接 child 不存在 Activation 時會從持久化會話冷恢復。當駐留 Activation 結算時，管理器會在 parent 自身的輪次流中告知該 child 的直接 parent。

本地子級創建成功時，父 Session 追加一條 `subagent/catalog` 事實。一次性創建在提供方返回后記錄；可繼續創建在初始 inbox 準入后、返回子級 id 前記錄。失敗會釋放子級，不發布補償性目錄事件。一次性目錄追加失敗時會處理 run 的結果拒絕，并保留目錄錯誤；資源釋放失敗會單獨記錄。`subagentCatalog` projection 排除 fork 繼承的事實，通過 Session 觀察和客戶端快照中的 `projections.values.subagentCatalog` 暴露直接子級列表。無效的自身 catalog payload（包括不支持的版本）會使 projection 恢復失敗。其不可變存儲和檢查點校驗使用 [`dsh-chunked-list`](../../util/chunked-list/README.zh.md)。其視圖對 D 條事實以 O(D) 時間保留父目錄事件順序。[父目錄決策](../../../.agents/notes/implemented/architecture/2026-09-01-parent-owned-subagent-catalog.zh.md) 說明排序、持久化成本和替代方案。

### 所有權與不變式

- **發布即邊界**——發布前提供方擁有設置并須在失敗時回滾；發布后調用方擁有運行并須 dispose（資源釋放）它。
- **注冊受 effect 作用域約束**——移除提供方會阻止新啟動，但絕不撤銷已接受的運行。
- **Agent 消息權限基于確切相鄰關系**——`sendMessage()` 要求確切在線 sender；每個 sender 都可以指定直接可繼續 child，只有具備駐留可繼續 Activation 的 sender 可以指定自己的直接 parent。
- **描述符僅進日志**——它是會話事件，不進入模型歷史，并跨壓縮（compaction）保留；可繼續描述符會顯式記錄解析后的子級提供方、模型與推理強度，用于冷恢復。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從共享 seam 逐步進入后端、面向模型的工具與設計決策。

- [Subagent 子系統](../../../docs/subsystems/subagent.zh.md)——服務約定、提供方約定與終態結果語義。
- [Subagent 能力 seam](../../../.agents/notes/implemented/feature/2026-06-21-subagent-capability-seam.zh.md)——委派能力家族的設計記錄。
- [可繼續的 subagent](../../../.agents/notes/implemented/feature/2026-07-28-continuable-subagent-conversations.zh.md)——接受后續輪次的持久子級。
- [進程內 spawn 后端](../subagent-spawn-in-process/README.zh.md)——最容易組合的提供方。
- [進程外 ACP 后端](../subagent-acp/README.zh.md)——經 Agent Client Protocol 擁有自有運行時的子級。
- [tool-subagent-control README](../tool-subagent-control/README.zh.md)——后續消息、中斷與列舉面。

-----

<a id="model-experience"></a>
## 模型體驗

### 結算通知

#### 模型看到什么

一條用戶角色的父級消息，開頭是結果本身——`Background subagent <child-id> finished and will do no further work unless you send it more.`，或子級被停止、耗盡額度、拒絕任務或失敗時的對應句子——隨后是 `Its closing message:` 與子級的最終 assistant 內容；若子級沒有產出內容，則是 `It left no closing message.`。這條由運行時生成的通知與模型編寫的父子消息相互獨立；后者使用 `sendMessage()` 與 `AgentMessageSource`。委派 schema 與模型控制工具歸消費方包所有。

#### Token 影響

父級請求中，每個已結算的 Activation 一條通知，長度取決于子級的最終消息。如果子級先發送自己的消息再結算，父級請求會同時承擔兩者。

#### KV Cache 影響

在父級中僅追加：通知位于其可復用請求前綴之后。到達空閑父級會啟動一次獨立的模型請求，到達繁忙父級則不會。

### 子級委派范圍聲明

#### 模型看到什么

每個進程內子 agent 的運行時上下文快照都攜帶下方的 `subagent:delegation` 聲明，位于沙箱策略與審批策略語句之后。

##### 委派范圍聲明

```markdown
You are a delegated subagent: your permission scope was fixed when you were started and cannot be widened from inside this session — operations that require approval are rejected automatically. When the job needs access beyond that scope, do not retry the denied operation; state the limitation in your reply so the delegating agent can handle it.
```

#### Token 影響

每個子 agent 的運行時上下文快照中一條固定聲明；父級請求中沒有任何新增。

#### KV Cache 影響

子級內部前綴穩定：該聲明在子 agent 生命周期內絕不變化，因此只寫入第一份運行時上下文快照一次。父級側不會直接使緩存失效；具名工具消費方共同負責請求前綴的任何變化。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明該 seam 何時不合適，或何時需要特別的運維注意。它們是當前包約束，不是通用委派對比或任務積壓。

- **ACP 子級仍為一次性，且無法通過追蹤枚舉**——ACP 運行在父級會話語料中沒有本地子會話，遠程提供方需要 Activation 所有權約定才能支持可繼續子級。
- **僅允許相鄰模型消息**——`sendMessage()` 要求確切在線 sender；每個 sender 都可以指定直接可繼續 child，只有具備駐留可繼續 Activation 的 sender 可以指定自己的直接 parent。瀏覽器提示使用獨立的人類 Queue 或 Steer 控制路徑。
- **child 到 parent 的投遞要求直接 parent 保持在線**——服務沒有持久 parent mailbox；parent 缺失時會拒絕消息，而非接受無法喚醒的工作。
- **取消收斂期間存在喚醒缺口**——中斷信號發出后、driver 進入 idle 前被接受的后續消息會保持排隊，直到另一條喚醒發送到達。
- **待處理的注入上下文會保留 Activation**——settlement 會保守地把每個 Inbox occurrence 都視為未完成。Agent 進入 idle 后停放的上下文會讓 child 及其在線祖先繼續駐留，直到喚醒投遞將其 claim、queue 變更將其移除，或 manager teardown 將其丟棄。
- **駐留僅限進程內**——Activation inbox 與所有權圖不會在兩個 harness 進程之間協調；對單個持久化存儲的并發訪問需要持久化郵箱與跨進程租約協議。
- **不回放已接受但未記錄的消息**——崩潰可能丟失從未寫入子會話日志、已被接受的提示詞；丟失的消息不會自動回放。
- **沒有持久化 parent mailbox**——child 到 parent 的消息要求駐留的可繼續 child 與在線直接 parent，提供的是接受標識，不保證恰好一次投遞。
- **生命周期事件只供觀察**——影響運行的 `subagent/end` 延續或決策接口仍需等待具體消費方。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文：開放問題與尚未決定的探索方向。它明確不具權威性——已交付的行為與限制以上文和包代碼為準。

- **跨進程繼續執行**——持久化郵箱與租約協議可讓兩個 harness 進程共享一個持久化存儲。
- **可繼續 ACP 子級**——需要持久化遠程會話 id 與逐子級的繼續執行能力聲明。
- **host-user 投遞**——未來的 host 適配器需要具體的經認證交互，該 seam 才能獲得用戶投遞能力。

</details>
