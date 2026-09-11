<!-- 英文源文件由 scripts/gen-tool-catalog.ts 生成；本中文文件是通過雙語配對維護的經評審對側。
     更新時先運行 `pnpm run gen-tool-catalog` 更新英文，再更新本文件并運行 `pnpm run verify-translation-pairing --write docs/tool-catalog.md` 重新記錄配對。 -->

# 工具 Schema 目錄

[English](tool-catalog.md) | 中文

已發布插件向 `ctx.tools` 提供的所有面向模型的工具：模型通過系統提示詞組裝獲得的 `name`、`description` 和 JSON Schema `parameters`。本目錄是[子系統頁面](subsystems/core.zh.md)（類型及每頁生成的 `cordis-surface` 接線區域）的補充；本頁列出的是向 agent（智能體）提供的*工具*。

英文源文件由系統**生成**，并通過 `pnpm run verify-tool-catalog`（`doc-sync`（文檔同步門禁）的一部分）驗證新鮮度；本中文文件作為經評審對側通過雙語配對維護。與 Cordis 目錄（純源碼 AST 處理）不同，英文生成器會在真實上下文中**啟動**每個工具插件并讀取 `ctx.tools.schemas()`，因為工具 schema 無法通過靜態分析完全確定，例如運行時展開的枚舉、拼接的描述、由配置決定的名稱以及使用原始 JSON Schema 的 MCP 工具。完整性守衛會 glob 匹配 `packages/*/tool-*`；如果生成器的啟動 manifest（元數據清單）遺漏任何包，檢查就會失敗，因此新工具不會在無人察覺的情況下缺少文檔。

范圍：`packages/*/tool-*` 下已發布的產品工具，每個工具均使用其**默認**配置啟動；但如果某個 Config 字段是**必填項**且沒有默認值，生成器就必須作出選擇，對應包的說明會記錄本頁展示的是哪個分支。注冊的工具**名稱**可以是加載時配置，例如 `tool-subagent` 的 `toolName`，因此部署可能以不同名稱或額外名稱提供某個包；如果存在隨產品發布的別名，對應包的說明會予以記錄。`examples/` 中的演示工具（例如 `echo`）不在范圍內，這與 Cordis 目錄僅涵蓋包的范圍一致。

<a id="tool-package-map"></a>

## 工具包映射

下表將模型可見的工具名稱與其背后的插件包和服務 seam 對應起來。各包章節隨后給出確切的 JSON Schema。

| 工具包 | 模型可見名稱 | 依賴 | 寫入／影響 | 隨產品發布的別名 | 部署說明 |
| --- | --- | --- | --- | --- | --- |
| `@deepseek-ai/dsh-tool-ask-user` | `ask_user_question` | `ctx.tools`、`ctx.userQuestions` | `tool/call`、`tool/result after a UI/provider answers the question` | - | ask_user_question 會暫停工具調用，直到當前 UI 提供方返回人類答案。 |
| `@deepseek-ai/dsh-tools` | `run_code` | `ctx.tools`、`ctx.codeRuntime (execution time)`、`ctx.systemPrompt` | `tool/call`、`one tool/ptc-dispatch-start + tool/ptc-dispatch pair per bridged sub-call`、`tool/result` | - | 在 `mode: ptc`／`mode: both` 下，它由工具注冊表所有，作為可過濾能力層之外的保留傳輸機制（參見 PTC mode Agent Note）。在 `ptc` 下，它是注冊表對協議格式（wire format）的唯一貢獻；其他可見能力在使用已加載運行時語言生成的 SDK 章節中聲明。程序通過 binding 調用這些能力，調用按照原生并發約定調度：啟動順序和策略遵循提交順序，并發安全的函數體最多重疊執行 `maxParallelSubCalls` 個。調用會重新進入完整且受守衛保護的工具流水線，并將每個嵌套執行關聯到此外層結果。 |
| `@deepseek-ai/dsh-plan-mode` | `exit_plan_mode` | `ctx.tools`、`ctx.systemPrompt`、`ctx.userQuestions (execution time, opportunistic)` | `tool/call`、`plan/mode inactive on an approved review`、`tool/result` | - | 規劃未激活時，exit_plan_mode 仍保留在面向模型的 schema 中，這樣狀態轉換不會在規劃策略變更之外額外造成工具目錄變動。其執行路徑會拒絕規劃模式之外的調用；在規劃模式下，它通過用戶交互 seam 提交計劃（批準／根據反饋繼續規劃），批準后會在步驟邊界記錄規劃模式已停用。 |
| `@deepseek-ai/dsh-tool-bash` | `bash` | `ctx.tools`、`ctx.shell`、`ctx.systemPrompt`、`ctx.shellEnv`、`ctx.jobs at call time for run_in_background` | `tool/call`、`tool/result` | - | bash 工具是 bash 執行器 seam 面向模型的消費方。使用 `run_in_background` 的運行會注冊到通用 `ctx.jobs` 運行時，并通過 `job_*` 工具（來自 `@deepseek-ai/dsh-tool-jobs`）收集／停止；禁用 `enableRunInBackground` 配置（默認為 true）后，該參數會被完全移除。 |
| `@deepseek-ai/dsh-tool-present` | `present` | `ctx.tools`, `ctx.fs`, `ctx.sessionProjections` | `tool/call`, `deliverables/presented 在成功的最終結果之后`, `tool/result` | - | 交付歸調用方 Session 所有；Web ui-deliverables 提供源文件打開與卡片。 |
| `@deepseek-ai/dsh-tool-pwsh` | `pwsh` | `ctx.tools`、`ctx.shell`、`ctx.systemPrompt`、`ctx.shellEnv`、`ctx.jobs at call time for run_in_background` | `tool/call`、`tool/result` | - | pwsh 工具是 Windows 組合中 bash 執行器 seam 的 PowerShell 方言消費方（由 `@deepseek-ai/dsh-pwsh-local` 等 PowerShell 執行器為 `ctx.shell` 提供后端）；除沙箱接口外，它逐項對應 bash 工具調用。使用 `run_in_background` 的運行會注冊到通用 `ctx.jobs` 運行時，并通過 `job_*` 工具收集／停止；托管的 `DSH_*` 環境來自 `@deepseek-ai/dsh-shell-env`。每次調用都在新進程中運行，不使用持久 PTY 會話。路徑采用原生 `C:\...` 形式，變量采用 `$env:NAME`。 |
| `@deepseek-ai/dsh-tool-cordis` | `cordis_define`、`cordis_inspect_list`、`cordis_inspect_query`、`cordis_inspect_self`、`cordis_run`、`cordis_stop`、`cordis_undefine` | `ctx.tools`、`ctx.dynamicCordisRunner` | `tool/call`、`tool/result`、`process-local dynamic package lifecycle` | - | 不在任何隨產品發布的樹中，需要顯式選擇啟用；動態 Package 代碼可以訪問真實運行時，見 .agents/notes/implemented/feature/2026-07-08-self-referential-cordis-toolset.md。該工具集注入 `@deepseek-ai/dsh-cordis-host-runner` 提供的 `ctx.dynamicCordisRunner`，后者擁有定義注冊表和 vm 沙箱；組合缺少它時這些工具不會激活。運行中的 Package 在停止、undefine 或 DSH 重啟前可以注冊**額外的**模型可見工具；發生這類工具集變化時，系統會記錄完整且有變動的請求頭。 |
| `@deepseek-ai/dsh-tool-bash-persistent` | `bash` | `ctx.tools`、`ctx.terminals`、`an owning Agent at execution time` | `tool/call`、`PTY shell state`、`tool/result` | - | 一個按所有者隔離的持久 bash 工具；部署組合提供 PTY 后端，并可覆蓋面向模型的環境描述。 |
| `@deepseek-ai/dsh-tool-pwsh-persistent` | `pwsh` | `ctx.tools`、`ctx.terminals`、`an owning Agent at execution time` | `tool/call`、`PTY shell state`、`tool/result` | - | 一個按所有者隔離的持久 pwsh 工具，持久 bash 工具的 Windows 對應物；部署組合提供 pwsh 方言的 PTY 后端，并可覆蓋面向模型的環境描述。 |
| `@deepseek-ai/dsh-tool-str-replace-editor` | `str_replace_editor` | `ctx.tools`、`ctx.fs` | `tool/call`、`fs/observed after view presence/absence, edit absence, or successful mutation`、`tool/result` | - | 基于文件系統 seam 的獨立查看／創建／唯一字面量替換／按行插入工具；可與任何 shell 或終端接口組合。 |
| `@deepseek-ai/dsh-tool-fs` | `edit`、`read`、`read_image`、`write` | `ctx.tools`、`ctx.fs`、`ctx.systemPrompt`、`ctx.attachments (image-tool registration)`、`ctx.llm + an image-capable route (image-tool execution)` | `tool/call`、`fs/write-intent or fs/edit-intent for mutations`、`fs/observed after read presence/absence or successful file operation`、`durable attachment (read_image)`、`tool/result` | - | 先讀后寫／編輯策略由 `@deepseek-ai/dsh-fs-observation-policy` 添加；它是一個 `fs/*` 事件門禁插件，不會改變 schema。加載這些工具的部署按預期也應加載該插件。沒有 `ctx.attachments` 時圖片工具不會注冊；其 schema 與路由無關，執行時除非確切路由的模型聲明圖片輸入，否則拒絕。 |
| `@deepseek-ai/dsh-tool-fs-search` | `glob`、`grep` | `ctx.tools`、`ctx.subprocess`、`ctx.systemPrompt` | `tool/call`、`tool/result` | - | glob 和 grep 是無條件可用的發現工具，通過 ctx.subprocess spawn 隨包提供的 ripgrep 二進制文件（`@vscode/ripgrep`），并作為普通前臺調用運行，絕不作為后臺任務；無需在宿主機安裝 `rg`，也不經過 shell 層。本目錄使用 `sampleOverCapGlobResults: true`；部署必須顯式選擇該行為。結果超過上限時，會通過可選的 ctx.spillStore 后端保存完整的格式化列表；在共置部署中，如果后端公開本地路徑，返回的定位信息可供后續讀取／搜索。 |
| `@deepseek-ai/dsh-tool-terminal` | `terminal_close`、`terminal_list`、`terminal_open`、`terminal_read`、`terminal_send`、`terminal_signal` | `ctx.tools`、`ctx.terminals`、`ctx.systemPrompt`、`ctx.jobs at call time for run_in_background` | `tool/call`、`tool/result` | - | 這 6 個終端工具需要選擇啟用，用于補充一次性 bash／文件系統工具。`terminal_send(run_in_background: true)` 會注冊到 `ctx.jobs`；schema 不包含 TUI、具名按鍵序列、BEL、調整尺寸、自動啟動和跨 agent 共享。 |
| `@deepseek-ai/dsh-tool-goal` | `create_goal`、`get_goal`、`update_goal` | `ctx.tools`、`ctx.agents`、`ctx.goals`、`ctx.systemPrompt`、`a calling Agent in an authorized open turn` | `tool/call`、`goal/change for mutations`、`tool/result` | - | create、edit、pause 和 resume 要求直接來自人類的根權限；complete 和 blocked 也接受確切的當前 Goal Round。blocked 的默認下限是 3 個獲準的 Round。 |
| `@deepseek-ai/dsh-schedule` | `schedule_create`、`schedule_delete`、`schedule_list` | `ctx.tools`、`ctx.sessions`、Session 持久化、未來創建的 live 根 Agent | `tool/call`、`schedule/change create or delete`、`tool/result` | - | 僅在選擇啟用的 Schedule 插件加載后創建的 live 根 Agent scope 內注冊。版本 1 接受 after_seconds、顯式絕對 at 和有界固定速率 every_seconds，并披露 session-local 交付；管理讀取與變更必須通過共享的 Session 持久化 barrier。 |
| `@deepseek-ai/dsh-tool-lsp` | `lsp` | `ctx.tools`、`ctx.lsp`、`ctx.systemPrompt` | `tool/call`、`tool/result` | - | lsp 工具將提供方選擇和語言服務器子進程置于 ctx.lsp 之后，因此其模型可見 schema 在更換提供方時保持穩定。運行時要求已注冊提供方，例如 `@deepseek-ai/dsh-lsp-stdio`；如果沒有提供方，查詢會返回結構化 `LSP_UNAVAILABLE` 錯誤，而不會改變 schema。 |
| `@deepseek-ai/dsh-tool-ralph` | `ralph` | `ctx.tools`、`ctx.workflowEngine`、`ctx.subagents`、`ctx.systemPrompt`、`a calling Agent (exec.agent parents every fresh round)` | `tool/call`、`tool/result`、`workflow and child session events during execution` | - | 固定的前臺工作流會在每個 Round 啟動一個全新的結構化子級；模型只能選擇不可變目標和可選的 Round 上限。 |
| `@deepseek-ai/dsh-tool-skill` | `skill` | `ctx.tools`、`ctx.agents`、`ctx.skills` | `tool/call`、`tool/result`、`user/message replacement catalogs via agent.inject()` | - | - |
| `@deepseek-ai/dsh-tool-session-query` | `session_event_read`、`session_event_search`、`session_event_trace`、`session_search`、`session_trace` | `ctx.tools`、`ctx.systemPrompt`、`ctx.sessionQuery`、`a calling Agent for workspace authority` | `tool/call`、`tool/result` | - | 這 5 個只讀工具會隱藏提供方游標，并根據不可變的調用 agent 會話為每個結果授權。該包需要選擇啟用；需要強制截止時間或限制行內輸出的組合還會掛載通用超時或 spill 策略。 |
| `@deepseek-ai/dsh-tool-subagent` | `list_subagent_models`、`subagent` | `ctx.tools`、`ctx.subagents`、`ctx.systemPrompt`、`用于模型發現和所選路由校驗的 ctx.llm` | `tool/call`、`tool/result`、`child session events through the chosen provider` | `subagent`、`subagent_fork` | 注冊的委派工具名稱取決于加載時 `toolName` 配置（默認為 `subagent`）；上述默認 schema 關閉模型選擇，而發現 schema 則展示為已啟用 Session 中可用的固定配套工具。Web preset 會在每個新頂層 Session 創建時讀取插件頁偏好，并為其子 Session 保留該決定；`subagent_fork` 始終使用固定路由。每個實例通過 `modelSelectionSettings`、`backgroundMode` 與 `enableRunInBackground` 獨立控制是否讀取模型選擇設置及其后臺行為。 |
| `@deepseek-ai/dsh-tool-subagent-control` | `interrupt_agent`、`list_agents`、`send_message` | `ctx.tools`、`ctx.subagents`、`ctx.agents and ctx.sessionProjections (list_agents only)` | `tool/call`、`tool/result`、`child session events through ctx.subagents` | - | 這些是控制可繼續后臺 subagent 的全局命名工具：綁定提供方的 `tool-subagent` 實例注冊不同的委派工具；本包注冊一次 `send_message` 和 `interrupt_agent`，另由 `list_agents` 通過單獨加載的 `/list-agents` 插件提供，其目錄行使用 sessionProjections 和實時 Agent 注冊表。 |
| `@deepseek-ai/dsh-tool-jobs` | `job_kill`、`job_list`、`job_output` | `ctx.tools`、`ctx.jobs`、`ctx.systemPrompt` | `tool/call`、`tool/result`、`user/message via agent.inject() for background completion notices` | - | 與任務種類無關的后臺任務控制器：后臺 bash 命令、PTY 發送和 subagent 都通過相同的 3 個工具讀取、列出和終止。加載該插件會掛接控制器，從而啟用生產方的 `ctx.jobs.start()`。 |
| `@deepseek-ai/dsh-experimental-tool-agent-team` | `interrupt_agent`、`list_agents`、`send_message`、`spawn_teammate`、`team_task_create`、`team_task_get`、`team_task_list`、`team_task_update`、`wait_agent` | `ctx.tools`、`ctx.systemPrompt`、`ctx.agentTeams`、`an exact live Team member Agent` | `tool/call`、`team/member`、`team/message/queued`、`team/message/delivered`、`team/task`、`tool/result` | - | 這 9 個工具限定于隱式 Team Lead 與持久 teammate 作用域。隨產品發布的 dsh-base bundle 默認禁用該包；文檔中的 Agent Teams profile patch 會啟用它，并禁用舊 continuable child 的同名控制工具。 |
| `@deepseek-ai/dsh-tool-todo` | `todo_write` | `ctx.tools`、`owning Agent session` | `tool/call`、`todo/write`、`tool/result` | - | todo_write 是會話所有的狀態；UI 將最新的 todo/write 事件渲染為檢查清單。`allowParallelInProgress` 是沒有默認值的必填項，因此本目錄明確選擇 `true`，對應描述允許同時存在多個 `in_progress` 項。選擇 `false` 的部署會獲得同一工具，但描述會要求只能有 1 個活動任務。 |
| `@deepseek-ai/dsh-tool-workflow` | `workflow` | `ctx.tools`、`ctx.workflowEngine`、`ctx.systemPrompt`、`a calling Agent (exec.agent parents the script children)` | `tool/call`、`tool/result` | - | - |
| `@deepseek-ai/dsh-tool-web` | `web_fetch`、`web_search` | `ctx.tools`、`ctx.web`、`ctx.systemPrompt` | `tool/call`、`tool/result` | - | web_search 和 web_fetch 將提供方選擇置于 ctx.web 之后，使模型可見 schema 在更換后端時保持穩定。 |

