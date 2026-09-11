# 實操手冊：擴展插件形態

[English](extension-cookbook.md) | 中文

harness 擴展的參考模式。代碼片段省略了 import 和輔助實現，無法直接復制運行。具體編寫路徑見[包檢查清單](adding-a-package.zh.md)、[第一個工具教程](../user/develop/basic/tool.zh.md)、[工具參考](adding-a-tool.zh.md)、[LLM（大語言模型）適配器指南](adding-an-llm-adapter.zh.md)和 [Session 格式版本教程](adding-a-session-format-version.zh.md)；系統與擴展點映射由[架構文檔](../architecture.zh.md)負責。

## 工具插件

工具在 `ctx.tools` 上注冊。帶注解的 `defineTool` 示例（類型化的 `execute` 參數、結果構造、`run_in_background` 模式）見 [adding-a-tool.md](adding-a-tool.zh.md)——該指南是工具定義的真源。`ctx.tools.register()` 也直接接受原始 JSON Schema `ToolDefinition`（MCP 來源的工具就是這樣到達的）；`defineTool` 是第一方工具使用的類型化輔助函數。

<a id="a-hook-plugin-permission-gate-example"></a>

## 鉤子插件（以權限門禁為例）

這個權限門禁是鉤子插件的一個示例。它從 `tools/pre-execute` 門禁返回一個類型化的決策，用于允許或拒絕一次調用；沙箱、權限和 plan-mode 插件都可以使用該擴展點。鉤子插件也可以攔截其他擴展點，本身并不等同于權限門禁。「原生鉤子」是在攔截點上運行的普通 Cordis 插件，不需要外部協議。

```ts
import type { Context } from '@deepseek-ai/cordis'
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'

declare function isAllowed(exec: ToolExecution): Promise<boolean>

export const name = 'permission-gate'

export function apply(ctx: Context) {
  ctx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
    if (!(await isAllowed(exec))) {
      return { kind: 'deny', reason: 'Denied by policy.' }
    }
    return next()
  })
}
```

