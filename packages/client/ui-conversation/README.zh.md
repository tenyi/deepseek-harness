---
description: "Target-neutral 對話裝配與瀏覽器 shell：事件和視圖注冊表、逐會話 binding、輸入狀態、slot 與臨時 composer takeover。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-conversation

[English](README.md) | 中文

## 概述

`ui-conversation` 擁有與 target 無關的 Conversation 組裝和共享瀏覽器 shell。它消費 Session Controller 的 `SessionEventLikeEntry` feed，通過 `ctx.uiConversation` 暴露不依賴 React 的注冊表與逐 Session binding，并通過 `ctx.uiSession` 提供 `useConversation`、`useInput` 和 `inputActions` 標準 props。它還擁有按會話的持久化圖片 URL 緩存：`ctx.uiConversation.imageUrl(sessionId, attachment)` 為每個附件解析一個經會話授權的瀏覽器 URL，并隨 Session binding 釋放而撤銷，因此所有 Conversation target 共享一次 `session.attachment` 讀取。Chat 等具體 target 位于獨立包，由各自包注冊 Definition、快照 builder、View 和 renderer。

## 目錄

- [Conversation 組裝](#conversation-assembly)
- [Shell 與標準 props](#shell-and-standard-props)
- [臨時 composer entry](#temporary-composer-entries)
- [模型體驗](#model-experience)
- [已知限制與暫緩事項](#known-limitations-and-deferred-work)
- [開發備注](#dev-note)

-----

<a id="conversation-assembly"></a>
## Conversation 組裝

`UiConversation.events` 是 event Definition 的唯一 registry，`UiConversation.views` 是 target snapshot builder 的唯一 registry。兩者都拒絕重復 key、保持注冊順序、返回冪等 disposer，并在 contribution roster 變化時重建現有 binding。`UiConversation.binding(bindingOrSessionId)` 為當前 Session Controller binding 返回 identity 穩定的 Conversation binding，不會另開事件源。

適配器把每個 `SessionEventLikeEntry` 直接交給 assembler。外層 `type` 區分持久事件與 Client-only transient event，內部 `event` 則統一公開 `type`、`seq`、`time` 與 `data`；Definition 接收這個內部 `SessionEventLike`。replacement window 可以包含兩種 entry，歷史 prepend 攜帶持久 entry，實時 append 則可以攜帶任一種。兩種事件都使用 Definition 的同一組 `match` 與 `update` 方法，`start` 只接收持久 event，assembler 會拒絕 transient start。不消費 Assistant delta 的 Definition 對 `assistant/live-chunk` 返回 `null`。replace window 或 revision 斷檔從完整已加載窗口重建；連續 revision 的 append、prepend 與 Assistant settlement 使用增量組裝。settlement 只刪除具名 attempt 的 transient match，應用可選持久 entry，并重放受影響的 Context 及其 dependent，不替換無關 target node。assembler 擁有 Context 匹配、Turn/Step location、target node 物化、target activity 和穩定 target source。`ConversationSnapshot` 只包含與 target 無關的 View 與 active-target 事實；Session lifecycle 狀態仍屬于 `SessionSnapshot`。

shell 選擇解析出 target 或 target source 收到首個 subscriber 時，該 target 進入 active 狀態。assembler 從當前 Context 對它執行一次 replace，并使它參與后續增量 flush；創建 source 不會激活 target，取消訂閱也不會停用 target。

target package 通過 declaration merge 擴展 snapshot 與 Location data map，再調用 `ctx.uiConversation.events.register(...)` 和 `ctx.uiConversation.views.register(...)`。target 通過 `ctx.uiConversation.binding(binding).target(targetId)` 讀取其 Session-owned source。注冊屬于 Cordis effect，返回的 disposer 從同一個 registry 移除 contribution。共享的請求檢查服務于每個 target：`ctx.uiConversation.inspectSystemPrompt(previous, event)` 將系統消息與位置替換解釋為不可變的已加載 surface 狀態。它按 surface 順序選擇最后一個非空的存活系統節點，為連續重寫只保留存活的替換位置；遇到未建立索引的更早端點后，提示詞保持不可用，直到向前補頁回放提供其順序。target 自有的 Definition 獨立保留歷史卡片。`ctx.uiConversation.inspectRequestPrompt(previous, header, system)` 根據該有效提示詞分類請求變更；普通消息與流式分片無需處理系統狀態。

<a id="shell-and-standard-props"></a>
## Shell 與標準 props

輸入框注冊「文件」命令動作，負責其標題、可用性和原生文件選擇器回調。菜單可用性與實際調用都讀取已掛載輸入框當前的附件接收策略。輸入框卸載或鎖定后該動作不可用，插件 dispose（資源釋放）時移除注冊。回調綁定留在輸入模塊內部。

已認領的命令在僅刪除參數和末尾分隔空格時保留身份與高亮，改動命令名才會釋放認領。所有命令和語言使用相同規則，包括 `/goal`、`/目標`、`/plan` 和 `/計劃`。輸入法組合輸入期間，命令提示和普通占位文字持續隱藏，直到編輯器提交最終文字且對應輸入為空時才重新顯示。

工作區選擇使用 `uiWorkspace.openWorkspace` 準備目標并提交導航。草稿文字和附件僅在該請求仍為當前請求時，通過它的同步準備回調搬移；后續導航或所有者釋放會保留原草稿。

本包占據 root 作用域 `main` 中的 `conversation` key，其包裝層聲明 optional-Session `main.conversation` shell。本包注冊 strict Session header/body、View list、composer chain 與 bar、輸入區域、Hero 區域、queue dock、草稿持久化和 phase 計算。`ctx.uiSession.provide()` 從同一個 Session binding 物化 Conversation 與 input source，并將 `inputActions` 作為穩定標準 prop 提供。

View 選擇規則固定：有效且已注冊的持久化選擇優先，其次是已注冊的 `chat`，否則不渲染 View；絕不選擇第一個已注冊 View。Shell phase 只組合 Session lifecycle 與 active-target set，不讀取任何 target-specific 快照。

Session 首次綁定或緩存的 Session 成為 current 時，shell 會在渲染前讀取持久化 View 偏好，激活已注冊的偏好 View 或 Chat fallback，并在后續 tab 或 focus 選擇寫入 store 前先激活對應 target。blank Session 仍不渲染 `conversation.view` slot；未選中的 target 不會激活。

常駐 composer 在無 Session 與有 Session 之間保持掛載。輸入空白字符會隱藏占位提示；沒有附件的純空白草稿無法發送。無 Session 時，同一個編輯器表面保持 inert，Workspace picker 連接 blank Session。該表面是 shell 所有的 Lexical 編輯器：引用 chip 是攜帶 owner 序列化身份的原子 decorator 節點（提交時經 owner codec 展開），已認領的 slash command 保持為帶樣式的行首文本，文件夾文本引用以圖標前綴攜帶文件夾圖形，草稿的剪貼板投影鏡像到逐 Session Conversation store。Queue 操作通過 scoped `ctx.conversation` service 尋址準確的 queue occurrence；queue 預覽經 `ui-primitives` 的共享行內引用投影渲染已發送文本（wire 會話形式折疊為其標簽），并按原始附件順序展示本地或持久化的圖片和文件。圖片使用縮略圖，文件使用緊湊的名稱與大小卡片。編輯態展示字面發送文本，持久化縮略圖通過會話圖片 URL 緩存解析。繁忙時 Enter 行為保存在 Host-backed `ui-conversation` settings namespace。

默認發送采用樂觀提交：Enter 在同一事務里清空草稿、occurrence 表和撤銷歷史，composer 保持 `plain`，發送作為 detached attempt 運行，發送期間可以繼續輸入和提交。`sendSession` 在序列化之前用投遞模式注冊 Session 提交回顯（`session.beginSubmission`），并在 `pendingSubmissions` 中保留圖片與文件的選擇順序；Session 根據該模式與當前運行狀態推導位置，因此空閑發送進入 transcript（文本記錄），繁忙時 Queue 進入 QueueDock，繁忙時 Steer 進入 pending-steering 區域。隨后讓出一幀，圖片經瀏覽器原生 `FileReader` data-URL 路徑編碼，文件則引用已暫存憑證。命令提交也用同一憑證表示通用文件，因此發送 `/goal` 或 `/plan` 時不會再次讀取這些瀏覽器文件。提示詞復用提交 `requestId`；queue 或歷史以同一 `rpcId` 被觀察后，回顯只退休一次。多個并發發送失敗時，在用戶編輯還原內容之前按提交順序合并還原；命令提交保持凍結的 `submitting` 階段。Detached attempt 持有附件 id，直到 admission 完成或 Session scope 銷毀。回顯以 observed 退休時，durable 圖片緩存立即公開每個預覽 URL，讀取 admitted 附件后用規范化 URL 替換預覽，并在各 URL 停止使用后撤銷，同時釋放文件卡。選中的通用文件進入同一個先進先出的后臺上傳隊列；`maxConcurrentFileUploads` 默認允許兩個 Worker transport 同時運行，Conversation 服務在切換 Session 時繼續持有排隊和運行中的傳輸操作及字節進度，移除草稿會跳過排隊中的傳輸或中止正在運行的傳輸。continuable 子代理禁用附件入口，也不創建本地回顯，因為其 transport 不保留瀏覽器 request id。

排隊提交的本地回顯在禁用的編輯、刪除、插話按鈕旁顯示“發送中…”；折疊后的隊列在標題欄保留發送狀態。匹配的 Host 隊列行替換回顯后，各操作按原有的純文本內容和運行狀態要求啟用。僅收到提示詞確認不會啟用隊列操作。提交失敗會移除回顯并顯示錯誤；輸入框為空或仍保留上一次自動恢復的內容時，composer 恢復失敗草稿，保留用戶隨后輸入的文字。

Send 和 Stop 按鈕禁用時不顯示提示氣泡，輪次結束后由 Stop 切換成禁用 Send 的按鈕也遵循此規則。普通 composer 運行時，如果草稿為空或輸入不可用，主指針操作保持為 Stop。可提交的文字或附件會把同一位置切換為 Send；清空或成功提交草稿后恢復 Stop。繁忙態 Enter 設置為普通 Session 與可繼續 child 選擇 Queue 或 Steer 投遞，運行中的 Send 按鈕按 plain Enter 解析出的同一模式投遞；當它在普通消息草稿上可用（沒有待上傳文件）時，其標簽以該模式命名（排隊發送或插話發送），因此該設置同時約束 Enter 與按鈕，而 Cmd/Ctrl+Enter 仍使用另一模式；空閑會話、空草稿與 `/` 命令行保留普通的 Send 標簽（[決策](../../../.agents/notes/implemented/bug-fix/2026-09-04-busy-send-button-follows-enter-setting.zh.md)）。它們的 QueueDock 行共享 Edit、Remove 與 Steer，空草稿也共享 steer-all 組合鍵。One-shot child 繼續只讀。Plan Mode 與 active goal 不改變附件入口。可繼續 child 保留獨立的 Send 與 Stop 操作，但不提供「文件」菜單項、粘貼或拖放入口；parent 離線時，Send 與 composer 手勢鎖定，但在線 inbox 的 QueueDock 控制仍可使用（[決策](../../../.agents/notes/archived/bug-fix/2026-08-20-running-draft-primary-send.md)、[inbox 控制](../../../.agents/notes/implemented/feature/2026-08-27-continuable-subagent-human-inbox-control.zh.md)）。

文件標簽和可編輯的 skill 引用共用覆蓋整個引用的懸停背景，并跟隨輸入框的行高與文字基線。首次點擊立即由已注冊的引用來源負責打開預覽，包括雙擊序列的第一次點擊。后續點擊保留原生文本選擇行為；已有非折疊選區時，指針點擊不打開預覽。預覽不改變草稿、剪貼板文本或提交內容。

<a id="temporary-composer-entries"></a>
## 臨時 composer entry

`conversation.composer` 是通用 chain，其完整 owner currency 為：

```ts type-equiv
/** Owner values used to elect a composer takeover. */
interface ComposerChainProps {
  /** Current Session identity used by temporary business-owned entries. */
  sessionId: SessionId | undefined
  /** Current Session lifecycle state, absent without a selected Session. */
  session: SessionSnapshot | undefined
  /** Effective business-owned interaction awaiting the user in this Session. */
  pendingInteraction: SessionPendingInteraction | undefined
}
```

業務包僅可在一個 Remote waterfall request pending 期間安裝 entry：

```tsx
import type { ComposerChainProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ChainSelect, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

interface Request {
  readonly sessionId: SessionId
}

type RequestComposerProps =
  PropsRuntime<'conversation.composer'> & { matched: Request }

const select: ChainSelect<ComposerChainProps, Request> = owner =>
  owner.sessionId === request.sessionId ? request : null

const dispose = ctx.slots.register(
  { name: 'conversation.composer', select },
  RequestComposer,
)

try {
  return await request.result
} finally {
  dispose()
}
```

selector 必須是 owner currency 的純函數。非 null 返回值作為 `matched` 傳給組件；`PropsRuntime<'conversation.composer'>` 提供標準 Session 與 global props。Chain 順序仍按 `priority` 升序，再按注冊順序；首個返回非 null 的 selector 獲選。Shell 會在 takeover 下保持默認 composer 掛載。Request 狀態、listener、response encoding 和任何 request-specific child slot 都屬于業務 package，不進入 `SessionSnapshot`，也不由 core 包聲明。

<a id="model-experience"></a>
## 模型體驗

無，因為本包渲染瀏覽器狀態，并通過 Session Controller API 發送用戶確認提交的輸入，而不構造模型請求。

#### KV Cache 影響

無；Conversation 組裝和瀏覽器輸入狀態不會改變提供方側的 prompt cache。

## 已知限制與暫緩事項

<a id="known-limitations-and-deferred-work"></a>

- **只有已注冊 target 可以渲染**——除已注冊的 `chat` 偏好外，shell 刻意不提供隱式 fallback target。


<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。Conversation Definition、target builder 與 View 已由其所屬注冊表和 Slot ledger 校驗。
