# Conversation 組裝

[English](conversation.md) | 中文

Conversation 是 Client `SessionEventLikeEntry` window 與瀏覽器 view 之間的 target-neutral assembly 層。[`ui-conversation`](../../packages/client/ui-conversation/README.zh.md)擁有 event 與 view registry、每個 `SessionBinding` 對應的 identity-stable binding、Turn/Step Location、增量 Context assembly、target source、共享 shell 與輸入編排。[`ui-chat`](../../packages/client/ui-chat/README.zh.md)和 [`ui-trajectory`](../../packages/client/ui-trajectory/README.zh.md)等 target 包擁有各自的 Definition、最終 snapshot 與渲染。

本文定義數據模型與業務自有 Conversation node 的擴展路徑。[Web Client 架構](web-client.zh.md)說明該子系統在 Client model 與 Slots 之間的位置；[Conversation Node 組裝決策](../../.agents/notes/implemented/architecture/2026-08-09-client-conversation-node-assembly.zh.md)記錄其設計理由。

## 數據模型與所有權

Session Controller 擁有連續的已加載邏輯 event window。每個 `SessionEventLikeEntry` 要么是表示一個持久事件的 `{ type: 'event', event: SessionEvent }`，要么是表示一個 Client-only `assistant/live-chunk` 呈現的 `{ type: 'transient', event: AssistantLiveChunkEvent }`；兩種內部 event 都公開 `type`、`seq`、`time` 與 `data`。`ui-conversation` 把這些 entry 直接交給 assembler，不另開 history stream。每個 Session 對應一個 `ConversationNodeAssembler`，它應用所有已注冊 Definition，并為每個已注冊 view target 發布獨立 source。

| 概念 | Owner 與用途 |
|---|---|
| Event Definition | 業務包一次匹配一個持久 event 或 Client-only 瞬態 event，以穩定 `(kind, id)` 關聯輸入、折疊確定性 State，并可選擇 materialize 一個 target node。 |
| Context | Engine 為一個 `(kind, id)` 擁有的有序 Match 與當前 State。一個瞬態 event 只占一個 update Match；只有 update 的證據可以保持 pending，直到分頁補齊其唯一持久 start。 |
| Location | Engine 根據持久 boundary event 推導的 Session、Turn 或 Step 坐標。Definition 可以向一個 Turn 或 Step 發布類型化數據。 |
| View Definition | Target 包為每個 Session 創建一個增量 builder，并擁有該 target 的最終 snapshot 類型。 |
| View | Chat 或 Trajectory 等 Slot entry 只讀取自身 target snapshot，并渲染 target 自有 node。 |

Chat 與 Trajectory 可以識別同一個持久 event family，但各自保留自己的 Definition State 與最終 node payload。共享的 target-neutral 機制只包括 identity routing、有序 replay、Location data、predecessor dependency 與 publication cadence。

## Target 激活

每個 Session 都保留單調增長的 active target 集合。創建或讀取 target source 不會激活它。shell 會顯式激活持久化選擇或新選擇的 View，其他消費者則通過 target source 的首個訂閱激活 target。首次激活會創建該 target 的 builder，并從當前按 target 索引的 Context 調用一次 `replace()`。后續 flush 對每個 active target 調用 `apply()`，取消訂閱不會移除 target。

shell 擁有 View 選擇，并在 binding 創建、被選為 current 或 View roster 變化時，于渲染前解析已注冊的偏好 View 或 Chat fallback。assembler 只接收解析后的 target id，不自行選擇 Chat 或其他默認 target。第三方 View 使用相同的選擇與激活操作。

## 可回放 event family

編寫 Definition 前先選定穩定的業務 id。構成同一個 Node 的每條事件都必須攜帶該 id，或只憑自身 payload 獨立推導出該 id；Client 絕不能把 update 猜測為屬于“最近一個未完成”的 Context。

以一個 review job 為例，事件約定可以是：

