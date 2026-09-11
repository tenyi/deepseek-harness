# 計劃模式

[English](plan.md) | 中文

計劃模式是 [dsh-plan-mode](../../packages/plan/plan-mode) 擁有的、記錄到日志的逐 agent（智能體）協作狀態（`ctx.planMode`，`PlanModeController`）：激活期間，每個模型請求都會包含一段部署持有的指引。計劃模式是**軟性指引**。[沙箱模式](sandbox.zh.md)與[審批策略](approval.zh.md)分別強制限制；兩者都不讀寫計劃狀態，因此部署需要分別配置它們。該包是可選項，agent loop（智能體循環）不依賴它。它貢獻 `plan:policy` 提示詞段落，并注冊 `exit_plan_mode` 工具和 `/plan` 命令。[設計說明](../../.agents/notes/implemented/simplification/2026-07-22-plan-specific-collaboration-state.zh.md)負責決策依據；[包 README](../../packages/plan/plan-mode/README.zh.md)負責模型體驗與限制細節。

源碼：[`packages/plan/plan-mode/src/index.ts`](../../packages/plan/plan-mode/src/index.ts)

## 已記錄狀態與恢復

`plan/mode`（`{ active: boolean }`）是僅記日志、整值替換的[會話事件](session.zh.md)：持久且可回放，絕不進入模型 transcript（文本記錄）。可選注冊的 `plan` 單元折疊已提交模式、命令結算結果和最近一次請求頭記錄的模式。`ctx.planMode` 通過 `stateOf()` 讀取該狀態；注冊表、`plan` key 或 `turnBoundary` key 缺失時，第一次依賴它們的訪問會失敗。客戶端只接收 `{ active, pending }`；恢復、fork 與壓縮（compaction）都能從日志恢復兩者。完整事件聲明見[持久化日志事件目錄](../persistence-catalog.zh.md)。

## 待生效選擇與 pre-step 追加

由于每個會話事件都位于輪次之內，用戶選擇會保持待生效狀態，直到下一個被接受的輪內 pre-step 在派生請求之前追加該選擇，無論該 pre-step 位于哪個輪次。選擇不會強制續行，因此在某輪最后一個被接受的 pre-step 之后作出的選擇會在之后的輪次追加。`set(agent, active)` 記錄待生效選擇（目標值與已記錄或已在等待的狀態相同時不做任何事），`get(agent)` 返回 `{ active: boolean; pending?: boolean }`：用于組裝當前步驟的已記錄狀態，以及等待追加的已選狀態。

agent 運行時，唯一的追加點是前置（prepend）注冊的 `agent/pre-step` 監聽器。它會觀察每個候選請求步驟，包括第 1 輪第 1 步和請求恢復重試；它先調用下游監聽器，只在下游接受該步驟后追加。提示詞準入發生在輪次開啟之前，無法追加 `plan/mode`，因此在提示詞處作出的選擇由它開啟的輪次內第一個被接受的 pre-step 追加。追加失敗不能阻塞輪次，且該選擇會繼續等待之后被接受的輪內 pre-step。追加用戶選擇時還會記錄一條插件來源的 `user/message` 通知，但僅當最后記錄的請求頭描述的是另一種狀態時才記錄，因此模型恰好在上下文變化時收到通知，且絕不重復。在某輪最后一個被接受的 pre-step 之后作出的選擇只存在于進程內；如果進程在另一個被接受的輪內 pre-step 之前退出，該選擇會丟失（[README 限制](../../packages/plan/plan-mode/README.zh.md#known-limitations-and-deferred-work)）。

## 配置

```ts type-equiv
/** Deployment-owned plan guidance. */
interface PlanModeConfig {
  /** Guidance rendered as the `plan:policy` prompt section while plan mode is active. */
  section: string
}
```

`section` 缺失、為空白或不是字符串，以及任何未知鍵，都會在插件加載時失敗，而不是被忽略。計劃模式激活期間，確切的 `section` 文本以 order 50 渲染為 `plan:policy` [系統提示詞段落](system-prompt.zh.md)；未激活的計劃模式不貢獻任何文本。

## 退出工具與 `/plan` 命令

[`exit_plan_mode`](../tool-catalog.zh.md#deepseek-aidsh-plan-mode) 在計劃模式未激活時仍保持注冊，因此進入或離開計劃模式只改變提示詞段落，絕不改變請求的工具目錄；在計劃模式之外執行會失敗。在計劃模式中，它要求一份以 `#` 標題開頭的完整 markdown 計劃，并通過[用戶交互 seam](user-questions.zh.md) 呈交評審。批準返回 `{ approved: true }`，并記錄一個靜默（不敘述）的待生效退出，由下一個被接受的輪內 pre-step 追加。因此，計劃指引在 assistant 當前這批工具調用的剩余部分繼續生效，而工具結果本身會報告這次轉換。「繼續規劃」則是一次攜帶用戶反饋的失敗調用，模型據此修訂并再次呈交；評審期間交互通道缺失或服務重載同樣使調用失敗，而不是靜默離開計劃模式。

當 [`ctx.commands`](commands.zh.md) 被組合時，插件注冊 `/plan [off|message]`：單獨的 `/plan` 選擇計劃模式；任何其他非空消息先選擇計劃模式，再通過 `agent.steer()` 提交該文本，使其在計劃指引下成為下一步驟的普通已記錄用戶消息；確切參數 `off` 選擇未激活，這還會在待生效條目被追加并對請求可見之前將其取消。

## 服務

`ctx.planMode` 擁有已記錄的計劃狀態，在步驟開始時應用并敘述選中的狀態，還擁有 `plan:policy` 段落、`/plan` 命令和穩定注冊的退出工具；`get`/`set` 簽名見生成的[服務目錄](#ctxplanmode--planmodecontroller)。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxplanmode--planmodecontroller"></a>

### `ctx.planMode` — `PlanModeController`

`ctx.planMode`: owns logged plan state, applies and narrates selected state at step start, the `plan:policy` section, the `/plan` command, and the stable exit tool. Client carriers expose the projection's cropped `{ active, pending }` view.

```ts cordis-catalog
/**
 * Read the logged plan state and any selected state awaiting the next
 * accepted in-turn pre-step.
 *
 * @param agent The agent to read.
 * @returns Current logged state plus a pending selection, when present.
 */
get(agent: Agent): { active: boolean; pending?: boolean }

/**
 * Select whether plan mode should be active. Between turns the method
 * appends the change immediately because no in-turn pre-step will run until
 * another prompt starts a turn. The open-turn fold is the idle signal:
 * agent status stays `running` through post-turn checkpointing, when no
 * further in-turn pre-step runs. During an open turn the selection remains
 * pending until the next accepted in-turn pre-step. Repeated selection of
 * the current or already-pending state is a no-op.
 *
 * @param agent The agent to switch.
 * @param active Whether plan mode should be active.
 * @returns what happened: `committed` (logged now), `queued` (awaiting the
 * next accepted in-turn pre-step), `cancelled` (an opposite pending selection
 * was cleared; the logged state already matches), or `noop` (already in that
 * state).
 */
set(agent: Agent, active: boolean): 'committed' | 'queued' | 'cancelled' | 'noop'
```

Types: [Agent](core.zh.md)

Source: [`packages/plan/plan-mode/src/index.ts`](../../packages/plan/plan-mode/src/index.ts)
<!-- END GENERATED cordis-surface -->
