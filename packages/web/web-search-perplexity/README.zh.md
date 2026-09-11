---
description: "ctx.web 的 Perplexity 搜索提供方：部署方如何掛載 OpenAI 兼容的 Perplexity 搜索，獲得生成答案與引用。"
kind: "package-reference"
---

# @deepseek-ai/dsh-web-search-perplexity

[English](README.md) | 中文

## 概述

有了 `dsh-web-search-perplexity`，harness 可以通過 Perplexity 搜索 web，一次調用同時獲得模型生成的答案與可引用來源。當部署持有 Perplexity API 密鑰、并希望獲得生成答案時選擇它。Perplexity 沒有結果數量控制，因此返回的來源會在事后被截斷到請求的上限。Perplexity 省略結構化結果元數據時，來源回退為只含 URL 的引用。面向模型的 `web_search` 工具位于 `dsh-tool-web`。

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

在已加載 web 服務的組合中掛載本提供方；它以 `perplexity` 搜索提供方身份注冊，因此當它是唯一可用的搜索后端時，`ctx.web.search()` 會自動解析到它——也可以用 `searchProvider: perplexity` 固定。

### 何時選擇

當部署持有 Perplexity API 密鑰、并希望一次搜索同時獲得模型生成的答案與可引用來源時選擇此后端。密鑰為空或端點基址無法解析時，提供方不可用——每次搜索調用都會以結構化錯誤失敗。

### 最小配置

加載 web 服務與本提供方；API 密鑰回退到啟動環境中的 `$PERPLEXITY_API_KEY`，其余設置都有安全默認值。

```yaml
- name: '@deepseek-ai/dsh-web'
- name: '@deepseek-ai/dsh-web-search-perplexity'
  config:
    apiKey: !!js process.env.PERPLEXITY_API_KEY
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `apiKey` | `$PERPLEXITY_API_KEY` | Perplexity API 密鑰；為空或缺失時提供方不可用 |
| `baseURL` | `https://api.perplexity.ai` | 端點基址；追加 `/chat/completions`。無法解析時提供方不可用 |
| `model` | `sonar` | 搜索模型名稱 |
| `maxTokens` | `1024` | 生成答案 token 上限（`max_tokens`）；必須是正整數 |
| `searchRecency` | （未設置） | 以 `search_recency_filter` 發送的新近程度窗口：`day`、`week`、`month` 或 `year`。未設置時不發送過濾條件 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-web-search-perplexity)是每個受支持字段及其 JSDoc 的窮盡式真源。

### 搜索返回什么

`content` 攜帶 Perplexity 的生成答案。`sources[]` 優先使用結構化 `search_results[]`（`url`、`title`、`snippet`、`publishedAt` 取自 `date`），僅當 `search_results` 缺失時才回退到只含 URL 的 `citations[]` 數組——這正是服務上 `title`／`snippet`／`publishedAt` 為可選字段的原因。Perplexity 不公開結果數量控制，因此服務通過截斷并標記來強制執行 `maxResults`。

### 失敗與恢復

提供方失敗——HTTP 錯誤、網絡失敗、響應體無法解析或結構不符——以 `WebError` `WEB_PROVIDER_ERROR` 呈現；中止請求以 `WEB_ABORTED` 呈現。HTTP 重定向會在訪問 `Location` 指向的目標之前被拒絕，并以 `WEB_PROVIDER_ERROR` 呈現。調用方根據錯誤碼進行路由；面向模型的 `web_search` 工具會在自己的錯誤包裝層內把失敗呈現給模型。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋提供方背后的設計決策；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

該提供方是 Perplexity chat-completions 端點之上的薄適配器，遵循兩條刻意的規則：

- **生成答案直接用作 `content`。** 與其他搜索后端不同，Perplexity 返回模型生成的答案，本提供方將其作為規范化 `content` 字段透傳。
- **結構化來源優先；只含 URL 的引用是回退。** `search_results[]` 攜帶可移植字段；`citations[]` 只攜帶 URL，服務詞匯把這些字段設為可選，正是為了這種情況。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：配置 schema、環境變量回退、提供方注冊 |
| [`src/provider.ts`](src/provider.ts) | `PerplexitySearchProvider`：請求分發、中止分類、答案與來源映射 |
| [`src/types.ts`](src/types.ts) | chat-completions 響應的 Perplexity 協議類型 |
| — | 不發布運行時不變量配套入口；除所屬 seam 強制執行的約定外，本包不公開獨立的事件序列或可變數據關系。 |

