---
description: "面向程序化客戶端與維護者的僅自動化 ACP（Agent Client Protocol）服務器，用于通過 JSON-RPC stdio 驅動 DeepSeek Harness agent（智能體）。"
kind: "package-reference"
---

# @deepseek-ai/dsh-acp

[English](README.md) | 中文

## 概述

`dsh-acp` 讓受信程序通過標準 [ACP](https://agentclientprotocol.com) 自動操作持久 DeepSeek Harness agent：創建或恢復會話、選擇模型與推理強度、掛載 MCP 服務器、提交或取消工作、接收語義更新，并獨立關閉會話。進程外 subagent、測試運行器與腳本化控制器適合選擇它；它刻意不提供 DSH 專用呈現數據與交互式 UI 功能。持久化支持跨進程重啟列出、恢復與關閉會話，但不支持刪除、fork、transcript（文本記錄）回放與附加目錄。運行 `pnpm dsh --profile acp` 可啟動服務器；倉庫客戶端使用 `dsh-subagent-acp`。

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

當腳本、測試運行器或另一個 harness 需要通過標準自動化協議端到端運行 agent 工作時，使用本包。常用路徑是：啟動服務器、創建或恢復會話、按需掛載 MCP 服務器并選擇模型選項、發送提示詞、消費語義更新，再關閉會話。

### 何時選擇

當自動化應擁有交互時選擇它：管理持久會話、工具、模型選擇與權限的進程外 subagent、測試運行器或腳本化控制器。當人類需要 DSH 專用呈現卡片、計劃、標題、todo、終端視圖或 elicitation 時請避開；本服務器刻意只提供標準 ACP v1 界面。

### 最小配置

服務器創建的每個會話都使用此處配置的提供方與模型。兩個字段都是可選的，以便由另一個 agent/request 監聽器提供；可運行的演示組合會同時設置兩者。Stdout 只承載協議流量，因此請讓日志遠離它。

```yaml
- name: '@deepseek-ai/dsh-acp'
  config:
    provider: deepseek-official
    model: deepseek-v4-pro
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `provider` | — | 每個會話 agent 的提供方路由 |
| `model` | — | 每個會話 agent 的模型 |
| `sessionListPageSize` | `100` | 單頁 `session/list` 返回的最大摘要數量 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-acp)是每個受支持字段及其 JSDoc 的窮盡式真源。

### 啟動服務器

`pnpm dsh --profile acp` 會啟動隨附的 stdio 服務器。`acp` profile 會掛載會話持久化，因此客戶端可以列出、恢復和關閉持久會話。[`@deepseek-ai/dsh-subagent-acp`](../../subagent/subagent-acp/README.zh.md) 會啟動同一 profile 來執行進程外委派。

<a id="protocol-contract"></a><a id="standard-acp-v1-surface"></a>
### 協議約定

一個連接可以同時運行多個會話，彼此獨立。客戶端發出的調用如下：

| 調用 | 你會得到什么 |
|---|---|
| `initialize` | 穩定 ACP v1，以及 `session/list`、`session/resume`、`session/close` 與 Streamable HTTP MCP 支持；圖片提示詞只在持久附件存儲和配置的確切路由支持時公布。 |
| `authenticate` | 立即成功；服務器不需要身份驗證。 |
| `session/new` | 全新持久 agent；其絕對工作區與 stdio 或 HTTP MCP 服務器會在發布前通過校驗，并返回完整配置選項狀態。 |
| `session/list` | 按確定的新到舊順序分頁返回已持久化、可恢復的根會話；可選絕對 `cwd` 篩選會盡可能使用物理目錄標識。 |
| `session/resume` | 恢復一個已持久化且非活躍的會話；組合前校驗其規范工作區，并恢復日志但不回放舊更新。 |
| `session/close` | 停穩式取消、更新 drain、后代釋放、持久化 flush，并且只釋放指定 Agent 作用域。 |
| `session/set_config_option` | 串行更新公布的 `model` 或 `reasoning_effort`，并返回完整結果狀態。 |
| `session/prompt` | 有序文本、資源鏈接與受支持圖片，每個會話一次一個提示詞；Agent 空閑且有序更新交付后才結算。 |
| `session/cancel` / `$/cancel_request` | 提示詞所擁有的取消路徑；沒有進行中的 ACP 提示詞時取消自主工作，未知會話 id 則為空操作。 |
| `session/update` | 已提交 assistant 消息與 thought、通用工具生命周期、配置變化與上下文用量，按會話串行交付。 |
| `session/request_permission` | 帶一次性允許／拒絕選項的權限提示；你的客戶端可以自動回答。 |

會話配置從實時 LLM（大語言模型）服務目錄提供不透明的提供方／模型選項，并在確切模型聲明推理選項時提供 `reasoning_effort`。提示詞會在異步圖片準入前快照該選擇，并在該輪次的每個模型步驟中固定它；并發選項變更從下一輪次開始生效。ACP 客戶端是受信控制器：stdio MCP 條目授權其絕對命令與環境，HTTP 條目授權其絕對 HTTP(S) URL 與 header；初始連接或發現失敗會回滾尚未發布的 Agent。不支持的界面會被省略或拒絕：`session/load`、刪除、fork、附加目錄、SSE（Server-Sent Events）或 ACP 傳輸 MCP、mode、命令、計劃、終端、客戶端文件系統操作與 elicitation。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋服務器如何實現上述行為，并指出實現它的代碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

服務器是刻意采用標準公開協議的自動化傳輸。三項承諾塑造了它：

- **只發送標準語義更新。** 協議承載已提交消息與 thought、通用工具生命周期、配置與上下文用量；原始提供方增量、重試嘗試、DSH 呈現數據與不受支持內容不會進入協議。
- **誠實的能力與配置狀態。** `initialize` 只公布已掛載支持，拓撲變化會發布完整配置選項，提示詞則固定其準入時的確切路由。
- **停穩后才結算。** 提示詞與關閉操作只在其擁有的準入、Agent 活動、有序更新、后代、持久化與釋放達到所需終態后才結算。

決策歷史記錄在 [ACP 作為僅面向自動化的協議筆記](../../../.agents/notes/implemented/simplification/2026-07-23-acp-automation-only-protocol.zh.md) 與[多會話筆記](../../../.agents/notes/archived/feature/2026-06-14-acp-multi-session.md) 中。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`Config` schema、`AgentSideConnection` 接線、按會話記錄、準入與結算、清理 |
| [`src/content.ts`](src/content.ts) | 協議內容準入與投影：圖片校驗、路由重查、提示詞重建、assistant 塊轉換 |
| [`src/codec.ts`](src/codec.ts) | 輪次結束到 ACP `stopReason` 的純映射 |
| — | 不發布運行時不變式伴生入口；本傳輸不擁有持久包內事件流；協議與生命周期測試覆蓋其映射。 |

### 準入與提示詞結算

每個會話只允許一個正在處理的提示詞。準入先校驗整個提示詞批次、快照所選路由、重新檢查 Agent 是否為同一對象與圖片能力、持久化圖片附件，然后才把用戶消息入隊——先于準入完成的取消絕不會讓遲到的輪次入隊。入隊后，會話模塊會將該快照與 inbox 消息關聯起來，直至該消息被認領，并在提示詞變量與該輪次的每個模型步驟中固定相同的提供方、模型與推理強度。按會話更新會串行交付；已提交圖片會重新讀取并驗證完整性，因此圖片缺失或損壞會讓關聯提示詞失敗，而不是發出占位符。結算優先級依次為顯式取消、已提交輸出失敗、區間內 Agent 失敗、關聯輪次結束。

### 清理與連接歸屬

每個會話模塊擁有其 Agent 句柄、MCP 掛載、未來與輪次固定的模型選擇、提示詞槽位、更新鏈和記憶化關閉操作。顯式關閉、客戶端斷開與 Cordis 釋放使用同一停穩式清理流程：停止新工作、取消提示詞準入與 Agent 活動、drain 已提交更新、按子優先順序釋放可繼續后代、flush 持久化并釋放所擁有的 Agent 作用域。會話關閉后，已持久化的狀態仍可供列出與恢復；共享上下文的其他會話或前端不受影響。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從匹配的客戶端逐步進入自動化約定背后的設計記錄。

- [dsh-subagent-acp](../../subagent/subagent-acp/README.zh.md)——spawn 并驅動本服務器的進程外 ACP 客戶端。
- [ACP 作為僅面向自動化的協議](../../../.agents/notes/implemented/simplification/2026-07-23-acp-automation-only-protocol.zh.md)——自動化約定及其協議邊界的決策記錄。
- [在單個連接上多路復用并發 ACP 會話](../../../.agents/notes/archived/feature/2026-06-14-acp-multi-session.md)——按會話隔離、歸屬與清理決策。
- [擴展實操手冊](../../../docs/cookbook/extension-cookbook.zh.md)——本包作為擴展作者的僅自動化完整示例。

-----

<a id="model-experience"></a>
## 模型體驗

### 提示詞內容

#### 模型看到什么

`session/prompt` 會在一條用戶消息中保留文本與圖片順序：相鄰文本會拼接，資源鏈接則表示為帶方括號的 `[resource_link name=… uri=…]` 引用，模型可以使用自身工具打開它。內聯圖片 base64 在批量準入后即被丟棄，因此持久消息只包含經過校驗的附件引用。協議元數據、客戶端能力、權限選擇與會話 id 絕不進入模型請求。

#### Token 影響

提示詞內容、工具調用／結果和持久圖片引用會保留在該會話中直到上下文壓縮（context compaction）。并發會話保留獨立上下文。

#### KV Cache 影響

只要所選路由與組裝后的前綴保持不變，就僅追加。模型變更會使下一個 ACP 輪次改用新路由。

### 權限決策

#### 模型看到什么

不會直接看到任何內容。所屬工具通過常規工具結果路徑記錄其結果：允許、拒絕、取消或不可用。

#### Token 影響

只有所屬工具的結果會貢獻 token。

#### KV Cache 影響

僅通過所屬工具的結果追加。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本包何時不合適，或何時需要特別的運維注意。它們是當前包約束，不是協議對比或任務積壓。

- **僅一個主 workspace**——附加目錄仍不支持。
- **僅光柵提示詞圖片**——PNG、JPEG、WebP 與 GIF 要求持久附件存儲及確切的圖片能力路由。
- **僅 MCP 工具**——MCP resource 與 prompt 沒有 DSH 消費方。
- **沒有 transcript 回放或交互式擴展**——會話刪除、fork、`session/load`、mode、命令、計劃、終端、客戶端文件系統操作與 elicitation 仍不屬于此自動化界面。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
