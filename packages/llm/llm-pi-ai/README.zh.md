---
description: "面向用戶與維護者的 pi-ai 多提供方適配器說明：通過 pi-ai 目錄與手工聲明網關路由 harness LLM（大語言模型）服務。"
kind: "package-reference"
---

# @deepseek-ai/dsh-llm-pi-ai

[English](README.md) | 中文

## 概述

`@deepseek-ai/dsh-llm-pi-ai` 通過一份配置把模型請求路由到多個 pi-ai 提供方、OpenAI 兼容網關或自托管服務器。已安裝的 pi-ai 提供方會提供端點、協議和模型目錄默認值；自定義路由可以直接聲明這些值，無需修改代碼。profile 與憑據按請求解析，因此設置變更會在下一個請求生效，無需重啟。受支持的提供方可以使用已存儲的 OAuth 或交互式密鑰登錄，并通過跨進程鎖刷新憑據。本包可以在沒有路由時啟動，并在用戶設置添加路由后將其激活。

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

當組合需要通過 pi-ai 的提供方目錄、或通過 pi-ai 已安裝目錄未描述的網關路由模型請求時掛載本插件。`providers` 字典就是整個配置面：每個鍵都是請求用 `GenerateOptions.provider` 選擇的提供方路由名。

### 何時選擇

當同一組合服務多個提供方、某條路由需要 pi-ai 目錄默認值并修正少數字段、或必須通過自有端點與協議到達手工聲明網關時，選擇本適配器。當部署不需要其他提供方時，選擇 `dsh-llm-deepseek` 直連 DeepSeek 路由。兩個適配器可以同時掛載，因為它們的路由名不沖突；注冊其他適配器已擁有的路由會導致插件加載失敗。

### 配置提供方路由

每個 profile 都可以設置 `retryPolicy`；省略時使用 normal mode、最多重試五次。`apiKeyEnv` 是按請求經 harness 憑據 seam 解析的憑據引用，因此配置文件絕不包含密鑰；解析為空的引用會讓請求以 `MISSING_CREDENTIAL` 失敗。省略它會讓路由保持已配置但無密鑰（configured-but-keyless）狀態，對已安裝目錄路由而言即交由 pi-ai 提供方原生的環境發現。

