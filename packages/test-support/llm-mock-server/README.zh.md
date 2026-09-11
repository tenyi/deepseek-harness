---
description: "用于在無提供方密鑰的情況下測試 LLM（大語言模型）適配器與恢復策略的可通過腳本控制的 OpenAI 兼容故障服務器，面向測試作者與演示。"
kind: "package-library"
---

# @deepseek-ai/dsh-llm-mock-server

[English](README.md) | 中文

## 概述

本包為測試與演示提供可編腳本的 OpenAI 兼容 HTTP／SSE（Server-Sent Events）端點，使其無需提供方密鑰即可檢驗模型提供方的失敗與成功。每個已接受的 `/chat/completions` 請求依次消費下一個腳本行為，包括重置、停滯、畸形分片、限流、服務器錯誤、補全與工具調用。測試作者可以通過 `pnpm run mock:llm` 運行服務器，也可以調用 `startMockLlmServer`，后者會返回捕獲的請求供斷言使用。帶種子的 `random` 行為支持可復現的混合故障壓力運行。

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

本包讓測試或演示無需實際提供方即可使用提供方協議進行通信：啟動服務器，腳本化你想檢驗的協議行為，然后把真實 LLM 適配器指向它的 base URL。

### 獨立運行

從本倉庫運行源入口：

```sh
pnpm run mock:llm \
  --port 8000 \
  --api-key mock-key \
  --sequence partial_disconnect,success \
  --partial-text "discard this half"
```

將發布的 DeepSeek 適配器指向服務器；它會將 `/chat/completions` 追加到已配置 base：

```sh
DEEPSEEK_BASE_URL=http://127.0.0.1:8000/v1 \
DEEPSEEK_API_KEY=mock-key \
pnpm dsh --profile headless "test provider recovery"
```

倉庫腳本將 JSONL 寫入 stdout：`ready` 記錄攜帶以 `/v1` 結尾的 base URL 與隨機種子，后續請求/結果記錄同時命名腳本行為與實際選中的具體行為。本包不公開可安裝的二進制命令。

### 腳本化行為

`--sequence` 是逗號分隔的 FIFO。耗盡時返回結構化 HTTP 500；`--repeat-last` 顯式重用最后一項。

| 行為 | 協議結果 |
|---|---|
| `connection_reset` | 在發送 HTTP 標頭前銷毀 socket |
| `stream_disconnect` | 發送 SSE 標頭，然后在第一個事件前重置連接 |
| `partial_disconnect` | 發送文本增量，然后重置 socket |
| `stall` | 發送 SSE 標頭，并保持空閑，直到客戶端／服務器取消 |
| `empty` | 發送有效的無內容 stop 和 `[DONE]` |
| `empty_body` / `stream_eof` / `partial_eof` | 正常結束，但缺少必需的 `[DONE]` 邊界 |
| `malformed_json` / `malformed_event` | 發送無效 SSE JSON 或無效提供方分片形態 |
| `rate_limit` / `server_error` / `service_unavailable` | 返回面向重試的 429/500/503 JSON 錯誤 |
| `auth_error` / `invalid_request` / `context_overflow` / `quota_exceeded` | 返回終止性錯誤或需要單獨恢復的提供方錯誤 |
| `success` / `slow_success` / `reasoning_success` | 流式發送完整文本響應，可選延遲或先發送推理（reasoning） |
| `tool_call_success` / `max_tokens` | 以工具調用或結束原因 `length` 完成 |
| `wrong_content_type` | 以 `application/json` 內容類型發送有效 SSE 正文 |
| `random` | 按帶權重的種子隨機選擇具體請求行為 |

`connection_refused` 只能在 CLI 中使用，且必須是第一個條目。它會延遲綁定調用方指定的非零端口，因此 `--listen-delay-ms` 期間的請求會收到真實 TCP 拒絕；其余條目在 listener 啟動后開始。

### 隨機模式

使用重復 `random` 條目執行開放式混合運行：

```sh
pnpm run mock:llm \
  --port 8000 \
  --sequence random \
  --repeat-last \
  --seed 42 \
  --random-weights 'success=60,slow_success=10,connection_reset=5,stream_disconnect=5,partial_disconnect=10,empty=5,server_error=5'
```