<a id="deepseek-aidsh-tool-ask-user"></a>

## `@deepseek-ai/dsh-tool-ask-user`

### `ask_user_question`

繼續操作前，如果需要確認、選擇或缺失的信息，請向用戶提出簡明問題。發送一個或多個問題，每個問題都帶一個穩定 id，該 id 會在答案中原樣返回。

```json
{
  "type": "object",
  "properties": {
    "questions": {
      "type": "array",
      "description": "Questions to ask the user before continuing.",
      "items": {
        "type": "object",
        "additionalProperties": true,
        "properties": {
          "id": {
            "type": "string",
            "description": "Stable id for this question; echoed in the answer."
          },
          "question": {
            "type": "string",
            "description": "The specific question to ask the user."
          },
          "header": {
            "type": "string",
            "description": "Optional short heading for the question, such as \"Confirm\" or \"Choose Mode\"."
          },
          "options": {
            "type": "array",
            "description": "Optional choices to show the user. If you recommend one, put it first and append \"(Recommended)\" to that label.",
            "items": {
              "type": "object",
              "additionalProperties": true,
              "properties": {
                "label": {
                  "type": "string",
                  "description": "Short user-facing option label."
                },
                "description": {
                  "type": "string",
                  "description": "One sentence explaining the tradeoff or impact."
                }
              },
              "required": [
                "label"
              ]
            }
          },
          "multi_select": {
            "type": "boolean",
            "description": "Whether the user may select more than one option. Defaults to false."
          }
        },
        "required": [
          "id",
          "question"
        ]
      }
    }
  },
  "required": [
    "questions"
  ]
}
```

來源：[`packages/interaction/tool-ask-user/src/index.ts`](../packages/interaction/tool-ask-user/src/index.ts)

ask_user_question 會暫停工具調用，直到當前 UI 提供方返回人類答案。

<a id="deepseek-aidsh-tools"></a>

## `@deepseek-ai/dsh-tools`

### `run_code`

針對可用工具執行 TypeScript 程序。接受兩個必填參數：`code`，即異步函數的**函數體**（僅使用可擦除語法；支持頂層 `await` 和 `return`）；以及 `description`，簡要說明該程序做什么。請根據系統提示詞中的聲明，以 `await tools.name(args)` 形式調用工具。只有打印或返回的內容屬于程序輸出，請謹慎篩選。含圖片的子工具結果會在運行結束后附加。

```json
{
  "type": "object",
  "properties": {
    "code": {
      "type": "string",
      "description": "The program: the body of an async TypeScript function."
    },
    "description": {
      "type": "string",
      "description": "Clear, concise description of what this program does in active voice, 5-10 words (shown in the UI). Examples: \"Count TODO markers across packages\"; \"Read failing test and its fixture\"; \"Rename config key in every cordis.yml\"."
    }
  },
  "required": [
    "code",
    "description"
  ]
}
```

來源：[`packages/core/tools/src/ptc.ts`](../packages/core/tools/src/ptc.ts)

在 `mode: ptc`／`mode: both` 下，它由工具注冊表所有，作為可過濾能力層之外的保留傳輸機制（參見 PTC mode Agent Note）。在 `ptc` 下，它是注冊表對協議格式的唯一貢獻；其他可見能力在使用已加載運行時語言生成的 SDK 章節中聲明。程序通過 binding 調用這些能力，調用按照原生并發約定調度：啟動順序和策略遵循提交順序，并發安全的函數體最多重疊執行 `maxParallelSubCalls` 個。調用會重新進入完整且受守衛保護的工具流水線，并將每個嵌套執行關聯到此外層結果。

<a id="deepseek-aidsh-plan-mode"></a>

## `@deepseek-ai/dsh-plan-mode`

### `exit_plan_mode`

僅在規劃模式下使用。提交計劃供用戶評審，并在獲批后退出規劃模式。發送**完整的** Markdown 計劃，以一個為計劃命名的 # 標題開頭。用戶可以批準（從你的下一步驟起執行計劃），也可以要求繼續規劃；其反饋會通過工具結果返回，請修改后再次提交。

```json
{
  "type": "object",
  "properties": {
    "plan": {
      "type": "string",
      "description": "The complete plan, as markdown, starting with a # heading that names it."
    }
  },
  "required": [
    "plan"
  ]
}
```

