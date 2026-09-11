---
description: "ctx.web 的 DeepSeek 搜索提供方：部署方如何通過 Anthropic 兼容 Messages API 掛載 DeepSeek 原生 web 搜索，并逐次解析憑據。"
kind: "package-reference"
---

# @deepseek-ai/dsh-web-search-deepseek

[English](README.md) | 中文

## 概述

有了 `dsh-web-search-deepseek`，harness 可以通過 DeepSeek 原生搜索檢索 web，使用部署已有的 `DEEPSEEK_API_KEY`。當部署希望使用 DeepSeek 原生搜索、并接受一次搜索在延遲與 token 上消耗一個完整模型輪次時選擇它，因為 DeepSeek 不提供專用搜索端點。結果來自 DeepSeek 返回的結構化搜索塊，絕不會從回復文本中抓取。憑據缺失時調用以結構化錯誤失敗；響應缺少搜索結果塊時會明確報錯，而非降級。面向模型的 `web_search` 工具位于 `dsh-tool-web`。

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

在已加載 web 服務的組合中掛載本提供方；它以 `deepseek-official` 搜索提供方身份注冊，因此當它是唯一可用的搜索后端時，`ctx.web.search()` 會自動解析到它——也可以用 `searchProvider: deepseek-official` 固定。

### 何時選擇

當部署希望使用 DeepSeek 原生服務端 web 搜索、且已持有 `DEEPSEEK_API_KEY` 時選擇此后端——提供方復用該憑據引用。一次搜索比專用檢索端點更重：DeepSeek 在完整模型輪次內執行搜索，因此每次搜索都要預期一次 Messages 調用的延遲與生成 token，每次請求最多 `maxUses` 次服務端搜索。當單次搜索的成本或延遲占主導時避免使用它。

### 最小配置

加載 web 服務與本提供方；密鑰在已掛載 `ctx.credentials` 服務時從其解析，否則從進程環境解析。搜索端點使用 Anthropic 兼容基址（`https://api.deepseek.com/anthropic/v1`），不同于 LLM（大語言模型）適配器使用的 chat-completions 基址——絕不復用 `$DEEPSEEK_BASE_URL`。

```yaml
- name: '@deepseek-ai/dsh-web'
- name: '@deepseek-ai/dsh-web-search-deepseek'
  config:
    apiKeyEnv: DEEPSEEK_API_KEY
    baseURL: https://gateway.internal/anthropic/v1
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `apiKey` | 未設置 | DeepSeek API 密鑰字面值；優先使用 `apiKeyEnv`，避免密鑰進入配置。非空字面值優先 |
| `apiKeyEnv` | `DEEPSEEK_API_KEY` | 每次搜索通過 `ctx.credentials` 解析的憑據引用；沒有該服務時從進程環境解析。值缺失時調用以 `WEB_PROVIDER_CREDENTIAL_MISSING` 失敗 |
| `baseURL` | `https://api.deepseek.com/anthropic/v1` | Anthropic 兼容端點基址；追加 `/messages`。缺省時回退到 `$DEEPSEEK_SEARCH_BASE_URL`；無法解析時提供方不可用 |
| `model` | `deepseek-v4-flash` | Anthropic 格式模型名稱 |
| `apiVersion` | `2023-06-01` | `anthropic-version` 標頭值 |
| `maxTokens` | `4096` | Messages 請求生成 token 的正整數上限 |
| `maxUses` | `5` | 每次請求使用 `web_search` 服務器工具的正整數上限 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-web-search-deepseek)是每個受支持字段及其 JSDoc 的窮盡式真源。上面的條目是提供方 Settings 段的 base 層；疊加其上的用戶層會作用于下一次搜索，因為提供方是按次投影該段，而不是在注冊時固化它。

### 搜索返回什么

`content` 始終省略：DeepSeek 的提供方文本不作為答案受到信任。`sources[]` 來自 `web_search_tool_result` 塊內的 `web_search_result` 條目——`url` 和 `title` 直接取自同名字段，`publishedAt` 取自 `page_age`——snippet 在存在摘錄時按 URL 關聯的 `cited_text` 條目拼接。結果按 URL 去重，且由于 DeepSeek 不公開結果數量旋鈕，服務通過截斷并標記來強制執行 `maxResults`。

### 請求日志

由發起 agent（智能體）運行的搜索會在發出請求前一刻，追加僅用于日志的 `web/deepseek-search-llm-request` 會話事件。其中包含已解析端點、API 版本，以及發送給 DeepSeek 且不含密鑰的精確 JSON 請求體；不包含標頭和憑據。發出請求前發生憑據失敗或取消時不會創建事件，而發出請求后的 HTTP 或響應失敗會保留本次請求嘗試的持久記錄。

### 失敗與恢復

失敗拋出攜帶可按機器路由 code 的 `WebError`：憑據缺失為 `WEB_PROVIDER_CREDENTIAL_MISSING`，調用方取消為 `WEB_ABORTED`，提供方或傳輸失敗，包括響應中沒有 `web_search_tool_result` 塊，為 `WEB_PROVIDER_ERROR`。HTTP 重定向會在接觸 `Location` 指向的目標之前被拒絕。請求發出后的每項失敗都會指出已解析的搜索端點，并說明搜索端點配置獨立于聊天端點。如果該端點不符合用戶預期，錯誤消息會要求會話模型指導用戶進入 Settings > Plugins > Plugin configuration > Web search，修改 Endpoint 字段并保存。該頁面不可用時，消息會把 `DEEPSEEK_SEARCH_BASE_URL` 和 `web-search-deepseek.baseURL` 作為部署配置方式。模型不得替用戶選擇或修改端點。面向模型的 `web_search` 工具會在自己的錯誤包裝層內呈現這段文本。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋提供方背后的設計決策；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

