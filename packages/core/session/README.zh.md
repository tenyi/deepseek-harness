---
description: "面向用戶與維護者的事件溯源會話日志與內存存儲說明，用于構建、檢查或擴展每個 agent（智能體）交互背后的持久記錄。"
kind: "package-reference"
---

# @deepseek-ai/dsh-session

[English](README.md) | 中文

## 概述

`dsh-session` 在僅追加的會話日志中記錄每個模型可見事實，并從該記錄派生模型歷史。消費方可以檢查、回放、fork 和刷新會話，同時保留歷史事件；壓縮（compaction）會在活躍對話中隱藏被取代的條目，但不會刪除它們。除非添加持久化后端，否則會話僅保留在內存中；持久性檢查點會等待配置的后端。agent 需要可重建的會話記錄時請選擇本包；它本身不調用模型。

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

在必須存在會話的任何地方掛載 `dsh-session`。它在內存中創建并持有事件溯源的 `Session` 實例；持久存儲由訂閱 `session/event` 流的持久化插件疊加。

### 創建與檢查會話

`ctx.sessions.create()` 構建綁定到調用方 fiber 的實時會話；`get(id)` 與 `list()` 查找會話，`fork()` 從實時會話的穩定前綴創建子會話。

```text
const session = ctx.sessions.create(sessionId, { meta: { cwd: '/workspace' } })
ctx.sessions.get(sessionId)      // the live session
ctx.sessions.list()              // every live session, in creation order
```

### 追加與派生

`session.append(type, data, opts?)` 提交一個類型化事件——它先快照并凍結載荷、校驗其為無損 JSON，再通知觀察者。`session.deriveMessages()` 把日志投影為模型看到的 `Message[]`，采用增量且有緩存的方式：

```text
session.append('user/message', { role: 'user', content: [{ type: 'text', text: 'hello' }], source: { kind: 'user' } },
  { surfaceOp: 'append' })
session.deriveMessages()         // the derived model history
```

表層事件（`system/message`、`user/message`、`assistant/message`、`tool/result`）在類型化事件與追加輸入中都必須帶有 `surfaceOp`。替換操作僅接受 `{ op: 'replace', startSeq, endSeq }`，端點為包含邊界的 `SessionSeq`，按當前 surface 順序解釋。assistant 消息會嵌入精確、緊湊的提供方流，并禁止 `sourceEventSeqs`。已知僅日志事件禁止這兩個元數據字段，且從不產生消息。

追加、seed/restore 與事件 adoption/snapshot 會拒絕任何 `header.system` 及恰好為空的可選請求頭字段（`tools: []`、`adapterDefaults: {}`），而不規范化輸入。工具結果的 `data.error` 僅在 `message.content[0].isError === true` 時允許存在；失敗標識仍是可選的。被拒絕的追加不會改變日志、派生狀態或事件流。Adoption 校驗事件局部元數據，但不校驗所引用的歷史或替換端點是否屬于 surface。

`system/message` 承載渲染后的系統提示詞：第一條是 surface 第 0 號節點，準入依據已準備調用的能力，不具備能力的路由將非空渲染文本歸并到首個系統節點，延續中的 `in-history` 序列則在緩存歷史之后追加；空系統節點不投影為消息，因此清除提示詞必須為所有生效的系統節點記錄空內容替換，而非僅替換最新節點；當第 0 號節點是 `system/message` 時，surface 折疊拒絕覆蓋它的替換，除非替換事件本身是恰好覆蓋該節點的 `system/message`，而后續系統節點不受保護，壓縮范圍可以遮蔽它們（[決策](../../../.agents/notes/implemented/architecture/2026-09-02-system-prompt-as-surface-node.zh.md)）。

### 讀取日志

`session.seq` 無需物化數組即可讀取當前日志長度，`session.eventAt(seq)` 按序列號讀取單個已接受且深度凍結的事件。`session.snapshotEvents(fromSeq?, toSeqExclusive?)` 會物化半開區間的凍結穩定快照；當前完整快照會緩存到下一次追加。`eventAt()`、`snapshotEvents()` 和 `ownEvents()` 已棄用：現有邏輯可以暫不遷移，但禁止新增生產調用。倉庫測試文件可以在限定范圍的 lint 豁免下使用這三個讀取方法（[策略](../../../.agents/notes/implemented/architecture/2026-09-09-deprecate-synchronous-session-event-reads.zh.md)）。只需要長度的調用方使用 `seq`。

會話日志位置使用兩種數字類型。`SessionSeq` 標識已有事件或包含端點的事件水位；`SessionLogOffset` 標識間隙、前綴長度或讀取邊界，并且可以等于事件數量。`SessionSeqCursor` 添加 `-1` 這個“尚無事件”值，`OptionalSessionSeq` 則在缺失本身屬于數據時使用 `null`。構造函數會校驗非負安全整數，brand 在運行時會被擦除，因此持久 JSON 與 wire 值仍是普通數字。

### 派生會話的 fork