來源：[`packages/plan/plan-mode/src/index.ts`](../packages/plan/plan-mode/src/index.ts)

規劃未激活時，exit_plan_mode 仍保留在面向模型的 schema 中，這樣狀態轉換不會在規劃策略變更之外額外造成工具目錄變動。其執行路徑會拒絕規劃模式之外的調用；在規劃模式下，它通過用戶交互 seam 提交計劃（批準／根據反饋繼續規劃），批準后會在步驟邊界記錄規劃模式已停用。

<a id="deepseek-aidsh-tool-bash"></a>

## `@deepseek-ai/dsh-tool-bash`

### `bash`

執行 bash 命令（`bash -c`）并返回 stdout/stderr。每次調用都在新 shell 中運行：調用之間不保留任何狀態（cwd、變量、函數），請傳入 `workdir`，不要使用 `cd`。非零退出會報告為 `[exit code: N]`。當前 harness 環境信息通過托管的 `$DSH_*` 變量公開，需要時請檢查這些變量。命令可能在文件沙箱中運行；被阻止的文件操作報告為 `[sandbox: file access denied under <mode> mode]`，這是策略拒絕，而不是命令缺陷，請勿換一種方式重試。較長的輸出會截斷，只保留尾部；如可用，完整輸出會保存到文件并報告其路徑。對于長時間運行的命令，請設置 `run_in_background: true`：調用會立即返回 job id；使用 `job_output` 讀取輸出，使用 `job_kill` 停止任務。

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "description": "The bash command to execute."
    },
    "description": {
      "type": "string",
      "description": "Clear, concise description of what this command does in active voice, 5-10 words (shown in the UI). Examples: \"ls\" → \"List files in current directory\"; \"git status\" → \"Show working tree status\"; \"npm install\" → \"Install package dependencies\"."
    },
    "timeoutMs": {
      "type": "number",
      "description": "Timeout in milliseconds. The executor applies its configured default and cap, and kills the command on expiry."
    },
    "workdir": {
      "type": "string",
      "description": "Working directory for this command. Defaults to the session workspace; a relative path is resolved against it."
    },
    "run_in_background": {
      "type": "boolean",
      "description": "Run in the background and return a job id immediately (collect with job_output, stop with job_kill). No timeout applies."
    }
  },
  "required": [
    "command",
    "description"
  ]
}
```

來源：[`packages/shell/tool-bash/src/index.ts`](../packages/shell/tool-bash/src/index.ts)

bash 工具是 bash 執行器 seam 面向模型的消費方。使用 `run_in_background` 的運行會注冊到通用 `ctx.jobs` 運行時，并通過 `job_*` 工具（來自 `@deepseek-ai/dsh-tool-jobs`）收集／停止；禁用 `enableRunInBackground` 配置（默認為 true）后，該參數會被完全移除。

<a id="deepseek-aidsh-tool-present"></a>

## `@deepseek-ai/dsh-tool-present`

### `present`

聲明交付 Session 文件系統可訪問的已有文件。如果你創建或更新的文件是用戶要求接收的成果，則必須在寫入完成后、最終回復前調用 present，包括通過 Bash 或代碼執行創建的文件。在回復中提到文件路徑不能替代這次調用。文件必須已存在。用戶打開當前源文件；不復制或保存其內容。

```json
{
  "type": "object",
  "properties": {
    "files": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "path": {
            "type": "string",
            "description": "Path of an existing regular file. Relative paths use the Session working directory."
          },
          "description": {
            "type": "string",
            "description": "Brief description for the user."
          }
        },
        "required": [
          "path"
        ]
      }
    }
  },
  "required": [
    "files"
  ]
}
```

來源： [`packages/fs/tool-present/src/index.ts`](../packages/fs/tool-present/src/index.ts)

交付歸調用方 Session 所有；Web ui-deliverables 提供源文件打開與卡片。

<a id="deepseek-aidsh-tool-pwsh"></a>

## `@deepseek-ai/dsh-tool-pwsh`

### `pwsh`

執行 PowerShell 命令（`pwsh -Command`）并返回 stdout/stderr。每次調用都在新的 pwsh 進程中運行：調用之間不保留任何狀態（cwd、變量、函數），請傳入 `workdir`，不要使用 `cd`。路徑采用 Windows 原生形式（`C:\...`）；使用 `$env:NAME` 讀取環境變量。非零退出會報告為 `[exit code: N]`。當前 harness 環境信息通過托管的 `$env:DSH_*` 變量公開，需要時請檢查這些變量。命令可能在文件沙箱中運行；被阻止的文件操作報告為 `[sandbox: file access denied under <mode> mode]`，這是策略拒絕，而不是命令缺陷，請勿換一種方式重試。較長的輸出會截斷，只保留尾部；如可用，完整輸出會保存到文件并報告其路徑。在 Windows 上，被強制終止的命令會以 `[exit code: 1]` 結算且不帶信號標記，請將其視為中斷，而不是命令失敗。對于長時間運行的命令，請設置 `run_in_background: true`：調用會立即返回 job id；使用 `job_output` 讀取輸出，使用 `job_kill` 停止任務。

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "description": "The PowerShell command to execute."
    },
    "description": {
      "type": "string",
      "description": "Clear, concise description of what this command does in active voice, 5-10 words (shown in the UI). Examples: \"ls\" → \"List files in current directory\"; \"git status\" → \"Show working tree status\"; \"Get-Process\" → \"List running processes\"."
    },
    "timeoutMs": {
      "type": "number",
      "description": "Timeout in milliseconds. The executor applies its configured default and cap, and kills the command on expiry."
    },
    "workdir": {
      "type": "string",
      "description": "Working directory for this command. Defaults to the session workspace; a relative path is resolved against it."
    },
    "run_in_background": {
      "type": "boolean",
      "description": "Run in the background and return a job id immediately (collect with job_output, stop with job_kill). No timeout applies."
    }
  },
  "required": [
    "command",
    "description"
  ]
}
```

來源：[`packages/shell/tool-pwsh/src/index.ts`](../packages/shell/tool-pwsh/src/index.ts)

pwsh 工具是 Windows 組合中 bash 執行器 seam 的 PowerShell 方言消費方（由 `@deepseek-ai/dsh-pwsh-local` 等 PowerShell 執行器為 `ctx.shell` 提供后端）；除沙箱接口外，它逐項對應 bash 工具調用。使用 `run_in_background` 的運行會注冊到通用 `ctx.jobs` 運行時，并通過 `job_*` 工具收集／停止；托管的 `DSH_*` 環境來自 `@deepseek-ai/dsh-shell-env`。每次調用都在新進程中運行，不使用持久 PTY 會話。路徑采用原生 `C:\...` 形式，變量采用 `$env:NAME`。

<a id="deepseek-aidsh-tool-cordis"></a>

## `@deepseek-ai/dsh-tool-cordis`

### `cordis_define`

定義一個不可變的 Cordis Package。新建 Plugin 時使用 kind:"new"，只提供 3 至 6 位小寫英文字母組成的語義前綴；Host 返回最終 pluginId 和 packageId。修改現有 Plugin 時使用 kind:"existing" 并傳入精確 pluginId，以追加 Package 而不覆蓋舊版本。code.host 與 code.client 至少提供一個；每個值都是返回 Cordis Plugin 的 plain JavaScript 函數體，不經過 TypeScript、JSX 或 import 轉換。依賴 Service、Event、Builtin、Slot 或 token 前先查詢 Inspect。Define 只校驗參數和語法并記錄源碼，不申請審批、不執行 apply，也不改變 currentPackageId。成功后用返回的 ID 調用 cordis_run。

```json
{
  "type": "object",
  "properties": {
    "plugin": {
      "oneOf": [
        {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "kind": {
              "type": "string",
              "const": "new"
            },
            "idPrefix": {
              "type": "string",
              "description": "Suggested semantic prefix of 3–6 lowercase English letters; the Host adds a unique numeric suffix."
            }
          },
          "required": [
            "kind",
            "idPrefix"
          ]
        },
        {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "kind": {
              "type": "string",
              "const": "existing"
            },
            "pluginId": {
              "type": "string",
              "description": "Exact ID of an existing Plugin; the new Package is appended to that instance."
            }
          },
          "required": [
            "kind",
            "pluginId"
          ]
        }
      ]
    },
    "name": {
      "type": "string",
      "description": "Short, readable Package name."
    },
    "purpose": {
      "type": "string",
      "description": "One-sentence, user-facing description of the Package purpose."
    },
    "code": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "host": {
          "type": "string",
          "description": "Plain JavaScript function body that returns the Host-half Cordis Plugin."
        },
        "client": {
          "type": "string",
          "description": "Plain JavaScript function body that returns the browser Client-half Cordis Plugin."
        }
      }
    }
  },
  "required": [
    "plugin",
    "name",
    "purpose",
    "code"
  ]
}
```

來源：[`packages/extensions/tool-cordis/src/index.ts`](../packages/extensions/tool-cordis/src/index.ts)

### `cordis_inspect_list`

列出 Host 當前已知的全部 Cordis Inspect Provider，包括本地 Host Provider 和 Client 最近同步的 manifest。每項包含所屬平臺、用途、只讀方法及輸入／輸出 schema。創建或修改 Package 前先調用本 Tool，再從結果中選擇 cordis_inspect_query 的 provider 和 method。不要猜測名稱，也不要把 Inspect method 當作 Plugin 代碼可調用的業務 Service。

```json
{
  "type": "object",
  "properties": {}
}
```

來源：[`packages/extensions/tool-cordis/src/index.ts`](../packages/extensions/tool-cordis/src/index.ts)

### `cordis_inspect_query`

執行 Inspect Provider 顯式聲明的只讀查詢。platform、provider 和 method 必須來自 cordis_inspect_list，input 必須符合該方法的 schema。在 cordis_define 前用本 Tool 讀取精確 Service 方法、Event mode、Builtin 簽名、Tool schema、主題 token，或實時 Slot 樹及 props。Host 查詢在本地執行；Client 查詢等待首個有效頁面響應，在頁面回答或 Tool 被取消前保持 pending。本 Tool 不能調用業務 Service 方法或修改運行時。查詢 Service.listService 和 Event.listEvents 時，先不傳 input 瀏覽緊湊簽名目錄，再查詢精確 service 或 event 獲取結構化約定和引用類型。查詢 Slots.listSubTree 時，先不傳 root 瀏覽緊湊樹，再查詢精確 root 獲取完整注冊約定和 props。

```json
{
  "type": "object",
  "properties": {
    "platform": {
      "type": "string",
      "description": "Runtime platform that owns the Provider.",
      "enum": [
        "host",
        "client"
      ]
    },
    "provider": {
      "type": "string",
      "description": "Exact Provider ID returned by cordis_inspect_list."
    },
    "method": {
      "type": "string",
      "description": "Exact method name declared by the Provider manifest."
    },
    "input": {
      "description": "Optional query input; it must satisfy the method input schema."
    }
  },
  "required": [
    "platform",
    "provider",
    "method"
  ]
}
```