本提供方建立在兩項承諾之上：

- **只取結構化塊。** DeepSeek 在服務端執行搜索并返回結構化的 `web_search_tool_result` 塊；提供方解析這些塊，絕不從模型文本中抓取 URL。嚴格模式下，沒有此類塊的響應會拋出 `WEB_PROVIDER_ERROR`，而非降級。
- **一個憑據，逐次解析。** 提供方復用 `DEEPSEEK_API_KEY` 引用（不新增密鑰），但不復用 `$DEEPSEEK_BASE_URL`，因為搜索使用 Anthropic 兼容 Messages API。已掛載的憑據服務具有權威性；沒有該服務時回退到啟動進程的環境。按次解析意味著在 Web 的 Models 頁中存儲或輪換的密鑰無需重啟，即可用于下一次搜索。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：配置 schema、Settings 段安裝、逐次選項投影 |
| [`src/provider.ts`](src/provider.ts) | `DeepSeekSearchProvider`：Messages 請求分發、塊解析、引用拼接、憑據解析 |
| [`src/types.ts`](src/types.ts) | 搜索響應的 Anthropic 協議類型 |
| — | 不發布運行時不變量配套入口；本包會在分發前發出日志事件，但沒有后續的權威分發事件可與之關聯；精確的請求包絡相等性改由提供方邊界保障。 |

### 請求流程

每次搜索先把當前 Settings 段投影為提供方選項——端點、模型、密鑰引用、上限——然后通過 `ctx.credentials`（或環境）解析憑據引用，追加僅用于日志的會話事件，并以原生 `web_search` 服務器工具分發 Messages 請求。響應中的 `web_search_tool_result` 塊變為 `sources[]`；文本塊中的 `cited_text` 條目按其 URL 拼接為 snippet；結果按 URL 去重；服務在返回路徑上強制執行請求的來源上限。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從共享詞匯逐步進入服務、面向模型的工具與設計依據。

- [web 子系統](../../../docs/subsystems/web.zh.md)——窮盡式的搜索請求／結果詞匯與錯誤碼。
- [web 包映射](../README.zh.md)——六包家族與各角色。
- [dsh-web](../web/README.zh.md)——本提供方注冊進入的 web 服務。
- [dsh-tool-web](../tool-web/README.zh.md)——渲染本提供方來源的面向模型 `web_search` 工具。
- [生成配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-web-search-deepseek)——每個受支持配置字段及其源聲明。
- [web 能力 seam 決策](../../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.zh.md)——搜索與抓取為何共用一項提供方選擇服務。

-----

<a id="model-experience"></a>
## 模型體驗

### 輔助 DeepSeek 搜索請求

#### 模型看到的內容

獨立的 DeepSeek 模型會原樣接收 `Perform a web search for the query: <query>` 作為用戶文本，并收到一個原生 `web_search` 服務器工具定義。該請求不屬于會話模型上下文。

#### Token 影響

每次搜索都會產生獨立的提供方輸入與輸出 token；`maxTokens` 限制生成輸出，`maxUses` 限制原生搜索次數。

#### KV Cache 影響

與會話請求緩存相互獨立。輔助指令與原生工具定義可以形成穩定前綴，但查詢或模型路由的每次變化都會阻止從首個差異起的復用。

### 間接的會話工具結果

#### 模型看到的內容

通過 `dsh-tool-web`，會話模型會看到結構化搜索塊中去重后的 URL、標題、日期與引用 snippet；提供方文本不會作為答案受到信任。該提供方的具體失敗消息包括帶有處理指引的憑據缺失消息、`DeepSeek search credential resolution failed: <error>` 和 `DeepSeek search aborted`。請求、HTTP、原生搜索和響應正文失敗會追加已解析端點及前述條件式配置指引。錯誤包裝屬于消費方。

#### Token 影響

注冊不會直接產生會話 token。結果 token 隨返回源與 snippet 增長，隨后服務強制執行請求的來源上限。

#### KV Cache 影響

僅追加；新可見內容位于可復用請求前綴之后，不會使現有 KV Cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明提供方在哪些情況下昂貴或不完整。它們是當前包約束。

- **一次搜索消耗一個完整的 Messages 模型輪次**——產生延遲與生成 token，最多執行 `maxUses` 次服務端搜索；DeepSeek 不公開專用檢索端點。
- **動態憑據的可用性在操作內部解析**——同步可用性檢查可以確認解析器存在，但無法查詢異步憑據存儲，因此選中的無密鑰提供方會使搜索以 `WEB_PROVIDER_CREDENTIAL_MISSING` 失敗；穩定的 `web_search` schema 仍保持注冊。
- **超量返回的來源仍消耗 token**——協議沒有結果數量旋鈕，`maxResults` 只能由服務在事后截斷。
- **未引用的結果沒有 `snippet`**——只有當文本塊引用（`cited_text`）匹配其 URL 時，來源才會獲得 snippet。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文：開放問題與尚未決定的探索方向。它明確不具權威性——已交付的行為、限制與既定理由以上文和相關 Agent Note 為準。

#### 未來：專用檢索端點

能夠避免完整模型輪次的 DeepSeek 原生搜索端點將消除主要成本；在 DeepSeek 公開此類端點之前，本提供方仍是 Messages 調用適配器。

</details>
