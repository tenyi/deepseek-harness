---
description: "web 訪問服務（ctx.web）：部署方與插件作者如何通過可互換的提供方搜索 web 與抓取 URL，以及統一的選擇策略與錯誤詞匯。"
kind: "package-reference"
---

# @deepseek-ai/dsh-web

[English](README.md) | 中文

## 概述

使用 `dsh-web` 搜索 web 或抓取 URL，而無需讓調用方依賴特定廠商。它為每項操作選擇可用后端，并為調用方提供一致的取消、錯誤和結果上限。在調用 `ctx.web.search()` 或 `ctx.web.fetch()` 的插件或工具中選擇它；已交付的 `dsh-tool-web` 工具會為你加載它。搜索或抓取需要已配置且可用的提供方，因為本包自身不發起網絡請求。

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

需要 web 訪問的組合會加載 `dsh-web` 服務并掛載至少一個后端——搜索提供方和／或抓取提供方——插件或工具作者隨后直接調用 `ctx.web.search()` 與 `ctx.web.fetch()`。服務會為每次調用解析后端，因此除非調用方配置了提供方 id，否則它們看不到提供方 id。

### 何時選擇

當插件或工具必須搜索或抓取、又不希望硬編碼廠商時選擇本服務；只使用已交付的 `web_search`／`web_fetch` 工具的組合會通過 `dsh-tool-web` 自動加載本服務。當組合從不訪問 web 時，你不需要它。服務本身不增加任何網絡訪問能力：沒有至少一個可用提供方時，每次調用都會以結構化 `WebError` 失敗。

### 最小配置

加載服務并讓唯一掛載的后端自動選擇，或用 `searchProvider`／`fetchProvider` 固定提供方 id。環境變量 `$DSH_WEB_SEARCH_PROVIDER` 與 `$DSH_WEB_FETCH_PROVIDER` 提供相同字段，不是另一條優先級鏈。

```yaml
- name: '@deepseek-ai/dsh-web'
- name: '@deepseek-ai/dsh-web-search-exa'
- name: '@deepseek-ai/dsh-web-fetch-http'
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `searchProvider` | （未設置） | 固定的搜索提供方 id；未設置時僅在恰好一個可用時自動選擇 |
| `fetchProvider` | （未設置） | 固定的抓取提供方 id；未設置時僅在恰好一個可用時自動選擇 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-web)是每個受支持字段及其 JSDoc 的窮盡式真源。

### 搜索與抓取

`search()` 執行一次查詢，返回可選的提供方答案與可引用的來源列表；服務強制執行 `request.maxResults`：截斷 `sources[]` 并設置 `truncated`。`fetch()` 獲取一個 URL，返回其最終 URL、狀態碼、解碼后的正文與截斷標志；非 2xx 響應是結果，不是錯誤。

```text
// Search the web; sources[] is capped to maxResults:
const result = await ctx.web.search({ query: 'deepseek harness', maxResults: 8 })

