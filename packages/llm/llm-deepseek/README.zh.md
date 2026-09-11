---
description: "面向用戶與維護者的 DeepSeek chat-completions 適配器說明：配置 deepseek-official 路由、thinking 與圖片輸入。"
kind: "package-reference"
---

# @deepseek-ai/dsh-llm-deepseek

[English](README.md) | 中文

## 概述

使用本包可通過 `deepseek-official` 路由流式調用 DeepSeek 模型，包括配置 thinking 與推理強度、向視覺模型輸入圖片，以及查看建議性模型目錄。端點、憑據、目錄與 thinking 策略均按請求解析，因此有效的用戶設置更改會在下一個請求生效，無需重啟進程。它適合 DeepSeek 官方 API 或 OpenAI 兼容網關；由于路由名不同，可與 pi-ai 包并用。

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

當組合需要通過 harness LLM（大語言模型）服務流式調用 DeepSeek 模型時掛載本插件。它注冊唯一的 `deepseek-official` 路由，并按請求解析連接事實，因此組合條目加可選用戶設置分節即可驅動整個適配器。

### 何時選擇

當部署面向 DeepSeek 官方 API（可選地通過 `baseURL` 指向的 OpenAI 兼容網關）時選擇本適配器。當同一組合還要通過 pi-ai 目錄路由其他提供方或手工聲明的網關時，選擇 `dsh-llm-pi-ai`；兩個適配器可以同時掛載，因為它們的路由名不沖突。為 `deepseek-official` 注冊任何其他適配器會以 `DUPLICATE_ADAPTER` 失敗。

### 最小配置

```yaml
- name: '@deepseek-ai/dsh-llm-deepseek'
  config:
    apiKeyEnv: DEEPSEEK_API_KEY  # credential reference, resolved per request
    baseURL: https://api.deepseek.com # optional; $DEEPSEEK_BASE_URL then this default
    reasoningEffort: high        # optional; off | low | high | max
    maxTokens: 256000            # optional per-request output cap
    maxRequestFilesBytes: 134217728
    maxInlineRequestImageBytes: 20971520
    maxImagesPerRequest: 600
    filesApiTimeoutMs: 60000
```

