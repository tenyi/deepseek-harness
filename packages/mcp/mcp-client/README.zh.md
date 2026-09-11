---
description: "面向部署方與維護者的 MCP 客戶端橋接說明，用于選擇、配置或排查連接到外部 MCP 服務器、并將其工具注冊到 ctx.tools 的插件。"
kind: "package-reference"
---

# @deepseek-ai/dsh-mcp-client

[English](README.md) | 中文

## 概述

`dsh-mcp-client` 讓模型把外部 MCP（Model Context Protocol）服務器的工具當作 harness 原生工具調用。每臺服務器配置一條記錄，其工具便會以穩定名稱出現，例如 `mcp__github__create_issue`。可將它用于文件系統、GitHub、數據庫、記憶或其他 MCP 工具服務器；默認不啟用任何服務器。工具定義會為每次模型請求增加 token；緩慢或崩潰的服務器可能延遲啟動，或讓工具調用失敗直至恢復。本包只橋接工具；MCP 資源與提示詞不受支持。

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

當模型需要把外部 MCP 服務器的工具當作原生工具調用時，添加 `dsh-mcp-client`。每臺服務器一條配置項就是全部設置：給服務器一個簡短的唯一名稱和一種傳輸方式，它的工具就會以 `mcp__<serverName>__<tool>` 形式出現。服務器作為本地程序運行時選擇 stdio，作為服務運行時選擇 Streamable HTTP。如果你已經用其他客戶端連接過 MCP 工具服務器，同樣的配置行在這里也能用。

### 最小配置

每臺服務器添加一條配置項即可，無需其他內容。harness 啟動后，服務器的工具會出現在模型的工具列表中。

