# DeepSeek Harness 架構

[English](architecture.md) | 中文

改動 `packages/` 下的任何內容之前，請先閱讀本文。本文假定你已了解 Cordis；如果尚未了解，請先閱讀[入門](cordis-primer.zh.md)或[教程](cordis-tutorial/index.zh.md)。

建議使用 agent（智能體）探索代碼庫并理解其架構。

## Cordis

[Cordis](cordis-primer.zh.md) 是 dsh 底層的框架：插件向共享上下文貢獻服務、類型化事件和可逆的副作用。產品的每一部分都是插件，包括模型適配器、工具注冊表、會話日志，以及 agent loop（智能體循環）本身，因此每個都可以從配置替換。

不存在需要打補丁的特權內核：擴展 dsh 的方式是把插件掛載到其他插件旁邊，而各項注冊都是副作用，會在其插件卸載時撤銷。

## Profile 與組合包

運行中的 `dsh` 是一棵插件樹，由啟動時按序疊加的各層組合而成。

**profile** 是存放在 Harness home 中的具名組裝。它列出自己疊放的組合包，存放自己安裝的樹外插件，并保存用戶自己的 `cordis.patch.yml`。`web`、`headless`、`sdk`、`sdk-minimal` 和 `acp` 作為模板隨發行版交付。

**組合包**是 Cordis 配置項及其掛載代碼的分發格式，因此它插入的內容始終可被其上各層 patch。

兩者都在各自的 `package.json` 中通過 `dsh` 字段聲明自己：`dsh.profile` 列出一個 profile 的組合包，`dsh.bundle` 指向一個組合包的 patch 文件。

[`dsh-base`](../packages/bundle/base/README.zh.md) 是 `web`、`headless`、`sdk` 與 `acp` profile 的共享第一層：模型適配器、工具、持久化、沙箱與審批策略、設置、憑據、遙測。[`dsh-web-app`](../packages/bundle/web-app/README.zh.md) 增加瀏覽器應用，[`dsh-headless`](../packages/bundle/headless/README.zh.md) 增加不帶服務器的一次性運行器，[`dsh-sdk-app`](../packages/bundle/sdk-app/README.zh.md) 增加 SDK JSON-RPC 服務器，[`dsh-acp-app`](../packages/bundle/acp-app/README.zh.md) 增加僅用于自動化的 ACP 服務器。[`dsh-sdk-minimal`](../packages/bundle/sdk-minimal/README.zh.md) 是刻意保留的例外：一個組合包擁有完整的顯式 SDK 配置樹，不應用 `dsh-base`。

各層按此順序應用在空條目列表之上：先按 profile 列出的順序應用每個組合包，然后是 profile 的 `cordis.patch.yml`，然后是 home 級的那份，最后是任意 `--patch` overlay。一條 patch 按 id 定位某個條目并替換其整個 config，或插入新條目。

自定義 profile 默認實時重載 patch。隨附的 `web` profile 使用實時重載；`headless`、`sdk`、`sdk-minimal` 和 `acp` 則只在啟動時應用一次所有配置層，因為一次性應用或 stdio 應用擁有工作之后，替換其依賴會破壞該生命周期。

要查看你的機器啟動的配置樹：

```sh
dsh --profile web --dump-config
```

它打印出的任何條目，都可以由你自己的 patch 替換。

