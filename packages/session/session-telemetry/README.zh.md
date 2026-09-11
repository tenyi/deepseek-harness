---
description: "面向部署方與后端作者的會話遙測捕獲 seam 說明，用于選擇上報后端、掛載脫敏規則或實現后端約定。"
kind: "package-library"
---

# @deepseek-ai/dsh-session-telemetry

[English](README.md) | 中文

## 概述

會話遙測讓部署方發送會話活動的有序副本用于上報，同時保留權威會話日志。部署方選擇一個上報后端，并可在投遞前脫敏每個外發副本；如果沒有脫敏規則，捕獲的數據將原樣離開進程。交接以非阻塞方式完成，因此上報不會延遲會話處理。投遞采用盡力而為方式；如果進程崩潰，隊列中的記錄可能丟失。

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

作為部署方，選擇一個后端并掛載它，當記錄不能以捕獲原樣離開進程時添加脫敏規則。作為后端作者，實現三成員約定，并以一種捕獲模式組裝協調器。

### 選擇并掛載后端

只加載一個后端插件；它把捕獲協調器與投遞流水線注冊為 `ctx.sessionTelemetry`。重復加載會拋出異常。必需的 [`sharing` 成員](#the-sharing-disclosure) 報告部署模式，不代表會話準入或投遞。只有在未掛載任何遙測服務時，消費方才可報告「未配置」。`/feedback` 命令確認記錄，不讀取此策略。

### 后端約定

后端實現三個成員：`emit(record)` 必須是非阻塞入隊，因為它會在會話事件路徑上同步執行；可選的 `flush()` 是輪次結束后的即發即忘提示，多數后端為了遵循 SDK 自身的批處理計劃而省略它；`shutdown()` 排空已入隊記錄，并在 SDK 停止后結束，dispose（資源釋放）會等待它。實現 `flush()` 的后端必須安排并發 flush 與最終 `shutdown()` 排空的先后順序。

### 捕獲內容

捕獲以兩種模式之一運行。`live` 捕獲在追加時跟隨會話事件、在掛載時回放已存活會話并記錄生命周期標記；`on-demand` 捕獲只在后端通過 `captureSession(session, throughSeq?)` 請求前綴時讀取權威會話日志。協調器選項決定是否包含存儲歷史。每條權威會話事件都按順序映射為一條 ledger 記錄。`assistant/message` 或 `assistant/attempt` 記錄會攜帶完整的嵌入式緊湊流，包括失敗和重試輸出。每條 ledger 記錄還攜帶 `session.id`、`session.format_version`、數值型事件標識、可選 header 事實與預先映射的嚴重級別（`tool/result.isError`、`turn/end` 的錯誤原因與 `agent-error` 映射為 `error`；其余為 `info`）。

### 共享披露

<a id="the-sharing-disclosure"></a>

每個后端通過 `sharing` 披露部署模式：`full`、`feedback-only` 或 `disabled`。后端還可限制符合條件的會話。該屬性不是投遞回執；交接是非阻塞入隊，批處理、重試與丟失策略屬于后端 SDK。

### 脫敏記錄

<a id="the-redact-waterfall"></a>

協調器復制權威事件后，每條外發記錄都會立即經過 `sessionTelemetry/record` waterfall（瀑布式事件）。本包不帶任何規則：未掛載監聽器時，記錄以捕獲時的原樣到達后端，因此導出數據能干凈到什么程度，恰恰取決于部署方掛載了什么規則。監聽器通過變換 `next()` 的返回值來堆疊；拋出異常的監聽器以 fail-closed 方式攔下這一條記錄。脫敏只作用于外發副本——權威會話日志永不改寫。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋捕獲設計；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

seam 建立在一個邊界之上：harness 的職責止于 `emit()`。完整事件捕獲、脫敏與 handoff 游標都在這里；批處理、重試、排隊與丟失策略屬于上報 SDK，本包有意不建模也不包裝。設計與被否決的替代方案見[復活 Agent Note](../../../.agents/notes/implemented/feature/2026-07-23-session-telemetry-otel-revival.zh.md)。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | Service Definition：`SessionTelemetryBackend`/`SessionTelemetrySink` 約定、記錄詞匯、`session-telemetry/record` waterfall 聲明 |
| [`src/coordinator.ts`](src/coordinator.ts) | 捕獲：live 監聽器、生命周期本地 on-demand 回放、脫敏、handoff 游標、異常隔離 |

### 捕獲流程

實時捕獲通過組合 fiber 的 effect 注冊 Session 事件、刷新提示、關閉標記與 agent/error 觀察器。按需捕獲只注冊釋放 effect，并按歷史策略讀取請求的權威日志前綴。同步處理器隔離失敗，避免影響 agent loop（智能體循環）或其他監聽器。

### handoff 游標

模塊作用域的 `WeakMap<Session, seq>` 記錄已交接而非已投遞的最高序號。重新收養同一對象時從該游標之后繼續。捕獲通常從 `firstLiveSeq` 開始；顯式 `includeHistory: true` 從未交接對象的 seq 0 開始，包含恢復或 fork 歷史。后端負責捕獲授權。存儲的歷史本身不授權捕獲；OTel 后端等待新的顯式反饋。接收方按 `(session.id, session.format_version, event.seq)` 對重復記錄去重。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當 seam 約定不夠用時閱讀以下頁面。它們從隨附后端逐步進入子系統參考與決策證據。

- [OpenTelemetry 遙測后端](../session-telemetry-otel/README.zh.md)——部署方加載的隨附后端，含模式與導出器配置。
- [會話遙測子系統](../../../docs/subsystems/session-telemetry.zh.md)——能力拆分與類型聲明。
- [會話遙測復活決策](../../../.agents/notes/implemented/feature/2026-07-23-session-telemetry-otel-revival.zh.md)——理由、權衡與被否決的替代方案。
- [會話包映射](../README.zh.md)——相鄰的持久化、投影、標題與遙測包。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為該 seam 觀察會話流并把脫敏后的副本交給外部；它不注冊任何面向模型的內容。

#### KV Cache 影響

無；本包既不組裝也不發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制定義部署方能得到的投遞與數據保護保證。它們是當前包約束。

- **盡力而為的投遞**——游標標記的是已交接而非已投遞；在重載窗口內被拆除的會話無法重新收養，崩潰時留在后端隊列中的內容會丟失。持久化 outbox（spool、每 sink 游標、at-least-once）推遲到有部署方提出明確的崩潰丟失要求時再實現。
- **不內置脫敏規則**——未掛載 `sessionTelemetry/record` 監聽器時，記錄以捕獲時的原樣離開進程，包括文件內容或命令輸出中內嵌的任何憑據；向共享 collector 導出的部署方自行負責其規則集。
- **按需脫敏使用當前狀態**——未捕獲的事件只存在于權威會話日志中；后續的 `captureSession()` 會使用當時掛載的策略，深拷貝并脫敏其當前值，且不存在捕獲時的遙測快照或持久化的捕獲前 spool。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。本包的全部輸出都是后端交接，即在所有權威事件流之外同步調用 `emit()`；捕獲側不追加會話事件，因此不存在可供獨立 companion 觀察的事件與數據關系。