來源：[`packages/extensions/tool-cordis/src/index.ts`](../packages/extensions/tool-cordis/src/index.ts)

### `cordis_inspect_self`

按逐層增加的詳細程度檢查當前 Session 擁有的動態 Cordis 對象。不傳 ID 時只列 Plugin 摘要；只傳 pluginId 時返回版本指針、最新 Run 和全部 Package 摘要；只有同時傳 pluginId 與 packageId 才返回該不可變 Package 的 Host/Client 源碼和運行診斷。packageId 不能單獨傳入。處理 @pluginId、修復異步失敗或定義更新版本前，先查詢精確 Package。本 Tool 只讀，不執行代碼，也不改變版本指針。

```json
{
  "type": "object",
  "properties": {
    "pluginId": {
      "type": "string",
      "description": "Stable Plugin ID returned by cordis_define or injected by @pluginId; omit it to list every current Plugin."
    },
    "packageId": {
      "type": "string",
      "description": "Exact immutable Package ID owned by pluginId; when specified, source and diagnostics are returned."
    }
  }
}
```

來源：[`packages/extensions/tool-cordis/src/index.ts`](../packages/extensions/tool-cordis/src/index.ts)

### `cordis_run`

激活動態 Plugin 的一個精確 Package。首次激活、重啟 currentPackageId 或回退使用 mode:"run"；已有 current 時，即使 Plugin 當前已停止，切換到其他 Package 也使用 mode:"update"。未授權的 Client Package 創建審批請求并返回 awaiting-approval；已授權的 Package 返回 starting，并在瀏覽器中異步繼續。兩種結果都不會在 Tool 內等待最終結局。currentPackageId 只在完整成功后改變；失敗時保留舊 current 和目標 next。異步成功、拒絕或技術失敗通過狀態與 steering 報告。技術失敗后，用 cordis_inspect_self 讀取診斷，修正同一 Plugin 并自主重試。用戶拒絕后不要再次申請審批。

```json
{
  "type": "object",
  "properties": {
    "pluginId": {
      "type": "string",
      "description": "Stable Plugin ID returned by cordis_define."
    },
    "packageId": {
      "type": "string",
      "description": "Exact immutable Package ID to activate under that Plugin."
    },
    "mode": {
      "type": "string",
      "description": "Use run for the first activation, restarting current, or rollback; use update to switch from current to a different Package.",
      "enum": [
        "run",
        "update"
      ]
    }
  },
  "required": [
    "pluginId",
    "packageId",
    "mode"
  ]
}
```

來源：[`packages/extensions/tool-cordis/src/index.ts`](../packages/extensions/tool-cordis/src/index.ts)

### `cordis_stop`

停止動態 Plugin 的當前 Run，并取消尚未完成的審批或激活請求。保留 Plugin、全部不可變 Package、授權、currentPackageId 和 nextPackageId，以便之后直接運行或更新。停止已處于停止狀態的 Plugin 會冪等成功。臨時禁用副作用使用本 Tool；永久移除使用 cordis_undefine。

```json
{
  "type": "object",
  "properties": {
    "pluginId": {
      "type": "string",
      "description": "Stable dynamic Plugin ID to stop."
    }
  },
  "required": [
    "pluginId"
  ]
}
```

來源：[`packages/extensions/tool-cordis/src/index.ts`](../packages/extensions/tool-cordis/src/index.ts)

### `cordis_undefine`

永久移除當前 Session 擁有的動態 Plugin。如果它正在運行或等待審批，先停止并取消請求，再刪除全部 Package、授權和版本指針。返回后，其 pluginId、packageIds、@ 引用和 Package 業務視圖均失效；歷史卡片只保留“Plugin 已移除”記錄。需要保留版本以便重啟或回退時不要調用本 Tool，應改用 cordis_stop。

```json
{
  "type": "object",
  "properties": {
    "pluginId": {
      "type": "string",
      "description": "Stable dynamic Plugin ID to remove permanently."
    }
  },
  "required": [
    "pluginId"
  ]
}
```

來源：[`packages/extensions/tool-cordis/src/index.ts`](../packages/extensions/tool-cordis/src/index.ts)

不在任何隨產品發布的樹中，需要顯式選擇啟用；動態 Package 代碼可以訪問真實運行時，見 .agents/notes/implemented/feature/2026-07-08-self-referential-cordis-toolset.md。該工具集注入 `@deepseek-ai/dsh-cordis-host-runner` 提供的 `ctx.dynamicCordisRunner`，后者擁有定義注冊表和 vm 沙箱；組合缺少它時這些工具不會激活。運行中的 Package 在停止、undefine 或 DSH 重啟前可以注冊**額外的**模型可見工具；發生這類工具集變化時，系統會記錄完整且有變動的請求頭。

<a id="deepseek-aidsh-tool-bash-persistent"></a>

## `@deepseek-ai/dsh-tool-bash-persistent`

### `bash`

在持久 bash shell 中運行命令。包括當前目錄和已導出環境變量在內的狀態會在此 agent 的多次調用之間保留。

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "description": "The bash command to run. Relative path is preferred in the command."
    }
  },
  "required": [
    "command"
  ]
}
```

來源：[`packages/shell/tool-bash-persistent/src/index.ts`](../packages/shell/tool-bash-persistent/src/index.ts)

一個按所有者隔離的持久 bash 工具；部署組合提供 PTY 后端，并可覆蓋面向模型的環境描述。

<a id="deepseek-aidsh-tool-pwsh-persistent"></a>

## `@deepseek-ai/dsh-tool-pwsh-persistent`

### `pwsh`

在持久 PowerShell shell 中運行命令。包括當前目錄和已導出環境變量在內的狀態會在此 agent 的多次調用之間保留。

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "description": "The PowerShell command to run. Relative path is preferred in the command."
    }
  },
  "required": [
    "command"
  ]
}
```

來源：[`packages/shell/tool-pwsh-persistent/src/index.ts`](../packages/shell/tool-pwsh-persistent/src/index.ts)

一個按所有者隔離的持久 pwsh 工具，持久 bash 工具的 Windows 對應物；部署組合提供 pwsh 方言的 PTY 后端，并可覆蓋面向模型的環境描述。

<a id="deepseek-aidsh-tool-str-replace-editor"></a>

## `@deepseek-ai/dsh-tool-str-replace-editor`

### `str_replace_editor`

用于查看、創建和編輯文件的自定義編輯工具：

* 狀態會在命令調用以及與用戶的討論之間持久保留
* 如果 `path` 是文件，`view` 會顯示應用 `cat -n` 后的結果。如果 `path` 是目錄，`view` 會列出最多向下 2 層的非隱藏文件和目錄
* 如果指定的 `create` 命令目標 `path` 已作為文件存在，則不能使用該命令
* 如果 `command` 產生較長輸出，輸出會被截斷并標記為 `<response clipped>`
* 當前命令不使用某個參數時，值為 `null` 的占位參數視為未提供。必填參數仍須提供值；刪除匹配內容時應省略 `str_replace.new_str`，而不是將其設為 `null`

使用 `str_replace` 命令時請注意：

