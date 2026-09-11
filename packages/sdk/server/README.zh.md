---
description: "面向讓進程外 SDK 客戶端在 DeepSeek Harness 運行時中打開會話并驅動 agent 的部署的 stdio JSON-RPC 服務插件。"
kind: "package-reference"
---

# @deepseek-ai/dsh-sdk-jsonrpc-server

[English](README.md) | 中文

## 概述

`dsh-sdk-jsonrpc-server` 通過 stdio 服務 SDK 協議格式（wire format），使進程外客戶端能夠驅動 harness agent（智能體）：它為每個 `sessionId` 打開一個會話、把用戶提示詞排入隊列，并把每個會話事件與 agent 狀態轉換流式發回客戶端。把它作為 `jsonrpc` 插件掛載到 Loader 組合中；外圍插件樹提供其余一切——agent、模型適配器、持久化與工具。Stdout 只承載 JSON-RPC 幀，因此部署不得組合 stdout logger。它通過 dispose（資源釋放）根運行時并以 0 退出應答 `shutdown`；EOF 與信號退出歸 app bin 負責。

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

當運行時必須服務 SDK 客戶端時掛載本插件：把它加入組合了 agent 服務的 `cordis.yml`，啟動運行時，客戶端即可通過 stdio 連接。常用路徑是顯式的——插件需要 `agents` 服務；其余每個能力都來自外圍插件樹。

### 組裝

插件在首次使用時為每個 `sessionId` 創建一個 agent。已注冊的模型適配器優先用于該路由；尚無適配器負責的 `deepseek-official` 路由會掛載 DeepSeek 適配器，任何其他尚無適配器負責的提供方都會導致初始化失敗。初始化成功前，所選適配器會解析確切模型與可選推理強度。

### 配置

| 字段 | 默認值 | 含義 |
|---|---|---|
| `maxTokensAsSuccess` | `false` | 把 max-token 輪次或 subagent 終止報告為成功的 SDK 結果 |

profile 組合擁有每個根 agent 的工具。`input`、`output` 與 `exit` 是僅供測試的運行時傳輸鉤子；生產環境使用進程 stdio 與 `process.exit`。生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-sdk-jsonrpc-server)是每個受支持字段的窮盡式真源。

### stdout 即協議

Stdout 只承載 JSON-RPC 幀，客戶端可以逐字節解析；診斷信息應寫入 stderr。請勿在組合的插件樹中加入 stdout logger。

### SDK 客戶端可以做什么

`initialize` 是運行時就緒邊界：服務器由 Loader 組合掛載時，會等待當前插件樹完成所有加載任務后再響應，因此首次提示詞能夠看到 MCP 初始工具發現等異步同級能力。握手返回協議穩定標識 `deepseek-harness-sdk-runtime`。服務器會通過所選適配器校驗提供方／模型路由與可選的非空 `reasoningEffort`，再保存這些值；省略時不會保存推理強度，因此模型保留自身默認值。可選的正整數 `maxTokens` 會成為每個 SDK 創建的 agent 及其進程內后代的請求輸出上限，省略時則應用所選適配器或提供方路由的默認值。JSON-RPC 請求可能并發分派，因此在一次 `initialize` 成功完成之前，`session/prompt` 會拒絕；客戶端必須等待握手完成后再發送提示詞。已接受的提示詞會把一條帶標識的用戶消息排入隊列，并立即返回 `{ messageId }`；服務器隨后把每個持久事實作為 `session.event`、把整個 agent 生命周期的每次狀態轉換作為 `session.status` 流式發出。它不會把某條助手消息或 `turn/end` 歸屬于某個提示詞，同一會話上的獨立請求可以繼續排入更多工作。持久化根目錄與 persona 來自外圍組合。

### 關閉與退出

插件應答 `shutdown`，刷新響應并 dispose 根上下文，使 SDK 持有的 agent、訂閱與持久化達到完全停穩，然后以 0 退出。EOF 與信號退出歸 app bin 負責，后者也會 dispose 根上下文。僅卸載此插件會停止服務，但不會退出進程。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋服務插件背后的設計；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

