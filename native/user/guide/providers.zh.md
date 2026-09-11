# 配置模型

[English](providers.md) | 中文

本指南假定你已按照[根 README](../../../README.zh.md#run)啟動 Web UI。模型變更會在下一次請求時生效，不需要重啟服務器。

## 配置 DeepSeek

打開**設置 → 模型**。DeepSeek 卡片提供一個 API 密鑰字段；輸入密鑰并保存。

![模型頁：DeepSeek 卡片，以及添加提供方與添加自定義提供方兩個入口](providers-models-page.zh.png)

密鑰是只寫的。保存后，頁面只會收到脫敏描述符，永遠不會收到明文密鑰。密鑰存儲在 `$DSH_HOME/.credentials.yaml` 中，settings 只保留它的憑據引用。

## 添加內置提供方

選擇**添加提供方**，選取 dsh 自帶的提供方；列表顯示的是提供方 id，例如 `anthropic`、`openai`、Kimi 對應的 `moonshotai`、GLM 對應的 `zai`。輸入其 API 密鑰并保存。已安裝目錄會提供端點、協議和模型列表。

通過 OAuth 登錄的提供方（例如 Codex）暫不支持。

## 添加自定義提供方

對于公司網關、自建服務器或已安裝目錄中不存在的提供方，選擇**添加自定義提供方**。提供小寫 Provider ID、基礎 URL、API 協議、憑據和至少一個模型。**API 協議**必須選網關實際使用的那一種，表單提供三種：`openai-completions` 對應 OpenAI Chat Completions，`openai-responses` 對應 OpenAI Responses API，`anthropic-messages` 對應 Anthropic Messages API。一個提供方只使用一種協議，網關同時提供兩種時需要建兩個提供方。

![自定義提供方表單：Provider ID、顯示名稱、API 地址、API 協議、API 密鑰](providers-custom-form.zh.png)

Provider ID 是永久的，因為請求、已保存會話、模型默認值和憑據引用都會使用它。如需重命名提供方，請添加新提供方并刪除舊提供方。顯示名稱、基礎 URL、協議、憑據和模型仍可編輯。

### 探測模型

在**模型目錄**中選擇**獲取可用模型**，即可詢問端點它提供哪些模型。請求使用表單當前的 API 地址、協議和密鑰，已保存的提供方則用已存儲的密鑰；響應會打開一個可搜索的選擇框，搜索、勾選想要的模型，再點**添加所選**。保存或創建提供方之前不會存儲任何內容。

探測讀取的是常見網關公開的列表格式，但并非每個端點都用這些格式作答，所以它只是便利手段而非保證：探測失敗或列表為空時，手動添加模型 ID 即可，效果完全一樣。內置提供方一律由已安裝目錄作答，即使其 API 地址指向網關也是如此，要查看網關實際提供的模型，請通過自定義提供方探測。

## 選擇模型

已配置的提供方會出現在模型選擇器中。選擇模型也會將其設為新會話的默認值。已發送過請求的會話會保留自身日志中記錄的模型。

如果已保存默認值指向已刪除的提供方，輸入框會顯示**選擇模型**，并在選擇其他模型前阻止輸入。

## 進階配置

自動生成的[插件配置目錄](../../config-catalog.zh.md)列出每個插件的所有受支持字段與默認值；[`dsh-llm-pi-ai`](../../config-catalog.zh.md#deepseek-aidsh-llm-pi-ai) 就是本頁所配置的那個提供方段落。[`dsh-llm-pi-ai`](../../../packages/llm/llm-pi-ai/README.zh.md) 和 [`dsh-llm-deepseek`](../../../packages/llm/llm-deepseek/README.zh.md) 參考文檔負責直接 `settings.yaml` 配置、目錄解析、推理控制、憑據與適配器錯誤。

::: tip 表單刻意保持精簡
模型頁只開放讓一條路由得以存在的字段：API 密鑰、顯示名稱、API 地址、API 協議，以及每個模型的 ID、顯示名稱、上下文窗口和最大輸出 token 數。其余所有字段——推理等級、圖片輸入、請求兼容性開關、請求頭、超時、重試策略——都在 `$DSH_HOME/settings.yaml` 中設置，也就是模型頁寫入的同一份文檔。可以直接編輯它；瀏覽器與服務器在同一臺機器時，也可以點擊設置頁頂部的**打開配置文件**打開它。適配器會在下一次請求時重新讀取，無需重啟任何東西。下面各小節介紹多數網關會用到的字段。
:::

### 圖片輸入

手動輸入的模型在自己聲明之前一律按純文本對待，因為沒有任何環節能去詢問端點接受哪些模態。給這類模型附加圖片，會在發送前就被拒絕，并點名該模型。

因此自定義提供方下的視覺模型需要加一行。表單沒有對應字段；請在 `$DSH_HOME/settings.yaml` 中給該模型加上 `input`：

```yaml
llm-pi-ai:
  providers:
    my-gateway:
      apiKeyEnv: GATEWAY_API_KEY
      api: openai-completions
      baseURL: https://gateway.example/v1
      models:
        - id: legacy-chat
        - id: vision-preview
          input: [text, image]
```

`input` 接受 `text` 和 `image`，且只作用于該模型，因此一條路由可以同時服務兩類模型。省略它——或寫成空列表，兩者同義——則保留已安裝目錄為該模型記錄的模態；目錄未描述的模型則回退到該路由的 `defaultInput`。

如果你手動錄入的模型全都接受圖片，可以在路由上設置一次回退值，不必逐個模型寫：

```yaml
llm-pi-ai:
  providers:
    vision-gateway:
      apiKeyEnv: GATEWAY_API_KEY
      api: openai-completions
      baseURL: https://vision.example/v1
      defaultInput: [text, image]
      models:
        - id: first-model
        - id: second-model
```

`defaultInput` 是回退值而不是覆蓋值，默認為 `[text]`：在內置提供方上，它只為其目錄未描述的模型作答，因此絕不會把目錄中本就具備圖片能力的模型的該能力去掉。要收窄這類模型，請用它自己的 `input`。內置提供方沒有可供填寫的 `models` 列表，因此寫在 `modelOverrides` 下，以模型 id 為鍵：

```yaml
llm-pi-ai:
  providers:
    anthropic:
      modelOverrides:
        claude-sonnet-4-5:
          input: [text]
```

除模型自身的列表外，每個列表都至少要寫一項模態；模型自身的空列表與省略它同義。未知模態在任何位置寫入都會被拒絕。

這兩個字段都是對你端點的斷言，而不是對它的檢查。聲明了端點并不提供的圖片能力的模型不會在這里被攔下，改由提供方拒絕該請求。

### 推理等級

對于聲明了推理等級的模型，模型選擇器會提供**推理等級**菜單。內置提供方的模型從已安裝目錄繼承其等級。手動錄入的模型不聲明任何等級，因此模型菜單里不會出現推理等級項，由端點自身的默認值決定模型是否思考。請在 `$DSH_HOME/settings.yaml` 中用 `reasoningEfforts` 聲明等級：

```yaml
llm-pi-ai:
  providers:
    my-gateway:
      apiKeyEnv: GATEWAY_API_KEY
      api: openai-completions
      baseURL: https://gateway.example/v1
      reasoning: high
      models:
        - id: my-reasoner
          reasoningEfforts:
            off:
            high: high
            max: max
```

每個鍵都是菜單提供的一個等級，其值是在協議上以 `reasoning_effort` 發送的寫法，因此 `max: xhigh` 可以為自有一套詞匯的網關重命名某個等級。只有 `off` 可以留空，因為對多數端點來說，不思考就是不傳該參數。路由的 `reasoning` 是會話尚未選擇等級時采用的等級；在選擇器中選定某個等級后，它會與模型一起保存為新會話的默認值。

留空的 `off` 什么都不發送，這只能讓「按請求才思考」的模型停下來；給 `off` 一個值，則會把該值作為 `reasoning_effort` 發送。對于「不明確關閉就會思考」的模型——例如 OpenAI 兼容網關后面的 DeepSeek V4——需要 `compat.thinkingFormat: deepseek`：它讓 `off` 發送 `thinking: {type: disabled}`，其他每個等級則在 effort 之外再發送 `thinking: {type: enabled}`：

```yaml
      models:
        - id: deepseek-v4-pro
          compat:
            thinkingFormat: deepseek
          reasoningEfforts:
            off:
            high: high
            max: max
```

網關并不提供推理能力的內置提供方模型，可在 `modelOverrides` 下用 `reasoningEfforts: false` 去掉其等級；之后再為它選擇等級會被拒絕并報 `UNSUPPORTED_REASONING_EFFORT`。DeepSeek 自身的路由不需要以上任何配置：其模型已經提供 `off`、`low`、`high` 和 `max`，`llm-deepseek.reasoningEffort` 設置選擇器的起始默認值：

```yaml
llm-deepseek:
  reasoningEffort: max
```

### 請求兼容性

網關可能持有可用的密鑰、地址也通得到，卻仍然拒絕每一個請求。pi-ai 依據端點的 URL 決定請求的形狀——系統提示詞由哪個角色承載、輸出上限寫在哪個字段、思考級別如何傳輸——而對于它無法識別的地址，會當作 OpenAI 本身來對待。多數 OpenAI 兼容網關至少會拒絕 OpenAI 所接受的某一樣東西。

其中兩樣占了絕大多數。聲明了推理能力的模型，其系統提示詞會以 `role: "developer"` 發出，很多網關直接拒絕；輸出上限則寫作 `max_completion_tokens`，只認 `max_tokens` 的服務端會拒絕。表單里沒有這兩個字段；請在 `$DSH_HOME/settings.yaml` 的路由上更正：

```yaml
llm-pi-ai:
  providers:
    my-gateway:
      apiKeyEnv: GATEWAY_API_KEY
      api: openai-completions
      baseURL: https://gateway.example/v1
      compat:
        supportsDeveloperRole: false
        maxTokensField: max_tokens
      models:
        - id: my-model
```

路由的 `compat` 是其模型的默認值，模型自身的則逐字段勝出，因此更正某一個模型無需重述整條路由：

```yaml
      models:
        - id: my-model
        - id: my-reasoner
          compat:
            thinkingFormat: deepseek
```

兩者都未設置的字段，沿用已安裝 catalog 為該模型記錄的值；catalog 也未描述的，落到 pi-ai 的檢測。凡是寫下的開關都要給值：冒號后留空的鍵（`supportsDeveloperRole:`）會被拒絕而不是被忽略，因為空值會抹掉 catalog 已知的信息，卻又沒有給出任何替代。任何協議都不接受的名字同樣會被拒絕，報錯會列出可用的那些。

每個開關歸屬于聲明了它的那些協議，因此在某個 `api` 上合法的開關，在另一個上可能被拒絕——報錯會點名該協議實際提供哪些。與上面的 `input` 一樣，開關陳述的是關于你的端點的一個斷言，而不是對它的檢查：設置一個網關其實并不需要的開關，只是發出一個不同的請求而已。

全部開關、各自接受的取值，以及接受它們的協議，都列在[生成的 `dsh-llm-pi-ai` 配置參考](../../config-catalog.zh.md#deepseek-aidsh-llm-pi-ai)的 `PiAiCompatProfile` 之下——該參考派生自源碼，因此不會落后于適配器實際接受的內容。

## 排錯

- **`MISSING_CREDENTIAL`**：通過模型頁存儲提供方密鑰，或提供被引用的環境變量。
- **`UNKNOWN_MODEL`**：選擇已配置的模型，或向自定義提供方添加缺失的模型。
- **獲取可用模型返回 401**：檢查密鑰。模型發現會調用 OpenAI 兼容的 `GET /models` 端點；對于不提供該端點的服務，請手動輸入模型。
- **獲取可用模型提示既沒有 `data` 數組也沒有 `models` 對象**：端點返回的列表格式不在探測的讀取范圍內。請手動輸入模型。
- **密鑰與地址都正確，網關卻拒絕每一個請求**：它的請求形狀與 OpenAI 不同。先在路由上設 `compat.supportsDeveloperRole: false` 與 `compat.maxTokensField: max_tokens`。
- **只有推理模型失敗**：pi-ai 把它們的系統提示詞以 `developer` 角色發出，而網關拒絕該角色。設 `compat.supportsDeveloperRole: false`。
- **手動錄入的模型沒有推理等級菜單**：該模型沒有聲明任何等級。在 `settings.yaml` 中給該模型加上 `reasoningEfforts`。
- **`off` 無法讓 DeepSeek 模型停止思考**：留空的 `off` 不發送任何推理字段，默認思考的端點就繼續思考。請在模型或路由上設置 `compat.thinkingFormat: deepseek`。
- **某個 compat 開關因沒有值而被拒絕**：冒號后什么都沒寫。給它一個值，或刪掉該鍵以沿用已安裝 catalog 的值。
- **圖片在發送前被拒絕**：該模型未聲明圖片模態。請給自定義提供方的模型加上 `input: [text, image]`；在 DeepSeek 自身的路由上，請從配置的目錄中選擇支持圖片的條目（默認為 `deepseek-flash`），并確認網關提供該模型且支持圖片輸入。
- **提供方拒絕了帶圖片的請求**：該模型聲明了其端點實際并不提供的圖片能力。請從授予它圖片能力的那個列表中移除 `image`——可能是模型的 `input`，也可能是路由的 `defaultInput`——然后開啟新會話：附加的圖片會留在會話日志里，因此在會話離開它之前，同一個請求會不斷重復。