// Fetch one URL; a non-2xx response is a result, not an error:
const page = await ctx.web.fetch({ url: 'https://example.com' })
```

兩個調用都接受可選的 `AbortSignal`，用于把取消轉發給提供方。規范化的請求與結果形狀是調用方賴以構建的約定；[web 子系統](../../../docs/subsystems/web.zh.md) 參考中的詞匯章節對其有窮盡式描述。

### 提供方選擇

每次調用都在執行時解析提供方，注冊或加載順序從不影響結果。已配置的提供方 id 在已注冊且可用時優先；沒有配置 id 時，服務運行唯一可用的提供方，或在情況不明時明確失敗：

| 情況 | 結果 |
|---|---|
| 已配置 id 已注冊且可用 | 運行該提供方 |
| 已配置 id 未注冊 | `WEB_PROVIDER_CONFIGURED_MISSING` |
| 已配置 id 已注冊但不可用 | `WEB_PROVIDER_CONFIGURED_UNAVAILABLE` |
| 無 id，恰好一個已注冊的可用提供方 | 運行它 |
| 無 id，沒有可用提供方 | `WEB_PROVIDER_UNAVAILABLE` |
| 無 id，多個可用提供方 | `WEB_PROVIDER_AMBIGUOUS` |

提供方的可用性是一項廉價的局部檢查——例如其 API 密鑰是否存在——并且從不發起網絡調用，因此選擇保持快速且確定。

### 失敗與恢復

失敗拋出 `WebError`，攜帶穩定、可按機器路由的 code；消息補充細節，例如缺失的提供方 id 或歧義候選集合。調用方按 code 路由并決定如何降級。要改變一次調用使用的后端，請重新配置固定的 id、掛載或卸載提供方，或修正提供方配置使其可用性檢查通過。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋服務背后的設計決策；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

本包建立在一個刻意的分離之上：

- **一個 seam，兩個獨立操作。** 搜索與抓取沒有共享請求 schema 或業務邏輯，但它們共用一個服務，使提供方選擇、取消、錯誤與產品配置只有一個歸屬方。并行的 `Search`／`Fetch` 方法對是有意為之。
- **選擇絕不依賴順序。** 能力要么固定提供方 id，要么在恰好注冊一個可用提供方時自動選擇；`search()`／`fetch()` 在執行時解析提供方。
- **服務擁有結果上限。** `maxResults` 由 seam 在提供方返回后強制執行，因此超量返回的提供方絕不可能泄漏超出調用方要求的來源。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`WebRuntime` 服務、兩個提供方注冊表與執行時選擇 |
| [`src/types.ts`](src/types.ts) | 詞匯：請求／結果類型、封閉的 `WebFetchBody` 聯合與 `WebError` 分類體系 |
| — | 不發布運行時不變式配套項；提供方映射是私有數據，服務會在每次調用時執行提供方選擇并強制執行結果上限；該 seam 不發布獨立注冊表，也不發布請求／結果觀測流。 |

### 數據模型

請求與結果類型定義了調用方賴以構建的規范化詞匯——`Search` 請求／結果對與 `Fetch` 請求／結果對各一組——窮盡式字段與 JSDoc 見 [`src/types.ts`](src/types.ts) 與 [web 子系統](../../../docs/subsystems/web.zh.md) 參考。兩個刻意的選擇塑造了它們：`WebFetchBody` 是這里擁有的封閉聯合（`html` | `text`），因此新增類型會破壞編譯，直到每個消費方都處理它；`WebError` 繼承 `HarnessError`，攜帶開放的字符串 `code`，因此消費方必須容忍提供方專有的取值。來源字段保持可選，因為并非每個提供方都返回全部字段。

### 選擇流程

執行時，服務先按配置 id、再按唯一可用提供方解析提供方，沒有明確贏家時拋出對應的 `WebError`。搜索結果隨后經過 `capSources`：把 `sources[]` 截斷到 `maxResults` 并標記 `truncated`。注冊基于 effect：提供方隨調用 fiber 注冊，fiber 釋放時注銷；同一能力類型下重復的 id 會在注冊時被拒絕。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從共享詞匯逐步進入已交付后端、面向模型的工具與設計依據。

- [web 子系統](../../../docs/subsystems/web.zh.md)——窮盡式的搜索／抓取請求與結果、提供方可用性與錯誤碼。
- [web 包映射](../README.zh.md)——六包家族與各角色。
- [dsh-tool-web](../tool-web/README.zh.md)——構建于本服務之上的面向模型 `web_search` 與 `web_fetch` 工具。
- [dsh-web-fetch-http](../web-fetch-http/README.zh.md)——已交付的匿名 HTTP(S) 抓取后端。
- [生成配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-web)——每個受支持配置字段及其源聲明。
- [web 能力 seam 決策](../../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.zh.md)——搜索與抓取為何共用一項提供方選擇服務。

-----

<a id="model-experience"></a>
## 模型體驗

間接地，通過 `dsh-tool-web`：該工具把 seam 規范化的搜索結果與抓取正文渲染給模型，而本服務不貢獻任何提示詞或 schema。

#### KV Cache 影響

不會直接導致 KV Cache 失效；請求前綴變更由上述消費方負責。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本服務單獨使用時在哪些方面不完整。它們是當前包約束。

- **沒有觀測接口**：沒有提供方變更事件或能力狀態查詢；可用性只能通過執行搜索或抓取并按拋出的 code 路由來觀測，無提供方失敗是通用的 `WEB_PROVIDER_UNAVAILABLE`，不枚舉逐提供方原因（見 [Agent Note](../../../.agents/notes/archived/simplification/2026-07-04-drop-unconsumed-web-observation-surface.md)）。
- **搜索請求只攜帶 `query` 與 `maxResults`**：提供方無關的控制項（新近程度、域名過濾條件、區域提示、搜索深度）暫緩至后端都能誠實支持時（見 [seam Agent Note](../../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.zh.md)）。
- **`WebFetchBody` 沒有 `pdf` 分支**：可提取文本的 PDF 支持屬于明確的延期工作；封閉聯合會使新增該分支成為跨 web 包、由編譯強制執行的變更。
- **提供方支持的頁面提取不屬于 `fetch()` 范圍**：Firecrawl/Tavily 風格的 `web_extract` 能力延期，而不會擴展抓取操作。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文：開放問題與尚未決定的探索方向。它明確不具權威性——已交付的行為、限制與既定理由以上文和相關 Agent Note 為準。

#### 未來：觀測提供方狀態

沒有提供方變更事件或能力狀態查詢；消費方只能通過執行調用并按拋出的 code 路由來觀測可用性。如果消費方需要逐提供方原因，恢復一個小的觀測接口是可行的，但已歸檔的簡化筆記記錄了為何放棄此前的那個接口。

</details>