本插件是輕量的展示適配器：[`HarnessSdkJsonRpcServer`](src/server.ts) 負責協議方法與通知，傳輸與具名協議類型來自 `dsh-sdk-protocol`，與客戶端 SDK 共享。它訂閱會話、agent 與 subagent 生命周期事件，并把它們作為協議通知轉發；只有當服務在生命周期建立快照時記錄的 `local` 標志為 true 時才轉發 subagent 完成事件——提供方名稱、子級 id 與持久化譜系均不能證明本地性。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`Config` schema、stdio 接線、請求分發、共享關閉與退出任務 |
| [`src/server.ts`](src/server.ts) | `HarnessSdkJsonRpcServer`：協議方法、逐會話 agent 創建、生命周期訂閱、清理 |
| — | 不發布運行時不變式伴生入口；此展示適配器不擁有包內持久事件流；邊界與回放測試覆蓋協議映射。 |

### 請求流程

每個協議方法在執行前都會校驗輸入并解析負責該請求的狀態——`initialize` 保存 SDK 路由，`session/prompt` 解析存活的 agent 與會話配對并排入消息，`shutdown` 刷新響應，再 dispose 根上下文使其達到完全停穩，最后以 0 退出——共享退出任務確保競爭的 `shutdown` 請求絕不會重復 dispose 或退出。分發邏輯位于 [src/index.ts](src/index.ts) 與 [src/server.ts](src/server.ts)。

### 清理

`server.shutdown()` 只 dispose 服務器自身持有的內容——僅卸載本插件時，外圍上下文保持運行。協議 `shutdown` 則 dispose 根 fiber，使持久化與整個運行時在進程退出前達到完全停穩。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當插件約定不夠用時閱讀以下頁面。它們從協議格式進入客戶端與可運行應用。

- [SDK 協議格式](../protocol/README.zh.md) — 本插件服務的協議方法與載荷結構。
- [TypeScript SDK 客戶端](../client/README.zh.md) — 驅動本插件的客戶端。
- [SDK 應用組合包](../../bundle/sdk-app/README.zh.md) — 啟動本插件的 `dsh --profile sdk` 應用。
- [Python SDK](../../../python/README.zh.md) — 驅動同一服務器的 Python 客戶端。
- [SDK 運行時分發決策](../../../.agents/notes/implemented/architecture/2026-07-10-single-file-executable-sdk-runtime-distribution.zh.md) — 打包運行時為何服務封閉插件樹。

-----

<a id="model-experience"></a>
## 模型體驗

### SDK 用戶消息

#### 模型看到什么

對于每個已接受的 `session/prompt`，文本和持久內容引用會原樣進入一條用戶消息。內聯 `SdkEncodedImageBlock` 會先通過組合中的附件存儲完成校驗與提交，因此會話日志保留內容尋址的圖片引用而不是 base64 字節。此包不會添加系統提示詞文本或工具 schema；這些內容來自組合中的其他插件。

#### Token 影響

依數據而定的用戶消息 token 會進入保留的會話歷史，并在后續輪次中重復發送，直至另一個包將其壓縮（compaction）。JSON-RPC 幀、會話通知與服務器內部記錄不會增加模型上下文 token。

#### KV Cache 影響

僅追加；新可見內容位于可復用請求前綴之后，不會使現有 KV Cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本插件何時需要特別的運維注意。它們是當前包約束，不是與其他服務方式的對比或任務積壓。

- **協議沒有逐會話關閉或提示詞取消方法**——SDK 創建的 agent 會一直存活到進程關閉。
- **沒有逐提示詞結果**——`MessageId` 只標識 inbox 準入；擁有自動化活動區間的客戶端必須自行定義并觀察該區間。
- **stdout 純凈性由部署保證**——外圍配置仍可能加載 stdout logger 并破壞 JSON-RPC 通道；此插件不會檢查或否決同級 logger。
- **自動掛載適配器僅支持 DeepSeek**——`initialize` 可以復用任何預先注冊的模型適配器，但唯一的回退行為是掛載 DeepSeek 適配器。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文，明確不具權威性——已交付的行為與限制見上文各節與代碼。單文件可執行運行時分發將本插件與打包的 `jsonrpc-demo` bin 配對；請讓關閉與退出約定與負責 EOF 和信號退出的 app bin 保持一致。沒有記錄其他未解決的開放設計問題。

</details>
