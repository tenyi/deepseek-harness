---
description: "面向用戶與維護者的具備回放感知的 token 與上下文壓力計量說明：評估提示詞規模或構建壓縮（compaction）與占用顯示。"
kind: "package-reference"
---

# @deepseek-ai/dsh-token-meter

[English](README.md) | 中文

## 概述

使用 `ctx.tokenMeter` 估算會話當前的請求與上下文壓力，或為單條消息計價。測量會回放持久會話日志，結果確定且不進行模型調用，因此壓縮、占用顯示與遙測可以共享同一結果。會話投影可用時，消費方可以讀取 `tokenUsage`、`contextPressure` 與 `contextBreakdown`；文本和沒有圖片定價的路由采用近似的固定啟發式規則，存在聲明時應用視覺 token 定價，文件則按模型可見的句柄文本計價。只有請求 envelope 完全相同時才復用提供方報告的用量；本包不添加模型可見內容，也不在 loop 中做決策。

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

當消費方需要為壓縮決策、占用顯示或遙測獲取 token 或上下文壓力時掛載本插件。估算器沒有任何配置，也不添加模型可見表面；模型容量屬于擁有精確提供方／模型路由的適配器，可通過 `ctx.llm.resolveModelInfo().context` 獲取。

### 何時選擇

當多個插件應該就同一種基于回放的測量達成一致時選擇它——壓縮規劃、占用 UI 與壓力檢查都讀取同一個 fold。測量回放持久會話日志，因此確定、無需模型調用，并精確反映已記錄內容。文本和未聲明圖片定價的路由使用固定啟發式規則；當部署需要精確到計費級別的計數時，使用提供方分詞器。

### 測量壓力

`ctx.tokenMeter` 暴露兩個操作。`measure(session, requestHeader?)` 在同一個已消費日志 revision 上返回獨立、深度不可變的快照：`totalTokens` 是請求與響應壓力，`surfaceTokens` 是僅表面的路由定價總量，等于 `nodes[].tokens` 之和。可選 `requestHeader` 覆蓋會選擇計價路由與壓力字段；節點集合仍描述當前會話。`estimateMessage(message)` 用固定啟發式規則為一條消息計價。每次調用都會克隆帶位置的表面節點，因此測量是 O(surface)。

```text
const { totalTokens, surfaceTokens, nodes } = ctx.tokenMeter.measure(session)
const price = ctx.tokenMeter.estimateMessage(message)
```

每次測量都會通過可選的 `llm` 服務解析生效 envelope 的提供方／模型。適配器聲明圖片定價時，圖片出現處使用路由請求的視覺 token 價格加模型可見文本；其他路由保持固定啟發式規則。文件出現處使用同一個 `llm` 服務為適配器分發解析的確切、與路由無關的句柄文本，其中包含當前執行世界路徑或明確的無路徑說明。每個節點還攜帶與路由無關的 `heuristicTokens`，供替換影子價使用。只有當最新成功調用的規范請求 envelope 與已測量 envelope 匹配、且其總量不低于該調用完整路由定價錨點時，才復用提供方用量；否則會對完整當前 envelope 與表面做估算。表面變更保持相對于按同一路由重新定價的匹配錨點的帶符號值，包括縮減替換后的負 delta。

測量錨點包含成功的 `assistant/message` 之前的已計價表面，包括 `step/start` 之后接納的系統與用戶消息，以及重試之前執行的替換。持久輸出未變時，完成調用的表面增量為零：其提示詞已包含在提供方用量中。后續表面變更仍是相對于該錨點的帶符號增量。

### 會話投影

