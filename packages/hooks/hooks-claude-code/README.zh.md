---
description: "在 agent 運行期間使用你現有的 Claude Code hooks.json 或 settings 鉤子配置——阻塞提示詞與工具、附加上下文或強制繼續——供本橋接的用戶與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-hooks-claude-code

[English](README.md) | 中文

## 概述

`dsh-hooks-claude-code` 在 agent（智能體）運行期間執行你現有 Claude Code `hooks.json` 或 settings 文件中的 command 鉤子，無需重寫。受支持的鉤子會在會話、提示詞、工具、停止或 subagent 到達對應時刻時運行。它們可以帶模型可見的原因阻塞提示詞或工具調用、添加對話上下文，或強制模型再執行一個輪次。需要在 harness 中復用 Claude Code command 鉤子時選擇本包；沒有 Claude Code 對應物的行為應使用原生插件。

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

掛載本包并把 `configPath` 指向你的鉤子配置，你已有的鉤子就會在 agent 運行中的對應時刻開始觸發。在第一個鉤子生效之前無需其他設置。

### 何時選擇

當你持有 Claude Code `hooks.json`（或 `hooks` key 存放配置的 settings 文件）、且其中的 command 鉤子需要把關提示詞、工具與輪次時，使用它。沒有 Claude Code 對應物的行為請跳過它：原生插件擁有完整的 harness API，而本橋接只運行參考工具的 command hook 子集。

### 最小配置