請求用 `provider: deepseek-official` 選擇路由；模型 id 原樣傳到協議，因此新增 DeepSeek 模型無需重新注冊。省略 `models` 時公布支持文本和圖像的 `deepseek-flash` 和 `deepseek-v4-flash-vision-exp`，以及僅支持文本的 `deepseek-v4-flash` 和 `deepseek-v4-pro`，各自的上下文窗口均為 1,000,000 token。顯式列表會替換這些默認值，未列出的模型 id 仍作為純文本路由原樣通過。包括模型發現工具在內的客戶端可通過 `ctx.llm.listModels('deepseek-official')` 讀取這些建議性條目。支持圖片的條目可把 `imagePixelBudget` 設置為正整數或 `low`，也可以設置 `imageMaxBytes`。當端點把 `messages` 中任意位置最新的 `system` 消息讀作完整的有效系統提示詞時，條目可以聲明 `systemPromptUpdate: in-history`；適配器會在已解析模型與已準備調用上報告該模式，agent loop（智能體循環）隨后把變化后的提示詞追加到已緩存歷史之后，而不是改寫開頭的 system 消息（[決策規則](../../core/agent-loop/README.zh.md#understand-the-implementation)）。默認的 `deepseek-flash` 條目聲明該模式；其他模型需通過 `models` 顯式聲明，`in-history` 以外的任何值都會在加載時以 `llm-deepseek: catalog model "<id>" systemPromptUpdate must be "in-history" when present` 失敗。

| 字段 | 默認值 | 含義 |
|---|---|---|
| `apiKeyEnv` | `DEEPSEEK_API_KEY` | 按請求解析的憑據引用：先經憑據 seam，再到環境變量 |
| `baseURL` | `https://api.deepseek.com` | 端點基址；設置了 `$DEEPSEEK_BASE_URL` 時優先 |
| `thinking` | `enabled` | 部署策略；`disabled` 把所有請求鎖定為 `off` |
| `reasoningEffort` | `high` | 默認強度：`off`、`low`、`high` 或 `max` |
| `maxTokens` | `256,000` | 單次請求輸出上限；模型自身上限與顯式請求值優先 |
| `defaultContextWindow` | `1,000,000` | 無精確值模型的容量回退 |
| `models` | V41 Flash + V4 Flash + V4 Pro + V4 Flash Vision Exp | 供發現消費方查看的建議性目錄 |
| `streamIdleTimeoutMs` | `300,000` | 單次流讀取未完成的最大提供方空閑時間 |
| `maxRequestFilesBytes` | `128 MiB` | 按最舊優先卸載前保留的請求圖片字節高水位 |
| `maxInlineRequestImageBytes` | `20 MiB` | 獨立的 base64 回退高水位 |
| `maxImagesPerRequest` | `600` | 保留請求圖片數量的高水位 |
| `imageOffloadByteQuantum` | `64 MiB` | Files 模式最舊前綴移除量子 |
| `inlineImageOffloadByteQuantum` | `10 MiB` | 內聯模式最舊前綴移除量子 |
| `imageOffloadCountQuantum` | `20` | 數量超限移除量子 |
| `filesApiTimeoutMs` | `60,000` | 每張圖片 Files 解析截止時間 |
| `fileExpiresAfterSeconds` | `604,800` | 請求的上傳圖片生存期 |
| `fileRefreshMarginSeconds` | `3,600` | 低于此剩余生存期時替換 id |
| `fileQuotaCleanupBatch` | `100` | 配額重試前刪除的、歸 harness 所有的最舊文件數 |
| `retryPolicy` | normal，5 次重試 | 由 `dsh-llm-retry` 執行的提供方自有重試策略 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-llm-deepseek)是每個受支持字段及其 JSDoc 的窮盡式真源。

### 帶 thinking 與圖片的流式調用

支持圖片的路由會在自身像素與字節預算內把每個持久引用解析為確定性請求版本。`imagePixelBudget` 接受正整數或 `low`；省略時使用總計 640,000 像素，`low` 使用總計 512×512 像素，`imageMaxBytes` 默認為 1 MiB。帶 alpha 的圖片使用 effort 0 的 WebP，不透明圖片使用 JPEG，并采用 85/75/60 質量階梯；全部候選都超過目標時保留最小輸出。每張保留圖片前都有文本，注明完整附件 id 與實際請求尺寸。當前文件系統可以映射附件提供方的宿主對象時，該文本還攜帶只讀執行世界路徑與可寫副本使用的擴展名。純文本與未列出路由接收穩定附件占位符，而持久歷史繼續保留圖片引用。

適配器通常通過 DeepSeek Files API 上傳這些確切請求字節，并發送 file-id 塊。文件解析失敗或超時會用相同請求版本的 base64 data URL 重建整份 chat 請求；一次請求絕不混用 file id 與內聯圖片。緩存 id 按端點與 API key 限定作用域，在到期前刷新，根據提供方的陳舊文件錯誤失效，并通過帶等待方局部取消的 singleflight 解析。配額失敗會先刪除一批配置數量的最舊 harness 文件，再重試一次上傳。

Files 模式通過 `maxRequestFilesBytes` 與 `maxImagesPerRequest` 限制保留請求版本；內聯回退有獨立 base64 預算。兩種模式都按配置的字節或數量量子移除最舊前綴。每張省略圖片都有自己的模型可見占位符，包含顯示名或附件 id，以及可用時的規范化尺寸、媒體類型與當前只讀路徑。分階高水位策略避免每新增一張圖片都改寫舊請求前綴。

