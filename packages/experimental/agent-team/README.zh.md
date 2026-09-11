---
description: "在一個會話中運行一個小型具名 agent（智能體）團隊：成員之間的持久消息與共享任務板，用于組合實驗性 Team 插件的部署。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-agent-team

[English](README.md) | 中文

## 概述

`dsh-experimental-agent-team` 把一個編碼會話變成一個小型工作團隊：會話中的 agent 成為 Lead，創建具名 teammate 處理委派的工作，與它們交換持久消息，并在公共任務板上跟蹤共享任務。消息與任務狀態能挺過崩潰、reload 與中斷，因此離線的 teammate 會在恢復后收到排隊的消息。它本身不提供任何工具——請掛載兄弟包 `dsh-experimental-tool-agent-team`，讓模型能夠創建 teammate、給它們發消息并使用任務板。它以實驗性名稱公開發布、不承諾穩定性，并且需要持久會話存儲才能激活。

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

當一個 agent 應該在自己的工作目錄中運行一支小型具名助手團隊、且消息與任務狀態需要挺過崩潰與重啟時，把本包加入組合。它本身不帶工具：請與 `@deepseek-ai/dsh-experimental-tool-agent-team` 一起掛載，讓模型能夠創建 teammate、給它們發消息并使用任務板。

### 何時選擇

當多個 agent 必須在同一個共享工作區協作、且 roster、消息與任務狀態需要挺過崩潰與重啟時，選擇它。當 teammate 需要獨立工作目錄、多個進程需要協調同一支團隊、或任務 owner 需要自動釋放時，請不要選擇——這些都不受支持。團隊功能需要持久會話存儲才能激活。

### 最小工作配置

<a id="smallest-working-setup"></a>

對現有組合的最小增量是持久會話存儲加兩個 Team 包：

```yaml
# smallest team setup — durable storage plus both Team packages
- name: '@deepseek-ai/dsh-session-persistence-jsonl'
- name: '@deepseek-ai/dsh-experimental-agent-team'
- name: '@deepseek-ai/dsh-experimental-tool-agent-team'
```

工具安裝后，模型會按請求完成其余工作——例如先「創建一個名為 reviewer 的 teammate 檢查 diff」，再「把變更摘要發給 reviewer」。所有限制都是可選的，并在啟動時校驗：

| 字段 | 默認值 | 含義 |
|---|---|---|
| `maxMembers` | `8` | 一支團隊最多可創建的 teammate 數，包括失敗的 |
| `maxTasks` | `256` | 任務板上最多的活動任務數 |
| `maxPendingMessagesPerMember` | `64` | 單個成員最多可排隊的消息數 |
| `maxMessageBytes` | `65,536` | 單條發送消息的最大尺寸 |
| `disposalTimeoutMs` | `5,000` | 關閉清理允許的時間 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-experimental-agent-team)是每個受支持字段及其 JSDoc 的窮盡式真源。

### Teammate

請 Lead 創建 teammate：給它一個唯一的小寫名字（例如 `reviewer`）并描述其職責。teammate 可以 fresh 啟動（不攜帶 Lead 對話的任何記憶），也可以作為 fork 啟動（繼承 Lead 已完成的輪次）；創建請求決定用哪種。teammate 名字是永久的——即使創建失敗的 teammate 也保留其名字，任何名字都不會被復用。

roster 顯示每個成員的職責（`lead` 或 `teammate`）與當前狀態：`running`、`idle`、`inactive`（存在但未加載的成員）、`provisioning` 或 `failed`。未加載的成員會在喚醒后收到其消息。

只有 Lead 可以創建 teammate 或中斷它們。

### teammate 之間的消息

任何成員都可以向任何其他成員或 Lead 發送消息。live 成員會立即收到；離線成員的消息會排隊，并在其恢復后到達。消息不會丟失，也不會重復投遞。

每條消息都使用 Steer：running target 在最近的步驟邊界收到消息，idle target 啟動一個輪次，inactive teammate 則冷恢復。發送方始終能看到結果——target inbox 已接受，或在投遞暫時不可用時保留為 queued。排隊的消息已經安全存儲，因此絕不能重發。

### 共享任務板

任何成員都可以添加任務，包含標題、詳情、對其他任務的可選依賴，以及可選的文件觸及提示。只有其全部依賴完成后，任務才可 claim。

任務有 owner：成員 claim 任務開始工作，完成后標記完成、釋放回板或重新打開；Lead 可以把任務分配給任意成員。每次變更都是 compare-and-set：基于過期副本的更新會被拒絕，因此兩個成員不會悄悄覆蓋彼此的成果。

當兩個 in-progress 任務計劃觸及重疊路徑時，文件提示會產生警告——它們絕不阻止任何操作。已刪除任務保留在歷史中，但從活動列表中消失。

### 等待與中斷

成員可以等待下一次團隊變化——teammate 的狀態、新消息或任務更新——而不必反復輪詢；等待只報告是否超時，調用方隨后重新讀取當前狀態。

