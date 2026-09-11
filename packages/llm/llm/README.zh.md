---
description: "面向用戶與維護者的提供方無關模型調用服務說明：流式發起請求、注冊提供方適配器或解析模型元數據。"
kind: "package-reference"
---

# @deepseek-ai/dsh-llm

[English](README.md) | 中文

## 概述

使用 `@deepseek-ai/dsh-llm` 可通過已配置的提供方適配器流式調用模型、發現模型，并解析模型能力與調用默認值。每個已分發請求都可以從會話日志重建。請求在分發前會被深度凍結，因此擴展與適配器可以讀取但不能改寫。每個流只嘗試調用提供方一次：提供方特定的轉換由對應適配器完成，可選包 `@deepseek-ai/dsh-llm-retry` 負責重跑失敗的請求。流始終以終止結果結束，因此調用方可以一致地處理成功、失敗與取消。

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

任何調用模型提供方的組合——agent loop（智能體循環）、會話標題生成器、壓縮（compaction）摘要器——都會通過本服務流式發起請求。與至少一個提供方適配器一起掛載它；服務本身沒有任何配置，也不包含提供方協議代碼。

### 何時選擇

當插件或組合需要調用模型時選擇本包：它是進入提供方適配器的唯一受支持路徑，并在 loop、會話日志與每個消費方之間保持同一套詞匯。當需要提供方特定的協議行為（那屬于 `dsh-llm-deepseek` 或 `dsh-llm-pi-ai` 之類的適配器）或重試執行（那屬于 `dsh-llm-retry`）時，不要選擇它。

### 最小組合

掛載服務與至少一個適配器，然后在每個請求中按名稱選擇提供方：

```yaml
- name: '@deepseek-ai/dsh-llm'
- name: '@deepseek-ai/dsh-llm-deepseek'
  config:
    apiKeyEnv: DEEPSEEK_API_KEY
```

流會返回 token 級分片，并始終以一個終止 `finish` 分片結束。`BlockAssembler` 把分片組裝為內容塊與消息；`AssistantStreamAccumulator` 在緊湊表示中保留其精確時間戳與 token 邊界，loop 再把它嵌入一個持久 attempt settlement：

```text
for await (const chunk of ctx.llm.stream({
  provider: 'deepseek-official',
  model: 'deepseek-v4-flash',
  messages: [createUserMessage({ content: [{ type: 'text', text: 'Hello' }] })],
})) {
  // chunks: block-start, text-delta, ..., usage, finish
}
```

掛載成功后，`ctx.llm.listProviders()` 會按注冊順序報告已注冊路由。

### 你可以做什么

- **流式發起一次模型調用**——`ctx.llm.stream(options)` 為任何已注冊提供方與模型產出原始分片（token 級增量）；消費方用 `BlockAssembler` 組裝。
- **注冊提供方適配器**——一個適配器擁有一個或多個提供方路由，其注冊會捕獲該路由的重試策略；重復注冊同一路由會以 `DUPLICATE_ADAPTER` 失敗。
- **通過配置暴露并激活提供方**——適配器聲明可配置提供方路由與 settings namespace，配置界面因此可以激活休眠提供方并編輯連接信息，無需重啟。`LlmConfigurableProvider.error` 報告供修復的配置診斷；未受影響的模型仍可提供服務。
- **發現與解析模型**——列出適配器公布的模型、詢問端點它提供哪些模型，并解析某個精確模型的上下文窗口、輸出默認值、推理（reasoning）強度、輸入模態與系統提示詞更新模式：當模型把任意位置最新的 `system` 消息讀作有效系統提示詞時，`LlmResolvedModelInfo.systemPromptUpdate` 為 `'in-history'`；只讀取開頭 system 消息時該字段缺失；`normalizeModelInfo` 以 `INVALID_MODEL_INFO` 拒絕任何其他值。
- **校驗調用配置**——顯式或配置的推理強度會在任何提供方 I/O 之前對照精確模型校驗；請求省略輸出上限時，會填入適配器配置的輸出上限。
- **不展開即讀取內嵌 Assistant 流**——`assistantStreamFirstTokenTime`（首 token）、`assistantStreamHasVisibleContent`（任一可見內容）與 `assistantStreamHasVisibleText`（任一可見文本）通過可提前退出的掃描直接從緊湊記錄得出結果；`lastAssistantStreamChunk` 反向掃描到某一類型的最后一個原始 chunk，`assistantStreamChunks` 與 `joinAssistantStreamText` 掃描整個流，`assembleAssistantStream` 向 `BlockAssembler` 每個 run 喂一段拼接 delta，blocks／usage／replayState 與逐成員展開相同。`runFirstTokenTime` 與 `runFirstVisibleTime` 對單個打包 run 做提前退出掃描，`isTokenDelta`、`isVisibleChunk` 與 `chunkHasVisibleText` 定義單個 chunk 的 token 與可見性規則。`expandAssistantStream` 仍是持久邊界讀取記錄的校驗路徑；它不被記憶化，因為保留的展開在事件生命周期內約花費緊湊流的十倍內存。