這個 waterfall（瀑布式事件）是可重排的策略層。當不變式需要單調的最終拒絕時使用 `ctx.tools.guard()`；當插件需要包裹分發生命周期時（超時/重試/指標；僅 `exec.signal` 可替換）使用 `tools/execute`；顯式結果變換使用 `tools/post-execute`；對不可變最終結果的受限觀察使用 `tools/result`。選擇規則見[添加工具指南](adding-a-tool.zh.md#execution-policy-and-observation)。

## UI 插件

UI 插件把持久 `session/event` record（Assistant settlement、輪次/步驟邊界與工具活動）和用于實時 token 呈現的瞬態 `agent/assistant-stream` frame 組合起來，并通過 `agent.followup()` / `agent.steer()` 將輸入驅動回去。如果瀏覽器插件要向內建 Web Client 貢獻業務行，則應注冊 `ConversationNodeDefinition` 與 keyed Chat renderer；具體約定見 [Conversation 子系統參考](../subsystems/conversation.zh.md)。

```ts
import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'

declare function render(text: string): void
declare function onUserInput(handler: (text: string) => void): void

export const name = 'my-ui'
export const inject = ['agents']

export function apply(ctx: Context) {
  ctx.on('agent/assistant-stream', ({ frame }) => {
    if (frame.type === 'chunk' && frame.chunk.type === 'text-delta') {
      render(frame.chunk.text)
    }
  })
  onUserInput(text => ctx.agents.get(brandString<SessionId>('client-session'))?.followup(createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  })))
}
```

## 外部協議驅動

*協議驅動*將協議對端接入 `ctx.agents`；它可以服務于 UI 或自動化客戶端。stdio 驅動擁有 stdout，通過工廠創建或恢復 agent（智能體），并將協議請求映射為 `followup()` 或 `cancel()`。底層提示詞請求返回其持久入隊回執；它不會通過關聯 `MessageId` 與 `turn/end` 獲得結果。整個 agent 的狀態應單獨發布。自動化方法可以從回執等待到下一次 idle，并概括這一顯式擁有的區間；UI 通常則會持續觀察開放式事件流。通過 `AgentHandle.dispose()` 拆除 agent，以使 dispose（資源釋放）達到完全停穩。

[`packages/acp/acp`](../../packages/acp/acp) 是僅面向自動化的完整示例：它通過 ACP（Agent Client Protocol）JSON-RPC stdio 提供全新文本會話，發出已提交的助手文本，并為其擁有的 agent 注冊一次性機器權限應答器。其 [README](../../packages/acp/acp/README.zh.md) 定義確切的方法、事件順序和生命周期約定。

```ts
import type { Context } from '@deepseek-ai/cordis'
import { expandAssistantStream } from '@deepseek-ai/dsh-llm'

export const name = 'my-protocol-bridge'
export const inject = ['agents', 'sessions', 'sessionPersistence']

export function apply(ctx: Context) {
  // Publish every committed Assistant text delta to the client.
  ctx.on('session/event', (_session, event) => {
    if (event.type === 'assistant/message' || event.type === 'assistant/attempt') {
      for (const { chunk } of expandAssistantStream(event.data.stream)) {
        if (chunk.type === 'text-delta') {
          // sendToClient({ kind: 'message_chunk', text: chunk.text })
        }
      }
    }
  })
  // Inbound "prompt": create/resume an agent, feed it, and return its enqueue receipt.
  // Whole-agent status is a separate notification; no turn end belongs to this prompt.
  // Teardown reaches quiescence via AgentHandle.dispose() (stop + await exit).
}
```

## 可運行的組裝示例

交付應用通過 `packages/bundle/*/cordis.patch.yml` 提供 profile 層，產品 `dsh` 啟動器通過具名 profile 負責 Web、ACP、SDK 與一次性 headless 執行。可選的用戶 overlay 位于 `apps/cli/config/examples/`；profile 集成測試位于 `apps/cli/tests/profiles/`，包專屬 Loader 組合則留在對應包的測試目錄中。

<a id="the-feature--mechanism-map"></a>

## 功能→機制映射

每個產品功能都映射到一個文檔化擴展點上的監聽器——微內核聲明由此可驗證（[微內核 Agent Note](../../.agents/notes/implemented/architecture/2026-06-11-microkernel-event-taxonomy.zh.md)）。沒有任何一行修改循環本身。

`system-prompt/assemble` 是一個專家協作式的整體裝配變換：其返回的裝配結果具有權威性，因此監聽器作者有責任保留活躍的 PTC mode 和結構化輸出協議的貢獻。對于需要在展示、查找和執行之間保持對齊的工具過濾，優先使用 `ctx.tools.restrict()`。

| 產品功能 | 插件機制 |
|---|---|
| 鉤子系統（用戶級 + 項目級） | `agent/session-start`、`agent/pre-step`、`agent/request`、`tools/pre-execute`、`tools/post-execute` 和 `agent/turn-stopping` 上的監聽器；waterfall 返回類型化決策，`agent/turn-stopping` 則可通過 steering（中途引導）觸發下一步；`dsh-hooks-claude-code` / `dsh-hooks-codex` 橋接器將鉤子配置文件映射到這些擴展點上 |
| `/goal` | `ctx.goals` 管理持久狀態，`dsh-goal-round-driver` 通過公共 `Agent` 調度同會話 Round，獨立的命令/工具生產方分別提供人類/模型控制 |
| `/loop` | 在 `turn/end` 會話事件上 `followup()` 下一次迭代；或強制繼續 |
| 動態工作流 | `ctx.workflowEngine` + worker-thread 引擎 + `workflow` 工具；結構化的進程內子任務通過作用域化的提示詞/工具注冊、單調工具守衛、最終 `tools/result` 提交（包括外層 `run_code`）和結構化輸出執行的單調 `concludeTurn()` 標記來強制輸出 |
| 排隊消息 + steering | 核心 `Agent.followup()` / `Agent.steer()` |
| 上下文壓縮（context compaction）（自動 + 手動） | `ctx.compaction` seam + `dsh-compaction-basic`；自動壓力檢查運行在串行 `agent/pre-step`，標準的溢出恢復機制運行在 `agent/request-error`，手動調用方使用同一個壓縮服務（[壓縮 Agent Note](../../.agents/notes/implemented/feature/2026-06-18-compaction-capability-seam.zh.md)） |
| 系統提示詞可配置性 | `ctx.systemPrompt.section()`，支持排序與作用域局部覆蓋 |
| AGENTS.md（根目錄） | 一個讀取該文件的 section 提供方 |
| AGENTS.md（子目錄，按需觸發）+ 文件變更通知 | 從 watcher / 工具結果監聽器調用 `agent.inject()` |
| 內置工具 | `ctx.tools.register()`；schema 自動流入裝配——`dsh-tool-*` 系列（bash、fs、web、subagent、todo）是已交付的示例 |
| ToolSearch / 漸進式披露 | 當可見集變化時替換一個作用域化的 `ctx.tools.restrict()` 注冊；注冊表保持展示、查找和執行三者對齊 |
| 工具截止時間 / 重試 / 指標 | 用 `tools/execute` 包裹核心分發；包裝層可替換 `exec.signal`、委托執行，并在同一詞法生命周期內檢視規范化結果 |
| 最終工具結果指標 / 審計 / 捕獲 | 用 `tools/result` 觀察不可變的權威結果；僅當插件需要變換結果或附加上下文時才使用 `tools/post-execute` |
| 單調終端輪次策略 | 從成功的終端工具調用 `ToolExecution.concludeTurn()`；同一響應中后續工具調用仍可由守衛阻止，循環在該步驟后停止 |
| 子進程沙箱（landlock / sandbox-exec） | 通過 `dsh-bash-sandbox` 使用 `ctx.sandbox` 后端；能力級別的拒絕使用 `tools/pre-execute` |
| 權限系統 / AskUserQuestion | 從 `tools/pre-execute` 返回 `ask` 并通過 `ctx.approval` 應答；為普通用戶提問注冊一個獨立的面向模型的 ask 工具 |
| Plan mode | [`@deepseek-ai/dsh-plan-mode`](../../packages/plan/plan-mode/README.zh.md)：落日志的 `plan/mode` 狀態、`plan:policy` 引導段、`/plan [message]` 入口、`/plan off` 直接退出，以及經用戶評審的 `exit_plan_mode` 出口；強制約束留在獨立的沙箱/審批軸上 |
| subagent 委派 | `ctx.subagents` 提供方注冊表（`dsh-subagent-spawn-in-process`/`dsh-subagent-fork-in-process`/`dsh-subagent-acp`/`dsh-subagent-codex`/`dsh-subagent-claude-code`/`dsh-subagent-dsh-sdk`）+ `dsh-tool-subagent` 向模型暴露一個已配置的提供方 |
| MCP | 每個服務器一個插件：發現工具 → `ctx.tools.register()` |
| skill（技能） | section + 工具注冊；調用時通過 `inject()` 注入 skill 內容 |
| 記憶 | section 提供方 + 工具 |
| 定時任務（cron） | 插件注冊面向模型的調度工具；定時器觸發 → 空閑時 `followup(…, {source: {kind: 'plugin', plugin: 'schedule'}})`／忙碌時 `inject()` 通知 |
| UI（GUI；CLI（命令行界面）輸出 JSONL） | 監聽 `agent/assistant-stream` 的實時 chunk，并監聽 `session/event` 的持久 settlement、邊界與工具活動；輸入 → `followup()` |
| Web Client Chat 業務節點 | 注冊 `ConversationNodeDefinition` 與 `conversation.chat.node` keyed renderer |
| 遙測 / 可回放 trace | `session/event` → JSONL；回放 = `sessions.create(id, { seed })` |
| 模型適配器 | 通過 `registerAdapter` 注冊 `LlmAdapter` 子類（`dsh-llm-deepseek`、`dsh-llm-pi-ai`） |
| 插件熱重載 | 每個注冊都是一個 `ctx.effect` → 隨倉庫提供的 HMR（熱模塊替換）直接生效 |
