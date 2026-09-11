---
description: "面向客戶端與服務端實現者的 SDK 協議格式（wire format）說明：Harness 運行時與其 SDK 客戶端之間使用的按換行分幀 JSON-RPC 傳輸，以及具名的請求、結果與通知類型。"
kind: "package-library"
---

# @deepseek-ai/dsh-sdk-protocol

[English](README.md) | 中文

## 概述

`dsh-sdk-protocol` 讓 DeepSeek Harness 運行時與其 SDK 客戶端通過按換行分幀的字節流交換 JSON-RPC 2.0 消息：一個傳輸類，加上協議兩端共同使用的具名請求、結果與通知類型。服務端是 [`dsh-sdk-jsonrpc-server`](../server/README.zh.md) 插件；客戶端是 TypeScript 的 [`dsh-sdk-client`](../client/README.zh.md) 與 [Python SDK](../../../python/README.zh.md)（后者復現這些結構但不導入它們）。當你實現或調試協議某一端時使用本包：分幀規則、方法名、載荷類型與錯誤語義都在這里。它是純庫——無插件、無配置、無注冊。

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

當你構建或調試 SDK 協議端——服務插件、客戶端庫或使用該協議的自定義工具——時使用本包。它為你提供一個在調用方持有的字節流上承載 JSON-RPC 2.0 的傳輸，以及每個 SDK 方法與通知的類型化結構。

### 分幀與傳輸

在你擁有的字節流上，每個 `\n` 結尾的行承載一條 JSON-RPC 2.0 消息。同時帶 `id` 與 `method` 的幀是請求，僅 `id` 是響應，僅 `method` 是通知；格式錯誤的行會被忽略。沒有注冊處理器的請求應答 `-32601`，處理器失敗應答 `-32603`，錯誤響應會以 `JsonRpcResponseError` 拒絕掛起的請求，并保留協議中的 `code` 與可選 `data`。`start()` 掛接流監聽器，`close()` 移除監聽器并拒絕掛起請求，但不銷毀流。

### SDK 方法

兩個協議端共享同一套方法：三個客戶端到服務端請求與四個服務端到客戶端通知。

| 方向 | 方法 | 載荷類型 |
|---|---|---|
| client→server | `initialize` | `InitializeParams` → `InitializeResult` |
| client→server | `session/prompt` | `SessionPromptParams` → `SessionPromptResult`（持久入隊回執） |
| client→server | `shutdown` | 無參數 → `{}` |
| server→client | `session.event` | `SessionEventNotification`（運行時內每個會話，不過濾） |
| server→client | `session.status` | `SessionStatusNotification`（整個 agent（智能體）的 `running`/`idle` 轉換） |
| server→client | `subagent.started` | `SubagentStartedNotification` |
| server→client | `subagent.finished` | `SubagentFinishedNotification`（僅進程內運行） |

`HarnessSdkRequestMap` 與 `HarnessSdkNotificationMap` 按方法名索引這些結構；包根與傳輸一起導出它們。

### 載荷語義

`SessionPromptResult.messageId` 標識已排隊的用戶消息；它不標識后續的助手消息、輪次結束或提示詞結果。`SdkPromptContentBlock` 接受普通持久內容以及 `SdkEncodedImageBlock { type: "image", data, mimeType }`；服務器在入隊前把編碼圖像轉換為持久引用。`InitializeParams.reasoningEffort` 是所選提供方／模型路由可選的非空適配器自有標識符；省略時保留該模型的默認值。`InitializeParams.maxTokens` 是可選的正安全整數，用于限制 SDK 創建的 agent 及其進程內后代的每次對話模型輸出；省略時應用所選適配器的確切模型默認值。服務器會在初始化期間解析確切路由，并在握手成功前拒絕 `session/prompt`，因此缺少適配器、模型不可用或推理強度不受支持時，不會回退到構造期默認值。`SubagentFinishedNotification.lastAssistantMessage` 攜帶子 agent 最后一條非空 assistant 消息；若不存在這類消息，則攜帶其累積的 assistant 文本；子 agent 兩種輸出均未產生時，該字段缺省。`serverInfo.name` 的協議值固定為 `deepseek-harness-sdk-runtime`。通知載荷依賴 `SessionEvent`（`dsh-session`）、`ContentBlock`（`dsh-llm`）與 `SubagentStopReason`（`dsh-subagent`），因此會話詞匯是協議格式約定的一部分。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋協議庫背后的設計；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

本包采用一種職責分離設計：兩個協議端共用一個按換行分幀的傳輸類，并以具名類型索引協議方法。包根是唯一的導入面——源模塊不支持深層導入。它是沒有插件、配置或注冊的純庫；服務插件與客戶端負責其周圍的一切行為。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/transport.ts`](src/transport.ts) | `JsonRpcLineTransport`：行分幀、請求/響應/通知分發、錯誤映射、掛起請求記賬 |
| [`src/types.ts`](src/types.ts) | 具名請求/結果與通知載荷類型，按方法索引 |
| [`src/index.ts`](src/index.ts) | 消費方接口：傳輸與具名協議類型 |
| — | 不發布運行時不變式伴生入口；這是一個由傳輸類和類型聲明組成的純協議庫，自身沒有事件流或可變數據關系；兩個協議端各自負責其協議行為。 |

### 幀分發

入站行逐條解析：帶 `id` 與 `method` 的幀通過請求處理器應答（或應答 `-32601`），僅 `id` 的幀結算匹配的掛起請求（錯誤幀以 `JsonRpcResponseError` 拒絕它），僅 `method` 的幀交給通知處理器。`start()` 掛接輸入監聽器；`close()` 移除它們并在不銷毀流的情況下失敗所有掛起請求。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當協議約定不夠用時閱讀以下頁面。它們從服務插件進入客戶端與可運行應用。

- [JSON-RPC 服務插件](../server/README.zh.md) — 通過 stdio 服務該協議的運行時插件。
- [TypeScript SDK 客戶端](../client/README.zh.md) — 驅動該協議的客戶端。
- [Python SDK](../../../python/README.zh.md) — 復現這些結構的 Python 對應實現。
- [SDK 應用組合包](../../bundle/sdk-app/README.zh.md) — 啟動服務器的 `dsh --profile sdk` 應用。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為這是面向客戶端的協議庫；模型可見行為歸對外服務入口后方的運行時插件所有。

#### KV Cache 影響

無；此包既不組裝也不發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明協議未覆蓋或未承諾的內容。它們是當前包約束，不是與其他協議格式的對比或任務積壓。

- **無協議版本協商**——握手只攜帶 `serverInfo.version`（`0.0.1`，客戶端不校驗）；處于預發布階段，無兼容承諾。
- **無取消與會話關閉方法**——客戶端放棄輪次的方式是關閉運行時進程；見 [JSON-RPC 服務插件](../server/README.zh.md)。
- **server→client 請求是未使用的能力**——傳輸層支持，但服務器從不發送；Python SDK 的應答接口為未來審批流程預留。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文，明確不具權威性——已交付的行為與限制見上文各節與代碼。本協議的各個結構由 Python SDK 復現（而非導入），因此在這里更改方法、載荷或協議穩定值 `serverInfo.name` 時，必須在同一次變更中更新 Python 對側與 TypeScript 客戶端。沒有記錄其他未解決的開放設計問題。

</details>
