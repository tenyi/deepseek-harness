# Web Client Slots

[English](slots.md) | 中文

Slots 是 Web Client 的類型化 React 組合系統。[`dsh-client-ui-slots`](../../packages/client/ui-slots/README.zh.md)定義不依賴 React 的注冊表與類型代數；[`dsh-client-ui-renderer`](../../packages/client/ui-renderer/README.zh.md)把可觀測源綁定成鉤子、渲染整棵樹，并在內部擁有 React context。功能插件通過 `ctx.slots.register()` 貢獻 UI，絕不導入其他功能插件的組件。

本文記錄 slot 的所有權、組件輸入、擴展 API 與當前層級。外圍的啟動、Remote、Client model 與 Conversation 數據通路見 [Web Client 架構](web-client.zh.md)。

## 聲明與生命周期

`SlotMap` 是編譯期注冊表。包通過聲明合并寫入 key、cardinality（基數）、scope、owner props、keyed props 與可選的 slot 級 inject face。運行時聲明則是擁有該渲染位置的組件在 `children` 中給出的對應條目。

聲明一個 child 會同時產生三種效果：令該 child key 生效、授權 parent entry 調用 `renderSlot` 或 `renderSlotChain`，以及記錄運行時 dispatch 規格。每個聲明只能有一個存活 owner。向未聲明 slot 注冊，或重復聲明其他 entry 已擁有的 child，都會在插件激活時失敗。

`root` 是唯一內建聲明，也是唯一由 Cordis service 自身渲染的 key。`ui-renderer` 調用 `ctx.slots.renderSlot('root', {})`；其余每個后代都通過聲明它的 entry 所收到的 `renderSlot` 或 `renderSlotChain` prop 渲染。

注冊和聲明遵循 Cordis effect 生命周期。銷毀一個 entry 會移除其貢獻，并遞歸折疊它聲明的 child slots。因此，向其他包的 slot 貢獻功能時使用 `ctx.slots.inject(key, callback)`：callback 會在每段聲明生命周期內運行，owner 折疊時其 effect 隨之移除，owner 再次掛載時則重新運行。

```tsx ignore-check
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

type HeaderActionProps = PropsRuntime<'conversation.session.header.actions'>

function HeaderAction({ useSession }: HeaderActionProps) {
  const running = useSession(snapshot => snapshot.running)
  return <button disabled={running}>Review</button>
}

export const inject = ['slots']

export function apply(ctx: Context): void {
  ctx.slots.inject('conversation.session.header.actions', () =>
    ctx.slots.register({
      name: 'conversation.session.header.actions',
      id: 'review',
      order: 100,
    }, HeaderAction))
}
```

## Cardinality 與 scope

Slot 聲明固定兩個相互獨立的維度。

| 維度 | 值 | 含義 |
|---|---|---|
| cardinality | `single` | 單個 cell，渲染當前 priority 勝者；需要并列內容時應聲明 child slot，而不是把它當作列表。 |
| cardinality | `list` | cell 由必填 `id` 定址，先按 `order`、再按注冊順序排列。 |
| cardinality | `keyed` | owner 傳入 `entryKey`；匹配 cell 以該 key 對應的 props 渲染。 |
| cardinality | `chain` | 每個 entry 提供純 `select(owner)` 函數；按 priority 順序遇到的第一個非 null 結果獲選，并以 `matched` 傳給組件；全部拒絕時渲染 owner fallback。 |
| scope | `root` | 一個 root 作用域組件和 store 實例。 |
| scope | `session-maybe` | 跟隨當前選擇，但沒有 Session 時仍可渲染；Session 值是可選的。 |
| scope | `session` | 要求可解析的 Session binding，并收到確定存在的 Session 值。 |

對于 `single`、`list` 和 `keyed` cell，`priority` 是遮蔽優先級；對于 `chain`，它是選舉順序。數值越小越先運行或渲染。普通增量貢獻應選用新的 list `id` 或 keyed `key`；復用已有 cell 表示有意替換其展示。

## 組件輸入

注冊組件會在 binding 位置收到組裝后的輸入。組件應從這些類型推導 props，不要重新抄寫成員。