| 事件 | 角色 | 必須持久化的事實 |
|---|---|---|
| `review/start` | 唯一 start | `reviewId`、Turn/Step 坐標、標題 |
| `review/progress` | update | 相同的 `reviewId`、坐標、可回放進度 |
| `review/end` | update | 相同的 `reviewId`、坐標、最終摘要 |

跨進程邊界使用生產方擁有的 branded id 類型。把 `SessionEventMap` 合并和 payload 類型放在生產方的純類型導出中，再由 Client 包通過僅類型副作用導入該導出。每個 `(kind, id)` 最多只能有一條 start 事件。單事件業務可以把事件自身的穩定身份（例如 `event.seq`）作為 Definition 內部 id。

系統支持增量事件。如果生產方能以較低成本發出 whole-value checkpoint，應優先采用，因為 start 位于已加載窗口之外時它仍可直接使用。每條 delta 都必須攜帶穩定 id，并且按照日志 `seq` 升序回放時能夠確定性地產生 State；它不能依賴只存在于實時內存中的狀態。如果當前歷史窗口只有 update，Assembler 會保留一個 pending Context，并在更早分頁補齊 start 前不構造 State。如果產品必須在 start 尚未加載時渲染，terminal 或 checkpoint 事件就必須攜帶足夠的完整 fallback 狀態，讓 Definition 能直接構造結果；不要通過掃描無關事件恢復它。

實時 Assistant delta 作為 Client-only `assistant/live-chunk` update 到達。重連 baseline 會把活躍的進程內緊湊 stream 展開為相同的瞬態 event，持久 `assistant/message` 與 `assistant/attempt` event 則嵌入完整緊湊 stream 供歷史回放。瞬態 event 只能充當 update；`start()` 只接收標準 `SessionEvent`。消費 Assistant 輸出的 Definition 在同一組 `match()` 與 `update()` 方法里處理 live chunk 與持久 settlement，其他 Definition 直接返回 `null`，無需展開 stream。

## Definition 與類型化 Chat payload

為了完整展示關聯關系，下面把生產方聲明和 Client 貢獻寫在同一個代碼塊里。實際的包族中，branded id 與 `SessionEventMap` 聲明留在事件生產方，Definition、Chat data 合并與 renderer 留在 Client 插件。