* `old_str` 參數應與原文件中一行或多行連續內容**完全**匹配。請留意空白字符！
* 如果 `old_str` 參數在文件中不唯一，則不會執行替換。請確保在 `old_str` 中包含足夠的上下文，使其唯一
* `new_str` 參數應包含用于替換 `old_str` 的已編輯行

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "description": "The commands to run. Allowed options are: `view`, `create`, `str_replace`, `insert`.",
      "enum": [
        "view",
        "create",
        "str_replace",
        "insert"
      ]
    },
    "path": {
      "type": "string",
      "description": "Absolute path to file or directory, e.g. `/repo/file.py` or `/repo`."
    },
    "file_text": {
      "oneOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "description": "Required string parameter of `create` command, with the content of the file to be created. A null placeholder is treated as omitted by commands that do not use this parameter."
    },
    "insert_line": {
      "oneOf": [
        {
          "type": "integer"
        },
        {
          "type": "null"
        }
      ],
      "description": "Required integer parameter of `insert` command. The `new_str` will be inserted AFTER the line `insert_line` of `path`. A null placeholder is treated as omitted by commands that do not use this parameter."
    },
    "new_str": {
      "oneOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "description": "Optional string parameter of `str_replace` command containing the new string (if omitted, no string will be added). Required string parameter of `insert` command containing the string to insert. A null placeholder is accepted only by commands that do not use this parameter."
    },
    "old_str": {
      "oneOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "description": "Required string parameter of `str_replace` command containing the string in `path` to replace. A null placeholder is treated as omitted by commands that do not use this parameter."
    },
    "view_range": {
      "oneOf": [
        {
          "type": "array",
          "items": {
            "type": "integer"
          }
        },
        {
          "type": "null"
        }
      ],
      "description": "Optional parameter of `view` command when `path` points to a file. If omitted or null, the full file is shown. If provided, the file will be shown in the indicated line number range, e.g. [11, 12] will show lines 11 and 12. Indexing at 1 to start. Setting `[start_line, -1]` shows all lines from `start_line` to the end of the file."
    }
  },
  "required": [
    "command",
    "path"
  ]
}
```

來源：[`packages/fs/tool-str-replace-editor/src/index.ts`](../packages/fs/tool-str-replace-editor/src/index.ts)

基于文件系統 seam 的獨立查看／創建／唯一字面量替換／按行插入工具；可與任何 shell 或終端接口組合。

<a id="deepseek-aidsh-tool-fs"></a>

## `@deepseek-ai/dsh-tool-fs`

### `edit`

通過替換字面量文本來編輯現有 UTF-8 文本文件。

```json
{
  "type": "object",
  "properties": {
    "file_path": {
      "type": "string",
      "description": "Path to edit, resolved by the filesystem backend."
    },
    "old_string": {
      "type": "string",
      "description": "Literal text to replace. Must match exactly."
    },
    "new_string": {
      "type": "string",
      "description": "Literal replacement text. Use an empty string to delete the match."
    },
    "replace_all": {
      "type": "boolean",
      "description": "Replace all matches. Defaults to false; when false, old_string must appear exactly once."
    }
  },
  "required": [
    "file_path",
    "old_string",
    "new_string"
  ]
}
```

來源：[`packages/fs/tool-fs/src/index.ts`](../packages/fs/tool-fs/src/index.ts)

### `read`

讀取 UTF-8 文本文件，并返回帶行號的內容。

```json
{
  "type": "object",
  "properties": {
    "file_path": {
      "type": "string",
      "description": "Path to read, resolved by the filesystem backend."
    },
    "offset": {
      "type": "number",
      "description": "1-based first line to return. Defaults to 1."
    },
    "limit": {
      "type": "number",
      "description": "Maximum number of lines to return. Defaults to 2000."
    }
  },
  "required": [
    "file_path"
  ]
}
```

來源：[`packages/fs/tool-fs/src/index.ts`](../packages/fs/tool-fs/src/index.ts)

### `read_image`

讀取 PNG/JPEG/WebP/GIF 文件并返回圖像本身。無擴展名的路徑同樣被接受；格式按文件內容檢測，因此規范化附件路徑可以直接傳入，無需復制或重命名。Harness 會在下一次模型請求前校驗并縮小受支持的大圖，因此僅為查看圖片時應直接使用此工具，無需安裝圖片庫或創建縮略圖。可以用小批次并發讀取彼此獨立的文件。要求當前模型接受圖像輸入。

```json
{
  "type": "object",
  "properties": {
    "file_path": {
      "type": "string",
      "description": "Path to the image file, resolved by the filesystem backend."
    }
  },
  "required": [
    "file_path"
  ]
}
```

來源：[`packages/fs/tool-fs/src/index.ts`](../packages/fs/tool-fs/src/index.ts)

### `write`

創建或完全替換 UTF-8 文本文件。

```json
{
  "type": "object",
  "properties": {
    "file_path": {
      "type": "string",
      "description": "Path to write, resolved by the filesystem backend."
    },
    "content": {
      "type": "string",
      "description": "Full UTF-8 text content to write."
    }
  },
  "required": [
    "file_path",
    "content"
  ]
}
```

來源：[`packages/fs/tool-fs/src/index.ts`](../packages/fs/tool-fs/src/index.ts)

先讀后寫／編輯策略由 `@deepseek-ai/dsh-fs-observation-policy` 添加；它是一個 `fs/*` 事件門禁插件，不會改變 schema。加載這些工具的部署按預期也應加載該插件。沒有 `ctx.attachments` 時圖片工具不會注冊；其 schema 與路由無關，執行時除非確切路由的模型聲明圖片輸入，否則拒絕。

<a id="deepseek-aidsh-tool-fs-search"></a>

## `@deepseek-ai/dsh-tool-fs-search`

### `glob`

查找路徑匹配 glob 模式的文件。只返回匹配的文件路徑，絕不返回目錄；包括隱藏文件和被忽略的文件，但排除 VCS 元數據目錄。最多按修改時間順序返回 100 條路徑；如果結果更多，則改為返回從頂層條目中抽樣的 100 條路徑，說明已抽樣，并報告完整排序列表的保存位置。該工具不枚舉目錄條目。

```json
{
  "type": "object",
  "properties": {
    "pattern": {
      "type": "string",
      "description": "Glob pattern to match file paths against (e.g. \"**/*.ts\", \"src/**/*.test.js\"). A pattern with no \"/\" matches the basename at any depth, so \"*\" and \"*.ts\" both search the whole tree; include a separator to anchor the depth."
    },
    "path": {
      "type": "string",
      "description": "Directory to search in. Defaults to the session workspace; a relative path resolves against it."
    }
  },
  "required": [
    "pattern"
  ]
}
```

來源：[`packages/fs/tool-fs-search/src/index.ts`](../packages/fs/tool-fs-search/src/index.ts)

### `grep`

使用 ripgrep 正則表達式搜索文件內容。返回帶行號的匹配行，并按文件分組。前 250 條匹配會直接返回；結果達到上限時會報告完整匹配列表的保存位置。如需周邊上下文，請對匹配的文件使用 read。

```json
{
  "type": "object",
  "properties": {
    "pattern": {
      "type": "string",
      "description": "Regular expression to search for (ripgrep syntax)."
    },
    "path": {
      "type": "string",
      "description": "File or directory to search. Defaults to the session workspace; a relative path resolves against it."
    },
    "include": {
      "type": "string",
      "description": "One glob filter for which files to search (e.g. \"*.ts\", \"*.{js,jsx}\"). Not a list; negation is not supported."
    }
  },
  "required": [
    "pattern"
  ]
}
```

來源：[`packages/fs/tool-fs-search/src/index.ts`](../packages/fs/tool-fs-search/src/index.ts)

glob 和 grep 是無條件可用的發現工具，通過 ctx.subprocess spawn 隨包提供的 ripgrep 二進制文件（`@vscode/ripgrep`），并作為普通前臺調用運行，絕不作為后臺任務；無需在宿主機安裝 `rg`，也不經過 shell 層。本目錄使用 `sampleOverCapGlobResults: true`；部署必須顯式選擇該行為。結果超過上限時，會通過可選的 ctx.spillStore 后端保存完整的格式化列表；在共置部署中，如果后端公開本地路徑，返回的定位信息可供后續讀取／搜索。

<a id="deepseek-aidsh-tool-terminal"></a>

## `@deepseek-ai/dsh-tool-terminal`

### `terminal_close`

關閉一個持久終端，并等待其捕獲且所有的進程樹完全退出。

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "description": "Terminal session id."
    }
  },
  "required": [
    "sessionId"
  ]
}
```

來源：[`packages/terminal/tool-terminal/src/index.ts`](../packages/terminal/tool-terminal/src/index.ts)

### `terminal_list`

列出當前 agent 所有的持久終端會話。

```json
{
  "type": "object",
  "properties": {}
}
```

來源：[`packages/terminal/tool-terminal/src/index.ts`](../packages/terminal/tool-terminal/src/index.ts)

### `terminal_open`

通過已注冊的后端類型創建按所有者隔離的持久終端會話。需要在多次工具調用之間保留 shell 或 REPL 狀態時，請使用此工具。

```json
{
  "type": "object",
  "properties": {
    "type": {
      "type": "string",
      "description": "Registered terminal backend type, usually \"shell\"."
    },
    "name": {
      "type": "string",
      "description": "Optional owner-local display name such as \"main\" or \"gdb\"."
    },
    "cwd": {
      "type": "string",
      "description": "Initial working directory. Defaults to the deployment workspace root."
    }
  },
  "required": [
    "type"
  ]
}
```

來源：[`packages/terminal/tool-terminal/src/index.ts`](../packages/terminal/tool-terminal/src/index.ts)

### `terminal_read`

從持久終端讀取一頁有界的保留輸出，不發送輸入。

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "description": "Terminal session id."
    },
    "offset": {
      "type": "number",
      "description": "Newest-relative line offset (default 0)."
    },
    "count": {
      "type": "number",
      "description": "Requested line count (default 500; backend caps apply)."
    }
  },
  "required": [
    "sessionId"
  ]
}
```

來源：[`packages/terminal/tool-terminal/src/index.ts`](../packages/terminal/tool-terminal/src/index.ts)

### `terminal_send`

向持久終端發送文本。默認會提交 Enter，并等待提示符、stdin 等待、輸出靜默、超時或會話退出。后臺模式會返回供 job_output／job_kill 使用的 job id。

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "description": "Terminal session id returned by terminal_open or terminal_list."
    },
    "text": {
      "type": "string",
      "description": "UTF-8 text to write to the terminal."
    },
    "submit": {
      "type": "boolean",
      "description": "Submit Enter after text (default true). Set false for control characters or incomplete REPL input."
    },
    "run_in_background": {
      "type": "boolean",
      "description": "Return a job id immediately; collect with job_output or stop with job_kill."
    }
  },
  "required": [
    "sessionId",
    "text"
  ]
}
```

來源：[`packages/terminal/tool-terminal/src/index.ts`](../packages/terminal/tool-terminal/src/index.ts)

### `terminal_signal`

向持久終端當前的前臺進程組發送允許的信號。

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "description": "Terminal session id."
    },
    "signal": {
      "type": "string",
      "description": "Signal to deliver. Shell-targeted SIGKILL is rejected; use terminal_close.",
      "enum": [
        "SIGINT",
        "SIGTERM",
        "SIGKILL",
        "SIGTSTP",
        "SIGHUP"
      ]
    }
  },
  "required": [
    "sessionId",
    "signal"
  ]
}
```

來源：[`packages/terminal/tool-terminal/src/index.ts`](../packages/terminal/tool-terminal/src/index.ts)

這 6 個終端工具需要選擇啟用，用于補充一次性 bash／文件系統工具。`terminal_send(run_in_background: true)` 會注冊到 `ctx.jobs`；schema 不包含 TUI、具名按鍵序列、BEL、調整尺寸、自動啟動和跨 agent 共享。

<a id="deepseek-aidsh-tool-goal"></a>

## `@deepseek-ai/dsh-tool-goal`

### `create_goal`

當當前直接人類請求是需要跨自主 Goal Round 持續推進的長期目標時，創建一個持久化的同會話完成目標。即使用戶沒有明確說「創建目標」，你也可以推斷其意圖。不要用于簡單的單輪工作。執行時會拒絕非人類權限和 subagent 權限。

```json
{
  "type": "object",
  "properties": {
    "objective": {
      "type": "string",
      "description": "The concrete completion objective inferred from the direct human request."
    },
    "max_goal_rounds": {
      "type": "number",
      "description": "Optional positive safe-integer limit on automatic continuation rounds."
    }
  },
  "required": [
    "objective"
  ]
}
```

來源：[`packages/goal/tool-goal/src/index.ts`](../packages/goal/tool-goal/src/index.ts)

### `get_goal`

讀取當前的同會話目標，包括確切的 id／revision、目標、階段、已完成的延續 Round 數、Round 上限、存在時的阻塞原因，以及是否已準備下一次延續。更新目標前請先調用此工具。

```json
{
  "type": "object",
  "properties": {}
}
```

來源：[`packages/goal/tool-goal/src/index.ts`](../packages/goal/tool-goal/src/index.ts)

### `update_goal`

更新確切的當前目標 revision。edit、pause 和 resume 要求直接的頂層人類請求。在自動延續當前目標期間，也允許 complete 和 blocked。在達到配置的最小 Round 數之前會拒絕 blocked；模型仍須判斷相同條件是否在這些 Round 中持續存在，并在 blocked_reason 中予以說明。

```json
{
  "type": "object",
  "properties": {
    "goal_id": {
      "type": "string",
      "description": "Exact id returned by get_goal."
    },
    "revision": {
      "type": "number",
      "description": "Exact positive revision returned by get_goal."
    },
    "action": {
      "type": "string",
      "description": "edit | pause | resume | complete | blocked",
      "enum": [
        "edit",
        "pause",
        "resume",
        "complete",
        "blocked"
      ]
    },
    "objective": {
      "type": "string",
      "description": "Replacement objective; valid only with action edit."
    },
    "max_goal_rounds": {
      "type": "number",
      "description": "Replacement cap; valid only with action edit."
    },
    "blocked_reason": {
      "type": "string",
      "description": "Concrete blocking condition; required only with action blocked."
    }
  },
  "required": [
    "goal_id",
    "revision",
    "action"
  ]
}
```

來源：[`packages/goal/tool-goal/src/index.ts`](../packages/goal/tool-goal/src/index.ts)

create、edit、pause 和 resume 要求直接來自人類的根權限；complete 和 blocked 也接受確切的當前 Goal Round。blocked 的默認下限是 3 個獲準的 Round。

<a id="deepseek-aidsh-schedule"></a>

## `@deepseek-ai/dsh-schedule`

### `schedule_create`

在當前會話中創建一條提醒。請提供非空 prompt 和恰好一個 selector：正的安全整數 after_seconds 延時；作為嚴格帶偏移日期時間或本地日期／時間對象的 at；或不小于 300 的安全整數 every_seconds。固定速率提醒始終與創建時刻對齊，會跳過錯過的發生時點，并把每條逾期規則的最新一個發生時點合并到一個批次中。交付模式是 session-local：只有此會話處于 live 狀態時，提醒才會準時運行；否則提醒會進入 overdue 狀態，直至會話恢復。

```json
{
  "type": "object",
  "properties": {
    "prompt": {
      "type": "string",
      "description": "Reminder content to present when the target becomes due."
    },
    "after_seconds": {
      "type": "number",
      "description": "Positive safe-integer delay in seconds."
    },
    "every_seconds": {
      "type": "number",
      "description": "Fixed-rate safe-integer interval in seconds, at least 300."
    },
    "at": {
      "oneOf": [
        {
          "type": "string"
        },
        {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "date": {
              "type": "string"
            },
            "time": {
              "type": "string"
            },
            "time_zone": {
              "type": "string"
            }
          },
          "required": [
            "date",
            "time",
            "time_zone"
          ]
        }
      ],
      "description": "Absolute target as strict offset RFC 3339 or local date/time with an explicit IANA zone."
    }
  },
  "required": [
    "prompt"
  ]
}
```

來源：[`packages/schedule/schedule/src/tools.ts`](../packages/schedule/schedule/src/tools.ts)

### `schedule_delete`

使用 schedule_create 或 schedule_list 返回的確切 id，刪除當前會話中的一條活動提醒。未知或已經結束的 id 會返回 deleted false。

```json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "description": "Exact session-local schedule id."
    }
  },
  "required": [
    "id"
  ]
}
```

來源：[`packages/schedule/schedule/src/tools.ts`](../packages/schedule/schedule/src/tools.ts)

### `schedule_list`

按創建順序列出當前會話中的所有活動提醒，包括確切 id、UTC 目標、scheduled 或 overdue 狀態，以及 session-local 交付模式。

```json
{
  "type": "object",
  "properties": {}
}
```

來源：[`packages/schedule/schedule/src/tools.ts`](../packages/schedule/schedule/src/tools.ts)

僅在選擇啟用的 Schedule 插件加載后創建的 live 根 Agent scope 內注冊。版本 1 接受 after_seconds、顯式絕對 at 和有界固定速率 every_seconds，并披露 session-local 交付；管理讀取與變更必須通過共享的 Session 持久化 barrier。

<a id="deepseek-aidsh-tool-lsp"></a>

## `@deepseek-ai/dsh-tool-lsp`

### `lsp`

查詢語言服務器，以精確導航代碼。operation 可取 goToDefinition、findReferences、goToImplementation 或 hover。line 和 character 是從 1 開始的 UTF-16 光標坐標。findReferences 包含聲明。

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "description": "goToDefinition, findReferences, goToImplementation, or hover.",
      "enum": [
        "goToDefinition",
        "findReferences",
        "goToImplementation",
        "hover"
      ]
    },
    "file_path": {
      "type": "string",
      "description": "The source file to query, relative to the workspace or absolute."
    },
    "line": {
      "type": "number",
      "description": "One-based line of the cursor."
    },
    "character": {
      "type": "number",
      "description": "One-based UTF-16 column of the cursor."
    }
  },
  "required": [
    "operation",
    "file_path",
    "line",
    "character"
  ]
}
```