`reasoningEffort` 選擇公布的默認值。當部署策略允許 thinking 時，確切模型元數據會按順序公開 `off`、`low`、`high` 與 `max` 強度及選擇指引。`low`、`high` 與 `max` 啟用 thinking 并以 `reasoning_effort` 序列化，適配器自有的 `off` 則發送 `thinking.type: disabled`。不支持的取值會在網絡 I/O 前以 `UNSUPPORTED_REASONING_EFFORT` 失敗；`thinking: disabled` 會在插件加載時拒絕任何非 `off` 強度。`purpose: 'session-title'` 的請求會強制關閉 thinking，把有界輸出留給可見標題文本。

### 動態配置

連接事實通過可選 settings 與憑據 seam 每次操作重新讀取一次。用戶設置文檔中的 `llm-deepseek:` 分節無需重啟即可覆蓋任何字段；違反 schema 之外約束的快照會保留最后有效事實并記錄失敗。API 密鑰從提供端點、圖片與 Files 策略及空閑預算的同一快照按流調用解析，因此被拒絕的設置代際不會貢獻其中任何事實。圖片請求在請求時解析附件服務，因此加載順序不會凍結圖片可用性。

### 提供方專用請求字段

存在 `ctx.deepseekLlmApiExtensions` 時，適配器會在 `fetch` 前根據確切序列化基礎請求準備已注冊頂層字段。準備或字段沖突在 HTTP 前失敗；2xx 響應后，適配器會在消費 SSE（Server-Sent Events）前接受每項已捕獲貢獻。傳輸與非 2xx 失敗不會接受它們。隨產品交付的組合用它提供可選增量 `dsh_session_log` 字段和默認啟用的活躍 `dsh_plugin_packages` 清單；兩者都留在模型輸入之外。

### 失敗與恢復

非 2xx 響應以穩定 code 失敗：`AUTH`（401/403）、`QUOTA`、`RATE_LIMIT`、`CONTEXT_WINDOW_EXCEEDED`、`INVALID_REQUEST`、`SERVER` 以及其他情況的 `HTTP_<status>`；響應前傳輸失敗拋出 `TRANSPORT`，調用方中止拋出 `ABORTED`，流空閑超時拋出 `TIMEOUT`。請求擴展準備、字段沖突或 2xx 后接受失敗使用 `REQUEST_EXTENSION`。當提供方未指出 file id 時，規范化圖片拒絕會列出所有可能附件及其持久位置。陳舊文件拒絕會使點名映射（或該次嘗試使用的全部映射）失效，并允許一次替換 chat 嘗試。協議違規拋出 `STREAM_CLOSED` 或 `MALFORMED_RESPONSE`；不帶內容塊的終止 `stop` 變成 `EMPTY_RESPONSE`，默認重試策略會重試它。任何位置都沒有密鑰的請求以 `MISSING_CREDENTIAL` 失敗；格式錯誤的憑據以 `INVALID_CREDENTIAL` 失敗，并點名需要修復的引用——絕不包含密鑰的任何部分。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋適配器背后的設計；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

插件建立在一個顯式解析步驟與一條注冊事實之上。`resolveAdapterOptions()` 是從原始配置到已校驗連接事實的唯一路徑，適配器通過 thunk 每次操作重新讀取這些事實——基址、目錄、請求默認值、圖片與 Files 策略及空閑預算都會作用于下一個請求，而進行中的流保持其啟動時的事實。注冊時捕獲的唯一事實是重試策略：解析值變化時，插件會在一個同步區段內原位重新注冊路由，因此任何請求都觀察不到空檔。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`Config` schema、按請求解析、settings 與憑據接線 |
| [`src/adapter.ts`](src/adapter.ts) | `DeepSeekAdapter`：模型解析、圖片投影、Files 回退、帶空閑超時的流式調用 |
| [`src/file-store.ts`](src/file-store.ts) + [`src/files-api.ts`](src/files-api.ts) | 限定作用域的上傳緩存、到期、陳舊 id 恢復、配額清理與遠程文件操作 |
| [`src/serialize.ts`](src/serialize.ts) | 協議序列化：thinking 默認值、Files 或內聯圖片塊、歷史規則 |
| [`src/sse.ts`](src/sse.ts) | 直接 `fetch` 流的 `eventsource-parser` SSE 分幀 |
| [`src/translate.ts`](src/translate.ts) | 把 SSE 載荷翻譯為 harness `StreamChunk` 值；工具調用的 `id` 與 `name` 是身份，后續分片重復發送空串或 null 時保留已建立的值 |
| [`src/types.ts`](src/types.ts) | 上述模塊共享的協議級類型 |