```yaml
- id: mcp-github
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: github
    transport: stdio
    command: npx
    args: ['-y', '@modelcontextprotocol/server-github']
    env:
      GITHUB_TOKEN: !!js process.env.GITHUB_TOKEN

- id: mcp-web
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: web
    transport: streamable-http
    url: http://localhost:3000/mcp
    headers:
      Authorization: !!js '`Bearer ${process.env.MCP_TOKEN}`'
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `transport` | 必填 | `stdio` 或 `streamable-http` |
| `serverName` | 必填 | 服務器工具名稱的 namespace；`[A-Za-z0-9_-]{1,32}`，在一個注冊作用域內唯一 |
| `command` / `args` / `env` / `cwd` | — | stdio：可執行文件、參數、合并到清洗過的環境之上的額外環境變量、工作目錄 |
| `url` / `headers` | — | streamable-http：端點 URL 與額外請求標頭 |
| `toolCallTimeoutMs` | `60,000` | 每次 `tools/call` 調用的超時 |
| `failOnStartupError` | `false` | 初始連接或工具同步失敗時拒絕插件激活 |
| `reconnect.enabled` | `true` | 連接丟失后自動重新連接 |
| `reconnect.initialDelayMs` | `500` | 首次重連延遲；每次連續失敗嘗試翻倍 |
| `reconnect.maxDelayMs` | `30,000` | 退避上限；同時是重置嘗試預算所需的正常運行時長 |
| `reconnect.maxAttempts` | `10` | 每次中斷內連續失敗嘗試次數上限，超出后放棄 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-mcp-client)是每個受支持字段的窮盡式真源。

啟動后，服務器的工具會以 `mcp__<serverName>__<tool>` 形式出現——試著用一條提示詞調用其中一個。如果初始連接失敗，harness 仍會啟動，但該服務器的工具不會出現，并會記錄一條錯誤；設置 `failOnStartupError: true` 可讓啟動失敗改為中止 harness。

### 工具命名與共存

模型看到每個工具都帶有穩定的服務器限定名稱：`mcp__<serverName>__<rawName>`，例如 `mcp__github__create_issue`——與 Claude Code 和 Codex 使用的命名形態相同。只要服務器保持相同的工具名稱，名稱就保持不變，因此會話歷史與權限規則在重啟和重載后仍然有效。兩個服務器可以同時提供名為 `search` 的工具，分別以 `mcp__github__search` 和 `mcp__web__search` 共存。

- 發布相同工具名稱（例如 `search`）的兩個服務器會在各自的 namespace 下共存。
- 兩條配置項使用相同的服務器名稱時，后加載的一條會在加載時以明確錯誤失敗。
- 服務器在工具列表中兩次列出同一工具時，其工具列表會被作為無效列表拒絕，上一組工具保持可用。
- `tools/list` 返回重復的非空續傳游標時會立即拒絕本次更新，包括經過空頁的循環；上一組工具保持可用，后續更新仍可成功。
- 工具更新與已有工具名稱沖突時，該更新會被整體拒絕——絕不會得到該服務器的部分工具集。

### 調用工具與讀取結果

模型調用 MCP 工具時，調用會以每次調用超時（默認 60 秒）發往遠程服務器，并像其他工具調用一樣可以取消。結果按塊順序以普通文本返回；資源鏈接以文本形式顯示名稱與 URI。如果服務器報告錯誤，調用會明確失敗——模型不會看到虛假的成功。

當前模型接受圖片輸入且 harness 啟用了附件功能時支持圖片；圖片會像其他圖片一樣出現在對話中。不支持圖片時——以及服務器返回音頻或嵌入資源時——模型會看到清晰的診斷消息，而不是什么都沒有。

### 啟動、工具更新與重連

服務器的工具會在 harness 開始首個輪次之前出現。服務器更改工具列表時，模型的工具集會自動更新；更新失敗時，上一組工具繼續可用。

服務器連接斷開時——例如本地服務器進程崩潰——插件會以從 500 ms 起逐次翻倍、上限 30 s 的延遲自動重連，并刷新工具集；重連進度在日志中可見。中斷期間最后已知的工具仍會列出，但對它們的調用會失敗，直到服務器恢復。連續失敗十次后，該服務器的工具會被移除，重連停止，直到你重載配置或重啟 harness；服務器持續連接一段時間后，該計數會重置。設置 `reconnect.enabled: false` 可禁用自動重連——此時工具在斷開后仍會列出，但調用失敗，直到你重載。編輯配置項會在原地重載服務器連接，未變的名稱保持不變。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋橋接背后的設計決策，并指出實現它們的代碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

- **服務器限定身份。** 每個 MCP 工具都有穩定的身份 `(serverName, rawName)`。namespace 是本地配置，絕不采用遠程 `serverInfo.name`——遠程名稱不可信、在部署間不唯一、且升級時可能變化，這些都不允許靜默重命名面向模型的工具。
- **命名是固定約定。** 公開名稱是 `(serverName, rawName)` 的純函數，并滿足 DeepSeek 函數名稱約定；有損規范化會追加 12 位十六進制 SHA-256 hash，使不同身份絕不會折疊。會話歷史與權限規則因此能在 HMR（熱模塊替換）、重新同步和其他服務器變化后保持有效。
- **原始名稱是唯一的協議名稱。** `tools/call` 始終收到原始名稱；公開名稱絕不會發給服務器，也絕不會被解析來還原原始名稱。
- **要么完整世代，要么沒有。** 同步會原子地交換世代：獲取失敗保留上一世代，注冊沖突則回滾整個嘗試中的世代。
- **一個規范值，一個投影。** 執行器返回協議完整的規范 `McpResult`；另一個有序投影準備 Native 內容，`finalizeContent` 只在注冊表的執行后結果未變時安裝它，因此策略塊與值替換保持權威。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`Config` schema、`serverName` 預留、激活等待 |
| [`src/connection.ts`](src/connection.ts) | 連接監督器：客戶端世代、重連策略、嘗試預算、dispose（資源釋放） |
| [`src/tools.ts`](src/tools.ts) | 工具橋接：發現、命名、注冊交換、執行、圖片投影 |
| [`src/transport.ts`](src/transport.ts) | 傳輸工廠：帶清洗環境的 stdio spawn、Streamable HTTP |
| — | 不發布運行時不變式伴生入口；MCP 世代會通過工具注冊表發揮作用，但橋接在異步重新同步后不提供獨立的服務器工具映射快照。 |

### 生命周期與同步

`apply` 解析重連策略、在當前注冊作用域內預留 `serverName`、啟動監督器，并等待初始連接加發現完成。獨立 agent（智能體）作用域可以復用相同 namespace，因為其工具與傳輸彼此隔離；同一作用域內重復會在加載時失敗。監督器把所有同步——初始、通知與重連——串行到同一條隊列，因此兩次同步絕不會交錯執行各自的先 dispose 后注冊交換。dispose 會取消待執行的重連、關閉活動客戶端、等待進行中的嘗試與排隊同步完全停穩，然后注銷當前世代。

監督器監聽 `notifications/tools/list_changed` 并排隊一次重新同步；獲取階段失敗時保留上一世代注冊，注冊沖突則回滾本次嘗試的世代。每次中斷共享一個嘗試預算：連續失敗達到 `maxAttempts` 次后工具被注銷、重連停止；連接存活超過 `maxDelayMs` 會重置預算。

### 工具執行內部細節

工具調用會發送一次未緩存的 `tools/call` 請求，攜帶原始 MCP 名稱、JSON 參數、中止信號與配置的超時；公開名稱絕不會發給服務器，也絕不會被解析還原。規范成功值是 `{ content: JsonValue[], structuredContent? }`，為程序化調用方與 PTC 模式調用方保留完整的 MCP JSON 塊。受支持且已聲明的 `outputSchema` 會驗證 `structuredContent`；不受支持的 schema 詞匯回退為不受約束的 `JsonValue`。MCP 的 `isError` 結果會在任何圖片持久化之前拋出，使注冊表產生失敗的工具結果。圖片批次會先整體解碼并校驗，再保存任一成員；任何拒絕都會把每張圖片投影為診斷文本。

### 環境清洗（stdio）

子進程環境以子進程 seam 的 `scrubbedParentEnv()` 為基座——刪除匹配 `/KEY|PASSWORD|SECRET|TOKEN/i` 的環境名稱與所有 `DSH_*` 名稱——再在其上合并配置的 `env`，因此顯式覆蓋得以保留。實際 spawn 由 MCP SDK 負責；本包共享清洗定義，而非 spawn 路徑。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從共享工具注冊表逐步進入橋接的設計證據與可運行的示例配置。

- [工具子系統參考](../../../docs/subsystems/tools.zh.md)——接收已橋接工具的 `ToolRuntime` 與 `ctx.tools.register()` 約定。
- [MCP 客戶端插件 Agent Note](../../../.agents/notes/implemented/feature/2026-07-07-mcp-client-plugin.zh.md)——命名不變式、發現與執行設計、備選方案與后果。
- [規范工具輸出約定 Agent Note](../../../.agents/notes/implemented/architecture/2026-07-20-canonical-tool-output-contract.zh.md)——MCP 結果如何映射進規范工具輸出約定。
- [第三方記憶 MCP 指南](../../../docs/user/guide/mcp-memory.zh.md)——使用本包的三份記憶服務器 overlay。
- [生成配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-mcp-client)——每個受支持配置字段及其源聲明。

-----

<a id="model-experience"></a>
## 模型體驗

### 已發現的 MCP 工具

#### 模型看到什么

初始發現成功后，每個已聲明的 MCP 工具都會顯示為名為 `mcp__<serverName>__<rawName>`（或其確定性規范化形式）的原生工具，并攜帶服務器提供的描述與輸入 schema。成功的重新同步——包括自動重連后的同步——會替換整個世代；對插件執行 dispose 或重連預算耗盡會移除該世代。

#### Token 影響

工具注冊期間，工具描述與輸入 schema 會進入每次請求；重新同步會替換而非累積 schema，服務器限定名稱也會為每個工具定義和調用增加 token。

#### KV Cache 影響

已發現工具集合及其 schema 不變時，工具定義前綴保持穩定。增加、移除、重命名或更改工具的重新同步會替換定義，并可能使從第一個變化的 schema token 起的復用失效；恢復未變列表的重連會生成完全相同的定義，前綴保持穩定。

### 工具調用歷史與結果

#### 模型看到什么

公開工具名稱和 JSON 參數保留在 assistant 歷史中。規范值始終為程序化調用方與 PTC 模式調用方保留完整的 MCP JSON 塊與可選結構化內容；受支持的圖片塊在確切路由能力得到證明后，按原始順序與文本一起投影。被拒絕的圖片、音頻、嵌入資源、資源鏈接與未知塊繼續以有界文本診斷可見；MCP `isError` 會在圖片持久化之前拒絕調用。

#### Token 影響

參數、映射后的文本與持久圖片引用保留到壓縮（compaction）發生時。內聯 MCP base64 只存在于執行局部的規范值中，絕不會復制進會話事件；提供方會從附件存儲讀取經過校驗的字節。音頻與嵌入資源載荷不會進入模型上下文。

#### KV Cache 影響

僅追加；新可見內容位于可復用請求前綴之后，不會使現有 KV-cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明你無法用本插件做什么、以及何時需要運維注意。它們是當前包約束，不是與其他 MCP 客戶端的對比，也不是任務積壓。

- **只橋接 MCP 的工具能力**——資源與提示詞沒有 harness 消費機制，暫緩實現。
- **啟動與發現超時繼承自 MCP SDK**——插件不暴露連接或發現超時；每次 `initialize` 與分頁 `tools/list` 請求都使用 SDK 默認的 60 秒請求超時，因此無響應的服務器或 cursor chain 在初始同步完成期間可能同時延遲激活與 teardown。
- **重連在傳輸關閉時觸發**——崩潰的 stdio 子進程會觸發重連；Streamable HTTP 失敗按請求經 SDK 傳輸自身的恢復機制暴露，因此不可達的 HTTP 服務器會按調用重試，而非由 supervisor 重新 spawn。
- **圖片是唯一的持久豐富結果橋接**——PNG、JPEG、WebP 與 GIF 在確切能力得到證明后進入 Native 上下文。音頻與嵌入資源載荷仍只存在于執行局部并帶明確診斷，資源鏈接只以文本保留名稱與 URI。
- **不強制執行不受支持的 MCP 輸出 schema**——已聲明 schema 使用 harness 子集之外的詞匯時，`structuredContent` 回退為 `JsonValue`。
- **要求基于任務的 MCP 工具在調用時被拒絕**——要求使用基于任務的執行（task-based execution）擴展的工具會拋出異常而非被橋接；該擴展未實現。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文：開放設計問題與尚未決定的探索方向。它明確不具權威性——已交付行為、限制與既定理由以上文、包代碼與所鏈接的 Agent Note 為準。

- 公開名稱算法是由測試固定的 v1 約定；發布后更改會破壞會話歷史與權限規則。
- 由 DSH 顯式擁有的連接與發現超時是開放的探索方向；SDK 的 60 秒默認值約束著啟動與 teardown。
- Streamable HTTP 的重連歸屬仍未決定：按請求重試是 SDK 行為，supervisor 也可以擁有 HTTP 世代。
- 橋接 MCP 資源需要 harness 側的注入決策（系統提示詞、按需或模型觸發）；橋接提示詞需要 harness 缺少的提示詞模板概念。
- 固定的 MCP SDK 仍在演化；上游破壞性變更需要更新橋接。

</details>
