# 僅限 Session 內的 Schedule

[English](schedule.md) | 中文

Schedule 擁有持久提醒；這些提醒會作為普通的后續對話輪次返回原 live Session。[持久 Schedule Agent Note](../../.agents/notes/implemented/feature/2026-08-05-durable-web-schedule.zh.md) 負責持久化、生命周期與活動狀態呈現，[顯式時區邊界](../../.agents/notes/implemented/simplification/2026-08-09-explicit-schedule-time-zone.zh.md) 負責瀏覽器本地解釋。本頁記錄 [`packages/schedule/schedule/src/types.ts`](../../packages/schedule/schedule/src/types.ts) 中的持久數據形狀和面向模型的數據形狀；[包 README](../../packages/schedule/schedule/README.zh.md) 負責組合、工具行為與確切的提醒 framing。

## 持久記錄

`ScheduleId` 是[品牌化 id](core.zh.md#branded-ids)，在單個 Session 內唯一且絕不復用。版本 1 支持正的安全整數 `after_seconds` 延時、顯式的絕對 `at` 目標，或至少五分鐘的安全整數 `every_seconds` 間隔。創建操作會將每個初始目標規范化為使用四位年份的 RFC 3339 UTC `scheduledAt`；`after` 記錄會保留提交的延時，`at` 記錄只存儲結果時點，`every` 記錄則保留固定間隔和下一個目標。

```ts type-equiv
/** Durable one-shot reminder created from a positive delay. */
interface AfterScheduleRecord {
  /** Session-local stable identity. */
  readonly id: ScheduleId
  /** Rule discriminator for a delayed one-shot reminder. */
  readonly kind: 'after'
  /** Trimmed reminder content supplied at creation. */
  readonly prompt: string
  /** Positive safe-integer delay accepted at creation. */
  readonly afterSeconds: number
  /** Four-digit-year RFC 3339 UTC target. */
  readonly scheduledAt: string
}
```

```ts type-equiv
/** Durable one-shot reminder created from an absolute instant. */
interface AtScheduleRecord {
  /** Session-local stable identity. */
  readonly id: ScheduleId
  /** Rule discriminator for an absolute one-shot reminder. */
  readonly kind: 'at'
  /** Trimmed reminder content supplied at creation. */
  readonly prompt: string
  /** Four-digit-year RFC 3339 UTC target. */
  readonly scheduledAt: string
}
```

```ts type-equiv
/** Durable fixed-rate reminder whose next target remains creation-anchor-aligned. */
interface EveryScheduleRecord {
  /** Session-local stable identity. */
  readonly id: ScheduleId
  /** Rule discriminator for a fixed-rate recurring reminder. */
  readonly kind: 'every'
  /** Trimmed reminder content supplied at creation. */
  readonly prompt: string
  /** Fixed safe-integer interval, never below five minutes. */
  readonly everySeconds: number
  /** Earliest anchor-aligned occurrence not yet dispatched. */
  readonly scheduledAt: string
}
```

```ts type-equiv
/** One-shot record variants that terminate on an id-only dispatch. */
type OneShotScheduleRecord = AfterScheduleRecord | AtScheduleRecord
```

```ts type-equiv
/** The v1 durable reminder record union. */
type ScheduleRecord = OneShotScheduleRecord | EveryScheduleRecord
```

## 絕對時間輸入

`at` 選擇器可以是嚴格且帶偏移量的 RFC 3339 字符串，也可以是精確的本地日歷對象。本地形式讓這種解釋在工具邊界保持顯式：

```ts type-equiv
/** Structured local-calendar input accepted by `schedule_create`. */
interface LocalAtInput {
  /** Four-digit ISO calendar date. */
  readonly date: string
  /** Local wall-clock time with optional one-to-three digit milliseconds. */
  readonly time: string
  /** Explicit UTC or IANA Area/Location zone. */
  readonly time_zone: string
}
```

```ts type-equiv
/** Absolute selector accepted by `schedule_create`. */
type AtInput = string | LocalAtInput
```

官方 Web overlay 會為每條提示詞采樣瀏覽器的 IANA 時區。當 open turn 只有一個無歧義的瀏覽器時區時，Time-context 會告訴模型按該請求本地時區解釋未明確限定時區的自然語言日期和時間；provenance 混合或缺失時，則告訴模型詢問用戶。該指引不是持久 Session 默認值：模型仍必須在字符串形式中傳入偏移量，或在本地形式中傳入 `time_zone`；Schedule 絕不會讀取瀏覽器、Session、進程或模型上下文。

Schedule 會拒絕無效偏移量與時區、不帶偏移量的字符串、非未來目標，以及落在夏令時缺口內的本地時間。遇到夏令時重疊時，會選擇第一次出現的較早時點。創建成功后只存儲規范化后的 UTC `scheduledAt`，因此回放絕不依賴環境時區狀態。

## 固定速率輸入與補償

`every_seconds` 是每條記錄單獨擁有且至少為 300 秒的間隔，以創建時間為錨點。它只提供固定速率重復調度：協議不包含日歷規則或 Cron 表達式、重復調度時區、共享冷卻時間或跨記錄準入門禁。

如果一個 Session 在多個目標到期期間處于 cold 或 busy 狀態，一條 Every 記錄只會貢獻其中最新的一次到期觸發。dispatch 會直接將記錄推進到 dispatch 判斷時刻之后第一個與創建錨點對齊的目標，而不會枚舉、持久化或回放錯過的間隔。如果下一個目標無法落在四位數年份的 UTC 范圍內，最后一次 dispatch 將終結該記錄。

當多條彼此不同的 Every 記錄均已到期，且沒有一次性提醒到期時，每條記錄都會向同一個 follow-up 批次貢獻一次觸發，并按目標時間和創建順序排列。每條 Every 記錄的狀態互相獨立，但該獲準批次中的所有 dispatch 都使用同一個判斷時刻。批處理限制模型輪次數量；五分鐘下限限制每條記錄的 timer 頻率。

## 持久變更與回放

版本 1 的 `schedule/change` 會話事件是 Schedule 唯一的持久權威。create 保存完整記錄，delete 是終結性且僅含 id 的轉換。一次性提醒的 dispatch 同樣是終結性且僅含 id。Every dispatch 攜帶用于選擇最新到期觸發的墻鐘判斷時刻，通常推進活動記錄而不終結它。dispatch 表示 follow-up 已同步入隊，而不表示模型答復成功或用戶已讀取答復。

```ts type-equiv
/** Creates one durable reminder record. */
interface ScheduleCreateChange {
  readonly version: 1
  readonly operation: 'create'
  readonly schedule: ScheduleRecord
}
```

```ts type-equiv
/** Deletes one currently active reminder. */
interface ScheduleDeleteChange {
  readonly version: 1
  readonly operation: 'delete'
  readonly id: ScheduleId
}
```

```ts type-equiv
/** Records that one active one-shot reminder entered the durable dispatch history. */
interface OneShotScheduleDispatchChange {
  readonly version: 1
  readonly operation: 'dispatch'
  readonly id: ScheduleId
}
```

```ts type-equiv
/** Records one fixed-rate decision and advances directly past missed occurrences. */
interface EveryScheduleDispatchChange {
  readonly version: 1
  readonly operation: 'dispatch'
  readonly id: ScheduleId
  /** Wall-clock decision time used to select the latest due occurrence. */
  readonly acceptedAt: string
}
```

```ts type-equiv
/** Durable dispatch shapes supported by the current rule set. */
type ScheduleDispatchChange = OneShotScheduleDispatchChange | EveryScheduleDispatchChange
```

```ts type-equiv
/** Strict version-1 durable Schedule mutation union. */
type ScheduleChange = ScheduleCreateChange | ScheduleDeleteChange | ScheduleDispatchChange
```

嚴格 decoder 與 fold 會拒絕未知版本、額外字段、復用 id、不匹配的一次性提醒或 Every dispatch 形狀，以及針對非活動記錄的 delete 或 dispatch 轉換。普通 Session 折疊完整事件流。fork 只折疊精確 `inheritedEventCount` 位置及其后的事件，因此保留歷史，但不會接管父 Session 的活動提醒。Projection 初始化會在不可變 header 旁接收該 cut，復用共享 transition，并持久化 cut、活動記錄與已使用 id 歷史，使緩存恢復繼續保持嚴格回放。`schedule/change` 聲明和源碼位置也編入[持久化目錄](../persistence-catalog.zh.md#schedulechange--log-only)。

## 活動視圖與管理

工具值將持久記錄與根據當前墻鐘派生的交付狀態組合起來。`session-local` 表示原 Session 必須處于 live 狀態：不存在外部通知渠道或 cold Session scheduler。

```ts type-equiv
/** Current delivery timing derived from the durable record and wall clock. */
type ScheduleState = 'scheduled' | 'overdue'
```

```ts type-equiv
/** Fixed v1 delivery boundary: the original session must be live. */
type ScheduleDeliveryMode = 'session-local'
```

```ts type-equiv
/** Complete model-facing view of one active reminder. */
type ScheduleView = ScheduleRecord & {
  /** Whether the target remains in the future. */
  readonly state: ScheduleState
  /** Reminder delivery never leaves the owning session. */
  readonly deliveryMode: ScheduleDeliveryMode
}
```

生成的[工具目錄](../tool-catalog.zh.md#deepseek-aidsh-schedule)負責 `schedule_create`、`schedule_list` 和 `schedule_delete` 的參數與結果 schema。一條 Agent-scoped 隊列將管理調用與到期工作串行化。每次讀取或判斷都會先等待共享的 Session 持久化 barrier；create 與實際執行的 delete 在追加后還會再次等待。barrier 失敗會報告 `persistence_uncertain`，而不是猜測 eager write 是否已提交。其他穩定錯誤代碼是 `invalid_prompt`、`invalid_selector`、`invalid_rule`、`invalid_time_zone`、`not_future`、`time_out_of_range`、`frequency_too_high`、`corrupt_schedule_log` 和 `internal_error`。

## 只讀 Web 目錄

可選 Session projection 注冊表存在時，Schedule 會注冊客戶端可見的 `schedule` key，其值是完整的活動 `ScheduleRecord[]`。live、cache、history 與 detached 讀取共用同一套 header-aware 嚴格 fold；畸形權威輸入會使既有讀取路徑失敗，而不會發布部分值。

shipped Web bundle 默認禁用 `ui-schedule`，顯式 Schedule overlay 則把它與 Host 能力一同啟用。[`dsh-client-ui-schedule`](../../packages/client/ui-schedule/README.zh.md)擁有 header 交互，[`dsh-client-ui-workspace`](../../packages/client/ui-workspace/README.zh.md)擁有列表行呈現，持久 Schedule Agent Note 擁有二者共享的活動狀態邊界。共享值只表示當前活動狀態，絕不表示交付歷史或回執；到期提醒仍通過下文所述的普通 Assistant 輸出出現。

## Live 交付

進程內 owner 根據持久 fold 派生最早的 timer，并在每次有界等待后重新讀取墻鐘。cold Session 不執行任何工作；重新打開后會重建 timer，并使已經過去的目標進入 overdue 狀態。到期的一次性提醒享有優先級，每次只進入一個后續輪次。當沒有一次性提醒到期時，所有 overdue 的 Every 記錄會組成上述單個批次。

到期工作會先等待 Agent 完全 idle 并認領 maintenance phase，再重新折疊狀態、采樣本次判斷、將一個 `followup()` 排入隊列，并追加對應的 dispatch 變更。它絕不會調用 `steer()`，也絕不會中斷當前輪次。

獲得準入的一次性提醒或固定速率批次會啟動一個普通的后續輪次，且只通過普通對話 transcript（文本記錄）出現；Schedule 不提供獨立的持久 Web 回執。上面的只讀活動目錄絕不表示交付成功。如果 framing 構造或同步隊列準入失敗，則不會記錄 dispatch，提醒仍保持活動。隊列準入后、持久 dispatch 前的狹窄崩潰窗口可能使提醒內容在恢復后重復，因此該邊界提供的是盡力而為的至少一次交付，而非恰好一次交付。
