---
description: "在權威 Session 日志中保存已完成 assistant 消息的評分、分類與備注。"
kind: "package-reference"
---

# @deepseek-ai/dsh-message-feedback

[English](README.md) | 中文

## 概述

本服務為已完成的 assistant 消息記錄好評、差評、固定反饋分類表中的可選分類，以及可選的原樣備注。每次創建、編輯和刪除都由權威 Session 日志保存；`list`、`put` 和 `delete` 提供當前反饋，不會構造或喚醒 agent（智能體）。反饋僅寫入日志，不進入模型歷史。

## 目錄

- [使用本包](#use-this-package)
- [理解實現](#understand-the-implementation)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備注](#dev-note)

<a id="use-this-package"></a>
## 使用本包

將 `dsh-message-feedback` 與 `sessions`、`sessionPersistence` 一起掛載。它不需要 storage-domain 服務。Web 組合提供瀏覽器消費方，并將備注上限設為 8192 字節。

### 配置

| 字段 | 默認值 | 含義 |
|---|---|---|
| `maxNoteBytes` | 必填 | 單條可選備注的 UTF-8 字節上限，必須為大于零的安全整數。 |

提交的備注必須包含非空白字符，且不超過配置的字節上限。空白備注返回 `note-blank`；過長備注返回 `note-too-large`。通過校驗的文本會完整保留，包括首尾空白。省略備注會清除它。備注校驗先于 Session 查找。提交的分類必須是[固定反饋分類](../command-feedback/README.zh.md#the-web-feedback-dialog)之一；Remote schema 拒絕其他值，省略分類會清除它。

### 讀取與修改反饋

| 操作 | 請求 | 成功 | 業務失敗 |
|---|---|---|---|
| `list` | Session id | 按創建順序返回當前條目 | Session 不存在 |
| `put` | Session、消息、評分、可選備注、可選分類、預期版本 | 當前條目 | Session 或目標不存在、版本沖突、備注無效 |
| `delete` | Session、消息、預期版本 | 條目不存在 | Session 不存在、版本沖突 |

創建時傳入 `ifVersion: null`；編輯或刪除時使用返回的版本。陳舊修改返回 `version-conflict` 及當前條目。每次實質 put 都生成新 token，并保留原始創建時間。重復已存評分、備注與分類的 put 是無變化操作：返回相同條目，不追加事件。刪除不存在的條目始終成功，不受所傳版本影響，也不追加事件。重新創建已刪除條目會產生新的創建時間和排序位置。

目標必須是由 append 來源事件產生的非空 assistant 消息。用戶消息、空 assistant 占位及 replacement 來源消息返回 `target-not-found`。反饋跨重啟保留；fork 即使繼承了包含父會話反饋的前綴，初始時也沒有自有反饋。

<a id="understand-the-implementation"></a>
## 理解實現

### 權威日志與持久性

`feedback/message-put` 保存所屬 Session id 及完整條目，包括版本和時間戳。`feedback/message-delete` 保存所屬 Session 和消息 id。當前狀態從這些事件推導，忽略屬于其他 Session 的事件。持久化 payload 在使用前經過校驗。不存在第二個反饋存儲或緩存。

活躍會話通過 `Session.append` 追加，并等待 `sessions.flush`，然后通過持久化讀句柄核實捕獲的日志末端與 Session header，才會報告成功。冷會話修改在讀取、校驗、比較、追加、flush 和關閉期間持有持久化寫句柄。冷讀取使用讀句柄。兩條路徑都不會構造 Session 或追加生命周期事件。

每個 Session 的隊列在同一服務實例內串行化操作；持久化寫句柄排除其他冷寫入方。銷毀時停止接收操作并排空已接收操作，然后釋放服務。持久化故障會 reject，而非變成業務失敗。flush 失敗不會回滾已接受的事件；調用方可以讀取并使用其版本重試。成功的無變化修改也會 flush 當前前綴。

冷會話的實質修改在 flush 后發出 `feedback/committed` 通知，其中攜帶借用的只讀權威日志前綴；觀察方在轉移所有權前必須對其進行深拷貝。觀察方在寫入所有權釋放前完成，不得等待同一 Session 的其他反饋操作，也不能使已提交的修改失敗。活躍會話消費方觀察 `session/event`。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | Remote 服務、payload 校驗、事件投影與持久化所有權 |
| [`src/types.ts`](src/types.ts) | 請求、結果和 Session 事件聲明；僅類型 |

不發布運行時不變式伴生入口：服務直接從校驗后的權威事件推導反饋，不持有可獨立修改的投影。

各自的 API 見[反饋子系統](../../../docs/subsystems/feedback.zh.md)、[Session 持久化](../../../docs/subsystems/persistence.zh.md)和[瀏覽器消費方](../../client/ui-message-feedback/README.zh.md)。

<a id="model-experience"></a>
## 模型體驗

### 消息反饋

#### 模型看到什么

無。`feedback/message-put` 和 `feedback/message-delete` 不攜帶 surface 位置、工具、提示詞段落或模型可見上下文。日志導出與投遞策略由相應消費方負責。

#### Token 影響

為零。評分、備注和服務結果不進入模型請求。

#### KV Cache 影響

相互獨立。反饋不改變模型請求前綴。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **僅日志具有權威性：**不讀取或遷移現有 `message_feedback` 伴隨數據。這些文件保持不變，但其反饋無法通過本服務訪問。
- **刪除保留歷史：**delete 移除當前反饋，不會從僅追加日志中清除更早的評分或備注；它不是隱私擦除操作。
- **寫入所有權：**另一個進程持有 Session 寫句柄時，冷會話修改會 reject。服務不會喚醒該所有者，也不協調跨進程 Remote 調用。
- **受信任調用方：**請求不包含經過認證的 actor 或審計身份。部署方必須保護 Host 網關。
- **遙測導出：**對于所有用戶和提供方，包括 `deepseek-official`，隨附 OTel 后端在 `FEEDBACK_ONLY` 模式下僅在新的顯式文本反饋、評分、備注或分類編輯、撤回后釋放完整權威日志前綴。前綴包含上下文和原樣備注；后續記錄等待下一次反饋，`DISABLED` 阻止捕獲。部署方負責脫敏；見 [OTel 導出策略](../../session/session-telemetry-otel/README.zh.md)。
- **掃描成本：**每次訪問已有 Session 的 `list`、`put` 或 `delete` 都會掃描完整事件日志來推導當前反饋；冷會話操作還會從持久化存儲讀取完整日志。工作量隨 Session 歷史總量增長，而不只是反饋條目數。
- **保留量：**`maxNoteBytes` 只限制單條備注，不限制日志總大小或變更次數。

<a id="dev-note"></a>
### 開發備注

[包測試](tests/message-feedback.spec.ts)覆蓋當前狀態與持久歷史語義；[Loader 組合](tests/loader-composition.spec.ts)驗證跨重啟的活躍和冷 JSONL 操作。
