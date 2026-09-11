---
description: "面向部署方的 OpenTelemetry 會話遙測后端說明，用于選擇模式、配置導出器或排查哪些數據離開本機。"
kind: "package-reference"
---

# @deepseek-ai/dsh-session-telemetry-otel

[English](README.md) | 中文

## 概述

`dsh-session-telemetry-otel` 僅在新的顯式反饋后通過 OTel JS SDK 導出會話記錄，適用于所有用戶和提供方，包括 `deepseek-official`。`FEEDBACK_ONLY` 釋放截至該反饋的權威日志前綴，包含上下文；后續記錄等待下一次顯式反饋。`DISABLED` 不構造傳輸。SDK 批處理可完成已授權的上傳，無需另一次用戶交互或模型調用。部署方負責脫敏規則。

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

當部署方需要通過 OpenTelemetry 日志導出會話記錄時掛載此插件。選擇一個模式、給導出器一個端點，并決定是否在 seam 上掛載脫敏規則。

### 模式

| `mode` | 行為 |
|---|---|
| `FEEDBACK_ONLY` | 默認值。文本反饋、評分創建或修改、備注修改和撤回釋放尚未交接的前綴，截止該權威反饋事件；后續記錄等待 |
| `DISABLED` | 不構造協調器、提供方、處理器或導出器；沒有遙測記錄離開進程。活躍會話反饋在本地告警；冷會話修改保持靜默 |