### 失敗與恢復

每個流都恰好以一個終止 `finish` 分片結束：失敗為 `{ kind: 'error', failure }`，取消為 `{ kind: 'aborted', failure }`。失敗攜帶穩定 code，如 `NO_ADAPTER`、`MISSING_CREDENTIAL`、`AUTH`、`RATE_LIMIT` 與 `CONTEXT_WINDOW_EXCEEDED`；消費方依據 code 路由，絕不解析消息文本。點名未注冊提供方的請求會以 `NO_ADAPTER` 失敗，格式錯誤的憑據會以 `INVALID_CREDENTIAL` 失敗，而不是表現為不透明的 fetch 錯誤。本服務從不自行重跑請求：重試是 `dsh-llm-retry` 在 agent 失敗步驟擴展點上的職責。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋服務背后的設計；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

本服務基于一項職責分離原則：**邏輯約定是提供方無關的，適配器擁有協議。** 它一次性地定義規范消息、內容塊與流式分片詞匯，每個提供方適配器只把自己的協議格式翻譯為該詞匯。注冊表是拓撲的擁有者——適配器路由、可配置提供方條目與發現 offer 都在這里注冊，并隨其 fiber 一起 dispose（資源釋放）——而請求始終是會話日志的純函數：loop 構建的請求以深度凍結狀態到達，因此監聽器與適配器只能讀取，絕不能改寫。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | `LlmRuntime` 服務：適配器注冊表、可配置提供方目錄、模型發現、調用準備與流式邊界 |
| [`src/types.ts`](src/types.ts) | `StreamChunk` 協議、內容塊映射、結束原因與共享詞匯 |
| [`src/message.ts`](src/message.ts) | 投遞、歷史與請求共享的不可變消息構造函數 |
| [`src/assembler.ts`](src/assembler.ts) | `BlockAssembler`：分片到塊的增量組裝 |
| [`src/assistant-stream.ts`](src/assistant-stream.ts) | 帶時間信息的緊湊 Assistant 流累積、嚴格校驗、精確展開與記錄級讀取器 |
| [`src/call-config.ts`](src/call-config.ts) | 調用配置校驗、適配器默認值填入與請求凍結 |
| [`src/retry-policy.ts`](src/retry-policy.ts) | 提供方自有重試策略解析（normal 與 always 模式） |
| [`src/error.ts`](src/error.ts) | `HarnessError`/`LlmError` 分類體系與提供方無關失敗 code |
| [`src/content.ts`](src/content.ts) | 共享文件與圖片投影輔助函數，包括請求圖片卸載 |
| [`src/api-key.ts`](src/api-key.ts) | 每個適配器共享的憑據格式校驗 |
| [`src/adapter-failure.ts`](src/adapter-failure.ts) | 把失敗歸一化為終止 finish 分片 |

### 主流程

請求會對照其精確模型的能力——上下文窗口、輸出默認值、推理強度、輸入模態與 `systemPromptUpdate` 模式——校驗，填入任何適配器配置的默認值，然后整個請求被深度凍結。`prepareCall()` 把這些事實、分離的上下文與重試策略綁定到執行最終分發的精確適配器代次，因此 HMR（熱模塊替換）或動態設置無法把一個代次的圖片能力與另一代次的端點混用。支持圖片的適配器把持久引用投影為路由專用請求版本；`resolveImageAttachmentAccess()` 會單獨把附件提供方的可選宿主對象映射進當前工具執行世界，而不改變請求圖片或其 `variantId`。純文本路由接收確定性的逐圖片占位符，包括嵌套工具結果圖片，而不會改寫僅追加會話歷史。持久 `FileBlock` 引用永遠不會到達任何適配器：請求組裝把每個引用（包括嵌套工具結果中的出現）替換為確定性句柄文本，指出文件與其只讀保存路徑，路徑經由掛載的附件與文件系統提供方解析。`ctx.llm.fileRequestText(ref)` 向請求計量公開相同的同步投影。`offloadRequestImagesWithPolicy()` 按原始字節或 base64 大小以及圖片數或字節步長，確定性地從最舊圖片開始移除；純函數 `offloadedImagePrefixCount()` 公開同一決策，使路由所屬的請求定價無需構建投影即可復現它。對視覺 token 收費的適配器聲明按路由的 `imageRequestPricing`，`ctx.llm.imageRequestPricing(provider, model)` 為 token meter 同步解析它。分發經過 `llm/stream` waterfall（瀑布式事件），隨后分片以 token 級增量返回，每個適配器結果都以唯一一個終止 `finish` 分片到達消費方。

文件檢測在每次請求時讀取當前內容，包括嵌套工具結果，不緩存消息身份或凍結狀態。[文件掃描決策](../../../.agents/notes/implemented/simplification/2026-09-07-file-content-scan.zh.md)記錄了實測遍歷成本。