`ctx.sessions.fork(source, boundary?, childSessionId?)` 選取截至 `boundary` 事件序號（含該事件）的源事件（默認：當前最后一個事件），要求所選前綴結束時沒有開放輪次，再創建帶譜系元數據的實時子會話。必須在輪次中途分支的工具時委派會裁剪到已完成前綴。

邏輯 `SessionHeader.isSeeded` 字段報告是否存在 fork 歷史，而不公開位置整數。`Session.inheritedEventCount` 保留經過校驗的精確 `SessionLogOffset`；`ownEvents()` 返回從該切點開始的事件，`isOwnSeq(seq)` 只接受已存在且由子會話擁有的位置。底層帶 seed 構造必須顯式提供 `seed` 與 `inheritedEventCount`，因為構造 seed 可以在繼承前綴之后包含子會話自有的設置事件。

### 刷新持久狀態

`ctx.sessions.flush(session)` 分發需等待完成的持久性檢查點：每個持久化監聽器都會刷新，調用在所有監聽器結算后完成。需要立即持久性屏障的生產方應等待它，而不是假定延后寫入已經排空。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋該包如何實現上述行為；可觀察約定已在[使用本包](#use-this-package)中完整說明。

### 設計理念

該包建立在事件溯源之上：`Session` 是類型化 `SessionEvent` 的僅追加日志，其他一切——模型歷史、transcript（文本記錄）、遙測、標題、持久化——都從這條流派生。surface 是派生投影：一個增量管理器校驗追加候選、根據已提交事件推進有序視圖，并跟蹤每次已提交重寫都會遞增的 `replaceGeneration`。模型可見即已記錄：任何到達模型請求的內容都必須能從日志重建。每個完成結算的模型嘗試都會提交一個事件：`assistant/message` 攜帶組裝后的模型可見 message 及其緊湊帶時間 stream，`assistant/attempt` 則保留失敗、重試、取消或 stream error attempt，且不添加模型歷史。如果進程在 settlement 前硬中斷，則不會留下持久 attempt stream。

### 請求頭

`request/header` 存儲非歷史請求封裝的完整規范快照，原因為 `initial`、`resume`、`change` 或 `series`。顯式消息序列起點或表層替換會在請求封裝不變時寫入 `series` 快照；同時發生變化時使用 `startsSeries: true`。同一序列內的步驟、重試與普通后續輪次繼承最新快照。`adapterDefaults` 區分由適配器解析的值與顯式設置，`foldRequestHeader()` 選擇最新快照。這種自包含記錄以每個消息序列增加存儲為代價，支持局部窗口渲染與精確重建；細節由[可重建請求 Agent Note](../../../.agents/notes/implemented/architecture/2026-07-05-reconstructable-requests.zh.md)負責。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`SessionStore` 服務、存儲生命周期、`fork`、`flush` |
| [`src/types.ts`](src/types.ts) | `SessionEventMap`、`SessionEvent`、`UserMessage`、`SessionHeader`、`TurnEndReasonMap` |
| [`src/surface.ts`](src/surface.ts) | 有序 surface 投影、替換校驗、`deriveEventMessage` |
| [`src/request-header.ts`](src/request-header.ts) | `request/header` 折疊與重建 |
| [`dsh-util-values`](../../util/values/README.zh.md) | 共享無損 JSON 校驗與分離式快照 |
| [`src/repair.ts`](src/repair.ts) | 崩潰遺留日志的冷修復 |
| [`src/invariant.ts`](src/invariant.ts) | 不變式配套：序號、輪次／步驟閉合、工具調用／結果配對 |

### 追加校驗

每次追加都會使用共享的迭代式 `snapshotJsonValue()` 流程，對每個嵌套值只讀取、校驗并復制一次，因此有狀態的 getter 無法給校驗提供一個值、給存儲提供另一個值。非無損 JSON 載荷（BigInt、循環、稀疏數組、`-0`、特殊原型）會在追加位置被拒絕，先于任何后端刷新。追加路徑會構造每個 `SessionSeq`；surface 事件還會校驗標記形態、被引用的源事件序號，以及替換的完整遮蔽節點覆蓋。

### 派生歷史

`deriveMessages()` 把每個 surface 節點的投影緩存一次，每次調用都返回共享、深度凍結消息之上的新數組；四種 surface 事件類型（`system/message`、`user/message`、`assistant/message`、`tool/result`）各自投影自己的消息種類——system 角色的提示詞（空內容的系統節點投影為無消息）、user 內容原樣、帶提供方與模型的組裝 assistant 消息，或 user 角色的工具結果。嵌入式 Assistant stream 與 `assistant/attempt` 事件只保留回放和診斷數據。surface 重寫會重建投影——不存在原始日志回退，因此 surface 是派生歷史的唯一來源。

### 請求頭

循環在每個循環實例邊界及變更時記錄完整規范 `request/header` 快照（調用配置、適配器默認值、組裝后的工具 schema——渲染后的系統提示詞是 `system/message` surface 節點，不是 header 狀態）；`foldRequestHeader(events)` 通過選擇最新快照來重建它，使每個對話請求都成為日志的純函數。路由元數據（`request/context`）是獨立的已記錄狀態，僅在提供方、模型、容量或 `systemPromptUpdate` 模式變化時追加；它在提示詞與用戶消息準入之后記錄實際已準備調用的模式，而非提供準入決策。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

包級約定對大多數消費方已經足夠；需要周邊領域時再閱讀以下頁面。

- [會話子系統](../../../docs/subsystems/session.zh.md)——完整事件詞匯、surface 類型與生成的服務 API。
- [持久化子系統](../../../docs/subsystems/persistence.zh.md)——后端如何讓該日志持久化。
- [Core 子系統](../../../docs/subsystems/core.zh.md)——寫入并派生會話的循環。
- [生成持久化目錄](../../../docs/persistence-catalog.zh.md)——每個會話事件及其載荷與聲明位置。
- [core 分組地圖](../README.zh.md)——core 各包如何組合。

-----

<a id="model-experience"></a>
## 模型體驗

### 派生消息歷史

#### 模型看到什么

模型會原樣接收 `system/message`、`user/message`、`assistant/message` 與 `tool/result` surface 條目中的完整消息，系統提示詞在先——標識、角色、來源與內容塊都與創建時確定的值相同，投影從不生成標識。直接提示詞與注入上下文仍是彼此獨立的 `user/message` 事件，各事件的來源會保留其出處。嵌入式 stream、`assistant/attempt`、邊界與其他僅日志事實不會添加消息。

#### Token 影響

追加的 surface 條目會在后續步驟中重新發送。`replace` surface 操作會從未來輸入中移除被遮蔽條目，但不刪除其原始日志記錄。

#### KV Cache 影響

追加的 surface 條目會保留可復用前綴。即使底層事件日志保持僅追加，`replace` 操作也會從首條被遮蔽消息起使緩存復用失效。

### 崩潰修復結果

#### 模型看到什么

如果恢復發現 assistant 工具請求沒有持久 `tool/call`，其合成 `TOOL_NOT_STARTED` 結果內容為 `The tool call was interrupted before the Harness recorded it as started. Retry it if it is still needed.`。如果持久 `tool/call` 沒有結果，其 `TOOL_OUTCOME_UNKNOWN` 結果內容為 `The tool call was interrupted after it was recorded, but no result was durably recorded. Its outcome is unknown. Decide whether to retry from the tool semantics: retry only if the operation is read-only or idempotent; if it may have side effects, first verify external state or ask the user. Do not retry blindly.`。

#### Token 影響

未受損會話的 token 增量為零。恢復時，每個修復后的調用都會添加保留的、針對具體風險的錯誤文本。

#### KV Cache 影響

保持僅追加；新可見內容位于可復用請求前綴之后，不會使現有 KV Cache 條目失效。

### 已記錄的請求頭

#### 模型看到什么

會話會重建循環實際發送的工具 schema 與調用配置；系統提示詞作為 surface 第 0 號節點、并在歷史內更新之后作為最新的系統節點，屬于 `deriveMessages()` 的一部分。請求頭事件不向歷史加入任何消息，也不持有提示詞的副本。

#### Token 影響

日志記錄不產生重復 token。各系統節點與 schema 仍會產生正常的逐請求開銷。

#### KV Cache 影響

記錄日志不會導致失效，精確重建會保持請求前綴一致。后續請求頭若更改配置或 schema，可能從第一處差異開始使復用失效；替換 surface 第 0 號節點的提示詞變更會從第一個 token 起使復用失效，而歷史內追加則保持直到已緩存歷史末尾的前綴可復用。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明會話存儲何時需要特別留意。它們是當前包約束，不是任務積壓。

- **`fork()` 僅在實時會話的穩定邊界處切分**：所選前綴結束時不得有開放輪次，且源會話必須位于存儲中；fork API 不支持對已持久化但未加載的會話進行 fork。
- **`SESSION_FORMAT_VERSION` 命名[當前邏輯表示](../../../docs/session-format-status.zh.md)**——當前讀取器拒絕已退役的 `header.system`，并校驗 `system/message` 載荷與受保護頭節點的重寫。歷史 header 與事件歸相鄰格式包所有；相鄰遷移鏈在構造 `Session` 前轉換受支持的歷史，寫打開只發布當前格式的后繼代際。同版本未知事件要求信封顯式帶有 `ignorable` 標記，但這不保證結構遷移的安全性（[機制](../../../.agents/notes/implemented/architecture/2026-08-31-released-session-format-migrations.zh.md)）。
- **`TurnEndReasonMap` 不含 ACP（Agent Client Protocol）命名的 `refusal`／`max_turn_requests` 變體**：受生產方約束；只有當適配器或循環首次產生這些變體時才加入。
- **fork 之外沒有會話樹**：基于分支會話的 pi 風格條目樹被推遲，除非消費方需要超越基于邊界的 forking 的能力。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