組裝機制見 [app-boot](../packages/boot/app-boot/README.zh.md#profiles)；配置字段見生成的[配置目錄](config-catalog.zh.md)。

## 應用啟動

所有受支持的 Node 應用都從 `dsh` CLI 與具名 profile 啟動。隨附應用是 `dsh web`（刻意為 `--profile web` 保留的別名）、`dsh --profile headless`、`dsh --profile sdk`、`dsh --profile sdk-minimal` 與 `dsh --profile acp`。TypeScript SDK 會解析其同版本 `dsh` 依賴并選擇 `sdk`；自定義插件組合繼續由 profile 與有序 patch 文件表達，而不是另一個可執行文件或內聯應用樹。`sdk-minimal` 是位于同一 launcher 后的倉庫自有獨立組合包，而不是由調用方提供的 Cordis 配置樹。

Vendored CLI、僅用于構建和測試的可執行文件、進程內直接掛載插件以及私有瀏覽器 WebWorker 預覽都不屬于 Harness 應用啟動器。[`verify-application-entrypoints`](../scripts/verify-application-entrypoints.ts)將每個包 bin、可執行源碼與根 demo 歸入顯式類別，并拒絕任何繞過 `dsh` 的 Node 應用路徑。

Python SDK 遵循相同的應用架構。其運行時 wheel 把普通 `dsh` CLI 打包為 `deepseek-harness-sdk-runtime-<platform>-<arch>`，客戶端默認以顯式 Harness home 啟動 `dsh --profile sdk`。極簡示例選擇隨附的 `sdk-minimal` profile。Python 暴露 profile 選擇與有序 patch 文件，而不是完整 Cordis 樹；持久外部插件通過 `dsh plugin` 安裝。已刪除的私有直讀配置載體沒有兼容 bin 或回退 parser。

## 桌面應用

[Electron 桌面應用](../apps/desktop/README.zh.md)在簽名應用資源中攜帶精確版本的 dsh 生產運行時。保留的 `$DSH_HOME/profiles/desktop` 保存外部插件和指向宿主擁有包的鏈接；兼容升級保留插件文件并刷新這些鏈接，無需安裝核心依賴。CLI profile 共享 `$DSH_HOME` 下受支持的產品數據，而可執行包、插件激活、鎖文件和包管理器狀態保持獨立。

Electron 通過內置的上游 Node.js 進程啟動私有 Desktop Host 包；該包加載內置 dsh 后端、匹配的客戶端圖和已啟用的 profile 插件。一元 RPC、Remote stream 與版本匹配的客戶端資源經帶版本的分幀字節管道傳輸，Node IPC 只保留生命周期控制，再通過安全的 `dsh-app://` 協議到達渲染進程；因此桌面組合不會開放 Web server 或 loopback 端口。只有殼自有 UI 能通過內置 pnpm 及其私有 `$DSH_HOME/desktop/pnpm/store` 執行插件事務。

## 核心包

以下是向 Cordis 樹貢獻內容的部分核心包。

| 包 | 職責 | `ctx` 鍵 |
|---|---|---|
| [`core/session`](subsystems/session.zh.md) | 僅追加的 `SessionEvent` 日志和內存存儲 | `ctx.sessions` |
| [`core/system-prompt`](subsystems/system-prompt.zh.md) | 提示詞片段與工具 schema 的組裝 | `ctx.systemPrompt` |
| [`core/tools`](subsystems/tools.zh.md) | 作用域化的工具注冊表和帶把關的執行流水線 | `ctx.tools` |
| [`core/agent`](subsystems/core.zh.md) | `Agent` 接口、活躍 agent 注冊表和 `agent/*` 事件 | `ctx.agents` |
| [`core/agent-loop`](subsystems/core.zh.md) | 實現該接口的默認驅動器 | `ctx.agentLoop` |
| [`core/scope`](subsystems/scope.zh.md) | 按 agent 劃分作用域的注冊原語 | 庫，無 ctx 鍵 |
| [`llm/llm`](subsystems/llm-streaming.zh.md) | 消息與流式詞匯表，以及適配器 seam | `ctx.llm` |
| [`webhook/webhook`](subsystems/webhook.zh.md) | 已認證 delivery 的分派和 Workspace Session 創建 | `ctx.webhookRuntime` |

<a id="events"></a>

## 事件

事件就是擴展點，而選對事件域是大多數改動的第一個決定。

- **會話事件**是追加到日志并通過 `session/event` 廣播的持久事實。當某個事實必須在重新加載后仍然存在時，使用它。
- **Agent 事件**（`agent/*`）攜帶活躍 `Agent`：inbox、步驟、狀態、請求、驗證、續跑。要觀察或攔截進行中的工作時，使用它。
- **能力事件**無需導入循環即可向某個 seam（`fs/*`、`tools/*`、`telemetry/*`）附加策略和適配器。

[事件映射](event-producer-consumer.zh.md)列出每個事件的生產方與消費方。

<a id="turn-flow"></a>

## 輪次流程

一個**步驟**是一次模型請求加上它調用的工具。一個**輪次**包含零個或多個步驟：它在領取首條輸入之前打開，并在不再欠下任何工作時關閉。

```text
turn/start
  claim next-step input plus one queued message
  assemble prompt sections + tool schemas; project runtime context
  -> agent/pre-step                   reject | enter(messages, startsRequestSeries?)
     reject, or a first enter rewritten empty -> close the turn with no step
     step/start
     agent/request -> prepareCall (cancellation commits neither system nor users)
     reconcile system/message using the prepared call capability
     append entered messages as user/message; log request/header and request/context as needed
     derive and freeze model history from the log
     stream the bound prepared call -> llm/stream -> agent/assistant-stream start
       agent/assistant-stream chunk*
       assistant/message | assistant/attempt -> agent/assistant-stream end
     tool/call* -> tools/pre-execute -> tools/execute -> tools/post-execute -> tool/result*
     step/end
     tools owe another request, or next-step input arrived -> claim -> next step
  -> agent/turn-stopping
turn/end
```

`turn/*`、`step/*`、`system/message`、`user/message`、`assistant/message`、`assistant/attempt` 和 `tool/*` 是持久會話事件；其余是分屬三個事件域的實時擴展點。`agent/assistant-stream` 發布進程本地 start、瞬態 chunk 與 end frame。loop 會在 committed end frame 前把完整緊湊 stream 提交為一個 message 或僅日志 attempt；Web Session-follow adapter 是該 live event 唯一的遠程消費方。`agent/pre-step`、`agent/request`、`llm/stream` 和三個 `tools/*` 事件是 waterfall（瀑布式事件），其監聽器必須調用 `next()` 才能委托下去；`agent/turn-stopping` 是 serial 事件，沒有 `next()`。

輸入通過同一個 inbox 到達驅動器。有些消息會立即喚醒它；注入的上下文會留在 inbox 中，直到另一條消息將其喚醒。

`agent/pre-step` 決定接納的輸入。監聽器可以改寫或拒絕已領取消息；首次領取被拒絕或為空時，關閉不含步驟的持久輪次。enter 決策可設置 `startsRequestSeries`：循環記錄新的 `request/header`（原因為 `series`，或在封裝同時變化時為攜帶 `startsSeries: true` 的 `change`）。包裝監聽器通過 `{ ...decision, messages }` 保留該聲明。組裝與 `step/start` 之后，`agent/request` 和 `prepareCall()` 先解析實際路由，再提交系統提示詞與已接納用戶消息；在任一異步階段取消都不會提交這兩者。提示詞準入依據已準備調用的能力，而非先前的 `request/context`。每次嘗試同步協調同一份已渲染組裝結果、僅在首次嘗試追加用戶消息、按需記錄 header/context、派生并凍結請求，再通過綁定調用發起流式請求。重試不重復組裝或 `agent/pre-step`。附接后的 surface 替換開啟新請求序列，包括恢復后的首次 pre-step 中發生的替換；未變化的恢復延續序列。首次接納的步驟在用戶消息之前預留系統頭節點，即使提示詞為空（不產生協議消息）。提示詞僅通過 `system/message` 歷史傳遞：空渲染文本清除所有生效的系統節點，模型不再看到舊提示詞；具備能力的路由可在緩存前綴之后追加非空更新；不具備能力的路由與新請求序列將非空提示詞文本歸并到首個系統節點，并為非空的后續系統節點記錄空內容替換（[決策](../.agents/notes/implemented/architecture/2026-09-02-system-prompt-as-surface-node.zh.md)；[決策規則](../packages/core/agent-loop/README.zh.md#understand-the-implementation)）。

循環發送不可變請求，同時保留實時取消能力。只有已由該循環完整凍結的消息對象身份才能復用凍結證明；[agent-loop](../packages/core/agent-loop/README.zh.md)擁有請求構造規則。

詳情見[時序圖](agent-lifecycle.zh.md)、[工具流水線](tool-execution-pipeline.zh.md)和[取消與錯誤恢復](subsystems/core.zh.md#the-agent-handle)。

## 會話日志

會話日志是模型所見上下文的來源。`deriveMessages()` 從中投影出模型歷史。每個 `assistant/message` 都嵌入產生其組裝內容的精確緊湊帶時間 stream；`assistant/attempt` 保留已到達 settlement 的失敗、重試、取消與 stream error attempt，且不添加模型歷史。fork、恢復、transcript（文本記錄）、遙測與持久化都從這些持久 settlement 派生，實時 UI 增量則來自 `agent/assistant-stream`；如果進程在 settlement 前硬中斷，則不會留下持久 attempt stream（見[決策](../.agents/notes/implemented/architecture/2026-09-01-v2-embedded-assistant-streams.zh.md)）。

Session 消費方只了解當前邏輯格式。僅 header 的 `stat` 與 `list` 會重新掃描每個 Session 目錄，選擇數值最高的規范 generation，并在不加載事件或發布后繼的情況下轉換受支持的歷史 header。已存儲 Session 的 `open` 選擇同一 generation，拒絕未來版本，或只 Decode 并組合一次構建時靜態確定的相鄰遷移鏈，再返回經過校驗的當前邏輯事件。只讀 open 直接使用這份內存結果，不發布后繼；寫 open 則先編碼、校驗并在未改變源的旁邊排他發布最終版本命名的后繼。未被后續事件封住的普通中斷尾部仍由句柄消費方修復；只有在后續 `turn/start` 已經封住一種有限的已發布 restart 時，migration 才會插入缺失的 interrupted `turn/end`。JSONL v0 使用 `session.jsonl[.zstd]`，v1 及后續版本使用小寫 `session.vN.jsonl[.zstd]`；已提交 generation 路徑絕不重命名、替換或刪除。JSONL provider 負責物理 framing、壓縮、generation 選擇與排他發布，每個相鄰遷移包只負責一個 `vN -> vN+1` 步驟（[決策](../.agents/notes/implemented/architecture/2026-08-31-released-session-format-migrations.zh.md)）。

**模型可見即已記錄。** 抵達模型請求的一切都必須能從日志重建，并由一項運行時不變量斷言這一點。因此，新增一項模型可見輸入就需要新增一個會話事件：擴展 `SessionEventMap` 并從日志渲染。

**投影 seam。** `dsh-session-projection` 提供 `ctx.sessionProjections`：已注冊單元增量折疊已提交事件，host 消費方通過 `stateOf()` 讀取單個類型化狀態，載體通過 `snapshot()` 批量取得裁剪后的客戶端視圖。host 讀取方要么在激活時要求該服務，要么在注冊表或必需 key 缺席時明確失敗。貢獻方可以保留 `ctx.inject(['sessionProjections'], ...)` 注冊，但不能為缺失的 host 值靜默提供默認值。agent loop 為讀取方注冊共享的 `turnBoundary` 狀態（[決策](../.agents/notes/implemented/architecture/2026-08-19-session-projection-mandatory-seam.zh.md)）。

## 能力 seam

一個 **seam** 是一項可替換能力，包含三種角色：聲明接口的 **Service Definition**、實現它的 **Service Provider**，以及使用它的 **Consumer**（通常是面向模型的工具）。一個包可以合并承擔多個角色，但單一角色本身不是 seam；添加一項能力意味著把三者一并設計（[能力圖](capability-seams.zh.md)）。

seam 正是替換一個提供方就能改變整個產品的原因。文件系統與進程提供方共享同一個執行世界，因此把它們指向遠程沙箱，也就把 Bash、PTY 和 LSP 一并搬了過去，無需提供方專用 fork。[subagent 提供方](subsystems/subagent.zh.md)在同一個接口之后同樣千差萬別，從新建一個子 agent，到把一個輪次委派給另一個產品。

[實驗性 Agent Teams](subsystems/agent-team.zh.md) 是 `ctx.agentTeams` 上公開發布、顯式啟用的協作 seam，在可繼續 subagent 之上提供持久 roster、任務板和 mailbox。

## 新行為的歸屬位置

新行為附加到已有文檔記錄的擴展點。改動循環本身時，本映射隨之更新。

| 目標 | 機制 |
|---|---|
| 添加模型提供方 | 在 `ctx.llm` 上注冊其適配器 |
| 添加面向模型的能力 | 在 `ctx.tools` 上注冊；其 schema 加入提示詞組裝 |
| 讓某個會話擁有不同的能力集合 | 組裝一個 agent preset；其中的服務行需要 `isolate` realm |
| 添加 shell 執行 | 注冊 `ctx.shell` 后端；本地后端通過 `ctx.subprocess` spawn 進程 |
| 添加持久化終端執行 | 注冊 `ctx.terminals` 后端和 `dsh-tool-terminal` |
| 添加用戶命令 | 在 `ctx.commands` 上注冊；它無需模型輪次即可分派 |
| 添加后臺工作 | 在 `ctx.jobs` 上注冊；`job_*` 工具負責收集或停止 |
| 從外部 webhook 啟動 Session | 在 `ctx.webhookRuntime` 上注冊可信規則，并掛載提供方適配器 |
| 添加文件系統訪問或策略 | 注冊 `ctx.fs` 提供方，或監聽 `fs/*` 事件 |
| 限制所啟動的進程 | 使用 `ctx.sandbox` 后端；消費方在啟動進程前包裝 argv |
| 攔截請求、工具或輪次 | 使用相應的 `agent/*` 或 `tools/*` 事件；`agent/turn-stopping` 會停止輪次 |
| 添加模型可見上下文 | 調用 `agent.inject()`；它會落到下一次獲準的請求中 |
| 添加 UI 或編輯器集成 | 驅動 `ctx.agents` 并從 `session/event` 渲染 |
| 添加 Web Client Chat 節點 | 注冊 `ConversationNodeDefinition` + keyed renderer |
| 添加持久會話狀態 | 擴展 `SessionEventMap`；從日志渲染和回放 |
| 生成會話標題 | 注冊唯一的 `ctx.sessionTitle` 提供方 |
| 管理同會話目標 | 使用 `ctx.goals`；通過 `agent/*` 續跑 |
| 在輪次邊界 fork 會話 | `ctx.agents.create({ sessionId, seed, meta: { parentSession, seedLength } })`——只有經 agent-loop 發布的會話才會持久化 |
| 在新后端存儲會話 | 基于共享的句柄腳手架實現 `SessionPersistence`（`create`/`open`/`stat`/`list`/`export`） |
| 將注冊項限定到單個 agent | 使用該 agent 的 `agent.ctx` |

[擴展實操手冊](cookbook/extension-cookbook.zh.md)將功能映射到能力，并索引[包](cookbook/adding-a-package.zh.md)、[工具](cookbook/adding-a-tool.zh.md)、[LLM（大語言模型）適配器](cookbook/adding-an-llm-adapter.zh.md)和[設置卡片](cookbook/adding-a-settings-card.zh.md)的分步指南。[Conversation 子系統](subsystems/conversation.zh.md)負責 Chat node 組裝。