### 不變式

- **模型可見 ⟺ 已記錄**——到達提供方請求的任何內容都可以從會話日志重建；loop 構建的請求被深度凍結，絕不改寫。
- **回放狀態只在同一適配器內流動**——僅當同一適配器實例同時擁有歷史路由與目標路由時，assistant 回放狀態才會隨行；否則在分發前被丟棄。
- **已準備調用是一次性的**——已準備調用只能分發一次，且其調用配置字段必須與準備好的配置一致。
- **圖片投影遵循捕獲的路由**——只有支持圖片的模型會把持久 `ImageBlock` 引用轉換為路由專用請求版本；純文本模型接收穩定占位符。
- **文件投影無條件進行**——沒有任何提供方會收到文件字節；每條路由對每個 `FileBlock` 都得到一行確定性句柄文本，模型在需要時用文件工具讀取保存的副本。
- **協議順序**——`usage` 先于 `finish`，工具參數保持原始 JSON 字符串，終止 `finish` 之后不再有任何內容。
- **注冊表變更具有原子性**——路由與目錄注冊會在任何變動前整體校驗候選集合，因此被拒絕的變更會讓此前狀態繼續服務。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從共享類型逐步進入具體適配器、重試執行器與計量服務。

- [LLM（大語言模型）流式子系統](../../../docs/subsystems/llm-streaming.zh.md)——消息與塊類型、緊湊的 Assistant 流記錄、`StreamChunk` 協議與適配器約定。
- [llm-deepseek 適配器](../llm-deepseek/README.zh.md)——DeepSeek chat-completions 直連實現。
- [llm-pi-ai 適配器](../llm-pi-ai/README.zh.md)——基于 pi-ai 的多提供方實現。
- [llm-retry](../llm-retry/README.zh.md)——重跑失敗模型請求的重試執行器。
- [Token 計量](../token-meter/README.zh.md)——具備回放感知的請求與上下文壓力測量。
- [孿生 LLM 適配器](../../../.agents/notes/implemented/architecture/2026-06-13-twin-llm-adapters.zh.md)——為什么 DeepSeek 路由交付兩個結構不同的適配器。
- [LLM 流終止失敗](../../../.agents/notes/implemented/architecture/2026-07-29-terminal-llm-stream-failures.zh.md)——模型請求結果與插件失敗之間的服務邊界。

-----

<a id="model-experience"></a>
## 模型體驗

沒有直接影響，因為 LLM 服務不添加內容；適配器決定何時添加本包導出的共享圖片描述符與逐圖片占位符。

#### KV Cache 影響

推理強度的具體化會保留已組裝請求前綴。圖片身份與請求預覽文本是確定性的，可選執行世界路徑則按請求解析；路徑變化或圖片卸載邊界變化可能從該圖片起阻止復用。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本服務在哪里停止、由其他包或未來工作接續。它們是當前包約束，不是任務積壓。

- **本服務不提供重試執行、緩存或速率限制**——提供方注冊會存儲重試策略，但一次流仍是一次提供方嘗試；`@deepseek-ai/dsh-llm-retry` 在持久 agent 步驟邊界上執行該策略。
- **`GenerateOptions` 采樣只包含 `temperature`／`maxTokens`／`stop`**——沒有 `tool_choice`、`top_p` 或 penalty 字段；有產生方落地時詞匯才會增長（見[已刪除惰性旋鈕](../../../.agents/notes/archived/simplification/2026-07-04-drop-inert-request-knobs.md)）。
- **只有出現實際產生方后，相應變體才會加入**——`prefill`、逐工具 `strict`、內容塊 `cache` 提示和 `agent` 消息來源變體都沒有產生方（見 [Agent Note](../../../.agents/notes/archived/simplification/2026-07-04-prune-producerless-vocabulary-variants.md)）。
- **`BlockAssembler` 只處理核心塊類型**——插件添加塊類型的流若從未由 `block-end` 關閉，`blocks()` 會拋出異常。
- **`GenerateOptions.sessionId` 是本地聲明的品牌類型**——導入 dsh-session 的 `SessionId` 會產生依賴循環。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是不具權威性的工作上下文：開放問題與尚未決定的探索方向。已交付的行為與既定理由以上文、包代碼和相關 Agent Note 為準。

#### 開放事項

- `GenerateOptions.sessionId` 是本地聲明的品牌類型，因為導入 dsh-session 的 `SessionId` 會造成依賴循環；未來擁有 id 的包可以消除該權宜之計。
- 推理強度標識符是由適配器定義的不透明字符串，只對照各適配器公布集合解析；跨適配器共享強度詞匯尚未決定。
- `llm/adapters-updated` 事件按設計不攜帶載荷；消費方重新讀取注冊表，而不是在事件中接收新拓撲。

</details>