來源：[`packages/lsp/tool-lsp/src/index.ts`](../packages/lsp/tool-lsp/src/index.ts)

lsp 工具將提供方選擇和語言服務器子進程置于 ctx.lsp 之后，因此其模型可見 schema 在更換提供方時保持穩定。運行時要求已注冊提供方，例如 `@deepseek-ai/dsh-lsp-stdio`；如果沒有提供方，查詢會返回結構化 `LSP_UNAVAILABLE` 錯誤，而不會改變 schema。

<a id="deepseek-aidsh-tool-ralph"></a>

## `@deepseek-ai/dsh-tool-ralph`

### `ralph`

圍繞一個不可變目標運行使用全新 agent 的前臺 Ralph 循環。僅當直接人類明確要求 Ralph 或使用全新 agent 迭代時使用。每個 Round 都會啟動一個全新子級，該子級看不到父級對話或先前子會話；共享工作區充當長期記憶，Round 之間只傳遞有界的結構化報告。當工作進程報告完成、報告具體阻塞項或達到 Round 上限時，調用返回。普通的長期同會話工作應使用 goal 工具。

```json
{
  "type": "object",
  "properties": {
    "objective": {
      "type": "string",
      "description": "The immutable completion objective for every fresh Ralph round."
    },
    "maxRounds": {
      "type": "number",
      "description": "Optional positive safe-integer round cap, bounded by the deployment ceiling."
    }
  },
  "required": [
    "objective"
  ]
}
```

來源：[`packages/workflow/tool-ralph/src/index.ts`](../packages/workflow/tool-ralph/src/index.ts)

固定的前臺工作流會在每個 Round 啟動一個全新的結構化子級；模型只能選擇不可變目標和可選的 Round 上限。

<a id="deepseek-aidsh-tool-skill"></a>

## `@deepseek-ai/dsh-tool-skill`

### `skill`

加載可用 skill（技能）的完整說明。在執行點名某項 skill 或與其明確匹配的任務前，請使用會話 skill 目錄中的確切名稱調用此工具。

```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "The exact skill name from the available skills list."
    }
  },
  "required": [
    "name"
  ]
}
```

來源：[`packages/skill/tool-skill/src/index.ts`](../packages/skill/tool-skill/src/index.ts)

<a id="deepseek-aidsh-tool-session-query"></a>

## `@deepseek-ai/dsh-tool-session-query`

### `session_event_read`

從一個已獲授權的會話中讀取一個完整且未刪節的事件，以及可選的相鄰原始事件概述。

```json
{
  "type": "object",
  "properties": {
    "session_id": {
      "type": "string",
      "description": "Target session id. Omit for the current session."
    },
    "seq": {
      "type": "integer",
      "description": "Target event sequence number."
    },
    "before": {
      "type": "integer",
      "description": "Number of preceding raw events to summarize. Omit for none."
    },
    "after": {
      "type": "integer",
      "description": "Number of following raw events to summarize. Omit for none."
    }
  },
  "required": [
    "seq"
  ]
}
```

來源：[`packages/session-query/tool-session-query/src/index.ts`](../packages/session-query/tool-session-query/src/index.ts)

### `session_event_search`

在一個已獲授權的會話中搜索先前事件；如果搜索當前會話，則排除執行此次調用的步驟。

```json
{
  "type": "object",
  "properties": {
    "session_id": {
      "type": "string",
      "description": "Target session id. Omit for the current session."
    },
    "query": {
      "type": "string",
      "description": "Literal full-text query over the target session."
    },
    "seq_from": {
      "type": "integer",
      "description": "Inclusive event sequence lower bound."
    },
    "seq_to": {
      "type": "integer",
      "description": "Inclusive event sequence upper bound."
    },
    "time_from": {
      "type": "string",
      "description": "Inclusive timezone-qualified ISO 8601 event-time lower bound."
    },
    "time_to": {
      "type": "string",
      "description": "Inclusive timezone-qualified ISO 8601 event-time upper bound."
    },
    "event_types": {
      "type": "array",
      "description": "Event types to include.",
      "items": {
        "type": "string"
      }
    },
    "surfaces": {
      "type": "array",
      "description": "Event surfaces to include.",
      "items": {
        "type": "string",
        "enum": [
          "current",
          "shadowed",
          "log-only"
        ]
      }
    }
  },
  "required": [
    "query"
  ]
}
```

來源：[`packages/session-query/tool-session-query/src/index.ts`](../packages/session-query/tool-session-query/src/index.ts)

### `session_event_trace`

讀取已獲授權會話中某個事件的所有直接替換關系，以及該事件與其引用的來源事件之間的關系。

```json
{
  "type": "object",
  "properties": {
    "session_id": {
      "type": "string",
      "description": "Target session id. Omit for the current session."
    },
    "seq": {
      "type": "integer",
      "description": "Target event sequence number."
    }
  },
  "required": [
    "seq"
  ]
}
```

來源：[`packages/session-query/tool-session-query/src/index.ts`](../packages/session-query/tool-session-query/src/index.ts)

### `session_search`