| 輸入 | 聲明者 | 組件類型 |
|---|---|---|
| owner 值與標準 scope 值 | `SlotMap` 條目與已安裝的 scope adapter | `PropsRuntime<K>` |
| 獲授權的 child renderer | 注冊項的 `children` keys | `PropsRenderSlots<S>` |
| 共享視圖狀態的 selector hook 與 mutation callback | 注冊項的 `store` | `PropsStore<H>` |
| 私有數據、callback 與 observable hook | 注冊項的 `inject` factory | `InjectFace<I>` |
| 本地化 `t` 函數 | 注冊項的 `locale` namespace | `PropsLocale<N>` |
| chain 選中的值 | 注冊項的 `select` 結果 | 通過 `ComposedProps` 提供的 `matched` |

當 entry 聲明 strict Session child 時，`PropsRenderSlots` 還會提供 `SessionProvider`。它把子樹綁定到當前 Session identity，并在 identity 改變時重新掛載 body。

組件絕不會收到 `ctx`。父組件在某次渲染時已經知道的值通過 `renderSlot` 的 owner 參數進入；共享視圖狀態使用聲明的 store；service 與 model object 留在 `apply` closure 中，只向組件投影 callback 或 observable source。

## 框架提供的 hooks

當前組合中的 adapter 會添加以下標準 props。它們按目標 slot 的 scope 提供，與注冊組件來自哪個包無關。

| 可用范圍 | Props | Owner |
|---|---|---|
| 所有 scope | `useSessions`、`useSessionPendingInteraction` | `ui-session` |
| 所有 scope | `useWorkspaces` | `ui-workspace` |
| 所有作用域 | `usePanelInfo` | `ui-layout` |
| `session` | `sessionId`、`useSession`、`useProjection` | `ui-session` |
| `session-maybe` | 結果可選的 `sessionId`、`useSession`、`useProjection` | `ui-session` |
| `session` | `useConversation`、`useInput`、`inputActions` | `ui-conversation` |
| `session-maybe` | 結果可選的 `useConversation`、`useInput`、`inputActions` | `ui-conversation` |
| `session` | `useChat` | `ui-chat` |
| `session` | `useTrajectory` | `ui-trajectory` |

Renderer 還會根據聲明的 store 創建 `useStore`，并根據聲明的 locale namespace 創建 `t`。這些是由注冊項推導的 props，不屬于全局標準 props。

框架與領域 adapter owner 可以通過 `ctx.slots.provideRoot()` 或 `ctx.uiSession.provide()` 擴展標準集合，同時提供對應的 `GlobalStandardProps`、`SessionStandardProps` 或 `SessionMaybeStandardProps` 聲明合并。普通功能組件不應自行創建 React hook prop，也不應為 entry 私有數據添加全局標準 prop。

## 開發者提供的 injection

注冊項的 `inject` 選項是通常使用的功能私有注入點。它的 factory 在插件的 `apply` 世界中運行，可以閉包捕獲已經注入的 Cordis service，并且只返回組件所需的數據與 callback。對于 `session` slot，它會收到 `sessionId`；對于 `session-maybe`，它收到 `sessionId | undefined`；聲明 store 后，它還會收到該 store 綁定后的 actions。

返回值中保留的 `hooks` 對象接收裸 `getSnapshot`／`subscribe` source。Renderer 把 `hooks: { status }` 轉換為組件 prop `useStatus(selector)`，并按 source identity 緩存綁定。組件不會收到 source 本身，也不直接調用 `useSyncExternalStore`。

當每個 occupant 都需要同一種能力時，slot owner 可以在 child 聲明里放置 `inject` face。普通成員會原樣交給所有 occupant；其 `hooks` 對象中的函數成員是 hook factory，它會收到 slot 的標準 props 與可選的逐次渲染 `hookContext`，再返回提供給 occupant 的受限 hook。`conversation.chat.node` 正是通過這種機制，為當前渲染的 node 提供 `useTurnData(key)`。