省略 `--seed` 會生成種子，并在 `ready` 記錄中打印。`--random-weights` 接受非負的相對 `behavior=weight` 條目，并要求至少一個正權重具體行為。導出默認值是一個成功占主導的壓力分布，包含 reset、disconnect、部分輸出、空完成、stall、429/5xx、干凈截斷與格式錯誤的 JSON；它用于施加測試壓力，而非估計生產事故頻率。`connection_refused` 被排除，因為已綁定的請求處理器無法產生真實拒絕。隨機權重包含 `stall` 時，為待測客戶端配置較短的流空閑超時，使場景及時結束。

### 時序與內容控制

CLI 公開 `--success-text`、`--partial-text`、`--reasoning-text`、`--chunk-size`、`--chunk-delay-ms`、`--disconnect-delay-ms`、`--retry-after-ms`、`--request-id`、`--tool-name` 與 `--tool-arguments`。毫秒延遲是 Node 定時器范圍內的有界整數；`retryAfterMs` 還必須為正數。庫接受相同的 camel-case 選項。可選的 `apiKey` 會精確驗證 `Authorization: Bearer <token>`；省略時接受任何 token。

### 可能出什么問題

- **腳本耗盡**——耗盡時返回結構化 HTTP 500；當一次運行需要更多請求時設置 `--repeat-last` 或加長序列。
- **沒有正權重具體行為的隨機權重會被拒絕**——每個條目都必須命名現有行為，且至少一個條目帶正權重。
- **無效請求不消費腳本**——錯誤方法、路徑、Bearer token 與畸形 JSON 會收到普通 4xx 響應，因此配置錯誤的客戶端可能耗盡重試卻不推進序列。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋服務器的設計；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計

服務器建立在一個規則之上：每個已接受的 chat-completions 請求從按到達順序排列的 FIFO 游標消費恰好一個行為，服務器從不重試或解讀 harness 策略。校驗先于游標推進——只有 `POST` 且路徑以 `/chat/completions` 結尾、配置密鑰時攜帶有效 Bearer token、且 JSON 正文可解析的請求才消費腳本；其余請求都收到普通 4xx。`random` 條目在請求時通過帶種子的 PRNG 按配置權重解析，因此一次運行可由其打印出的種子復現。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | `startMockLlmServer`：listener、行為表、種子隨機、遙測（telemetry）、捕獲的請求記錄 |
| [`src/cli.ts`](src/cli.ts) | `--sequence` 與時序/內容選項解析、JSONL stdout 遙測 |
| [`src/bin.ts`](src/bin.ts) | `pnpm run mock:llm` 源入口 |
| — | 不發布運行時不變式伴生組件；該獨立測試服務器不擁有 Cordis 事件流或共享數據；其協議行為和生命周期通過直接 HTTP 測試及組裝后的循環測試進行檢驗。 |

### 協議流程

請求進入處理器、通過校驗，然后選擇行為：具體腳本條目直接運行，`random` 抽取一個，已耗盡腳本則以結構化 500 報告 `script_exhausted`。隨后 `runBehavior` 執行協議結果——銷毀 socket、SSE 流、JSON 錯誤或補全——同時每個請求與結果按到達順序記錄到返回的句柄上，供測試斷言。`close()` 停止接受請求并強制終止停滯連接。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從故障服務器逐步進入它所檢驗的適配器約定，以及用于已記錄成功 transcript（文本記錄）的無密鑰替代方案。

- [LLM 包](../../llm/llm/README.zh.md)——本服務器所檢驗的提供方流約定與重試策略。
- [llm-replay](../llm-replay/README.zh.md)——回放已記錄成功 transcript 而非制造故障的無密鑰替代方案。
- [測試策略](../../../docs/testing.zh.md)——本服務器服務的覆蓋層級與恢復測試。
- [test-support 組地圖](../README.zh.md)——兄弟 harness 與支持包。

-----

<a id="model-experience"></a>
## 模型體驗

無。該測試服務器替代提供方協議行為，而不調用真實模型。

#### KV Cache 影響

無；請求在本地終止，絕不會到達提供方緩存。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明何時需要對該服務器特別小心。它們是當前包約束，不是任務積壓。

- **隨機權重建模測試壓力，而非生產事故頻率**——需要環境專用分布的調用方必須提供已測量權重，并記錄發出的種子。
- **請求腳本按到達順序執行**——并發調用方共享一個游標，因此確定性的每會話故障分配需要獨立服務器實例。
- **真實連接拒絕發生在監聽器生命周期階段**——CLI 延遲必須與客戶端嘗試重疊；請求級隨機選擇只能重置已接受的連接。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