當組合提供 `ctx.sessionProjections` 時，token-meter 注冊三個投影單元。`tokenUsage` 攜帶完整持久日志中的 `uncachedInputTokens`、`outputTokens`、`cacheReadTokens` 與 `cacheWriteTokens`。最終 assistant 消息樣本會替換同一次嘗試的流式用量；`llm/retry-started` 會結束該替換范圍，因此同一步驟中的重試會貢獻另一次計費用量。`contextPressure` 攜帶可選 `pressureTokens`（提供方報告的最新提示詞規模）、可選 `projectedTokens`（下一個請求的提示詞將花費多少）與來自最新一條 `request/context` 記錄的可選 `contextWindow`。`contextBreakdown` 攜帶啟發式 `systemTokens`、`toolsTokens` 與 `messageTokens`——上下文的構成，而非提供方計費規模。卸載插件會移除全部三個鍵。

`contextBreakdown` 把 surface 順序中最后一個非空且存活的 `system/message` 歸入 `systemTokens`；休眠的空節點不貢獻 token，沒有非空系統消息時為零。`messageTokens` 包含其余所有可見節點，包括被取代的提示詞。兩者之和始終等于 `measure().nodes[].heuristicTokens`，未計量替換、壓縮和逐節點清空提示詞之后也成立。`toolsTokens` 跟隨最新 `request/header`。三個數字都使用固定啟發式規則，而非路由圖片定價或文件句柄投影；它們是近似構成，不是計費數據或 `projectedTokens`。

`deriveTurnTokenUsage(events)` 為瀏覽器消費方把一個完整輪次折疊為精確的逐次嘗試與整輪用量。生命周期證據缺失、計數不安全或精確總量矛盾時不返回結果；只有每次參與的嘗試都報告可選緩存、推理或路由值時，相應匯總才會出現。

### 組合

```yaml
- name: '@deepseek-ai/dsh-token-meter'
- name: '@deepseek-ai/dsh-compaction-basic'
```

兩個插件都有可用默認值。meter 只消費可選的 `llm` 服務，且僅用于解析路由聲明的請求圖片定價；壓縮保持可選。部署會在 LLM（大語言模型）適配器上配置容量與圖片定價，并在 `dsh-compaction-basic` 上配置壓縮策略。

### 解讀數字

占用是參考數字，不是計費記錄：harness 中沒有任何機制依據它做決定，壓縮讀取的是 `measure()`。UI 用測量壓力除以所選模型獨立解析的容量來計算占用。`contextBreakdown` 數字是估算值，其總和不會等于 `projectedTokens`；后者的提供方錨點恰好攜帶啟發式誤差——CJK 文本與 JSON schema 在每 token 四字符下嚴重低估。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋服務背后的設計；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

服務建立在一個 fold 與一個錨點之上。每個會話都有隔離的回放狀態——已消費事件游標、規范請求標頭、已計價表面、步驟邊界與測量錨點——通過折疊持久日志推進。只有當提供方用量的規范 envelope 匹配、且其總量不低于同一次調用的完整路由定價時，才用它錨定測量；否則會估算完整 envelope 與表面。與路由無關的 `heuristicTokens` 字段使替換影子價投影保持確定性。fold 是整體且分配全新的：格式錯誤事件會在任何變更前拋出，因此同一份日志每次重試都以相同方式失敗。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | `TokenMeter` 服務：回放狀態、fold、`measure()` 與 `estimateMessage()` |
| [`src/estimate.ts`](src/estimate.ts) | 固定啟發式規則：每 token 四字符加塊與角色開銷 |
| [`src/surface-fold.ts`](src/surface-fold.ts) | 與 `measure()` 共享的位置表面 fold |
| [`src/surface-projection.ts`](src/surface-projection.ts) | O(1) 投影單元的影價協議 |
| [`src/usage-projection.ts`](src/usage-projection.ts) | `tokenUsage` 與 `contextPressure` 投影定義 |
| [`src/breakdown-projection.ts`](src/breakdown-projection.ts) | `contextBreakdown` 投影定義 |
| [`src/client.ts`](src/client.ts) | 面向投影消費方、可安全用于瀏覽器的客戶端接口 |
| [`src/turn-usage.ts`](src/turn-usage.ts) | 精確逐次嘗試與逐 Turn 用量的純 fold |

### Fold 流程