程序化 TypeScript 配置使用導出的 `SessionTelemetryMode` 枚舉；原始字符串字面量不可賦值。`FULL` 會被拒絕，不是別名。[`sharing` 屬性](../session-telemetry/README.zh.md#the-sharing-disclosure)報告 `feedback-only` 或 `disabled`，不代表投遞回執。`/feedback` 確認文本只確認記錄。

### 最小配置

上傳模式需要導出器 URL，并原樣接受 SDK 選項塊：

```yaml
- id: sessionTelemetry-otel
  name: '@deepseek-ai/dsh-session-telemetry-otel'
  config:
    mode: FEEDBACK_ONLY       # optional; defaults to FEEDBACK_ONLY
    shutdownTimeoutMillis: 3000 # optional; defaults to 3000
    exporter:                # passed verbatim to the SDK's OTLP/HTTP log exporter
      url: https://collector.example.com/v1/logs
      headers:
        authorization: !!js `Bearer ${process.env.OTLP_TOKEN}`
    processor: {}            # optional; passed verbatim to BatchLogRecordProcessor
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `mode` | `FEEDBACK_ONLY` | 共享策略：`FEEDBACK_ONLY` 或 `DISABLED` |
| `exporter.url` | 上傳模式必填 | 完整 OTLP 日志端點；必須能解析為 `http(s)` |
| `exporter`、`processor` | — | 原樣傳給 SDK 導出器與批處理器 |
| `shutdownTimeoutMillis` | `3,000` | SDK 完整關閉序列的外層截止時間 |

直接調用 `ctx.sessionTelemetry.emit()` 在任何模式下都是空操作，不能繞過反饋授權。繼承的父會話反饋不授權子會話導出：子會話需要新的自身反饋。授權后的前綴包含繼承的上下文。

模型請求、請求頭、Session 創建或接納、恢復，以及插件掛載或 HMR（熱模塊替換）均不授權捕獲。僅憑已存儲的反饋不會觸發任何操作。SDK 定時刷新和關閉可以完成先前已授權的批次，但絕不捕獲新記錄。

### 哪些數據會離開本機

在上傳模式中，記錄攜帶 seam 的 `sessionTelemetry/record` waterfall（瀑布式事件）返回的完整 `event.data`——消息內容、工具參數與結果、系統提示詞與工具 schema、todo 文本、壓縮（compaction）摘要、反饋文本，以及會話 `cwd`。提供方憑據絕不會出現：適配器的 API key 是構造函數參數而非會話事件，因此它們在結構上就不存在于日志中，也就不存在于遙測中。`DISABLED` 不構造 SDK 流水線，也不把任何捕獲內容交給后端。

### 失敗與關閉

配置錯誤會在插件加載時失敗：缺少或非 `http(s)` 的 `exporter.url`、非正整數的 `processor.maxExportBatchSize`（SDK 會接受該值，隨后卻在關閉時掛起）以及無效的 `shutdownTimeoutMillis` 都會在任何記錄導出前被拒絕。關閉期間，OTel 會先等待 `exporter.forceFlush()`，再等待處理器有界完成 promise；如果該傳輸 promise 始終不結算，本包會在 `shutdownTimeoutMillis` 到期時放棄等待、記錄已隔離的失敗，并讓應用繼續拆卸——屆時仍待處理的記錄可能在進程退出時丟失。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋后端的組合方式；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

后端是對 OTel JS SDK 的薄適配層：它擁有反饋授權、資源身份與外層關閉截止時間。權威 ledger 記錄使用 `@deepseek-ai/dsh-session-telemetry-otel` 插樁作用域；此后端不捕獲運維記錄。資源身份攜帶 `service.name`/`service.version`（來自 `dsh-llm` 的 `APP_IDENTITY`）以及匿名 `user.id`（來自 `$DSH_HOME/.anonymous-user-id`），按導出批次攜帶一次，而非逐條記錄。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：模式解析、fail-closed 校驗、SDK 流水線接線、協調器組裝、關閉截止時間 |

### 捕獲接線

后端使用包含存儲歷史的按需捕獲。只有新的自身 `feedback/record`、`feedback/message-put` 或 `feedback/message-delete` 事件觸發活躍會話捕獲，并以該事件為上限。冷會話 `feedback/committed` 通知提供已提交的權威快照，不發布存活 Session 或 Agent。同對象交接游標抑制重復捕獲。后端不實現 `flush()`；SDK 負責批處理和關閉排空。

### 字段映射

每條遙測記錄映射為一條 SDK 日志記錄，攜帶捕獲的時間戳、嚴重級別、正文和屬性。反饋授權的是尚未交接的完整前綴，而非只有反饋載荷。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當后端約定不夠用時閱讀以下頁面。它們從它所實現的 seam 逐步進入子系統參考與它所上報的身份。

- [會話遙測 seam](../session-telemetry/README.zh.md)——捕獲約定、記錄詞匯與脫敏 waterfall。
- [會話遙測子系統](../../../docs/subsystems/session-telemetry.zh.md)——能力拆分與類型聲明。
- [匿名用戶身份](../../identity/anonymous-user-id/README.zh.md)——作為 OTel Resource `user.id` 上報的 id。
- [生成配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-session-telemetry-otel)——每個受支持配置字段及其源聲明。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為該后端把 seam 記錄轉發進 OTel SDK 流水線，不注冊任何面向模型的內容。

#### KV Cache 影響

無；本包既不組裝也不發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明 SDK 行為在何處起主導作用、導出保證止于何處。它們是當前包約束。

- **上游實驗性源碼樹**——`@opentelemetry/sdk-logs` 從上游實驗性源碼樹發布；SDK API 的變動只會落在本包，也僅落在本包，而 seam 約定不動。
- **真實 collector 行為屬于 SDK 導出器**——身份驗證、TLS、限流及其他真實 OTLP 部署行為遵循上游 SDK，不由本包自有兼容層處理。
- **盡力交接**——新冷快照以及重啟后的新反饋提交可能重復前綴；接收方按 Session id、格式版本和事件 seq 去重。沒有持久化 outbox、投遞水位、自動重試承諾或采集端接受保證。OTel 與需顯式啟用的 DeepSeek API 路徑可能重疊。撤回導出刪除事件，不是遠端擦除。

- **后端可用性**——本插件禁用或卸載期間提交的反饋會記錄在本地，但恢復插件不會自動重放。捕獲要求訂閱方保持掛載直到觀察到提交；在冷寫入尚未完成時卸載，可能錯過其 flush 后通知。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。模式選擇只改變 capture handoff、SDK setup 與本地 diagnostics，不改變可由獨立 companion 對照的會話或服務狀態。導出在越過后端邊界后仍由 SDK 內部處理。