### 協議流程

一次 `stream()` 調用通常發一條 chat 請求：解析確定性請求圖片、優先使用 Files id、準備所有已注冊頂層請求擴展、向解析后的 `baseURL` 發起 fetch、在 HTTP 2xx 后接受擴展事務，并把 SSE 流翻譯為 harness 協議。文件解析失敗會讓首條 chat 使用內聯模式；提供方的陳舊文件響應允許一次替換嘗試，且替換解析失敗時也使用內聯模式。每條 chat 與 Files 調用都在模型輸入之外攜帶共享歸因和穩定匿名用戶 id，會話調用還攜帶 session id。推理歷史會按需序列化回請求，緩存計量則把 DeepSeek 的緩存命中指標映射進 harness 用量桶。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從服務約定逐步進入孿生適配器、重試執行器與共享類型。

- [dsh-llm 服務](../llm/README.zh.md)——本適配器注冊其上的提供方無關服務。
- [llm-pi-ai 適配器](../llm-pi-ai/README.zh.md)——服務其他提供方與網關的庫實現孿生。
- [LLM 流式子系統](../../../docs/subsystems/llm-streaming.zh.md)——`StreamChunk` 協議與適配器約定。
- [llm-retry](../llm-retry/README.zh.md)——應用本適配器 `retryPolicy` 的重試執行器。
- [DeepSeek 請求擴展](../deepseek-llm-api-extensions/README.zh.md)——提供方專用頂層字段的生命周期與接受語義。
- [會話日志上傳](../../session/session-log-deepseek/README.zh.md)——可選的增量 `dsh_session_log` 貢獻。
- [插件包清單](../plugin-package-inventory-deepseek/README.zh.md)——默認啟用的 `dsh_plugin_packages` 貢獻。
- [孿生 LLM 適配器](../../../.agents/notes/implemented/architecture/2026-06-13-twin-llm-adapters.zh.md)——為什么 DeepSeek 交付兩個結構不同的適配器。
- [強制應用歸因標頭](../../../.agents/notes/implemented/architecture/2026-06-21-mandatory-app-attribution-headers.zh.md)——每個提供方請求攜帶的身份。

-----

<a id="model-experience"></a>
## 模型體驗

### DeepSeek 請求

#### 模型看到什么

所選 DeepSeek 模型會收到 harness 系統提示詞、消息歷史、工具 schema、停止序列與調用配置（`maxTokens`、`reasoningEffort`、`temperature`），不包含適配器撰寫的提示詞散文。提供方專用請求擴展字段留在模型輸入之外。視覺模型通常接收 Files API 引用形式的用戶與工具結果圖片，其旁帶附件句柄和請求預覽尺寸。當前執行文件系統可以映射附件提供方的宿主對象時，它還會收到規范化對象路徑；描述符會把該副本標記為只讀，并警告規范化可能縮放或重新編碼上傳內容。Files 解析失敗時，全部保留圖片改用內聯 data URL；超出預算的較舊圖片則在占位文本中保留當前請求已解析的訪問方式。此前 assistant 輪次的推理內容會原樣傳回，無論該輪次是否調用了工具。

#### Token 影響

提供方分詞決定精確的文本與圖片 token 輸入。適配器聲明按路由的 `imageRequestPricing`：它根據持久記錄中的字節長度復現最舊優先的圖片 offload，并按投影后的尺寸使用公開的視覺計量規則（14 px patch 網格、3:1 降采樣、544×544 放大下限、單圖 1024 token 上限）為每張保留圖片計價。這使 token 計量服務可以在請求發出前為圖片壓力定價；上報的 usage 仍是權威值。推理回傳會把每個推理輪次的思維鏈帶進后續請求，而丟棄超預算圖片會避免再次為它們付費。可用時報告緩存讀取用量。`totalTokens` 是精確的 `prompt_tokens + completion_tokens` 匯總值；提供方給出的 `total_tokens` 不一致時省略該值。