搜索調用方工作區中的先前會話，并從每個會話返回匹配度最高的事件。

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "Literal full-text query over prior session history."
    },
    "session_ids": {
      "type": "array",
      "description": "Optional session ids to include.",
      "items": {
        "type": "string"
      }
    },
    "created_at_from": {
      "type": "string",
      "description": "Inclusive timezone-qualified ISO 8601 creation-time lower bound."
    },
    "created_at_to": {
      "type": "string",
      "description": "Inclusive timezone-qualified ISO 8601 creation-time upper bound."
    },
    "parent_session_ids": {
      "type": "array",
      "description": "Optional direct parent session ids.",
      "items": {
        "type": "string"
      }
    },
    "include_root_sessions": {
      "type": "boolean",
      "description": "Include sessions with no parent in the parent filter."
    },
    "availability": {
      "type": "array",
      "description": "Require at least one selected source availability.",
      "items": {
        "type": "string",
        "enum": [
          "live",
          "persisted"
        ]
      }
    },
    "event_seq_from": {
      "type": "integer",
      "description": "Inclusive event sequence lower bound."
    },
    "event_seq_to": {
      "type": "integer",
      "description": "Inclusive event sequence upper bound."
    },
    "event_time_from": {
      "type": "string",
      "description": "Inclusive timezone-qualified ISO 8601 event-time lower bound."
    },
    "event_time_to": {
      "type": "string",
      "description": "Inclusive timezone-qualified ISO 8601 event-time upper bound."
    },
    "event_types": {
      "type": "array",
      "description": "Event types to include.",
      "items": {
        "type": "string"
      }
    },
    "event_surfaces": {
      "type": "array",
      "description": "Event surfaces to include.",
      "items": {
        "type": "string",
        "enum": [
          "current",
          "shadowed",
          "log-only"
        ]
      }
    }
  },
  "required": [
    "query"
  ]
}
```

來源：[`packages/session-query/tool-session-query/src/index.ts`](../packages/session-query/tool-session-query/src/index.ts)

### `session_trace`

讀取圍繞一個會話的已授權會話譜系，包括完整可見的祖先和后代關系。

```json
{
  "type": "object",
  "properties": {
    "session_id": {
      "type": "string",
      "description": "Target session id. Omit for the current session."
    }
  }
}
```

來源：[`packages/session-query/tool-session-query/src/index.ts`](../packages/session-query/tool-session-query/src/index.ts)

這 5 個只讀工具會隱藏提供方游標，并根據不可變的調用 agent 會話為每個結果授權。該包需要選擇啟用；需要強制截止時間或限制行內輸出的組合還會掛載通用超時或 spill 策略。

<a id="deepseek-aidsh-tool-subagent"></a>

## `@deepseek-ai/dsh-tool-subagent`

### `list_subagent_models`

發現 subagent 可用的 LLM 路由，不更改當前 Agent。無參數調用會列出已注冊提供方；提供 `provider` 時會列出其公布的模型；同時提供 `provider` 和 `model` 時會檢查該精確模型及其推理強度。目錄條目只提供建議：adapter 可能接受未列出的模型 id。把返回的 id 用于委派工具的 `provider`、`model` 與 `reasoning_effort` 字段。

```json
{
  "type": "object",
  "properties": {
    "provider": {
      "type": "string",
      "description": "Registered LLM provider id. Omit to list providers."
    },
    "model": {
      "type": "string",
      "description": "Exact model id to inspect. Requires provider; omit to list that provider's advertised models."
    }
  }
}
```

來源：[`packages/subagent/tool-subagent/src/list-models.ts`](../packages/subagent/tool-subagent/src/list-models.ts)

### `subagent`

將一項自包含任務委派給 subagent（在自身上下文中工作的獨立 agent），用它卸載聚焦且獨立的工作，例如研究、限定范圍的實現或分析，以免消耗當前對話的上下文。subagent 會返回結果，但不會返回中間步驟。請提供完整、獨立的提示詞，因為它看不到當前對話。此調用默認等待結果。設置 `run_in_background: true` 可返回 job id；使用 `job_output` 收集結果，使用 `job_kill` 停止任務。

```json
{
  "type": "object",
  "properties": {
    "description": {
      "type": "string",
      "description": "A short (3-5 word) description of the delegated task, for display."
    },
    "prompt": {
      "type": "string",
      "description": "The complete, self-contained task for the subagent. It does not share this conversation's context, so include everything it needs."
    },
    "run_in_background": {
      "type": "boolean",
      "description": "Whether to run as a background job and return its id. Defaults to false; collect with job_output or stop with job_kill."
    }
  },
  "required": [
    "description",
    "prompt"
  ]
}
```

來源：[`packages/subagent/tool-subagent/src/index.ts`](../packages/subagent/tool-subagent/src/index.ts)

注冊的委派工具名稱取決于加載時 `toolName` 配置（默認為 `subagent`）；上述默認 schema 關閉模型選擇，而發現 schema 則展示為已啟用 Session 中可用的固定配套工具。Web preset 會在每個新頂層 Session 創建時讀取插件頁偏好，并為其子 Session 保留該決定；`subagent_fork` 始終使用固定路由。每個實例通過 `modelSelectionSettings`、`backgroundMode` 與 `enableRunInBackground` 獨立控制是否讀取模型選擇設置及其后臺行為。

<a id="deepseek-aidsh-tool-subagent-control"></a>

## `@deepseek-ai/dsh-tool-subagent-control`

### `interrupt_agent`

根據 agent id 請求取消后臺 agent 的當前輪次。目標可以是你的直接子級，也可以是在你下方創建的更深層 agent。只有當前輪次會停止：已經排隊發給該 agent 的消息會一直擱置到后續的 send_message；它啟動的 agent 會繼續運行；該 agent 本身仍可接受后續操作。停止請求被接受后，此調用立即返回，因此目標可能還會短暫運行；中斷一個已經完成的 agent 是可接受的空操作。

```json
{
  "type": "object",
  "properties": {
    "agent_id": {
      "type": "string",
      "description": "The agent id of the running agent to interrupt."
    }
  },
  "required": [
    "agent_id"
  ]
}
```

來源：[`packages/subagent/tool-subagent-control/src/index.ts`](../packages/subagent/tool-subagent-control/src/index.ts)

### `list_agents`

按持久 id 和標簽列出你的可繼續后臺 subagent。用它回憶你啟動過哪些 subagent，而不是輪詢完成情況——subagent 完成時你會被告知。狀態來自實時注冊表：running 表示 agent 此刻正在工作；idle 表示已加載但處于輪次之間，可能正在等待它啟動的 agent；ready 表示它只存在于存儲中——可恢復而非終態，也不表示有結果等待收集；`send_message` 會在運行中 child 的最近 step 邊界 steer 消息，或為 idle、ready child 啟動輪次，且無論處于哪種狀態，直接子級都仍可作為 `send_message` 的目標。該快照并非投遞承諾；`send_message` 會執行權威檢查，仍可能失敗。無法讀取的子級會作為診斷信息報告，而不會被靜默丟棄。`descendants` 作用域會按穩定的前序順序遍歷你下方的整棵樹，并為每個條目標注其持久的直接父會話 id 和深度。只有深度為 1 的條目可以使用 `send_message`；更深的條目只能作為 `interrupt_agent` 的候選目標。

```json
{
  "type": "object",
  "properties": {
    "scope": {
      "type": "string",
      "description": "children (default) lists direct children only; descendants walks the complete tree below you.",
      "enum": [
        "children",
        "descendants"
      ]
    }
  }
}
```

來源：[`packages/subagent/tool-subagent-control/src/list-agents.ts`](../packages/subagent/tool-subagent-control/src/list-agents.ts)

### `send_message`

根據 agent id 向直接可繼續 child 發送消息。如果你是駐留的可繼續 child，也可以把自己的直接 parent 作為目標。如果目標仍在工作，消息會 steer 其最近的 step；如果目標處于 idle，消息會啟動一個輪次。此調用不會返回該 agent 的答案，只會確認消息已投遞。調用失敗表示消息**未**投遞。

```json
{
  "type": "object",
  "properties": {
    "agent_id": {
      "type": "string",
      "description": "The agent id of your direct continuable child, or your direct parent when you are a resident continuable child."
    },
    "message": {
      "type": "string",
      "description": "The message to deliver to the agent."
    }
  },
  "required": [
    "agent_id",
    "message"
  ]
}
```

來源：[`packages/subagent/tool-subagent-control/src/index.ts`](../packages/subagent/tool-subagent-control/src/index.ts)

這些是控制可繼續后臺 subagent 的全局命名工具：綁定提供方的 `tool-subagent` 實例注冊不同的委派工具；本包注冊一次 `send_message` 和 `interrupt_agent`，另由 `list_agents` 通過單獨加載的 `/list-agents` 插件提供，其目錄行使用 sessionProjections 和實時 Agent 注冊表。

<a id="deepseek-aidsh-tool-jobs"></a>

## `@deepseek-ai/dsh-tool-jobs`

### `job_kill`

根據 job id 請求取消正在運行的后臺任務。此調用立即返回；任務的工作真正停止后，會以 killed 狀態結算。

```json
{
  "type": "object",
  "properties": {
    "job_id": {
      "type": "string",
      "description": "Job id returned by the tool that started the background work."
    },
    "reason": {
      "type": "string",
      "description": "Optional short reason, recorded in the log and forwarded to the job."
    }
  },
  "required": [
    "job_id"
  ]
}
```

來源：[`packages/jobs/tool-jobs/src/index.ts`](../packages/jobs/tool-jobs/src/index.ts)

### `job_list`

列出你的后臺任務（包括正在運行和已完成的任務）及其 id、種類和狀態。

```json
{
  "type": "object",
  "properties": {}
}
```

來源：[`packages/jobs/tool-jobs/src/index.ts`](../packages/jobs/tool-jobs/src/index.ts)

### `job_output`

讀取后臺任務。流式任務只返回自上次讀取以來的輸出；最終輸出任務會在結算后返回結果。每個響應都以 `[status: ...]` 結尾。讀取默認不阻塞；設置 `wait: true` 后，最長等待到配置的上限。

```json
{
  "type": "object",
  "properties": {
    "job_id": {
      "type": "string",
      "description": "Job id returned by the tool that started the background work."
    },
    "wait": {
      "type": "boolean",
      "description": "Block until the job reaches a terminal status or the timeout expires. A timed-out wait returns [status: running] and leaves the job alive."
    },
    "timeout_ms": {
      "type": "number",
      "description": "Max wait in milliseconds (only meaningful with wait: true). Defaults to the configured wait timeout; capped by the configured maximum."
    }
  },
  "required": [
    "job_id"
  ]
}
```

來源：[`packages/jobs/tool-jobs/src/index.ts`](../packages/jobs/tool-jobs/src/index.ts)

與任務種類無關的后臺任務控制器：后臺 bash 命令、PTY 發送和 subagent 都通過相同的 3 個工具讀取、列出和終止。加載該插件會掛接控制器，從而啟用生產方的 `ctx.jobs.start()`。

<a id="deepseek-aidsh-experimental-tool-agent-team"></a>

## `@deepseek-ai/dsh-experimental-tool-agent-team`

### `interrupt_agent`

中斷一名 teammate 的當前 turn，同時保留其待處理 inbox。僅 Team Lead 可用。

```json
{
  "type": "object",
  "properties": {
    "target": {
      "type": "string",
      "description": "Teammate name."
    }
  },
  "required": [
    "target"
  ]
}
```

來源：[`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `list_agents`

列出 Lead 與所有持久 teammate，以及各自當前的運行時狀態。

```json
{
  "type": "object",
  "properties": {}
}
```