每次 `measure()` 調用都把 fold 同步到當前持久尾部，然后讀取一份連貫快照。fold 跟蹤完整請求標頭快照、步驟邊界、表面追加與替換、成功 assistant 消息及提供方用量。用量錨點的提供方輸出從 assistant 消息的精確內嵌流重新組裝，與監聽器對持久內容的改寫相互獨立；空的重組內容計價為零。

### 投影語義

`contextBreakdown` 按 surface 順序保留純 JSON 的 `{ seq, heuristicTokens, system }` 條目，并復用測量服務的 plan/commit fold。其狀態與 surface 轉換成本為 O(當前保留 surface)，不是 O(1)，也不是 O(完整歷史日志)；被替換條目和消息正文不保留。狀態版本 4 使標量檢查點失效并重放日志。`contextPressure` 仍是標量影子價消費方：沒有相鄰 claim 的替換貢獻零增量。用量 fold 保留一個最后樣本槽，因為合法日志不會在更晚步驟報告用量后再次報告更早步驟的用量。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從計量服務逐步進入壓縮消費方與共享類型。

- [Token 計量子系統](../../../docs/subsystems/token-meter.zh.md)——`ctx.tokenMeter` 背后的測量語義。
- [dsh-llm 服務](../llm/README.zh.md)——其容量元數據由 `resolveModelInfo()` 提供的模型調用服務。
- [壓縮能力](../../../docs/subsystems/compaction.zh.md)——讀取 `measure()` 的壓力敏感消費方。
- [投影 token 用量](../../../.agents/notes/implemented/architecture/2026-07-29-projected-token-usage-and-request-context.zh.md)——`projectedTokens` 背后的設計與被否決的原子配對比較。
- [LLM 流式子系統](../../../docs/subsystems/llm-streaming.zh.md)——本服務計價的消息與塊類型。

-----

<a id="model-experience"></a>
## 模型體驗

間接地，通過 `dsh-compaction-basic` 等消費方；服務本身不添加任何提示詞、消息、schema、工具或模型調用。

#### KV Cache 影響

不直接失效；任何請求前綴變更都由點名的消費方負責。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明計量在哪里停止、由未來工作接續。它們是當前包約束，不是通用 token 計量對比或任務積壓。

- **固定啟發式規則是近似值**——沒有可復用提供方用量的文本按字符數加結構開銷計價，而非精確提供方分詞器或請求序列化器；只有聲明了定價的路由上的圖片出現處攜帶提供方精確的視覺 token。
- **每次測量都克隆當前表面**——連貫不可變快照讓讀取為 O(surface)，包括低于閾值的壓力檢查。
- **提供方用量只在規范 envelope 完全相同時可復用**——工具、提供方、模型或調用配置變化會刻意回退到完整啟發式估算；系統提示詞變更在下一次成功調用之前按帶符號的表面增量計量。
- **系統提示詞改寫不帶影子價**——循環替換 system 節點時沒有緊鄰的計量事件，因此 `contextPressure.projectedTokens` 以零增量折疊該替換，直到下一個用量樣本；`contextBreakdown.systemTokens` 與 `measure()` 會立即按新提示詞重新計價。
- **構成檢查點保留當前 surface**——精確的 system/message 分類需要位置條目；檢查點大小和 surface 事件折疊成本為 O(當前保留 surface)。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是不具權威性的工作上下文：維護者備注與開放問題。已交付的行為與既定理由以上文、包代碼和相關 Agent Note 為準。

- 固定每 token 四字符啟發式規則會低估 CJK 文本與 JSON schema；復用用量時提供方錨點恰好攜帶該誤差，請把構成行呈現為近似構成，絕不呈現為總量。
- 按提供方的精確分詞器尚未決定；保持單一確定性啟發式規則，正是讓每個消費方的測量一致且回放穩定的原因。

</details>

**運行時不變式：** 不發布伴生入口。用量 fold 在每次嘗試內替換樣本，總量不必單調。構成和測量共享位置替換規劃器與固定估算器，因此啟發式 surface 總量按構造一致，而非需要比較的獨立可變觀測。路由定價總量有意與之不同。
