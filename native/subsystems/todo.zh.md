# Todo

[English](todo.md) | 中文

本頁記錄 [`@deepseek-ai/dsh-tool-todo`](../../packages/todo/tool-todo/README.zh.md) 擁有的持久 todo 詞匯。面向模型的工具會整體替換一個 agent（智能體）會話的列表；該包還擁有事件聲明、回放投影和不變量配套插件。工具行為與配置見[包 README](../../packages/todo/tool-todo/README.zh.md)。

源碼：[`packages/todo/tool-todo/src/types.ts`](../../packages/todo/tool-todo/src/types.ts)

## `TodoItem`：一條列表項

```ts type-equiv
/**
 * One entry in an agent's todo list — the unit of the `todo/write`
 * whole-list snapshot declared by this package.
 *
 * Deliberately minimal: a human-readable `content` line and a three-state
 * `status`. No id, priority, or `activeForm` — the list is replaced wholesale
 * on every write (last-write-wins), so entries need no stable identity. The
 * three statuses describe the complete portable lifecycle needed by model and
 * UI consumers.
 */
interface TodoItem {
  /** What this task is — a short imperative line shown in the UI. */
  content: string
  /** Lifecycle state. `in_progress` marks a task being worked now; parallel work may mark several. */
  status: 'pending' | 'in_progress' | 'completed'
}
```

## 持久事件與不變量

該包通過聲明合并把 `todo/write: { todos: TodoItem[] }` 加入 `SessionEventMap`。此事件僅寫入日志，并攜帶完整替換列表；生成的[持久化目錄](../persistence-catalog.zh.md#todowrite--log-only)會記錄其聲明位置。該包的不變量配套插件會單次遍歷校驗現有會話和新發布的會話，隨后增量追蹤已提交的輪次邊界，使每個實時 `todo/write` 都能在追加前得到校驗，而無需重新掃描日志。