```yaml
- name: '@deepseek-ai/dsh-llm-pi-ai'
  config:
    providers:
      openai:
        apiKeyEnv: OPENAI_API_KEY
        baseURL: https://proxy.example.com:8443
        reasoning: high
        requestImagePixelBudget: 4194304 # total pixels; 2048 by 2048 default
        requestImageMaxBytes: 1048576    # raw bytes before base64 expansion
        maxRequestImageBytes: 20971520   # accumulated base64 payload
        retryPolicy:
          mode: normal
          maxRetries: 3
      anthropic:
        apiKeyEnv: ANTHROPIC_API_KEY
        models:
          - id: claude-sonnet-4-5
            contextWindow: 200000
      acme-gateway:
        displayName: Acme Gateway
        apiKeyEnv: ACME_GATEWAY_API_KEY
        api: openai-completions
        baseURL: https://gateway.acme.example/v1
        compat:
          thinkingFormat: deepseek
        models:
          - id: acme-think
            name: Acme Think
            contextWindow: 262144
            reasoningEfforts:
              off:
              high: high
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `apiKeyEnv` | 無 | 按請求解析的憑據引用；省略時交由 pi-ai 環境發現 |
| `displayName` | 提供方名 | 選擇器界面顯示的標簽 |
| `api` | 目錄協議 | 協議格式；僅目錄不提供的路由需要 |
| `baseURL` | 目錄端點 | 路由上所有模型的端點 |
| `models` | 已安裝目錄 | 整體替換路由目錄；每個條目從已安裝模型取默認值 |
| `modelOverrides` | 無 | 重塑個別已安裝目錄模型，而不替換其余模型 |
| `compat` | 目錄檢測 | 無法識別端點的協議兼容開關 |
| `defaultContextWindow` | `262,144` | 未描述模型的容量回退 |
| `defaultMaxTokens` | `32,768` | 未描述模型的輸出上限回退 |
| `requestImagePixelBudget` | `4,194,304` | 每張確定性請求圖片的總像素預算 |
| `requestImageMaxBytes` | `1 MiB` | 每張請求圖片在 base64 擴展前的編碼字節目標 |
| `maxRequestImageBytes` | `20 MiB` | 帶最舊優先卸載的 base64 圖片載荷總上限 |
| `retryPolicy` | normal，5 次重試 | 由 `dsh-llm-retry` 執行的提供方自有重試策略 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-llm-pi-ai)是每個受支持字段及其 JSDoc 的窮盡式真源。

### 登錄提供方

pi-ai 提供登錄的提供方可以通過 harness 授權 seam 登錄：流程提供 OAuth 或交互式密鑰提示（密鑰鍵入 pi-ai 自己的登錄提示，而非設置表單），得到的憑據存儲在 harness 憑據存儲的 `llm-pi-ai/<provider id>` 記錄中。存儲的登錄在其路由的 `apiKeyEnv` 覆蓋之下完成認證，并在存儲的跨進程鎖下自行刷新；退出登錄即刪除存儲記錄。落在記錄文法之外——小寫連字符標識符——的手工聲明路由鍵無法登錄，因為對它的記錄寫入會以 `LlmError('UNSTORABLE_PROVIDER_ID')` 拒絕；這類路由改用 `apiKeyEnv` 或提供方 ambient 設置認證。

### 解析模型目錄

profile 的 `models` 列表會替換而非擴展路由的已安裝目錄；每個條目從同 id 已安裝模型取未設置字段的默認值，因此把路由收窄到兩個模型、修正一個容量或添加比已安裝目錄更新的模型都是一行編輯。`modelOverrides` 無需該代價即可重塑個別已安裝目錄模型——修正一個模型，保留其余三十七個——當它與 `models` 列表并存、位于手工聲明路由上、或點名目錄未描述的模型時會被拒絕，因為靜默不變的模型會成為別人日后尋找的拼寫錯誤。

### 帶推理（reasoning）與協議兼容運行

`reasoningEfforts` 聲明模型可選擇的 thinking 等級：每個鍵都是選擇器提供的等級，其值是分派時在協議中發送的拼寫，因此 `max: ultra` 可以為擁有自有詞匯的網關重命名等級。省略該字段時保留已安裝目錄條目的能力；`false` 聲明非推理模型。對于 pi-ai 無法識別的端點，`compat` 開關重塑請求——哪個角色攜帶系統提示詞、哪個字段限制輸出、thinking 等級如何傳遞——可逐路由、逐模型配置。條目與已安裝目錄都沒有尺寸的模型，會采用路由的 `defaultContextWindow` 與 `defaultMaxTokens` 回退值。

對于自托管 Chat Completions 端點，`thinkingTokenBudgetField` 選擇推理預算參數，`vllmPriority` 在服務端啟用優先級調度時設置整數調度優先級。模板參數接受 `$var: thinking.budget`。`openai-responses` 網關可設置 `supportsMaxOutputTokens: false` 來省略 `max_output_tokens`；Azure 與 Codex 傳輸會忽略這個共享兼容字段。這些控制均需顯式啟用；目錄擁有的 Anthropic effort 和回退能力不是可配置開關。

### 運行時更改配置

profile 通過可選 settings seam 每次操作重新讀取：base 與用戶的 `llm-pi-ai:` 設置分節按提供方合并，因此用戶可以新增路由、覆蓋組合路由的一個字段或把路由指向另一個代理，全部在下一個請求生效、無需重啟。適配器無法服務的分節會在寫入處被拒絕——`settings.mutate` 回答 `settings-rejected`——之后失效的已存儲分節會保留 namespace 最后有效值。當路由集合或某路由的重試策略變化時，插件會原子地重新注冊：沖突路由會讓此前路由繼續服務。

### 從端點發現模型

插件會回答「該提供方可以提供哪些模型？」，供配置界面正在編輯或起草的路由使用。已安裝目錄提供的路由直接由目錄回答，不發網絡請求；只有目錄未描述的路由才會經網絡詢問。`openai-completions` 與 `openai-responses` 使用帶 bearer 鑒權的 `GET {baseURL}/models`，`anthropic-messages` 則以 `x-api-key` 和 `anthropic-version` 使用原生 `GET /v1/models?limit=1000` 語義；其列表 URL 接受帶或不帶末尾 `/v1` 的 API 根地址，因為網關文檔兩種寫法都會發布，且只有該列表 URL 會歸一化這一段，模型請求收到的仍是配置原樣的 `baseURL`。已配置且具名的路由會在 Host 內部提供已存憑據與 profile `headers`，因此通過 `settings.yaml` 或 Cordis 配置設置的部署標頭可以到達模型發現請求，但不會成為發現請求或 Models 頁面的字段；表單中新鍵入的密鑰仍優先于已存憑據。解析器接受標準 `data` 數組或富信息 `models` 對象，并歸一化每個候選的 id、顯示名、上下文窗口與最大輸出 token 數；Anthropic 的 `max_input_tokens` 與 `max_tokens` 會進入相同容量字段，即使對象條目點名了另一個規范 id，對象鍵仍是請求 id，原始類型的對象屬性會被忽略，缺失的顯示名則回退到該請求 id。回答是界面可以提供給用戶采納的候選元數據——不存儲任何內容，`settings.yaml` 仍然是決定路由服務內容的唯一事實。

### 失敗與恢復

pi-ai 不提供的路由需要 `api`、`baseURL` 與非空 `models` 列表；無法服務的 profile 會在寫入處被拒絕，并點名路由與模型。失敗攜帶穩定 code：無法使用的憑據以 `INVALID_CREDENTIAL` 失敗并點名路由與引用，`apiKeyEnv` 引用解析為空的路由以 `MISSING_CREDENTIAL` 失敗，未配置模型以 `UNKNOWN_MODEL` 失敗，終止性提供方失敗則區分 `QUOTA` 與暫時性 `RATE_LIMIT`。`GenerateOptions.stop` 以 `UNSUPPORTED_OPTION` 被拒絕，因為 pi-ai 的通用流式 UI 無法跨提供方保證它。

Settings 寫入會在合并組合層與用戶層后嚴格校驗每個新增或修改的提供方。命名空間注冊時，已存儲配置的目錄解析錯誤會保留命名空間與提供方行，并通過 `LlmConfigurableProvider.error` 優先返回首個模型診斷，無模型診斷時返回路由錯誤；未修改的錯誤提供方不會阻止其他編輯。可解析的模型仍可選擇，無法解析的模型保留在可編輯配置中，直接請求時會在網絡 I/O 前以 `INVALID_CONFIG` 失敗。修復或刪除錯誤配置會清除診斷。Schema 與 profile 自身的約束錯誤仍會拒絕加載。后續外部文件編輯會校驗變化的提供方，失敗時保留最后一次接受的分節。

只修改 `displayName`、`apiKeyEnv` 或 `baseURL` 而未解決提供方的模型配置錯誤時，保存仍會被拒絕。例如，OpenRouter 路由的模型 `111` 缺少 `api` 時，不能單獨保存路由名稱的修改：需要在同一份編輯草稿中修復或刪除該模型，再保存完整的提供方配置。中間修復狀態保留在草稿中，直到整條提供方配置通過校驗；其他提供方可以獨立保存。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋適配器背后的設計；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

適配器建立在不可變快照與按操作解析之上。每個操作都會在第一次 `await` 前捕獲整個快照——profile 加一個持有每條路由所構建 `Provider` 的 `createModels()` 集合——配置變更會構建新集合而非修改使用中的集合，因此在一個配置下開始的請求絕不會在另一個配置下結束。路由自己的憑據引用經 harness seam 解析，并以請求 `apiKey` 選項傳入，pi-ai 將其視為優先級最高的 auth 覆蓋——這正是明確失敗引用語義的所在。該覆蓋未覆蓋的一切都經集合自身的 auth 到達 pi-ai：憑據存儲持有登錄寫入、刷新輪換的記錄（以 `llm-pi-ai/<provider id>` 尋址），auth context 回答提供方解析時提出的 ambient 問題。兩者跨快照保持穩定，因此配置變更重建集合時不會忘記誰已登錄。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：profile 解析、settings 接線、目錄與路由注冊 |
| [`src/auth.ts`](src/auth.ts) | 覆蓋 harness 憑據平面的憑據存儲與 ambient auth context |
| [`src/login.ts`](src/login.ts) | 面向提供登錄的已安裝提供方的授權流程 |
| [`src/config.ts`](src/config.ts) | Profile schema、解析與可服務性校驗 |
| [`src/catalog.ts`](src/catalog.ts) | 已安裝目錄集成與漂移門禁 |
| [`src/provider.ts`](src/provider.ts) | 受支持協議表與提供方構建 |
| [`src/context.ts`](src/context.ts) | Harness 到 pi-ai 的上下文轉換、圖片處理、回放恢復 |
| [`src/stream.ts`](src/stream.ts) | 把 pi-ai 事件轉換為 harness `StreamChunk` 值 |
| [`src/replay.ts`](src/replay.ts) | 帶版本的 `ReplayEnvelope` 存儲與校驗 |
| [`src/discovery.ts`](src/discovery.ts) | 面向配置界面的端點詢問 |

### 注冊與目錄

插件會在可配置提供方目錄中聲明它能認證的每個已安裝目錄提供方，并加入當前 profile 聲明的每條路由，因此配置界面可以在任何路由存在之前提供完整目錄。每個條目都攜帶 `declared`——pi-ai 是否在該鍵下不提供任何內容——因為只有適配器能區分手工聲明路由與收窄目錄路由。路由注冊具有原子性：與其他適配器沖突的候選集合會讓此前路由繼續服務。零路由的裸掛載即休眠姿態：settings 分節提供 profile 前不注冊任何內容，分節清空時路由隨之消失。

### 回放與詞匯

成功 assistant 響應會存儲帶版本的、無損 JSON 回放狀態，與產生它們的提供方和模型放在一起——響應級事實加每個流式塊一條逐塊條目。請求時，`LlmRuntime` 僅當同一適配器實例擁有兩條路由時才傳遞回放狀態；適配器校驗它并恢復原生響應 id、提供方簽名與可選的 `providerThinkingLevel` effort 元數據，缺失的 effort 元數據仍保持缺失。回放會對照 assistant 來源校驗請求模型身份，并在提供方解析別名或回退時單獨恢復 Anthropic 響應模型。無法使用的狀態會降級為提供方無關內容而不是讓請求失敗。pi-ai 工具調用參數是解析后的對象，因此適配器解析輸入并重新字符串化輸出，以符合 harness 原始 JSON 約定；pi-ai 流內錯誤事件映射為終止 `finish` 分片。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從服務約定逐步進入孿生適配器與共享類型。

- [dsh-llm 服務](../llm/README.zh.md)——本適配器注冊其上的提供方無關服務。
- [llm-deepseek 適配器](../llm-deepseek/README.zh.md)——`deepseek-official` 路由的 DeepSeek 直連孿生。
- [LLM 流式子系統](../../../docs/subsystems/llm-streaming.zh.md)——`StreamChunk` 協議與適配器約定。
- [llm-retry](../llm-retry/README.zh.md)——應用每個 profile `retryPolicy` 的重試執行器。
- [孿生 LLM 適配器](../../../.agents/notes/implemented/architecture/2026-06-13-twin-llm-adapters.zh.md)——為什么 DeepSeek 路由交付兩個結構不同的適配器。
- [生成配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-llm-pi-ai)——每個受支持配置字段及其源聲明。

-----

<a id="model-experience"></a>
## 模型體驗

### 經 pi-ai 的提供方請求

#### 模型看到什么

所選目錄模型會收到一條系統提示詞（`GenerateOptions.system`，否則取歷史中首條 `system` 消息的文本；首條 system 消息文本為空時不發送系統提示詞）、其余歷史、工具與 pi-ai 通用流式 API 支持的采樣字段。每張保留圖片前都會有文本，注明其完整附件 id 與實際請求尺寸。當前執行文件系統可以映射附件提供方的宿主對象時，該文本還會攜帶只讀規范化對象路徑，并警告規范化或請求投影可能縮放或重新編碼上傳內容。當累計 base64 圖片載荷超過路由的 `maxRequestImageBytes` 時，每張卸載圖片都會在替換文本中保留自己的身份與當前已解析訪問方式。卸載的規范化附件不會讀取或變換。提供方原生回放元數據只在適配器針對歷史內容校驗通過后恢復。

#### Token 影響

提供方分詞決定精確輸入。保留圖片會添加穩定的附件與坐標描述符；卸載占位符會替代省略圖片的視覺 token。回放元數據可能讓原生 API 復用提供方側狀態。

#### KV Cache 影響

轉換保持邏輯請求順序，圖片句柄與卸載占位符則會添加模型可見文本。即使附件身份與請求字節保持穩定，執行世界路徑變化也會改寫歷史句柄，并可能從該圖片起阻止復用。更換適配器實例、提供方、模型或其他上游 token 具有相同的后綴影響。越過圖片上限會把較早圖片替換為占位文本，因此復用在該消息處結束，直到被卸載前綴穩定。

### 提供方響應

#### 模型看到什么

pi-ai 事件變成 harness 的推理、文本、工具調用、用量與 finish 分片。適配器把解析后的工具參數以原始 JSON 字符串傳給 harness。

#### Token 影響

生成內容只在 loop 記錄后才影響后續輸入。提供方未單獨報告推理 token 時，pi-ai 會把推理 token 并入輸出用量，并原樣保留其精確 `totalTokens` 值。

#### KV Cache 影響

已記錄的響應內容會追加到下一個請求，不會使其更早可復用前綴失效。未記錄的傳輸元數據與用量計量不影響緩存標識。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明適配器在哪里停止、由未來工作接續。它們是當前包約束，不是通用 pi-ai 對比或任務積壓。

- **`maxRequestImageBytes` 只計算 base64 圖片載荷**——文本、工具、描述符與 JSON 結構在該上限之外，因此它必須留有余量地低于網關請求體上限。卸載是確定性請求投影，不會記錄為會話事件。
- **登錄只存在于發起它的進程中**——授權嘗試不持久，因此登錄中途刷新頁面會放棄它，用戶需要重新開始。退出登錄是對已存儲記錄執行 `deleteRecord`，只在本地忘記它，不會告知簽發方。
- **提供方原生發現經本插件的 ambient context 回答**——不點名憑據的路由交由目錄提供方自身解析，它會詢問環境值（`AZURE_OPENAI_API_KEY`、`AWS_PROFILE` 及各提供方自有集合）與本地憑據文件。兩個問題都在這里得到回答：憑據 seam 先于進程環境被查詢，文件存在性則針對宿主進程的文件系統以 `~` 展開后檢查。它做不到的是*讀取*憑據文件內容——自行解析 `~/.aws/credentials` 的提供方會直接讀取，不經該 seam。
- **設置可以新增或覆蓋路由，不能移除組合路由**——用戶層覆蓋組合 base，因此刪除 `cordis.yml` 提供的提供方屬于組合變更。
- **分層合并對字典鍵沒有刪除**——base 聲明的 `reasoningEfforts` 等級、`modelOverrides` 條目或 `compat` 字段可以被用戶層覆蓋，但不能被移除。
- **`headers` 可以攜帶 redactor 永遠看不到的憑據**——profile 解析會拒絕 Fetch 無法表示的名稱與值，但該字典仍是純字符串；以 `apiKeyEnv` 引用存儲憑據。
- **路由目錄不會自行刷新**——目錄就是 `settings.yaml` 的內容；這里沒有任何機制向提供方查詢它提供的模型。
- **Anthropic 模型發現最多讀取 1,000 個模型**——請求使用 API 的最大頁大小，但不會遍歷 `has_more`；第一頁之外的條目需要手工添加。
- **每條路由一種協議格式**——混合協議目錄路由無法承載另一協議格式的模型；把提供方拆到兩個路由鍵是變通辦法。
- **模態聲明不受校驗**——聲明 `image` 而其網關不支持的模型會在提示詞準入后被提供方拒絕。持久圖片仍留在歷史中，同一誤聲明模型可能再次失敗；切換到純文本模型仍然可行，因為共享 LLM 運行時會針對該請求把圖片引用投影為穩定文本。
- **未認證路由取決于其協議**——不點名憑據的路由解析為已配置但無密鑰，但 pi-ai 的 OpenAI 兼容實現仍要求 API 密鑰或 `Authorization` 標頭，因此無密鑰本地服務器需要由 `apiKeyEnv` 引用或 `headers` 中的 `Authorization` 條目提供的占位憑據。
- **不支持 `GenerateOptions.stop`**——pi-ai 的通用流式選項無法跨提供方保證停止序列行為。
- **只有歷史中首條 `system` 消息會成為 pi-ai 的 `systemPrompt`**——pi-ai 只有一個系統槽位，因此后續的 `system` 消息，或在同時設置了 `GenerateOptions.system` 時的首條消息，會在原位置折疊為 `user` 消息；系統提示詞的提供方專屬放置遵循 pi-ai，而非 harness 自有的協議覆蓋。system 或 assistant 歷史中的圖片（包括首條系統消息中的圖片）在兩條轉換路徑上都會以 `UNSUPPORTED_CONTENT` 失敗。
- **提供方 HTTP 狀態不可用**——pi-ai 錯誤事件不跨提供方暴露穩定 HTTP 狀態。
- **重試策略由提供方自有，而非 SDK 重試**——pi-ai SDK 重試保持禁用，因此持久 agent（智能體）步驟與 `llm/retry` 事件擁有每個可見嘗試，直接 `ctx.llm.stream()` 調用仍是單次嘗試。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是不具權威性的工作上下文：尚未決定的探索方向與維護者備注。已交付的行為與既定理由以上文、包代碼和相關 Agent Note 為準。

- 提供的協議集合刻意比 pi-ai 的完整 API 集合更窄：Bedrock、Vertex、Azure 與 Codex 通過 profile 無法以密鑰、端點與標頭完整描述的流程認證；目錄路由仍可經自有提供方到達它們，只有顯式覆蓋會被拒絕。Codex 可經授權流程的 OAuth grant 登錄。
- `compat` 開關集合由漂移門禁釘在 pi-ai 的 compat 類型上；上游升級若新增字段、為更多協議賦予 compat 類型或擴大值聯合，會在有人分類前讓構建失敗。

</details>

**運行時不變式：** 不發布伴生入口。本包沒有獨立事件序列或可變數據關系，相關約定在所屬 seam 強制執行。