來源：[`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `send_message`

向另一名 Team member 發送一條持久消息。running target 會在最近的步驟邊界收到消息；idle target 會啟動一個 turn；inactive teammate 會冷恢復。

```json
{
  "type": "object",
  "properties": {
    "target": {
      "type": "string",
      "description": "Team member name, or lead."
    },
    "message": {
      "type": "string",
      "description": "Self-contained message for the target."
    }
  },
  "required": [
    "target",
    "message"
  ]
}
```

來源：[`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `spawn_teammate`

創建一名具名、持久的 teammate。只有 Team Lead 可以調用此工具。

```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "Unique lower-kebab-case teammate name."
    },
    "description": {
      "type": "string",
      "description": "Short description of the delegated responsibility."
    },
    "prompt": {
      "type": "string",
      "description": "Complete initial task for the teammate."
    },
    "context": {
      "type": "string",
      "description": "fresh starts without Lead history; fork inherits completed Lead turns. Defaults to fresh.",
      "enum": [
        "fresh",
        "fork"
      ]
    }
  },
  "required": [
    "name",
    "description",
    "prompt"
  ]
}
```

來源：[`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `team_task_create`

在共享 Team 任務板上創建一個無 owner 的 pending task。

```json
{
  "type": "object",
  "properties": {
    "subject": {
      "type": "string",
      "description": "Concise task title."
    },
    "description": {
      "type": "string",
      "description": "Complete task details and acceptance criteria."
    },
    "blocked_by": {
      "type": "array",
      "description": "Task ids that must complete first.",
      "items": {
        "type": "string"
      }
    },
    "write_scopes": {
      "type": "array",
      "description": "Advisory workspace-relative file or directory prefixes this task expects to modify.",
      "items": {
        "type": "string"
      }
    }
  },
  "required": [
    "subject",
    "description"
  ]
}
```

來源：[`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `team_task_get`

在修改或執行共享任務前，讀取其完整的最新值。

```json
{
  "type": "object",
  "properties": {
    "task_id": {
      "type": "string",
      "description": "Shared task id."
    }
  },
  "required": [
    "task_id"
  ]
}
```

來源：[`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `team_task_list`

列出共享任務，包括 readiness、owner、revision、blocker 與 write-scope warning。

```json
{
  "type": "object",
  "properties": {
    "status": {
      "type": "string",
      "description": "Optional exact status filter.",
      "enum": [
        "pending",
        "in_progress",
        "completed"
      ]
    },
    "owner": {
      "type": "string",
      "description": "Optional member-name filter; use unowned for tasks without an owner."
    },
    "ready": {
      "type": "boolean",
      "description": "Optional readiness filter."
    },
    "cursor": {
      "type": "integer",
      "description": "Zero-based result offset. Defaults to 0."
    },
    "limit": {
      "type": "integer",
      "description": "Number of rows, 1 through 100. Defaults to 50."
    }
  }
}
```

來源：[`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `team_task_update`

使用 team_task_get 或 team_task_list 返回的最新 revision，對共享任務操作執行 compare-and-set。

```json
{
  "type": "object",
  "properties": {
    "task_id": {
      "type": "string",
      "description": "Shared task id."
    },
    "expected_revision": {
      "type": "integer",
      "description": "Current task revision used as the CAS precondition."
    },
    "action": {
      "type": "string",
      "description": "Task transition to apply.",
      "enum": [
        "claim",
        "release",
        "edit",
        "set_dependencies",
        "complete",
        "reopen",
        "reassign",
        "delete"
      ]
    },
    "subject": {
      "type": "string",
      "description": "Replacement title for edit."
    },
    "description": {
      "type": "string",
      "description": "Replacement details for edit."
    },
    "blocked_by": {
      "type": "array",
      "description": "Complete blocker list for set_dependencies.",
      "items": {
        "type": "string"
      }
    },
    "write_scopes": {
      "type": "array",
      "description": "Replacement advisory write scopes for edit.",
      "items": {
        "type": "string"
      }
    },
    "owner": {
      "type": "string",
      "description": "Member name for Lead-only reassign; omit to unassign."
    }
  },
  "required": [
    "task_id",
    "expected_revision",
    "action"
  ]
}
```

來源：[`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `wait_agent`

等待本次調用開始后下一次 teammate 狀態、mailbox 或共享任務變更。它絕不會喚醒 inactive member；若沒有其他 member 正在 running 或 provisioning，則立即返回 noProgress。喚醒或超時后應重新列出狀態，而不是輪詢。

```json
{
  "type": "object",
  "properties": {
    "timeout_ms": {
      "type": "integer",
      "description": "Wait duration in milliseconds, from 10000 through 3600000. Defaults to 30000."
    }
  }
}
```

來源：[`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

這 10 個工具限定于隱式 Team Lead 與持久 teammate 作用域。隨產品發布的 dsh-base bundle 默認禁用該包；文檔中的 Agent Teams profile patch 會啟用它，并禁用舊 continuable child 的同名控制工具。


<a id="deepseek-aidsh-tool-todo"></a>

## `@deepseek-ai/dsh-tool-todo`

### `todo_write`

記錄并更新當前工作的結構化任務列表。每次調用都要發送**完整列表**，它會**替換**之前的列表，不支持局部更新或逐項編輯。請用它規劃多步驟工作并展示進度：開始前為每個具體步驟添加一項 todo。將當前正在處理的每項 todo 標記為 `in_progress`；確實并行運行時（例如并發 subagent 或后臺命令）可同時標記多項，順序工作則標記 1 項。只要工作尚未完成，就應至少有一項任務為 `in_progress`。某項 todo 完成后立即標記為 `completed`，不要批量標記完成；只有全部工作完成后，才可以沒有 `in_progress` 項。簡單的單步驟任務無需使用列表。狀態：`pending`（未開始）、`in_progress`（正在處理）、`completed`（已完成）。

```json
{
  "type": "object",
  "properties": {
    "todos": {
      "type": "array",
      "description": "The COMPLETE task list, replacing any previous list.",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "content": {
            "type": "string",
            "description": "What the task is — a short imperative line."
          },
          "status": {
            "type": "string",
            "description": "pending (not started) | in_progress (now) | completed (done).",
            "enum": [
              "pending",
              "in_progress",
              "completed"
            ]
          }
        },
        "required": [
          "content",
          "status"
        ]
      }
    }
  },
  "required": [
    "todos"
  ]
}
```

來源：[`packages/todo/tool-todo/src/index.ts`](../packages/todo/tool-todo/src/index.ts)

todo_write 是會話所有的狀態；UI 將最新的 todo/write 事件渲染為檢查清單。`allowParallelInProgress` 是沒有默認值的必填項，因此本目錄明確選擇 `true`，對應描述允許同時存在多個 `in_progress` 項。選擇 `false` 的部署會獲得同一工具，但描述會要求只能有 1 個活動任務。

<a id="deepseek-aidsh-tool-workflow"></a>

## `@deepseek-ai/dsh-tool-workflow`

### `workflow`

運行用于大規模編排 subagent 的 JavaScript 工作流腳本。當工作會分散到許多相互獨立的部分時，請使用此工具，例如審查大量文件、執行遷移、開展多角度研究或對發現進行對抗式驗證；此時應將編排寫成腳本，而不是逐輪委派。

工作流的身份通過 `meta` 參數以 JSON 形式傳入：必填的 `name`（簡短 kebab-case）和 `description` 字符串，以及可選的 `whenToUse` 字符串和 `phases` 數組（`{title, detail?, provider?, model?}`）。`script` 參數只能是純 JavaScript **函數體**，不能是 TypeScript，也不能包含 `export const meta` 語句；meta 是參數而非代碼。腳本支持頂層 await；請以 `return <value>` 結尾，該值必須可以 JSON 序列化，并作為此工具的結果。

腳本函數體提供以下鉤子：

- `agent(prompt, opts?): Promise<any>`：運行一個 subagent 直至完成。不提供 `opts.schema` 時，解析為子級最終文本；提供 `opts.schema` 時，它必須是以對象為根、且**只能**使用 type/properties/required/additionalProperties/items/enum/const/oneOf 的 JSON Schema，不支持 pattern/format/數值邊界，此時解析為通過校驗的對象。子級失敗時解析為 `null`，可使用 `.filter(Boolean)` 過濾。其他選項包括 `label`（顯示名稱）、`phase`（進度組），以及相互獨立的 `provider`／`model` LLM（大語言模型）目標覆蓋項，兩者可單獨提供。其他任何選項（`effort`／`isolation`／`agentType`）都會明確報錯。
- `pipeline(items, ...stages): Promise<any[]>`：讓每個條目分別經過各階段，階段之間**沒有**屏障；多階段工作優先使用它。每個階段接收 `(prev, item, index)`。普通的階段異常會將該**條目**變為 `null`，并跳過它的剩余階段。
- `parallel(thunks): Promise<any[]>`：并發運行零參數函數并等待**全部**完成。它會形成屏障，僅當某個階段確實需要匯總全部先前結果時使用。拋出異常的 thunk 解析為 `null`。
- `phase(title)`：開始一個進度階段；`log(message)`：說明進度；`args`：工具調用的 `args` 輸入，原樣提供。

如果誤用鉤子（參數錯誤、未知選項、不受支持的 schema、觸發上限），拋出的錯誤**總會**終止腳本，絕不會退化為單個條目的 `null`。

約束：并發上限和 agent 總數上限均會生效；不提供文件系統、網絡、定時器或 Node.js API。具體工作由 agent 完成，腳本只負責編排。該運行在前臺執行：整個腳本完成后，調用才會返回。

```json
{
  "type": "object",
  "properties": {
    "script": {
      "type": "string",
      "description": "The plain-JS workflow script body (top-level await allowed; NO `export const meta` statement; end with `return <json-value>`)."
    },
    "meta": {
      "type": "object",
      "description": "The workflow identity block (plain JSON — never code).",
      "additionalProperties": true,
      "properties": {
        "name": {
          "type": "string",
          "description": "Short kebab-case workflow name."
        },
        "description": {
          "type": "string",
          "description": "One-line description of what the workflow does."
        },
        "whenToUse": {
          "type": "string",
          "description": "Optional guidance on when this workflow applies."
        },
        "phases": {
          "type": "array",
          "description": "Optional phase declarations matched by phase() calls.",
          "items": {
            "type": "object",
            "additionalProperties": true,
            "properties": {
              "title": {
                "type": "string",
                "description": "The phase title phase() calls match by exact string."
              },
              "detail": {
                "type": "string",
                "description": "Optional one-line description of the phase."
              },
              "provider": {
                "type": "string",
                "description": "Optional provider override this phase is expected to use."
              },
              "model": {
                "type": "string",
                "description": "Optional model override this phase is expected to use."
              }
            },
            "required": [
              "title"
            ]
          }
        }
      },
      "required": [
        "name",
        "description"
      ]
    },
    "args": {
      "type": "object",
      "description": "Optional JSON input exposed to the script as the `args` global (wrap a bare list as a field, e.g. {\"files\": [...]}).",
      "additionalProperties": true
    }
  },
  "required": [
    "script",
    "meta"
  ]
}
```

來源：[`packages/workflow/tool-workflow/src/index.ts`](../packages/workflow/tool-workflow/src/index.ts)

<a id="deepseek-aidsh-tool-web"></a>

## `@deepseek-ai/dsh-tool-web`

### `web_fetch`

獲取指定 HTTP(S) URL 的內容，并將其解碼為文本后返回。

```json
{
  "type": "object",
  "properties": {
    "url": {
      "type": "string",
      "description": "The HTTP(S) URL to fetch."
    }
  },
  "required": [
    "url"
  ]
}
```

來源：[`packages/web/tool-web/src/index.ts`](../packages/web/tool-web/src/index.ts)

### `web_search`

在 Web 上搜索最新信息。在必填的 `queries` 數組中提供 1–4 個查詢。返回可選的摘要答案和來源 URL 列表。

```json
{
  "type": "object",
  "properties": {
    "queries": {
      "type": "array",
      "description": "Required search queries; accepts 1–4 items and merges their results.",
      "items": {
        "type": "string"
      }
    }
  },
  "required": [
    "queries"
  ]
}
```

來源：[`packages/web/tool-web/src/index.ts`](../packages/web/tool-web/src/index.ts)

web_search 和 web_fetch 將提供方選擇置于 ctx.web 之后，使模型可見 schema 在更換后端時保持穩定。