Lead 可以停止 teammate 的當前輪次，而不會刪除其排隊的消息；任務歸屬不變。

### 成功與失敗的表現

成功的表現是：teammate 出現在 roster 中、消息報告 `accepted` 或 `queued`、任務 revision 隨每次變更遞增。可能的失敗會以具體錯誤報告，而不會悄悄破壞狀態：發給不存在的成員名字、claim 尚未就緒的任務、用過期 revision 編輯、或超出成員上限創建 teammate。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋服務背后的設計決策并指出實現它們的代碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

本服務建立在一個分離與三項承諾之上：

- **持久日志，派生狀態。** Lead 會話日志是唯一真源；roster、mailbox 與任務狀態每次讀取都從中回放。
- **進程內歸屬。** 所有協作都位于單一進程；保證是重試加去重，絕不是跨進程共識。
- **顯式權限。** 每個服務方法都接收確切的實時調用方 `Agent`；只有 Lead 可以 spawn、reassign 或 interrupt。
- **超出上限時明確失敗。** 每個限制都是經過校驗的部署值，耗盡時報告類型化錯誤，而不是復用 id 或名字。

[Agent Teams Agent Note](../../../.agents/notes/implemented/feature/2026-08-05-agent-teams.zh.md)負責身份、mailbox、任務與共享 checkout 決策。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`Config` schema、服務注冊、恢復調度 |
| [`src/roster.ts`](src/roster.ts) | Team 身份、成員關系解析、provisioning 與 roster 拆除 |
| [`src/mailbox.ts`](src/mailbox.ts) | 持久隊列、目標本地投遞、確認與恢復 |
| [`src/task-board.ts`](src/task-board.ts) | 任務 CAS 命令、DAG 校驗與派生視圖 |
| [`src/journal.ts`](src/journal.ts) | 串行化的 Lead 日志事務與提交通知 |
| [`src/projection.ts`](src/projection.ts) | 解碼并校驗 Team 事件的嚴格回放投影 |
| [`src/activity.ts`](src/activity.ts) | 一次性變更等待者與 dispose（資源釋放）時的等待解除 |
| [`src/lifecycle.ts`](src/lifecycle.ts) | 共享準入截止與有界結算 |
| [`src/invariant.ts`](src/invariant.ts) | 在 append 前回放候選事件的不變式伴生插件 |

### Team 身份與 roster

每個普通運行時 root 都是一個隱式 Team 的 Lead，其 `TeamId` 等于 `SessionId`；不存在創建事件，持久狀態從第一條成員、消息或任務記錄開始。`spawnTeammate()` 先追加并 flush 一條 `provisioning` 成員記錄，再要求配置的提供方創建預留 child；提供方失敗會追加一條持久的 `failed` 成員。fresh child 不攜帶 Lead 歷史；fork child 只捕獲一次 Lead 的已完成 turn 前綴。恢復把未終結的 provisioning 記錄對照 child 獨立持久化的會話進行對賬：直接 parent 與 continuable descriptor 匹配、且初始用戶消息已記錄則產生 `active`，其他任何情況都產生 `failed`。如果恢復在同進程競爭中先完成，creator 會接受終態，或報告 `TEAM_PROVISIONING_CONFLICT` 并 drain 該 child。名字由第一條 provisioning 記錄保留，且永不復用。

### 持久 mailbox

`sendMessage()` 校驗 peer 成員關系，追加 `team/message/queued` 并在嘗試投遞前 flush。目標消息以 `Team message <id> from <name>:` 開頭，并在 `TeamMessageSource` 中保留同一 id 與發送者。只有目標會話在 pending inbox 或已記錄歷史中持久持有消息身份后，才會以 `team/message/delivered` 確認投遞。即時準入按目標與持久隊列順序串行化；恢復按同一順序重新投遞 queued-minus-delivered 記錄。重試前會同時折疊 live 與持久目標 inbox／歷史狀態，因此 inbox 已接受但模型尚未 claim 時發生崩潰不會復制消息。該保證是進程內重試加 target 會話去重，而不是跨進程 exactly-once 投遞。

投遞給 Lead 時直接調用 `Agent.steer()`。投遞給 teammate 時使用 continuation owner 的 host-only Steer 路徑；該路徑會保留 Team 發送者 source，同時授權 Lead-to-child edge 并冷恢復 inactive target。sibling 消息絕不會通過公開的相鄰 Agent 消息操作偽裝成 Lead。

### 共享任務板

任務是完整版本化快照；每次變更都攜帶 `expectedRevision`，陳舊調用方會收到 `TEAM_TASK_STALE_REVISION`，而不會覆蓋更新的值。數字 `task-<n>` id 的后綴必須是安全整數，id 空間耗盡時報告 `TEAM_TASK_LIMIT`，而不是復用最后一個 id。已刪除任務作為 tombstone 保留以供回放與維持 id 穩定，但不占用 `maxTasks`，也不出現在 `listTasks()` 中。`writeScopes` 是規范化后的 workspace 相對前綴；視圖會對與 in-progress 任務的重疊發出警告，但絕不阻止 claim 或授予寫權限。

