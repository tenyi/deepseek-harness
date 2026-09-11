---
description: "工作流編排能力：運行由模型編寫的、扇出 subagent 的腳本，供選擇或構建在 ctx.workflowEngine 之上的用戶與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-workflow

[English](README.md) | 中文

## 概述

運行一段純 JavaScript 編排腳本，將工作扇出給 subagent，并返回腳本的最終 JSON 值。腳本可以使用 `agent()`、`parallel()`、`pipeline()`、`phase()` 和 `log()`；模型通常通過 `workflow` 工具訪問它們。每次運行都歸調用方所有，將每個子 agent（智能體）歸屬于調用它的 agent，在失敗或取消時以結果兌現而不拒絕，并在有界寬限期內完成 dispose（資源釋放）。調用方必須提供執行引擎，因此可以更換隔離策略而不改變可見行為。

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

當任務分解為許多獨立部分、適合用一段腳本統一協調——例如跨多個文件的審計、一次遷移、多角度研究——且模型明確要求工作流式編排時，運行工作流。一兩項委派時，優先使用普通 subagent 調用。

### 模型側路徑

模型通過 `dsh-tool-workflow` 的 `workflow` 工具觸達該能力；該工具擁有調用 schema 與結果包絡，引擎提供其下的執行。一次工具調用提交 `meta`、`script` 與可選 `args`，運行完成時返回 `{ runId, agentsStarted, result }`。工具會阻塞父級輪次直到整個工作流結算，因此模型只看到最終結果，永遠不會看到中間子 agent 消息。

### 運行工作流腳本

編排腳本是純 JavaScript 腳本體（不是 TypeScript），以頂層 `await` 運行并以 `return <json-value>` 結尾。`meta` 身份塊與任何 `args` 都以普通 JSON 數據到達——絕不作為代碼求值。執行期間腳本調用提供的鉤子：`agent(prompt, opts)` 啟動一個 subagent，并以其最終文本、或在提供 schema 時以經過校驗的結構化值兌現；`parallel()` 與 `pipeline()` 組合獨立工作；`phase()` 與 `log()` 為觀察者敘述進度。

```text
// Script body — runs with top-level await, ends with a JSON return value:
const reviews = await parallel([
  () => agent('Review src/a.ts for correctness'),
  () => agent('Review src/b.ts for correctness'),
])
return { reviewed: reviews.length }
```

腳本結算時，運行的 result 以返回值、結束原因和已啟動的子 agent 數量兌現。腳本不返回值時得到 `null`。

### 編程方式運行

插件消費方可以直接啟動運行：`ctx.workflowEngine.start({ script, meta, args?, parent, signal? })`。`parent` 把每個子 agent 歸屬于調用它的 agent；`signal` 在中止時取消運行。`start()` 在運行存在之前校驗 meta 塊并解析腳本，因此格式錯誤的請求會立即以違規清單失敗。

返回的運行公開 `id`、`meta`、`result`、`cancel(reason?)` 與 `dispose()`。result 絕不拒絕：腳本失敗以 `stopReason: 'error'` 兌現，取消以 `'cancelled'` 兌現。調用方擁有該運行——每條路徑都要調用 `dispose()`；它會取消剩余工作，并在有界寬限期內等待腳本與子 agent 完全停穩。

### 失敗與恢復

無法解析的腳本、格式錯誤的 meta 塊、不可用的提供方路由或不受支持的單次運行限制，都會在運行存在之前被同步拒絕；`workflow` 工具把這些報告為模型可以修正的錯誤。執行期間，鉤子誤用——錯誤參數、未知選項、不支持的 schema、超出上限——會明確終止腳本，而不會轉為逐項 `null`。普通子 agent 失敗不是基礎設施錯誤：`agent()` 以 `null` 兌現，由腳本決定如何處理。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋能力如何拆分、約定位于何處；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

本包把腳本、運行、結果與事件約定同執行分開：任何引擎都可以在同一詞匯背后實現 `ctx.workflowEngine`，一個上下文同時只有一個引擎——加載第二個引擎會明確報錯，因此更換引擎意味著更改組合所加載的引擎插件。`workflow/*` 事件只供觀察：payload 攜帶運行身份快照，絕不攜帶活動運行，因此監聽器無法取得取消或 dispose 權限。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 服務定義、`workflow/*` 事件聲明、`WorkflowError` 及其 fatal 標志 |
| [`src/types.ts`](src/types.ts) | 瀏覽器安全詞匯：`WorkflowMeta`、`WorkflowResult`、運行與 agent 事件信息 |
| [`src/runtime-types.ts`](src/runtime-types.ts) | 僅宿主的 `WorkflowStartRequest` 與 `WorkflowRun` 句柄 |
| [`src/invariant.ts`](src/invariant.ts) | 不變式伴生插件：事件配對與身份校驗 |

