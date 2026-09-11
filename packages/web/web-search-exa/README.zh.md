---
description: "ctx.web 的 Exa 搜索提供方：部署方如何掛載廠商原生 web 搜索，獲得可移植 snippet 與發布日期。"
kind: "package-reference"
---

# @deepseek-ai/dsh-web-search-exa

[English](README.md) | 中文

## 概述

有了 `dsh-web-search-exa`，harness 可以通過 Exa 搜索 web，獲得帶可移植 snippet 與發布日期的廠商原生結果。當部署持有 Exa API 密鑰、并希望使用 Exa 的關鍵詞或神經搜索時選擇它。Exa 不返回生成答案，因此結果不攜帶 `content`——只產出可引用的來源。沒有非空白高亮的來源會被丟棄，因此一次調用返回的來源可能少于請求數量。面向模型的 `web_search` 工具位于 `dsh-tool-web`。

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

在已加載 web 服務的組合中掛載本提供方；它以 `exa` 搜索提供方身份注冊，因此當它是唯一可用的搜索后端時，`ctx.web.search()` 會自動解析到它——也可以用 `searchProvider: exa` 固定。

### 何時選擇

當部署持有 Exa API 密鑰，并希望使用 Exa 的關鍵詞或神經搜索、獲得每項結果的高亮 snippet 與發布日期時，選擇此后端。密鑰為空或端點基址無法解析時，提供方不可用——每次搜索調用都會以結構化錯誤失敗。

### 最小配置

加載 web 服務與本提供方；API 密鑰回退到啟動環境中的 `$EXA_API_KEY`，其余設置都有安全默認值。

```yaml
- name: '@deepseek-ai/dsh-web'
- name: '@deepseek-ai/dsh-web-search-exa'
  config:
    apiKey: !!js process.env.EXA_API_KEY
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `apiKey` | `$EXA_API_KEY` | Exa API 密鑰；為空或缺失時提供方不可用 |
| `baseURL` | `https://api.exa.ai` | 端點基址；追加 `/search`。無法解析時提供方不可用 |
| `searchType` | `auto` | 以 Exa `type` 發送的檢索模式：`auto`、`keyword` 或 `neural` |
| `numResults` | （未設置） | 請求不含 `maxResults` 時使用的默認結果數；必須是正整數 |
| `highlightsPerResult` | `1` | 每個結果請求的 highlight 句子數（Exa `highlightsPerUrl`）；必須是正整數 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-web-search-exa)是每個受支持字段及其 JSDoc 的窮盡式真源。

### 搜索返回什么

每項 Exa 結果映射為 `WebSearchSource`：`url`、`title`、以首個非空白高亮作為 `snippet`、`publishedDate` 作為 `publishedAt`；沒有高亮的來源缺少可移植的 snippet，會被丟棄。請求的 `maxResults` 優先于已配置的默認 `numResults`，并作為成本與延遲優化發送給 Exa——最終上限由服務強制執行：截斷并標記。Exa 不返回生成答案，因此結果不攜帶 `content`。

### 失敗與恢復

提供方失敗——HTTP 錯誤、網絡失敗、響應體無法解析或結構不符——以 `WebError` `WEB_PROVIDER_ERROR` 呈現；中止請求以 `WEB_ABORTED` 呈現。HTTP 重定向會在訪問 `Location` 指向的目標之前被拒絕，并以 `WEB_PROVIDER_ERROR` 呈現。調用方根據錯誤碼進行分流；面向模型的 `web_search` 工具會在自己的錯誤包裝層內把失敗呈現給模型。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋提供方背后的設計決策；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

該提供方是 Exa API 之上的薄適配器，遵循兩條刻意的規則：

- **只取可移植的 snippet。** 來源只有在真實高亮存在時才獲得 `snippet`；用其他字段捏造會讓 seam 說謊，因此沒有 snippet 的結果被整個丟棄。
- **不虛構答案。** Exa 不返回生成答案，因此省略 `content`，而不是編造模型可能信任的提供方文本。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：配置 schema、環境變量回退、提供方注冊 |
| [`src/provider.ts`](src/provider.ts) | `ExaSearchProvider`：請求分發、中止分類、結果映射 |
| [`src/types.ts`](src/types.ts) | Exa 協議類型：`ExaSearchResponse`、`ExaResult`、`ExaError` |
| — | 不發布運行時不變量配套入口；除所屬 seam 強制執行的約定外，本包沒有獨立的事件序列或可變數據關系。 |

### 請求與映射流程

`search()` 以 `redirect: 'error'` 把查詢、檢索模式、高亮請求與可選結果數 POST 到 `{baseURL}/search`，因此重定向會在不接觸目標的情況下使請求失敗。解析后的 `results[]` 逐項映射，沒有 snippet 的條目被丟棄，服務在返回路徑上應用最終的 `maxResults` 上限。中止——名為 `AbortError` 的 `DOMException`——變為 `WEB_ABORTED`；其余情況變為 `WEB_PROVIDER_ERROR`。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從共享詞匯逐步進入服務、面向模型的工具與設計依據。

- [web 子系統](../../../docs/subsystems/web.zh.md)——窮盡式的搜索請求／結果詞匯與錯誤碼。
- [web 包映射](../README.zh.md)——六包家族與各角色。
- [dsh-web](../web/README.zh.md)——本提供方注冊進入的 web 服務。
- [dsh-tool-web](../tool-web/README.zh.md)——渲染本提供方來源的面向模型 `web_search` 工具。
- [生成配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-web-search-exa)——每個受支持配置字段及其源聲明。
- [web 能力 seam 決策](../../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.zh.md)——搜索與抓取為何共用一項提供方選擇服務。

-----

<a id="model-experience"></a>
## 模型體驗

通過 `dsh-tool-web` 間接影響模型體驗。該工具保留本提供方經 `maxResults` 限制的 URL、標題、首條高亮與發布日期；如果發生失敗，則會在消費方的錯誤包裝層內保留原樣錯誤消息 `Exa search aborted`、`Exa search request failed: <error>` 和 `Exa returned an unprocessable response body: <error>`。

#### KV Cache 影響

不會直接導致 KV Cache 失效；請求前綴變更由上述消費方負責。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明提供方在哪些情況下不合適。它們是當前包約束。

- **沒有非空白高亮的來源會被整個丟棄**——沒有可映射的可移植 snippet，因此返回來源可能少于請求數量。
- **只公開 `searchType`／`numResults`／`highlightsPerResult`**——Exa 的其他控制項（livecrawl、category、域名／日期過濾條件、全文內容）等待提供方無關的服務字段（見 [seam Agent Note](../../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.zh.md)）。
- **按錯誤形狀分類中止**——只有名為 `AbortError` 的 `DOMException` 才映射為 `WEB_ABORTED`；攜帶自定義原因的中止（例如 `dsh-timeout` 的 `TimeoutReason`）呈現為 `WEB_PROVIDER_ERROR`。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文：開放問題與尚未決定的探索方向。它明確不具權威性——已交付的行為、限制與既定理由以上文和相關 Agent Note 為準。

#### 未來：更寬的 Exa 控制面

Exa 的 livecrawl、category、域名與日期過濾條件以及全文內容仍未公開。公開它們需要先有提供方無關的服務字段，讓家族以一個協調一致的控制項、而非廠商專有參數的方式新增。

</details>
