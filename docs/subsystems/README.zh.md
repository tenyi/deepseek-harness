# 子系統

[English](README.md) | 中文

每個子系統一頁，覆蓋 DeepSeek Harness 的全部子系統：它是什么、它操作哪些數據結構，以及——當它由某個 `ctx` 服務或事件作用域支撐時——一段生成的 **Cordis API** 小節，承載其服務與事件參考。本目錄與 [architecture.md](../architecture.zh.md) 互補：后者描述跨子系統的*行為*（服務映射、會話/輪次/步驟生命周期、事件分類體系）；這里的每一頁是單個子系統詞匯與接線的參考。

| 頁面 | 負責內容 |
|---|---|
| [core.md](core.zh.md) | `packages/core` 如何控制 agent loop（智能體循環）：逐包的循環說明、agent 創建與所有權（`AgentHandle`）、`Agent` 句柄的投遞/取消/攔截約定，以及全倉通用類型模式（`…Map → derived-union`、品牌化 id） |
| [llm-streaming.md](llm-streaming.zh.md) | `packages/llm` 的對話類型——`Message`/`ContentBlock`、組裝完成的模型請求、`StreamChunk` wire protocol 和適配器約定（adapter contract）、`BlockAssembler`，以及 `LlmAdapter` 提供方約定 |
| [token-meter.md](token-meter.zh.md) | 不可變的標量與位置回放度量，附帶已消費日志修訂號 |
| [scope.md](scope.zh.md) | 作用域注冊標識、dispatch 載體，以及擁有的 `Scope` 上下文 |
| [typert.md](typert.zh.md) | 遠程調用描述符、lookup/Context 聲明、Typert 注冊表，以及 Host Gateway/Client API 邊界 |
| [goal.md](goal.zh.md) | 持久 goal 標識、生命周期快照、激活、變更記錄與 Round 歸屬 |
| [schedule.md](schedule.zh.md) | 僅限會話內的提醒記錄、持久轉換、活動視圖與普通對話交付 |
| [todo.md](todo.zh.md) | todo 包的整列表條目類型、持久事件所有權、投影和未結束輪次不變式 |
| [commands.md](commands.zh.md) | 人類命令注冊表服務：定義、適配器發現、直接調用、結果與解析視圖 |
| [session.md](session.zh.md) | 完整的 `SessionEventMap` 變體目錄、`TurnEndReason`、`deriveMessages()`、執行封閉與獨立事件 |
| [persistence.md](persistence.zh.md) | 持久性 seam：`SessionPersistence`、JSONL 提供方、`session/flush`、崩潰恢復、`SessionHeader` |
| [settings.md](settings.zh.md) | 用戶設置 seam：`SettingsNamespace` 注冊、分層解析（默認值 → 組合 `base` → 用戶文檔）、owner scope、熱提交 |
| [credentials.md](credentials.zh.md) | 憑據 seam：配置中的 `CredentialRef` 引用（絕不含值）、按操作解析、對 UI 安全的 `CredentialInfo`、提供方來源層 |
| [session-query.md](session-query.zh.md) | 邏輯記錄、有界精確事件讀取、關系追蹤、語義篩選器/文檔與全文檢索結果頁 |
| [feedback.md](feedback.zh.md) | 綁定生命周期的逐消息反饋記錄、樂觀版本、伴隨記錄持久化與 Host Remote 約定 |
| [session-title.md](session-title.zh.md) | 持久標題快照、被引用的來源消息 seq 與異步提供方約定 |
| [session-reference.md](session-reference.zh.md) | 結構化跨會話引用：`SessionReferenceInput`/`Candidate`、prepared 消息上下文、穩定錯誤分類 |
| [system-prompt.md](system-prompt.zh.md) | 逐次組裝的上下文、工具提供方結果、提示詞段落與協作式組裝 |
| [tools.md](tools.zh.md) | `ToolDefinition` 完整字段、schema DSL、`ToolExecution`/`ToolResult`、工具展示 UI 類型，以及受保護的執行流水線 |
| [user-questions.md](user-questions.zh.md) | UI 支持的人工問答 seam：`AskUserQuestionRequest`、answer/options 詞匯、提供方 API、錯誤分類體系 |
| [approval.md](approval.zh.md) | 一次性用戶審批 seam：`ApprovalRequest`、`ApprovalOutcome`、逐會話策略、審計事件和 answerer 約定 |
| [attachment.md](attachment.zh.md) | 持久圖片標識與元數據、校驗輸入、經校驗讀取，以及 `AttachmentStore` seam |
| [shell.md](shell.zh.md) | bash 執行器 seam：`ShellExecRequest`/`Spec`、`ShellRunResult`、后臺 `ShellProcess` 句柄 |
| [subprocess.md](subprocess.zh.md) | 子進程 seam：完全顯式的 `SubprocessSpawnSpec`、基于偏移的輸出讀取器、不含分類的 `SubprocessOutcome`，以及受管 `DSH_*` 環境詞匯 |
| [terminal.md](terminal.zh.md) | 持久化終端 ID、后端/會話約定、發送就緒狀態、有界讀取與 owner 可見快照 |
| [sandbox.md](sandbox.zh.md) | 每會話策略解析與進程約束 seam：文件效果模式、執行/提供方策略、`ConfinedArgv`、強制執行與故障關閉錯誤 |
| [code-runtime.md](code-runtime.zh.md) | 代碼執行 seam：`CodeRunRequest`/`Result`、綁定命名空間、捕獲日志、`CodeRunFailure` 分類體系 |
| [extensions.md](extensions.zh.md) | 帶版本的動態 Cordis 插件與包、Host/Client 激活、審批、運行時檢查和生命周期清理 |
| [filesystem.md](filesystem.zh.md) | 文件系統 seam：`FsTarget`、讀/寫/編輯結果、觀測到的文件狀態、`FsErrorCode` |
| [lsp.md](lsp.zh.md) | LSP 導航 seam：`LspQueryRequest`/`Result`、`LspProvider`/`Service`、四種操作、`LspError` |
| [skills.md](skills.zh.md) | skill（技能）服務：發現優先級、`SkillSummary`/`SkillDefinition`、會話前綴目錄、面向模型的 `skill` 加載 |
| [compaction.md](compaction.zh.md) | 壓縮（compaction）seam：`compaction/*` 會話事件、`CompactionResult`、`CompactionEngine` 接口 |
| [subagent.md](subagent.zh.md) | subagent seam：命名提供方注冊表、`SubagentStartRequest`/`Result`/`Run`、啟動時與運行時能力拆分 |
| [agent-team.md](agent-team.zh.md) | Agent Teams：隱式 Lead 身份、具名 continuable teammate、持久 peer mailbox 與共享任務 DAG |
| [web.md](web.zh.md) | Web 訪問 seam：`WebSearchRequest`/`Result`、`WebFetchRequest`/`Result`、`WebFetchBody`、提供方可用性、`WebError` |
| [spill.md](spill.zh.md) | spill 存儲 seam：`SaveTextSpill`、`SpillOwner`/`SpillSource`、`SpillRef`、品牌類型 `SpillLocator` |
| [workflow.md](workflow.zh.md) | 工作流 seam：`WorkflowStartRequest`、`WorkflowMeta`、`WorkflowRun`/`Result`、`workflow/*` 事件載荷、`WorkflowError` 致命性 |
| [jobs.md](jobs.zh.md) | 后臺任務運行時：品牌化 `JobId`、producer 約定、消費方視圖和 `ctx.jobs` 服務行為 |
| [permission-presets.md](permission-presets.zh.md) | 權限預設層：`PresetSpec`/`PresetOption`、派生的 `custom` 狀態、僅記日志的 `permission/preset` 事件 |
| [plan.md](plan.zh.md) | 計劃模式：僅記日志的 `plan/mode` 狀態、待定選擇的沖刷、`PlanModeConfig`、`exit_plan_mode` 審閱流程 |
| [invariants.md](invariants.zh.md) | 運行時不變式注冊表：選擇配置 `Config`、`InvariantInstaller`/`InvariantFailure`、空配套插件約定 |
| [web-server.md](web-server.zh.md) | HTTP 載體：`WebRouteKind`/`WebRoute`、匹配順序、可認領的回退席位、index 渲染掛接點 |
| [webhook.md](webhook.zh.md) | 通過身份驗證的提供方交付、任意程序化規則，以及發起 Workspace 會話創建后不等待結果 |
| [storage.md](storage.zh.md) | 存儲子系統：后端約定（`StorageBackend`）、`StorageForms`、`DomainSpec`/`Domain`、`domain/changed` |
| [workspace.md](workspace.zh.md) | 工作區注冊表：`Workspace`/`WorkspaceId`、注冊與解析、與會話 `cwd` 的關系 |
| [web-client.md](web-client.zh.md) | 瀏覽器架構：啟動、Remote 通信、配對的 Client model、UI 適配器、Conversation 組裝、slot 與重連語義 |
| [client-modules.md](client-modules.zh.md) | Web 插件表：`dsh.client` 聲明、`WebBootGraph` 協議格式組合、bundle 路由與 index 掛接點 |
| [slots.md](slots.zh.md) | 類型化 Web UI 組合：聲明所有權、cardinality 與 scope、框架與功能注入、props 推導及已交付的層級結構 |
| [client-resources.md](client-resources.zh.md) | 客戶端資源模型：`dsh-resource://<type>/…` 地址、協議提供方與 `ResourceProtocolMap`、`useResource` 全局鉤子及其狀態、釘住與釋放 |
| [sidebar-right.md](sidebar-right.zh.md) | 右側 Sidebar：資源地址與導航地址、tab 類型注冊與路由、`ctx.sidebarRight` 導航服務、pane-tab slot 與 owner props、資源模型及 Workspace Files 服務 |
| [conversation.md](conversation.zh.md) | 目標無關的會話事件組裝：上下文標識、位置數據、回放路徑、視圖構建器與目標自有的渲染節點 |
| [session-projection.md](session-projection.zh.md) | 投影 seam：`SessionProjectionMap`、純函數 `ProjectionDefinition` 單元、`ProjectionSnapshot` 的一致切面、變更饋送 |
| [session-telemetry.md](session-telemetry.zh.md) | 對外會話上報能力 seam：`SessionTelemetryRecord`/`SessionTelemetrySeverity`、`SessionTelemetrySink` 約定和 `session-telemetry/record` 脫敏 waterfall（瀑布式事件） |

> 這些頁面上的類型聲明及其 JSDoc 與源碼等價，并由 `pnpm run verify-type-equiv` 檢查漂移（見 [development.md](../development.zh.md#documenting-types-verbatim-ts-type-equiv)）。普通塊保留完整聲明；`public-api` 塊保留去除實現體的公開 class 聲明。Cordis 服務與事件使用每頁生成的 **Cordis API** 小節。