```ts ignore-check
import { createElement } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { Branded } from '@deepseek-ai/dsh-brand'
import type {
  ConversationLocation, ConversationNodeContext,
  ConversationNodeDefinition,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ChatNodeViewProps } from '@deepseek-ai/dsh-client-ui-chat/client'

type ReviewId = Branded<'ReviewId'>

interface ReviewStartData {
  readonly reviewId: ReviewId
  readonly turn: number
  readonly step: number
  readonly title: string
}

interface ReviewProgressData {
  readonly reviewId: ReviewId
  readonly turn: number
  readonly step: number
  readonly completed: number
}

interface ReviewEndData {
  readonly reviewId: ReviewId
  readonly turn: number
  readonly step: number
  readonly summary: string
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * Opens one durable review job.
     * @mode emit
     * @param data - stable identity, location, and initial display state.
     */
    'review/start': ReviewStartData
    /**
     * Records replayable progress for one review job.
     * @mode emit
     * @param data - stable identity, location, and latest progress.
     */
    'review/progress': ReviewProgressData
    /**
     * Closes one review job with its final summary.
     * @mode emit
     * @param data - stable identity, location, and final display state.
     */
    'review/end': ReviewEndData
  }
}

interface ReviewChatData {
  readonly title: string
  readonly completed: number
  readonly status: 'running' | 'completed'
  readonly summary?: string
}

declare module '@deepseek-ai/dsh-client-ui-chat/client' {
  interface ChatNodeDataMap {
    'review-job': ReviewChatData
  }
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ConversationStepDataMap {
    'review-job': ReviewChatData
  }
}

interface ReviewState extends ReviewChatData {
  readonly turn: number
  readonly step: number
}

function locationOf(context: ConversationNodeContext): ConversationLocation {
  return context.start?.location ?? context.matches[0]?.location ?? { kind: 'unresolved' }
}

function viewData(state: ReviewState): ReviewChatData {
  return {
    title: state.title,
    completed: state.completed,
    status: state.status,
    ...state.summary === undefined ? {} : { summary: state.summary },
  }
}

const reviewDefinition: ConversationNodeDefinition<ReviewState> = {
  kind: 'review-job',
  target: 'chat',
  match: (event) => {
    if (event.type === 'review/start') {
      return { id: String(event.data.reviewId), role: 'start' }
    }
    if (event.type === 'review/progress' || event.type === 'review/end') {
      return { id: String(event.data.reviewId), role: 'update' }
    }
    return null
  },
  start: (_context, match) => {
    if (match.event.type !== 'review/start') throw new Error('review-job requires review/start')
    return {
      turn: match.event.data.turn,
      step: match.event.data.step,
      title: match.event.data.title,
      completed: 0,
      status: 'running',
    }
  },
  update: (context, match) => {
    if (match.event.type === 'review/progress') {
      return { ...context.state, completed: match.event.data.completed }
    }
    if (match.event.type === 'review/end') {
      return { ...context.state, completed: 100, status: 'completed', summary: match.event.data.summary }
    }
    return context.state
  },
  publication: match => match.event.type === 'review/progress'
    ? 'animation-frame'
    : 'immediate',
  buildLocationData: (context, scope) => {
    if (scope !== 'step' || context.state === undefined) return null
    return {
      kind: 'step',
      turn: context.state.turn,
      step: context.state.step,
      key: 'review-job',
      value: viewData(context.state),
    }
  },
  buildViewNode: (context) => {
    if (context.state === undefined) return null
    return {
      key: context.key,
      kind: 'review-job',
      id: context.id,
      target: 'chat',
      anchorSeq: context.start?.event.seq ?? context.matches[0]?.event.seq ?? 0,
      location: locationOf(context),
      visibility: 'visible',
      data: viewData(context.state),
    }
  },
}

function ReviewNodeView({ node }: ChatNodeViewProps<'review-job'>) {
  const text = node.data.summary ?? `${node.data.title}: ${node.data.completed}%`
  return createElement('p', null, text)
}

export const inject = ['uiConversation', 'slots']

export function apply(ctx: ClientContext): void {
  ctx.uiConversation.events.register(reviewDefinition)
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'review-job',
  }, ReviewNodeView))
}
```

`match(event)` 是身份提取器，不是 fold：它只能收到當前 `SessionEventLike`，并返回 Definition 內部 id 與生命周期角色。命中后，Assembler 通過 `(kind, id)` 定位 Context；標準 event 可觸發一次 `start`，標準或 packed event 可把當前 State 交給 `update`。兩個函數都必須返回引擎隨后采用的 State；推薦返回新的 immutable value，但函數原地修改后返回同一對象時，采用語義也相同。

`buildLocationData(context, scope)` 可以把 Definition 擁有的數據發布到引擎擁有的 Turn 或 Step 上。通過 declaration merging 為每個 key 指定精確 value 類型。同一 Location 內的另一個 Node 可以使用受限 slot hook（例如 `useTurnData(key)`）讀取該值，無須取得 Session，也無須掃描 `snapshot.chat.nodes`。

`target` 與 `buildViewNode(context)` 必須同時聲明一項由 target 擁有的渲染貢獻。把 `context.key` 保留為 React 側身份，根據持久排序證據選擇 `anchorSeq`，并且只返回 renderer 可以直接使用的數據。某個 target Node 一旦發布，就要繼續返回同一個 key；需要暫時離開可見流時使用 `visibility: 'hidden'`，不要改為返回 `null` 撤回它。

## Predecessor read

有些 Definition 需要另一個業務 kind 在當前位置之前的最新 State。`start` 會收到 `ConversationContextReader`；應在這里調用 `reader.previous<State>(kind)`，不要接收 Context 集合或掃描事件。Reader 返回當前 start `seq` 之前最近一個已啟動 Context 的只讀數據。