### 生命周期與歸屬

運行由持有方負責：引擎插件卸載會阻止新的啟動，但不會撤銷已接受的運行，調用方必須 dispose 自己啟動的每個運行。`dispose()` 在需要時取消，并在引擎文檔規定的期限內等待腳本與子 agent 完全停穩，因此等待 `result` 的消費方絕不會因取消而卡死。

`workflow/start` 與 `workflow/end` 為運行配對；`workflow/phase` 與 `workflow/log` 攜帶腳本敘述；`workflow/agent-start` 與 `workflow/agent-end` 按 `seq` 為每次子 agent 調用配對。每個監聽器都獨立隔離：拋錯的監聽器只記錄日志，不會餓死同級監聽器或改變執行，并且每個監聽器都會收到自己的 payload 副本。

### 失敗紀律

`WorkflowError` 攜帶機器可路由的 code 與 `fatal` 標志；每個 code 都是致命的，`parallel()` 與 `pipeline()` 會重新拋出致命錯誤，而不是把條目映射為 `null`——拼錯的選項必須明確終止腳本。code 覆蓋啟動失敗、約定違規、超出上限、提供方與結果故障、不可序列化值與取消；完整集合與含義見 [`src/index.ts`](src/index.ts)。

逐項 `null` 只保留給子運行失敗與階段內普通腳本錯誤，因此以非完成結束原因正常結算的子 agent 不屬于基礎設施異常：`agent()` 返回 `null`，讓腳本處理普通子 agent 失敗。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級契約不夠用時閱讀以下頁面。它們從共享工作流模型逐步進入當前引擎與面向模型的消費方。

- [工作流子系統](../../../docs/subsystems/workflow.zh.md)——完整類型詞匯、啟動請求與事件載荷。
- [組地圖](../README.zh.md)——工作流能力家族及其包。
- [workflow 工具](../tool-workflow/README.zh.md)——擁有調用 schema 與結果包絡的模型側消費方。
- [worker-thread 引擎](../workflow-worker-thread/README.zh.md)——當前執行引擎及其隔離邊界。
- [動態工作流 Agent Note](../../../.agents/notes/implemented/feature/2026-07-05-dynamic-workflows.zh.md)——seam 設計及其決策。

-----

<a id="model-experience"></a>
## 模型體驗

間接地，通過其消費方 `dsh-tool-workflow` 與一個工作流引擎，由它們渲染父級工具結果與子 agent 請求。

#### KV Cache 影響

不會直接導致失效；請求前綴的任何變化均由上述消費方與引擎負責。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明該能力尚未支持什么。它們是當前約束，不是任務積壓。

- **僅支持前臺收集**——調用方擁有一個活動運行并等待它；后臺啟動／輪詢、spill 句柄與分離收集均暫緩。
- **沒有日志化或恢復**——腳本、子 agent 進度與中間值均不設檢查點，因此進程重啟后無法繼續運行。
- **沒有已保存或嵌套工作流**——該能力只啟動調用方提供的腳本，工作流腳本不會收到用于遞歸編排的 `workflow()` 鉤子。
- **沒有 token 預算詞匯**——引擎限制并發、條目與子 agent，但請求與結果都不會統計跨子 agent 的模型 token。
- **運行由持有方負責，不由服務跟蹤**——卸載引擎不會發現獨立的活動句柄；每個消費方都必須 dispose 自己啟動的運行。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文：尚未決定的開放方向。它明確不具權威性——已交付的行為、限制與既定理由以上文、包代碼與相關 Agent Note 為準。

暫緩的方向：帶 spill 句柄與分離收集的后臺啟動／輪詢 API；已保存與嵌套工作流；跨子 agent 的 token 預算詞匯；以及該 seam 的承諾——未來的進程或沙箱引擎可以在不改變模型側表面的前提下替換 worker-thread 引擎。

</details>