一次渲染時 owner 已知的值走 owner props；單個 entry 的 callback 與私有 observable 走注冊項 `inject`；由 slot owner 控制、所有 occupant 共享的能力走 slot 級 `inject`；需要跨 entry 共享或跨重新掛載保留的可變視圖狀態走聲明的 store。React node 通過 child slot 組合，不通過注入值傳遞。

## 當前層級

下圖是當前發布組合的聲明樹。只有具名 parent entry 已掛載時，其 child 才存在；因此可選功能 entry 可以作為一個生命周期單元讓整棵子樹出現或消失。

```text
root
├─ sidebar
│  ├─ sidebar.brand.mark
│  ├─ sidebar.brand.name
│  ├─ sidebar.panellist
│  ├─ sidebar.footer.action
│  ├─ sidebar.workspaces
│  │  └─ sidebar.workspaces.directoryFlow
│  └─ sidebar.settings
│     ├─ settings.trigger
│     ├─ settings.header
│     ├─ settings.action
│     ├─ settings.close
│     ├─ settings.onboarding
│     └─ settings.section
│        ├─ settings.general.item
│        ├─ settings.models.provider-card
│        ├─ settings.models.footer
│        └─ settings.plugins.tab
│           └─ settings.plugin.item
├─ main
│  └─ main.conversation
│     ├─ conversation.session
│     │  └─ conversation.view
│     │     ├─ conversation.chat.node
│     │     │  ├─ conversation.chat.assistant-actions
│     │     │  ├─ conversation.chat.commandview
│     │     │  ├─ conversation.chat.turnTail
│     │     │  └─ tool.call.toolview
│     │     │     ├─ tool.call.images
│     │     │     └─ tool.view.cordis
│     │     ├─ conversation.message.images
│     │     └─ conversation.trajectory.images
│     ├─ conversation.session.header
│     │  ├─ conversation.session.header.lineage
│     │  ├─ conversation.session.header.actions
│     │  ├─ conversation.session.header.utilities
│     │  └─ conversation.session.header.corner
│     ├─ conversation.composer
│     │  └─ conversation.approval.detail
│     ├─ conversation.composer.bar
│     │  ├─ conversation.input.attachments
│     │  ├─ conversation.input.plan
│     │  └─ conversation.input.model
│     ├─ conversation.input.overlay
│     ├─ conversation.input.dock
│     ├─ conversation.composer.dock
│     ├─ conversation.input.left
│     ├─ conversation.input.right
│     ├─ conversation.hero.brand.mark
│     ├─ conversation.hero.workspace
│     │  └─ conversation.hero.workspace.directoryFlow
│     └─ conversation.hero.agentPreset
├─ rightbar
│  └─ rightbar.session
│     ├─ sidebar.right.pane.tab
│     │  └─ sidebar.right.tab.guide
│     ├─ sidebar.right.pane.tab.title
│     └─ sidebar.right.tab.menu.item
└─ shell.overlay
```

生成的 Client inspect catalog 是每個 key 的完整參考，包含 cardinality、scope、owner props、標準 props、當前 occupant、聲明 owner 與替換風險。運行中的動態包可以用 `cordis_inspect what:"client"` 查詢實時樹與某個精確 key；源碼 catalog 由 `pnpm run gen-client-catalog` 根據 `SlotMap` 聲明和 `slots.register()` 調用點生成。

## 擴展規則

- 另一個功能包只能通過 `import type` 引入聲明；絕不導入或轉發它的運行時值。
- 只在擁有并渲染某個位置的組件中聲明新的 child slot。其他包通過 `ctx.slots.inject()` 等待，再通過 `ctx.slots.register()` 貢獻內容。
- 業務與傳輸狀態留在所屬 Cordis service 或 Client model 中。Slot store 只承載共享的視圖與交互狀態。
- 可觀測 source 及其 snapshot identity 在值變化前保持穩定；值變化時通過同一個 source 發布。
- UI domain 之間只傳 JSON 兼容數據和 callback。`hooks` compartment 是裸 observable 的唯一例外；React 內容通過 slot 傳遞。
- 將 `single` 和已有 occupant 的 keyed cell 視為替換點。增量擴展使用 list id 或尚未占用的 key。