Assembler 會記錄這項依賴。如果后續 older prepend 帶來了更近的前序 Context、補齊了原先未知的窗口缺口，或者前序 State 被修訂，引擎會從 `start` 重新運行依賴方 Context，并按 `seq` 升序回放其 update。被查詢的 Definition 仍負責把有用信息寫入自身 State；Reader 不提供業務專用查詢方法，也不授予修改其他 Context 的權限。

## Window 更新路徑

歷史可能從尾部開始一頁一頁向前請求。Session journal 先校驗互不重疊的邏輯 seq range，Assembler 再按每個已接受 input 的首 `seq` 排序并進入 State 回放。

| 路徑 | 引擎工作 | Definition 可觀察到的行為 |
|---|---|---|
| open、resync 或 gap repair 時 replace | 重建已加載窗口，每條標準 event 或 packed run 對每個 Definition 匹配一次，再回放每個已有 start 的 Context | 先執行 `start`，再按邏輯 `seq` 升序執行其 update；只有 update 的 pending Context 仍沒有 State |
| prepend 一頁更早歷史 | 只匹配新增的更早 input，按 `(kind, id)` 合并進 Context，保留現有 keyed node，并只重放受影響的 Context 與依賴 | 新發現的 scalar start 會激活已收集的 scalar 與 packed update；Location 或前序依賴變化也可能重跑 Context |
| append 一條實時事件 | 每個 Definition 各調用一次 `match`，按 key 查找命中的 Context，只更新該 Context | 對 start 之后的匹配事件執行一次 scalar `update` 并請求一次發布；不掃描已有 Context |

注冊 `D` 個 Definition 時，一條新 scalar event 或 packed run 會進行 `D` 次僅當前 input 匹配；命中后的 Context key 查詢是常數時間。Definition 代碼必須維持這個性質：正常 append 熱路徑不得遍歷完整事件窗口、所有 Context、`context.matches` 或已渲染 Node 集合。累計事實放進 State，同 Turn/Step 共享信息放進 Location data，有索引的前序依賴使用 `reader.previous()`。

`publication` 控制發生 State 變更后何時物化。結構或 terminal 變化使用 `immediate`，高頻可見 delta 使用 `animation-frame`，只為后續發布積累 State 時使用 `none`。引擎按日志順序應用每條 scalar update，并用一次 batch update 應用一個 packed run；該選項只合并視圖發布頻率。

## 驗證要求

添加聚焦測試，證明以下結果：

1. 完整窗口通過 replace 后產生預期的最終 State、Location data、Node payload 與 `anchorSeq`。
2. 只有 update 的尾部窗口保持 pending；prepend 唯一 start 后，結果與完整 replace 相同。
3. 初始歷史后繼續實時 append，與回放合并后的完整窗口得到相同結果。
4. prepend 更早分頁只增加更早的行；數據未變化的既有 keyed Node value 不被替換。
5. 重復的可見 delta 保持 `context.key`，并在請求 `animation-frame` 時每幀最多發布一次。
6. keyed renderer 只消費 `node.data` 與受限 Location hook，不掃描 Session 事件窗口、Context 或 Chat Node。
7. scalar 與 packed Assistant 歷史產生相同的最終 State、timing boundary 和 target snapshot；一個 packed run 在 replace、prepend、Location replay 與 registry rebuild 中始終只保留一個 Match。
8. 創建 target source 不執行 builder 工作；顯式選擇或首次訂閱執行一次完整 replace，后續更新送達所有 active target，重復激活不會再次 replace。

流式與中斷處理可參考 [`packages/client/ui-chat/src/client/conversation-nodes/assistant.ts`](../../packages/client/ui-chat/src/client/conversation-nodes/assistant.ts)，前序查詢可參考 [`inbox.ts`](../../packages/client/ui-chat/src/client/conversation-nodes/inbox.ts) 與 [`message.ts`](../../packages/client/ui-chat/src/client/conversation-nodes/message.ts)，只發布 Turn data 而不創建自有 Node 的例子見 [`packages/client/ui-deliverables`](../../packages/client/ui-deliverables)。