#### KV Cache 影響

未改變的已組裝前綴有資格獲得 DeepSeek 緩存復用，本適配器會在用量中報告。確定性的請求圖片字節并不意味著完整前綴固定不變：執行世界路徑變化會改寫歷史描述符文本，刷新上傳會替換 `file_id`，Files 到 base64 的回退也會改變圖片表示。這些變化以及模型路由、提示詞、schema、歷史或圖片預算變化，都可能從首個受影響 token 起阻止復用；推理回傳在每個推理輪次上追加內容。在聲明了 `systemPromptUpdate: in-history` 的目錄條目上，同一請求序列延續期間的系統提示詞變化會追加到已緩存歷史之后，因此直到該歷史末尾的前綴仍可復用；工具 schema 變化仍會從第一個改變的 token 起阻止復用。

### DeepSeek 響應

#### 模型看到什么

推理、文本與原始字符串工具參數會被翻譯為 harness 分片，供 loop 記錄并組裝。

#### Token 影響

生成的 token 遵循請求中記錄的推理強度與 `maxTokens`；只有 loop 保留的塊會影響后續輸入。

#### KV Cache 影響

loop 保留的響應塊會追加到下一個請求，并保留其更早的可復用前綴；被丟棄的塊不再有后續緩存影響。更換提供方或模型會選中不同的緩存域。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明適配器在哪里停止、由未來工作接續。它們是當前包約束，不是通用 DeepSeek 對比或任務積壓。

- **設置中的 `models` 列表會整體替換組合列表**——設置層按字段合并，數組只算一個字段；按條目合并目錄需要帶鍵的形狀。
- **不映射 `tool_choice`**——不屬于核心詞匯（與 pi-ai 孿生共享）。
- **請求使用原始 `fetch`，而非 `@cordisjs/plugin-http`**——沒有共享代理或攔截配置。
- **跳過插件新增的內容塊類型**——核心文本與受支持圖片塊會被序列化，空工具輸出以字面量 `(no output)` 過線。
- **圖片是僅用于輸入的持久附件**——不支持直接外部 URL 與 assistant 圖片輸出；DeepSeek 輸入通常使用 Files API，僅在單次請求恢復時使用內聯 base64。
- 默認目錄預注冊 `deepseek-flash` 及其文本、圖片和歷史內更新能力，不探測網關可用性。網關開放該 ID 前，請求可能以 `INVALID_REQUEST` 失敗。配置 `DEEPSEEK_API_KEY` 和支持該 ID 的網關后，設置 `DEEPSEEK_FLASH_E2E=1` 可啟用[本包 e2e 測試文件](tests/adapter.e2e.ts)中的 Chat Completions 協議驗證。

- 默認請求圖片投影限制為 640,000 總像素，低于提供方約 1300×1300 的處理預算，可能丟棄可用細節。每個模型的 `imagePixelBudget` 可以覆蓋默認值。更改默認值會改變請求內容，需要單獨驗證快照（[決策](../../../.agents/notes/implemented/bug-fix/2026-09-10-deepseek-image-token-calculator-v41.zh.md)）。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是不具權威性的工作上下文：尚未決定的探索方向與維護者備注。已交付的行為與既定理由以上文、包代碼和相關 Agent Note 為準。

- OpenRouter 專屬應用歸因標頭延期到未來顯式 OpenRouter 適配器或模式；OpenAI 兼容網關請求只攜帶共享歸因基線。
- `off` 推理強度絕不會以 `reasoning_effort: 'off'` 過線；它序列化為 `thinking: { type: 'disabled' }` 并省略該字段，從而對拒絕未知強度取值的網關保持協議拼寫有效。

</details>

**運行時不變式：** 不發布伴生入口。本包沒有獨立事件序列或可變數據關系，相關約定在所屬 seam 強制執行。
