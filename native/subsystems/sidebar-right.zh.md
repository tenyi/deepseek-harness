# 右側 Sidebar

[English](sidebar-right.md) | 中文

右側 Sidebar 是 Web Client 里每個會話一份的停靠面：會話區旁的一列 pane 與 tab，按地址尋址的內容——工作區文件、目錄樹、產品自帶頁面——在這里打開、分欄、浮出、關閉。[`dsh-client-ui-sidebar-right`](../../packages/client/ui-sidebar-right/README.zh.md) 擁有這個面、tab 類型注冊表與導航服務；[`dsh-client-ui-dockkit`](../../packages/client/ui-dockkit/README.zh.md) 是它內部的布局引擎；[`dsh-client-resources`](../../packages/client/resources/README.zh.md) 把地址變成任何組件都能讀的活數據；[`dsh-api-workspace-files`](../../packages/api/workspace-files/README.zh.md) 同時提供 Host 工作區文件服務與 Client `file` 資源提供者。

本頁是該子系統契約的參考：地址、tab 類型注冊、導航服務、擴展 slot 與其 owner props、資源模型、Workspace Files 服務、內置類型，以及明確不做的事。布局引擎、frame 與停靠面如何拼在一起見 [Agent Note](../../.agents/notes/implemented/feature/2026-09-04-right-sidebar-docking-infrastructure.zh.md)；slot 機制見 [Slots 參考](slots.zh.md)。

## 定位與歸屬