### 等待與中斷

`waitForChange()` 等待注冊之后發生的下一條 roster、task、mailbox 或實時狀態邊，時長從 10 秒到 1 小時，并且只報告是否超時；運行時 dispose 會釋放當前等待。取消會保留 Error reason；非 Error reason 則通過 `TEAM_WAIT_ABORTED` 報告。`interrupt()` 僅限 Lead，委托 continuable-subagent 的 interrupt 路徑，以 `keepInbox` 只取消 live teammate 的當前 turn；它既不釋放任務 owner，也不刪除持久 mail。

### 持久性模型

Team 事件追加到精確的 live Lead 會話，并在操作報告成功或喚醒等待者之前 flush。`team/member`、`team/task`、`team/message/queued` 與 `team/message/delivered` 僅存在于日志：它們從不進入會話表面，因此派生模型歷史不受協作記錄影響。順序與時間由會話事件的 `seq` 與 `time` 負責，快照不重復保存。`./invariant` 伴生插件把每條候選 Team 事件對照已提交前綴回放，并在 append 前拒絕非法轉換。

### Dispose

dispose 會關閉準入、中止并等待已獲準的創建與 mailbox dispatch 事務，再讓 continuation owner 釋放 roster 中確切的 live direct child 及其后代；Lead 的非 Team continuable child 不受影響。cleanup 失敗會讓 dispose 明確失敗，并以 `disposalTimeoutMs` 為上限。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從共享子系統類型逐步進入工具表面與設計背后的決策。

- [Agent Teams 子系統](../../../docs/subsystems/agent-team.zh.md)——持久 Team 類型與 `ctx.agentTeams` 服務 API。
- [tool-agent-team 包](../tool-agent-team/README.zh.md)——讓模型創建 teammate、向其發送消息并進行協調的工具。
- [Agent Teams Agent Note](../../../.agents/notes/implemented/feature/2026-08-05-agent-teams.zh.md)——身份、mailbox、任務與共享 checkout 決策。
- [實驗包決策](../../../.agents/notes/implemented/architecture/2026-08-18-experimental-agent-teams-packages.zh.md)——位置、公開發布與依賴隔離。

-----

<a id="model-experience"></a>

### 瀏覽器 Remote

`TeamService` 除了 roster、mailbox、task 與 lifecycle operation，還擁有生成的 `agentTeams/view`、`agentTeams/createTask` 與 `agentTeams/updateTask` Remote method。`./remote` 導出由 Web UI 掛載的 Client contribution，`./client` 則重新導出可在瀏覽器 compilation face 中安全使用的 request、view 與 task mutation result type。Typert 在外層 `RemoteResult` 中保留 transport failure；create 與 update rejection 則作為 transport 成功響應中的顯式 domain result，其中過期的 update revision 會區分為 task conflict。

## 模型體驗

### Peer 消息

#### 模型看到什么

每條已投遞 peer 消息都是用戶角色消息。第一個短文本塊包含穩定消息 id 與發送者，之后原樣附加發送者的內容塊。roster、task 與 mailbox 記錄僅存在于日志，絕不進入派生模型歷史。

#### Token 影響

每次 peer 投遞都會把發送者前綴與消息內容加入 target 歷史。任務與 roster 變更不增加模型 token；其面向模型的呈現屬于 `@deepseek-ai/dsh-experimental-tool-agent-team` 結果。

#### KV Cache 影響

Peer 消息追加在 target 可復用歷史前綴之后。冷恢復會先復用持久對話，再追加尚未投遞的消息。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明一支團隊目前不能做什么、或哪些方面需要特別的運維關注。它們是當前包約束，不是與其他協作機制的對比。

- **實驗原型，無穩定性承諾**——本包公開發布，但孵化期間約定仍可自由變更。
- **單進程、共享 checkout**——成員共享 cwd，修改立即可見；本包不提供 worktree、遠端成員、merge 或文件鎖。
- **write scope 僅作提示**——Bash、formatter、代碼生成器與直接外部寫入可以繞過文件版本檢查；Lead 必須協調 owner 并檢查最終 diff。
- **扁平且不可變的 roster**——只有 Lead 可以創建直接 teammate；不支持嵌套 Team、重命名、刪除或名字復用。
- **不會自動釋放 owner**——idle、interrupt、進程退出與工作失敗都不會釋放任務 owner。
- **mailbox 不保證跨進程 exactly-once**——不支持多個 harness 進程并發操作同一 Team。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文，明確不具權威性。

#### Promotion

promotion 到產品角色組需要按[實驗子樹規則](../AGENTS.md)審查公共約定、限制、測試證據、發布載荷、運行時依賴與具名穩定 owner。

#### 未來方向

尚未決定的探索方向包括嵌套 Team、自動釋放 owner 的策略、跨進程 mailbox 事務，以及通過 worktree 實現文件系統隔離；這些都沒有承諾。

</details>