### 請求與映射流程

`search()` 以 `redirect: 'error'` 把查詢連同模型、token 上限與可選新近程度過濾條件 POST 到 `{baseURL}/chat/completions`。響應的 `content` 變為 `content`；存在 `search_results[]` 時它變為 `sources[]`，否則每個 `citations[]` 條目變為只含 URL 的來源；服務在返回路徑上應用最終的 `maxResults` 上限。中止——名為 `AbortError` 的 `DOMException`——變為 `WEB_ABORTED`；其余情況變為 `WEB_PROVIDER_ERROR`。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從共享詞匯逐步進入服務、面向模型的工具與設計依據。

- [web 子系統](../../../docs/subsystems/web.zh.md)——窮盡式的搜索請求／結果詞匯與錯誤碼。
- [web 包映射](../README.zh.md)——六包家族與各角色。
- [dsh-web](../web/README.zh.md)——本提供方注冊進入的 web 服務。
- [dsh-tool-web](../tool-web/README.zh.md)——渲染本提供方來源的面向模型 `web_search` 工具。
- [生成配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-web-search-perplexity)——每個受支持配置字段及其源聲明。
- [web 能力 seam 決策](../../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.zh.md)——搜索與抓取為何共用一項提供方選擇服務。

-----

<a id="model-experience"></a>
## 模型體驗

### 輔助 Perplexity 請求

#### 模型看到的內容

獨立的 Perplexity 模型通過 chat-completions 端點將 `<query>` 原樣作為唯一用戶消息接收。該請求不屬于會話模型上下文。

#### Token 影響

每次搜索都會產生獨立的提供方 token；`maxTokens` 限制生成答案。

#### KV Cache 影響

與會話請求緩存相互獨立。同一模型路由下的相同查詢可能復用提供方緩存；查詢或路由改變會建立不同前綴。

### 間接的會話工具結果

#### 模型看到的內容

通過 `dsh-tool-web`，會話模型會看到生成答案及結構化結果元數據，或只含 URL 的引用。該提供方確切的錯誤消息為 `Perplexity search aborted`、`Perplexity search request failed: <error>` 和 `Perplexity returned an unprocessable response body: <error>`；HTTP 失敗保留提供方消息。錯誤包裝層屬于消費方。

#### Token 影響

注冊不會直接產生會話 token。答案與來源 token 取決于數據，來源數量受服務限制；保留的結果或錯誤會重復發送，直到發生壓縮（compaction）。

#### KV Cache 影響

僅追加；新可見內容位于可復用請求前綴之后，不會使現有 KV Cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明提供方在哪些情況下不合適。它們是當前包約束。

- **引用回退來源只含 URL**——Perplexity 省略結構化 `search_results[]` 時，來源不含 `title`／`snippet`／`publishedAt`，因此工具只渲染純主機名標簽。
- **超量返回的來源仍會增加 token 消耗與延遲**——協議沒有結果數量控制，`maxResults` 只能由服務在事后截斷。
- **只公開 `model`／`maxTokens`／`searchRecency`**——Perplexity 的其他搜索控制項（域名過濾條件、`web_search_options` 上下文大小、圖片）等待提供方無關的服務字段（見 [seam Agent Note](../../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.zh.md)）。
- **按錯誤形狀分類中止**——只有名為 `AbortError` 的 `DOMException` 才映射為 `WEB_ABORTED`；攜帶自定義原因的中止（例如 `dsh-timeout` 的 `TimeoutReason`）呈現為 `WEB_PROVIDER_ERROR`。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文：開放問題與尚未決定的探索方向。它明確不具權威性——已交付的行為、限制與既定理由以上文和相關 Agent Note 為準。

#### 未來：更寬的 Perplexity 控制面

Perplexity 的域名過濾條件、`web_search_options` 上下文大小與圖片支持仍未公開。公開它們需要先有提供方無關的服務字段，讓家族以一個協調一致的控制項、而非廠商專有參數的方式新增。

</details>