每個會話恰有一個停靠面，保存在會話作用域的 slot store 里、由 `rightbar.session` 繪制。root 作用域的 `rightbar` 控制器僅在選中 Conversation 時掛載該席位；刷新頁面后每個會話回到折疊的默認態，切換會話時各自的面保持原狀（[狀態](../../packages/client/ui-sidebar-right/README.zh.md#state)）。面的每一次變化都是 kit 純規劃器算出的一條歷史記錄；停靠的 pane 從不空著，根 pane 為空時會加入根據已注冊引導入口選出的默認頁。

一個 tab 類型是共用定義 `id` 的兩次注冊：在 `ctx.sidebarRightTabs` 里的靜態定義說明其 `kind` 打開哪些地址，一次 keyed slot 注冊提供它的正文。框架注入 `useTabInfo()` 以讀取 Sidebar、窗格和標簽的實時信息；各類型把自身狀態放在 slot store 里。各包之間只以類型形式引用彼此的聲明。

| 包 | 職責 |
|---|---|
| [`client/ui-sidebar-right`](../../packages/client/ui-sidebar-right/README.zh.md) | 面板與欄席位、布局 store、`ctx.sidebarRightTabs`、`ctx.sidebarRight`、Tab 域、引導類型 |
| [`client/ui-dockkit`](../../packages/client/ui-dockkit/README.zh.md) | 純布局引擎與 React 面；`ui-sidebar-right` 的內部依賴，不是穩定接口 |
| [`client/resources`](../../packages/client/resources/README.zh.md) | `ctx.resources`、`useResource`、協議 → 值類型的花名冊 `ResourceProtocolMap` |
| [`api/workspace-files`](../../packages/api/workspace-files/README.zh.md) | Host `ctx.workspaceFiles`、`workspaceFiles` Remote 命名空間與 Client `file` 資源提供者 |
| [`util/workspace-path`](../../packages/util/workspace-path/README.zh.md) | 文件地址語法：`fileAddressFor`、`parseFileAddress` |
| [`client/ui-sidebar-documentpreview`](../../packages/client/ui-sidebar-documentpreview/README.zh.md)、[`client/ui-sidebar-files`](../../packages/client/ui-sidebar-files/README.zh.md) | 內置的 `text` 與 `files` 類型 |

## 地址

每個 tab 都由一個地址字串打開，地址就是 tab 的內容身份。地址分兩族。

**資源地址**是 `dsh-resource://<type>/…` 形式的 URL。host 命名資源協議——即 `ResourceProtocolMap` 的鍵——其后是該協議自己的路徑；所有協議共用一個 scheme，新增協議只新增 host、不新增 scheme。`file` 協議的路徑以其作用域開頭：`session/<sessionId>` 后接相對該會話工作區根的路徑（`dsh-resource://file/session/abc/src/notes.txt`），或 `absolute` 后接去掉前導 `/` 的絕對路徑（`dsh-resource://file/absolute/home/ys/notes.txt`，Windows 上為 `dsh-resource://file/absolute/C:/x/y.txt`）。id 與每一段路徑都做組件編碼，盤符的 `:` 保留原樣。`fileAddressFor(sessionId, cwd, path)` 構造地址——相對路徑或工作區內的絕對路徑成為 `session` 相對地址，其他絕對路徑成為 `absolute` 地址——`parseFileAddress(address)` 讀回各部分或返回 `undefined`（[語法](../../packages/util/workspace-path/README.zh.md)）。

**頁面地址**是 Sidebar 為按 kind（而非按資源）打開的 tab 記下的地址：`sidebar://<kind>`，由 Sidebar 自己在 `openTab(kind)` 運行時寫入。調用方從不拼它——引導頁與文件樹以 `openTab('guide')`、`openTab('files')` 打開——此外不存在任何導航地址（[不做](#not-built)）。

tab 身份是 `(kind, address)` 二元組：注冊表的認領把地址原文用作記錄的 `contentId`，因此同一地址經同一類型再次打開會找到已有 tab，同一地址經兩個類型打開則是兩個 tab。

## Tab 類型注冊

`ctx.sidebarRightTabs.register(definition)` 在調用方的生命周期內注冊一個類型的一份實現并返回注銷器；調用方把它放在自己的 `ctx.effect` 里，因此實現與貢獻它的插件同壽，同一 `id` 的第二次注冊拋錯（[擴展席位](../../packages/client/ui-sidebar-right/README.zh.md#extension-seats)）。定義是靜態的：沒有運行時 hook，沒有按 tab 或按會話的東西。

| 字段 | 含義 |
|---|---|
| `id` | 該實現的身份，在所有注冊中唯一；包名是自然取值（`@deepseek-ai/dsh-client-ui-sidebar-files`）。正文與標題坑位按它注冊。 |
| `kind` | 類型的判別名：它的 tab 是什么，也是 `openTab` 點名的對象。不唯一——extension 可以接管 builtin 的 kind。內置 kind 為 `guide`、`text`、`files`。 |
| `patterns` | 可選的資源地址 glob；按 kind 打開的頁面類型省略。含 `:` 的模式匹配整個地址（`dsh-resource://file/**`）；不含的匹配 URL 的路徑部分且任意深度都中（`*.md`），不是 URL 的地址不會命中此類模式。匹配不分大小寫、不隱藏 dotfile；語法為 picomatch 的 POSIX 方言。 |
| `priority` | 三檔字面量之一：`extension`（缺省且最高：產品之外的類型壓過所有內置查看器）、`builtin`（隨產品發布的類型）、`fallback`（任何更具體的類型都應壓過的純內容查看器）。 |
| `canOpen(address)` | 可選的同步否決，對 glob 命中生效；每次路由決策都會調用。 |
| `title(address)` | chip 文本，在 tab 打開時捕獲進布局記錄，之后不再改寫。 |
| `guide` | 可選的引導頁入口框：`{ order, title(), description?(), icon? }`。點一框即把貢獻它的類型作為頁面打開；省略即不上引導頁。 |

路由是一次排序認領。`candidates(address)` 對模式命中且未被 `canOpen` 否決的類型排序：先按檔，再按最長命中模式的長度，最后按注冊順序。`claim(address, kind?)` 取第一個候選，或直接用點名的 `kind`——跳過它的 glob，但 `canOpen` 仍生效——返回 `{ kind, contentId: address, title }`。沒有任何類型認領的地址會拋錯：這是接線錯誤，不是用戶錯誤。

同一個 `kind` 可同時攜帶一個 `builtin` 與一個 `extension` 注冊。extension 在認領、`get(kind)`、`openTab(kind)` 與引導頁上生效，席位按生效定義的 `id` 找 tab 的正文與標題，不涉及任何 slot 優先級；extension 注銷后 builtin 恢復。kind 上的其它任何撞名以及任何重復的 `id` 都拋錯。

```ts ignore-check
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'

export const inject = ['sidebarRightTabs', 'slots']

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: '@acme/dsh-client-ui-image',
    kind: 'image',
    patterns: ['*.png', '*.jpg', '*.gif', '*.svg'],
    canOpen: address => address.startsWith('dsh-resource://file/'),
    title: address => address.slice(address.lastIndexOf('/') + 1),
  }), 'image type')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab', key: '@acme/dsh-client-ui-image' },
    ImageBody,
  )), 'image body')
}
```

## 導航：`ctx.sidebarRight`

兩種打開構成導航控制器，進入這一列的每條路都調用其一：`openResource(address, options?)` 打開 `dsh-resource://` 地址——會話區的文件鏈接、工具行的行號引用、文件樹的行；`openTab(kind, options?)` 打開頁面——tab 條的新增控件、引導頁入口框。兩者都以一條歷史記錄走完四步——認領（注冊表為資源排候選，或點名 `kind` 的生效實現應答）；聚焦已顯示同一 `(kind, address)` 的 tab；否則落一個新 tab；展開這一列——然后把導航記入 Tab 域（[服務](../../packages/client/ui-sidebar-right/README.zh.md#ctxsidebarright)）。用戶看不見的內容不算打開，所以折疊的列會在同一步展開。`openResource` 對 `dsh-resource://` 之外的地址或無人認領的地址拋錯；`openTab` 對無人注冊的 kind 拋錯：二者都是接線錯誤，不是用戶錯誤。

| 選項 | 含義 |
|---|---|
| `paneId` | 新 tab 落到這個 pane；缺省為活動的停靠 pane（活動的是浮窗時取第一個停靠 pane）。 |
| `replaceTab` | 占用這個 tab 的 pane 與條上位置，并在同一步關閉它；浮窗里的 tab 讓不出位置，新 tab 按未指定位置落位。 |
| `revealIfOpened` | 缺省 `true`：已顯示同一 `(kind, address)` 的 tab 被聚焦并收到 `params`。`false` 則無論如何再開一個。 |
| `kind`（僅 `openResource`） | 點名打開類型而不排候選；該 kind 的生效實現打開地址，它的 `canOpen` 仍生效。 |
| `params` | 給正文的導航參數，作為 `navigation.params` 送達。`openResource` 按資源類型經聲明合并表 `SidebarRightResourceParamsMap` 定型（文本預覽聲明 `{ line?: number }`）；`openTab<K>` 按 kind 經 `SidebarRightTabParamsMap` 定型，未聲明的 kind 為 `undefined`；正文讀到的是二者聯合 `SidebarRightNavigationParams`。值按約定為 JSON 形狀，運行時不校驗。 |

落位是調用方的選項，從不是類型的屬性。會話區調 `openResource(fileAddressFor(sessionId, cwd, path))`，`read` 工具行另加 `{ params: { line } }`（來自調用的 1 起 `offset`）；引導頁入口框調 `tab.actions.openTab(entry.kind, { replaceTab: true })`；文件樹的行調 `tab.actions.openResource(address)`；tab 條的新增控件調 `openTab('guide', { paneId, revealIfOpened: false })`。

`close(tabId)` 關閉一個 tab；`active()` 返回活動 pane 的活動 tab；`isExpanded()` 與 `toggleExpanded()` 讀取與翻轉這一列，翻轉記入序列。無會話時讀操作返回 `undefined` 或 `false`；寫操作需要已掛載的會話面，沒有時拋錯而不是寫進沒人繪制的面。

`focus(tabId)` 讓一個 tab 成為其 pane 的活動 tab；`split(paneId?)` 分割活動的停靠 pane 或點名的 pane，返回新 pane 的 id——pane 數預算或列寬不允許時返回 `undefined` 且不記賬；`float(tabId, rect?)` 把一個 tab 浮出為浮窗 pane；`dock(paneId)` 把浮窗 pane 收回停靠區。四者都走 store 既有動作、各記一條歷史；目標不存在或已處于目標狀態時是空操作，與 `open` 一樣在沒有已掛載會話面時拋錯。`TabId`、`PaneId`、`TabRecord`、`FloatRect` 自本包 `/client` 入口再導出，調用方無需引 dockkit。

## Slot 與 owner props

Sidebar 聲明四個擴展 slot；其文檔 tab 另行聲明下表中的 keyed 文檔正文 slot（[層級](slots.zh.md)）。

| Slot | Cardinality | 用途 |
|---|---|---|
| `sidebar.right.pane.tab` | 按定義的 `id` keyed，會話作用域 | 一個 tab 的正文。席位把 tab 分發到其 kind 生效實現的 `id`，因此注冊者收到該 kind 的每個 tab，停靠或浮窗。實現沒有注冊正文的 kind 渲染 owner 的「無法查看此內容」提示。 |
| `sidebar.right.pane.tab.title` | 按定義的 `id` keyed，會話作用域 | chip 的標題，owner share 與正文相同。可選：沒有條目時 chip 顯示打開時捕獲的 `title(address)` 文本；有活標題的類型在此讀自己的 store。 |
| `sidebar.right.tab.guide` | chain，會話作用域 | 替換引導 tab 的內容而不替換 tab；第一個不拒絕的條目接管正文，否則渲染自帶引導。 |
| `sidebar.right.tab.menu.item` | list，會話作用域 | 追加在 kit 自身布局動作之后的內容級動作。執行了動作的條目必須調用 owner 的 `dismiss()`。 |
| `sidebar.right.tab.document` | 按文檔實現的 `id` keyed，會話作用域 | 文檔 tab 內選中的文件渲染器；父組件擁有共享加載與工具欄控件。 |

正文、標題與引導頁替換項接收框架注入的 `useTabInfo()`。它返回 `{ sidebar, panel, tab }`：`sidebar` 包含 `expanded` 與 `fullscreen`，`panel.id` 標識所屬窗格，`tab` 包含記錄字段以及 `visible`、`navigation`、`signal` 和 `actions`。停靠正文僅在展開且活躍時可見；停靠標題只要求展開；浮窗保持可見。`signal` 在記錄消失或插件卸載時中止，不因隱藏或切換 Session 而中止。`tab.actions` 提供綁定到標簽所屬 Session 的 `openResource`、`openTab` 與 `close`。打開位置缺省為當前所屬窗格；`revealIfOpened` 缺省為 `true`，`replaceTab: true` 在同一歷史項中替換本記錄。菜單項保留普通的 `tab` 與 `dismiss` owner 參數。

`navigation.revision` 在每次導航到該 tab 時遞增，`params` 不變也遞增，正文可僅憑「又被導航了」行動；按地址打開的 tab 為 `1`，沒有人按地址打開的記錄——種入的引導、撤銷恢復的 tab——為 `0`。Tab 域為每條打開的記錄保有一個 occurrence：記錄出現即在資源模型里釘住，因此切換 tab 卸載正文也不丟內容；記錄消失即中止并丟棄；撤銷恢復的記錄是新的 occurrence（[Tab 域](../../packages/client/ui-sidebar-right/README.zh.md#the-tab-domain)）。

## 文檔渲染器

`text` tab 是共享的 Document Preview 所有者。其[根注冊](../../packages/client/ui-sidebar-documentpreview/src/client/index.ts)聲明 `sidebar.right.tab.document` 并提供 `ctx.documentPreviews`。渲染器在自己的 effect 中注冊 `DocumentPreviewDefinition` 元數據，再通過 `ctx.slots.inject('sidebar.right.tab.document', ...)` 等待 slot，以 `key: definition.id` 和自己的 locale 命名空間注冊組件。切換渲染器不改變 tab 或資源地址；[擴展決議](../../.agents/notes/implemented/architecture/2026-09-08-document-preview-operations.zh.md)將預覽策略與資源歸屬分開。

[注冊表](../../packages/client/ui-sidebar-documentpreview/src/client/document/registry.ts)記錄唯一的 `id`、`extensions`、本地化 `title()`、`loading`，以及可選的 `priority` 和 `wrap`。后綴匹配不區分大小寫，先排 `extension`（缺省值）、再排 `builtin`，隨后比較后綴長度（長者優先）與注冊順序。與 tab kind 替換不同，注冊表保留所有實現；工具欄列出匹配的候選，按 tab 記住選擇。未知擴展名使用純文本。`loading` 為 `text-pages` 或 `bytes-complete`；`wrap` 聲明是否支持共享的源碼換行控件。

[`DocumentPreviewProps`](../../packages/client/ui-sidebar-documentpreview/src/client/document/contract.ts) 派生自 `PropsRuntime<'sidebar.right.tab.document'>`。owner 提供原始 `resourceAddress`、`content` 與當前 `wrap`：文本內容為 `{ kind: 'text', text, pages: [{ offset, text, lines }], eof }`，其中 `text` 為累積文本；完整字節為 `{ kind: 'bytes', data }`，其中 `data` 為 `Uint8Array<ArrayBuffer>`。這些瞬時緩沖區按只讀方式借用，不得進入持久布局或 Session JSON。PDF 在轉移到 Worker 前復制字節，以保留 owner 的緩沖區。子組件收到同一個框架綁定的 `useTabInfo`，以及全局共享、僅提供元數據的 `useResource`。父組件通過普通 inject 回調調用 `remote.workspaceFiles.read`/`readAll`，擁有追加分頁、逐 tab 刷新與加載狀態。HTML 自己的 inject 回調使用 `readRelated`；路徑由 Host 代碼解析。Markdown 和代碼在追加期間保留同一個增量渲染器，到 EOF 完成最終解析；HTML 和 PDF 接收完整字節。

Preview 記錄已載入版本和讀取開始時的觀察版本。刷新只重讀當前 tab，不改變共享元數據或其他 tab 的內容。讀取不具備事務性；版本是不透明的相等性令牌，不是可排序的時間戳（[資源觀察與 Preview RPC](../../.agents/notes/implemented/architecture/2026-09-08-document-preview-operations.zh.md)）。

## 資源模型

模型本身見[客戶端資源](client-resources.zh.md)；本節只寫 Sidebar 依賴的部分。一份資源是一個地址，資源地址是 `dsh-resource://<type>/…` 形式的 URL，小寫 host 即協議鍵。協議所屬的客戶端包用 `ctx.resources.register(provider)` 在自身生命周期內注冊唯一的提供方；同一協議的第二個提供方拋錯（[提供協議](../../packages/client/resources/README.zh.md#provide-a-protocol)）。提供方是 `{ protocol, open(address, { signal }) }`：`open` 產出 `RemoteResult` 幀——首幀是當前狀態，之后每次變化一幀——并在 `signal` 中止時停下；失敗是 `{ ok: false, error }` 幀而不是拋錯，流里拋出的東西是編程錯誤，模型不捕獲。

`useResource<P>(address)` 是每個 slot 組件都有的全局標準 prop，不論作用域。它返回 `{ status, value, failure }`：地址協議沒有提供方或地址不是資源地址（`sidebar://guide` 不指向資源）時為 `none`，首幀之前為 `loading`，`live` 攜帶最新 `ok` 值，`failed` 在最后一個值旁攜帶最新幀的失敗。（[讀取資源](../../packages/client/resources/README.zh.md#read-a-resource)）。

資源有持有者就保持打開——訂閱中的 `useResource` 或一次 `ctx.resources.pin(address, signal)`；第一個持有者打開提供方的流，之后的持有者共享它并立刻讀到最新值，最后一個釋放時中止流并丟棄值。流只推元數據不推內容：`file` 的值是 `{ absolutePath, version, bytes? }`，消費方自己經 Workspace Files 服務按頁讀文件文本（[生命周期](../../packages/client/resources/README.zh.md#lifecycle)）。

## Workspace Files

Host 的 `ctx.workspaceFiles` 服務與生成的 `workspaceFiles` Remote 命名空間讀取 Session 文件系統后端允許的文件：`stat(path)` 返回 `{ absolutePath, version, bytes? }`；`read(path, { offset?, limit? })` 返回一頁行（`offset` 1 起，`limit` 受配置頁長限制），形如 `{ …stat, offset, text, eof }`；`readBytes(path, { offset?, length? })` 返回一個原始字節窗口（`offset` 0 起，`length` 受配置字節上限限制），形如 base64 的 `{ …stat, offset, data, eof }`、不做文本解碼。`list(path)` 仍限定在工作區根內，返回目錄的直接子項（`name`、`type: 'file' | 'directory' | 'other'`、`size?`），按配置上限截斷并置 `truncated`。`changes()` 同樣限定于工作區，訂閱就緒后產出 `{ kind: 'ready' }`，隨后產出 `{ kind: 'change', change }` 幀，其載荷為 `{ absolutePath, version }` 或 `{ absolutePath, absent: true }`（[README](../../packages/api/workspace-files/README.zh.md#use-this-package)）。文件操作拒絕末端符號鏈接并執行傳輸上限；`read` 還要求 UTF-8 文本。失敗使用 `workspace-file/*` 錯誤碼（[失敗](../../packages/api/workspace-files/README.zh.md)）。

[`dsh-api-workspace-files`](../../packages/api/workspace-files/README.zh.md) 注冊 `file` 提供方，`ResourceProtocolMap.file` 直接是 `WorkspaceFileStat`。Session 地址攜帶授權 Session 與相對或絕對路徑，Host 原樣接收并解析。提供方在 stat 前等待 Host 的 `ready` 幀，并按 `stat.absolutePath` 過濾變更。裸 `absolute` 地址沒有授權 Session，以 `workspace-file/unknown-workspace` 失敗，不借用當前或 Tab Session。任何 UI（包括 Global）訪問同一完整地址都共享觀察。Preview 的普通 Remote 回調使用地址中的 Session；Host `readAll` 和 `readRelated` 保留，字節結果由 Preview 的 `rpc.ts` 解碼。

## 內置類型

- **`guide`**——`builtin`，以 `openTab('guide')` 打開。一枚弱化的羅盤位于各類型按 `order` 貢獻的入口膠囊上方；入口較少時顯示已注冊的描述，未提供圖標的入口統一使用內置占位符。點選膠囊即在引導 tab 的位置把貢獻它的類型作為頁面打開。每個 pane 最多一個引導 tab，tab 條的新增控件只在本 pane 沒有引導時出現。新 pane 使用已注冊的默認頁：只有一個引導入口時直接使用該入口，否則使用引導頁（[引導](../../packages/client/ui-sidebar-right/README.zh.md#the-guide)）。
- **`text`**——`fallback`，`dsh-resource://file/**`，只認領 Session 地址。Document Preview 通過 `useResource<'file'>` 觀察元數據，經 Remote 回調加載內容，并擁有渲染器選擇、工具欄、逐 tab 刷新、滾動與源碼定位；未知擴展名按純文本渲染（[README](../../packages/client/ui-sidebar-documentpreview/README.zh.md)）。
- **`files`**——`builtin`，以 `openTab('files')` 打開。工作區目錄樹，經 `list` 懶加載，用 `tab.actions.openResource(fileAddressFor(sessionId, root, path))` 在自己所在 pane 打開文件（[README](../../packages/client/ui-sidebar-files/README.zh.md)）。

<a id="not-built"></a>
## 不做

- 持久化：布局狀態只在內存里；刷新后每個會話從折疊開始，任何會話的 tab 都不會出現在另一個會話里。
- `ctx.sidebarRight` 上的只讀布局快照或訂閱：服務只暴露操作，dockkit 的 `LayoutState`/`LayoutOp` 是內部的。
- 服務上的能力探測數組（`features`）。
- tab 類型的 `option` 優先級檔：沒有「只列出、不許認領」的 tab 類型。
- 改寫記錄的標題：`title(address)` 只捕獲一次；活的 chip 來自標題 slot，而不是記錄。
- 打開時點名某個 tab 實現：`openResource` 最多點名一個 kind；文檔渲染器由文件 tab 的工具欄選擇。
- 服務上的地址查找（`find`）：調用方用 `revealIfOpened` 打開，由停靠面去重。
- Sidebar 自身 `sidebar://<kind>` 記賬之外的導航地址；其語法等導航控制器整體做時再定。
- 面向用戶的撤銷、內容導航棧與 tab 圖標（[暫緩](../../.agents/notes/implemented/feature/2026-09-04-right-sidebar-docking-infrastructure.zh.md#deferred)）。