```yaml
- name: '@deepseek-ai/dsh-hooks-claude-code'
  config:
    configPath: ./.claude/hooks.json
    pluginRoot: ./.claude/plugins/my-plugin
    projectDir: .
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `configPath` | 必填 | `hooks.json` 或 `hooks` key 存放配置的 settings 文件路徑 |
| `pluginRoot` | — | 替換命令字符串中的 `${CLAUDE_PLUGIN_ROOT}` |
| `projectDir` | 會話工作區 | 替換 `${CLAUDE_PROJECT_DIR}` 并設置 `CLAUDE_PROJECT_DIR` 環境變量 |
| `defaultTimeoutMs` | `600,000` | hook 未設置時的每 hook 超時（即 Claude Code 默認值） |
| `stderrSummaryMaxChars` | `500` | 持久化 `hook/result` stderr 摘要的字符上限 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-hooks-claude-code)是每個受支持字段的窮盡式真源。

### 你的鉤子能做什么

| 你的鉤子 | 運行時機 | 能做什么 |
|---|---|---|
| `SessionStart` | 會話開始時 | 附加該會話中模型可見的上下文 |
| `UserPromptSubmit` | agent 收到提示詞時 | 阻塞提示詞，或附加上下文 |
| `PreToolUse` | 工具運行前 | 阻塞工具，或在運行前請求批準 |
| `PostToolUse` | 工具運行后 | 帶反饋阻塞結果，或附加上下文 |
| `Stop` | 運行即將停止時 | 帶原因強制再執行一步 |
| `SubagentStart` | subagent 啟動時 | 向仍在運行的 subagent 附加上下文（僅限同進程） |
| `SubagentStop` | subagent 結束時 | 只觀測——不能阻塞或添加上下文 |

### 鉤子如何運行與失敗

- 鉤子在你的項目目錄（agent 的會話工作區）中運行，因此鉤子里的 `pwd` 與相對路徑指向你的項目，而非服務器啟動目錄。
- 命令字符串中的 `${CLAUDE_PLUGIN_ROOT}` 與 `${CLAUDE_PROJECT_DIR}` 會按你的配置替換，且每個鉤子進程都會設置 `CLAUDE_PROJECT_DIR`。
- 一份配置應用于整個進程：啟動時只讀取一次，相對 `configPath` 從啟動進程的目錄解析。
- 同一事件上的鉤子按配置順序逐個運行。
- 如果配置無法讀取或解析，橋接會記錄警告且不運行任何鉤子——agent 仍會啟動。
- 運行失敗的鉤子（命令錯誤或崩潰）會被記錄，agent 繼續運行。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋橋接背后的設計決策，并指出實現它們的代碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### Hook 點映射

每個受支持事件都面向一個 harness 擴展點：`SessionStart` 向新會話發射上下文（`agent/session-start`），`UserPromptSubmit` 與 `PreToolUse` 是能拒絕傳入動作的 waterfall（瀑布式事件）（`agent/pre-step`、`tools/pre-execute`），`PostToolUse` 是能帶反饋阻塞或向下游決策添加上下文的 waterfall（`tools/post-execute`），`Stop` 是串行監聽器，其阻塞結果通過 `steer()` 強制再執行一步（`agent/turn-stopping`）。兩個 subagent 事件面向 child 生命周期發射（`subagent/start`、`subagent/end`）：start 向仍在運行的同進程 child 注入上下文，stop 只觀測。僅提供上下文的 hook 總是先通過 `next()` 委托，再把帶來源的消息折疊進下游決策，因此后續監聽器仍可拒絕或改寫；阻塞決策映射為 `deny`（`PreToolUse` 為 `ask`）。逐事件接線位于 [`src/index.ts`](src/index.ts)。

### 載荷與環境

橋接從 `session_id`、字符串形態的 `transcript_path`、`cwd` 與 `hook_event_name` 的基礎字段加逐事件字段構建每個事件的 stdin payload。`transcript_path` 出于兼容性保留在 payload 中，但始終為 `''`：持久化 seam 不暴露產物路徑，且默認使用 Zstandard 壓縮的會話日志無法被 hook 腳本讀取。省略 `projectDir` 時，`CLAUDE_PROJECT_DIR` 按次默認到會話工作區，與鉤子運行的目錄一致；`${CLAUDE_PLUGIN_ROOT}` 與 `${CLAUDE_PROJECT_DIR}` 替換在配置解析時進行。

### Matcher subject 與串行執行

matcher subject 是工具名稱（`PreToolUse`／`PostToolUse`）、會話源（`SessionStart`），或常量 `agent_type` `general-purpose`（`SubagentStart`／`SubagentStop`——subagent seam 不攜帶每 kind 標簽）；`UserPromptSubmit` 與 `Stop` 忽略 matcher。匹配 hook 按配置順序串行運行，這使每個 hook 的 `hook/invoked`／`hook/result` 對在日志中相鄰，且最嚴格折疊與順序無關（`deny > ask > allow`）。

### 脫離運行與釋放

三個 emit 點（`SessionStart`、`SubagentStart`、`SubagentStop`）以脫離方式運行——沒有擴展點等待它們。每條運行鏈都會被跟蹤，對橋接執行 dispose（資源釋放）時會中止仍在運行的 hook 進程，并在 dispose 完成前排空 continuation（`createDetachedRuns`，位于 `dsh-hook-protocol`）。

### 設計理念

- **兼容適配器，而非強力工具。** 橋接的存在意義是運行現有 Claude Code 配置中顯式受支持的 command hook 子集；定制行為應放在同一批擴展點上的原生插件中。
- **添加上下文不是否決。** 僅提供上下文的 hook 會先通過 `next()` 委托，再把其消息折疊進下游 enter 決策，因此后續 `agent/pre-step` 或 `tools/post-execute` 監聽器仍可拒絕或改寫。
- **每個失敗點都受控。** 配置讀取／解析失敗與無效 matcher 不注冊任何內容；拋異常的脫離注入會被捕獲并記錄，而不是破壞會話啟動或循環。
- **dispose 必須達到完全停穩。** 脫離運行會被跟蹤并在釋放時排空，因此不會有 hook 進程或遲到回調超出 fiber 存活。
- **串行而非并發。** 匹配 hook 按配置順序串行運行：每個 `hook/invoked`／`hook/result` 對在日志中保持相鄰，且決策折疊與順序無關，因此結果與參考引擎的并發啟動一致，代價是串行化的延遲。

[hook-bridges Agent Note](../../../.agents/notes/archived/feature/2026-06-30-hook-bridges.md) 記錄了橋接設計與延期缺口；[hook-protocol-lib Agent Note](../../../.agents/notes/archived/feature/2026-06-30-hook-protocol-lib.md) 記錄了共享與逐方言的劃分。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：配置校驗、監聽器注冊、逐事件 payload、決策映射 |
| [`src/config.ts`](src/config.ts) | Claude Code 配置解析：受支持事件、matcher 校驗、命令替換 |
| — | 不發布運行時不變式伴生入口；本橋接發布 hook-protocol 會話事件，既有 companion 負責校驗每個結果所引用的調用事件。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從共享協議進入橋接設計，以及橋接所面向的擴展點。

- [hooks 組地圖](../README.zh.md)——同級組頁面及其包表。
- [hook 協議庫](../hook-protocol/README.zh.md)——本橋接應用的共享鉤子規則。
- [鉤子橋接 Agent Note](../../../.agents/notes/archived/feature/2026-06-30-hook-bridges.md)——橋接設計、決策映射與延期缺口。
- [攔截擴展點 Agent Note](../../../.agents/notes/implemented/feature/2026-06-30-interception-extension-points.zh.md)——橋接所映射的類型化 Decision 接口面。
- [生成的配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-hooks-claude-code)——每個受支持配置字段及其源聲明。

-----

<a id="model-experience"></a>
## 模型體驗

### Hook 提供的上下文

#### 模型看到什么

`SessionStart`、已接受提示詞、工具后與實時同進程 subagent-start hook 可以添加帶源歸因的上下文消息；阻塞 `Stop` hook 將原因添加為下一步 steering（中途引導）。遠程 child 注入沒有本地目標。

#### Token 影響

hook 不返回上下文時沒有成本。Hook 文本取決于數據，會被記錄，并在后續會話請求中重發，直到壓縮（compaction）。

#### KV Cache 影響

僅追加；新可見內容位于可復用請求前綴之后，不會使現有 KV Cache 條目失效。

### 已阻塞提示詞或工具結果

#### 模型看到什么

提供方提供的原因逐字傳遞。缺失原因時，已拒絕工具變為 `Error: blocked by PreToolUse hook`，已阻塞工具后反饋精確為 `blocked by PostToolUse hook`，阻塞 stop 則精確添加 steering `continue: blocked by Stop hook`；已阻塞提示詞不會產生任何模型可見消息，而是以 `blocked` 結束該輪次。`systemMessage` 與 `updatedInput` 會被記錄或警告，但在此實現中對模型不可見。

#### Token 影響

阻塞提示詞不會產生該提示詞對應的模型請求 token；拒絕或反饋會添加保留的回退或提供方文本；強制 continuation 需要另一個完整請求。

#### KV Cache 影響

已阻塞提示詞不發送請求，不會導致失效。拒絕、反饋與強制 continuation 上下文會追加在可復用前綴之后，不改寫前綴。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制描述你的 Claude Code 鉤子目前還無法通過本橋接做到的事情，以及行為與參考工具的差異。它們是當前包約束，而非任務積壓。

- **不支持的 hook 事件（Claude Code 當前 30 項中的 23 項）**——`Setup`、`InstructionsLoaded`、`UserPromptExpansion`、`MessageDisplay`、`PermissionRequest`、`PostToolUseFailure`、`PostToolBatch`、`PermissionDenied`、`Notification`、`TaskCreated`、`TaskCompleted`、`StopFailure`、`TeammateIdle`、`ConfigChange`、`CwdChanged`、`FileChanged`、`WorktreeCreate`、`WorktreeRemove`、`PreCompact`、`PostCompact`、`SessionEnd`、`Elicitation` 與 `ElicitationResult`。這些事件的配置會在配置組解析前被忽略，因此不支持的事件既不會使配置失效，也不會注冊 hook。比較基線是 Claude Code [官方 hook 事件參考](https://code.claude.com/docs/en/hooks#hook-events)。
- **`SessionStart` 只支持部分功能**——會消費 JSON `additionalContext`，但不支持純 stdout 上下文、`initialUserMessage`、`sessionTitle`、`watchPaths`、`reloadSkills` 與 `CLAUDE_ENV_FILE`。hook 脫離運行，因此上下文可能錯過第一個請求，payload 會省略 `model`、`agent_type` 與 `session_title` 等可選字段。
- **`UserPromptSubmit` 只支持部分功能**——支持阻塞與 JSON `additionalContext`，但不支持純 stdout 上下文、`sessionTitle` 與 `suppressOriginalPrompt`。除非被覆蓋，否則橋接還會使用自身 600 秒默認值，而非 Claude Code 的事件特定 30 秒 command 超時。
- **`PreToolUse` 只支持部分功能**——`deny` 與 `ask` 決策可用；`allow` 不會預審批，`defer` 不受支持，`additionalContext` 會被忽略，`updatedInput` 會被記錄 + 警告但不應用（見 [pre-tool-input-rewrite Agent Note](../../../.agents/notes/proposed/feature/2026-06-30-pre-tool-input-rewrite.zh.md)）。
- **`PostToolUse` 只支持部分功能**——支持阻塞反饋與 JSON `additionalContext`，但不支持 `updatedToolOutput` 與 `updatedMCPToolOutput`，`tool_response` 會展平為文本。
- **`SubagentStart` 與 `SubagentStop` 只支持部分功能**——兩者均報告常量 `agent_type` `general-purpose`，并在 Claude Code 報告父會話的位置使用 child 會話 id。Start 上下文是盡力而為，且只能到達仍在運行的同進程 child；stop 只觀測，無法阻塞 subagent 或向其提供上下文。Stop 省略 `agent_transcript_path`、`last_assistant_message`、`background_tasks` 與 `session_crons`，并始終報告 `stop_hook_active: false`。
- **`Stop` 只支持部分功能**——阻塞會強制另一個模型輪次，但 `stop_hook_active` 始終為 `false`，會省略 `last_assistant_message`、`background_tasks` 與 `session_crons`，且未實現連續阻塞上限。因此，無條件阻塞 hook 會在每個步驟中強制 continuation，除非它自我限制。
- **通用 payload 與輸出字段只支持部分功能**——已映射事件會省略 Claude Code 原本會提供的 `prompt_id`、`permission_mode` 與 `effort`，且 `transcript_path` 永不填充：它始終為空字符串，因為持久化 seam 不暴露產物路徑，且默認使用 Zstandard 壓縮的會話日志無法被 hook 腳本讀取。`systemMessage` 會被記錄 + 警告但不呈現；`{"continue": false}` 會被記錄但不會停止運行；`suppressOutput`、`stopReason` 與 `terminalSequence` 不會被應用。
- **Handler 與配置只支持部分功能**——只運行 shell 形態 command handler。會跳過 `http`、`mcp_tool`、`prompt` 與 `agent` handler；`args`、`async`、`asyncRewake`、`shell`、`if`、`once` 與 `statusMessage` 等 command handler 選項不會被遵循。匹配 handler 串行運行且不去重，而 Claude Code 會并行運行并對相同 handler 去重。一個進程級 `configPath` 會在加載時解析一次；尚未實現 Claude Code 的分層項目、用戶、插件與策略發現以及實時重新加載。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文：開放問題與尚未決定的探索方向。它明確不具權威性——已交付的行為、限制與既定理由以上文、包代碼和相關 Agent Note 為準。

上面的延期缺口就是工作隊列：按會話的 hook 配置發現、會話啟動投遞門、stop 循環防護，以及 `continue: false` 的運行級停止。目前均無設計；官方 Claude Code 參考是實現其中任何一項的基線。

</details>
