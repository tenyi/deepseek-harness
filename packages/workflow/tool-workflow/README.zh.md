---
description: "面向模型的工作流工具：運行扇出 subagent 的 JavaScript 編排腳本，供選擇或配置模型驅動編排的用戶與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-workflow

[English](README.md) | 中文

## 概述

`dsh-tool-workflow` 讓模型運行 JavaScript 編排腳本，把工作委派給多個 subagent，并返回腳本的最終 JSON 值。僅當用戶明確要求工作流或大型多 agent（智能體）編排時使用；一兩項委派應使用普通 subagent 調用。父級輪次會等待所有委派任務結束；取消或異常完成會返回錯誤，而不是部分成功。部署方可以通過 `toolName` 重命名工具，并通過 `maxResultChars` 限制渲染結果文本。

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

`workflow` 工具運行由模型編寫的編排腳本，把工作扇出到多個 subagent，并返回腳本的最終 JSON 值。僅當用戶明確要求工作流或大型多 agent 編排時使用——例如跨多個文件的審計、一次遷移、多角度研究；一兩項委派時優先使用普通 subagent 調用。

### 調用工具

模型提交三個參數：`meta`（必需的身份數據：`name`、`description`，以及可選的 `whenToUse` 與 `phases`）、`script`（必需的純 JavaScript 腳本體——不含 `export const meta` 語句；工具描述攜帶完整的編寫約定）與 `args`（可選 JSON 對象，作為全局變量 `args` 向腳本公開；裸列表應包裝到字段中，使協議 schema 如實表達形態）。

成功返回規范包絡 `{ runId, agentsStarted, result }`，向模型渲染為 `workflow "<name>" completed (<count> agent<optional-s>).`，后接 `Return value:` 與美化打印的 JSON。無法啟動的工作流——腳本解析或 meta 校驗失敗——返回模型可以修正的錯誤。取消與執行失敗返回 `Error: workflow run was cancelled` 或 `Error: workflow run failed: <error>`；部分輸出絕不會被報告為成功。

### 運行期間的預期

腳本運行期間，父級輪次會等待：工具啟動運行、等待其結果，并始終對該運行執行 dispose（資源釋放），因此腳本及其子 agent 在每條路徑上完全停穩——包括從父級步驟中止信號橋接而來的取消。模型只看到最終結果，永遠不會看到中間子 agent 消息；子 agent 自己的工作不會進入父級對話。

### 配置

| 字段 | 默認值 | 含義 |
|---|---|---|
| `toolName` | `workflow` | 要注冊的面向模型工具名稱。 |
| `maxResultChars` | `50000` | 渲染結果上限；更長的 JSON 會被截斷并附上提示。 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-workflow)是每個受支持字段的窮盡式真源。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋消費方如何與引擎拆分、運行生命周期與記錄如何工作；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

消費方擁有模型側 schema、`tool:<toolName>` 系統提示詞指導與結果包絡；腳本解析、執行、上限與取消位于 `ctx.workflowEngine` 之后，因此更堅固的引擎可以無縫替換，而不改變模型看到的內容。使用指導以提示詞段的形式隨工具插件交付，絕不放入部署 persona。

### 運行生命周期

`execute` 啟動運行，并在 `try/finally` 內等待 `run.result`；該結構總會對運行執行 dispose。`exec.signal` 會橋接到 `run.cancel()`，包括啟動前已經中止的情況。非 `completed` 結束原因會映射為報告原因的 `isError` 結果；完成時渲染 `{ runId, agentsStarted, result }`，Native 渲染器只會在 `maxResultChars` 處截斷該投影。

### 持久會話記錄

對于根 transport 執行（`exec.parent` 缺省），工具會用四個 log-only 事件把運行投影到調用方 agent 的會話：`start()` 返回后寫 run-start，只記錄 `run.id` 匹配的成員開始與結束，并且只在結果可用且 dispose 完全停穩后寫 run-end。嵌套 transport 調用照常執行，但不寫任何記錄。會話追加操作首次失敗后，本運行會停止后續記錄并只告警一次，留下空記錄或合法連續前綴，同時不改變工具結果和清理。包 invariant 會在冷加載與實時追加時拒絕重復 start、未配對成員、仍有開放成員的終點與 run-end 后更新，同時允許缺失終態后綴的連續前綴。

### 渲染意圖

按[渲染意圖 Agent Note](../../../.agents/notes/implemented/architecture/2026-07-02-tool-render-intent-union.zh.md)預先確定：使用 `generic` 卡片，標題為 `workflow: <meta.name>`，直接從 `args.meta.name` 讀取——呈現是參數的純函數——腳本文本作為 `rawInput` 攜帶。結果繼續使用 generic 卡片。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：工具注冊、運行生命周期、記錄器接線 |
| [`src/types.ts`](src/types.ts) | 四個 log-only 記錄事件 payload 及其 `SessionEventMap` 聲明 |
| [`src/invariant.ts`](src/invariant.ts) | 不變式配套入口：持久工作流記錄協議校驗 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當工具級約定不夠用時閱讀以下頁面。這些頁面依次介紹共享工作流模型、引擎，以及可供比較的委派工具。

- [工作流子系統](../../../docs/subsystems/workflow.zh.md)——seam 約定、啟動請求與事件載荷。
- [工作流 seam](../workflow/README.zh.md)——工具背后的運行與結果詞匯。
- [worker-thread 引擎](../workflow-worker-thread/README.zh.md)——執行腳本的引擎。
- [subagent 工具](../../subagent/tool-subagent/README.zh.md)——一兩項委派時的普通委派替代方案。
- [組地圖](../README.zh.md)——工作流能力家族及其包。
- [動態工作流 Agent Note](../../../.agents/notes/implemented/feature/2026-07-05-dynamic-workflows.zh.md)——seam 設計及其決策。

-----

<a id="model-experience"></a>
## 模型體驗

### 系統提示詞

#### 模型看到什么

在該插件的注冊作用域內，每個父級請求都會收到下方的工作流指導。作用域工具限制可以隱藏 schema，而不移除這段獨立注冊的指導。

##### 工作流指導

```markdown
Use the <toolName> tool ONLY when the user explicitly asks for a workflow or for large multi-agent orchestration: you write a JavaScript script (the tool description documents the exact format) that fans work out across many subagents with phases and structured results. For one or two delegations, prefer plain subagent calls.
```

#### Token 影響

插件啟用期間，每個請求都會產生少量固定的指導 token 開銷。

#### KV Cache 影響

只要插件作用域與指導文本不變，前綴就保持穩定。啟用或 dispose 可能會使從該提示詞段起的緩存復用失效。

### 工具 schema

#### 模型看到什么

工具可見時，已生成的默認 [`workflow` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-workflow) 包含完整的 JavaScript 鉤子與元數據約定；`toolName` 可以重命名該定義，模型會提交腳本、元數據與可選 args。

#### Token 影響

工具可見時，每個請求都會產生較大的固定 schema token 開銷。

#### KV Cache 影響

只要 `toolName`、定義與可見性不變，前綴就保持穩定。重命名、插件生命周期或作用域限制可能會使從該 schema 起的緩存復用失效。

### 工具調用歷史與結果

#### 模型看到什么

由模型編寫的完整腳本、元數據與 args 會保留在 assistant 工具調用中。成功結果精確為 `workflow "<name>" completed (<count> agent<optional-s>).`、換行、`Return value:`、換行，以及美化打印且依賴數據的 JSON；達到上限時，會在新行添加 `… [truncated: <omitted> more characters]`。失敗結果精確為 `Error: workflow run was cancelled`（可以追加后綴 ` (<error>)`）、`Error: workflow run failed: <error-or-unknown error>` 或防御性的 `Error: workflow run ended abnormally (<reason>)`；沒有所屬 agent 的調用變為 `Error: workflow tool requires a calling agent (exec.agent was undefined)`。中間子 agent 消息會被省略。

#### Token 影響

調用 token 可能很多，并會保留到壓縮（compaction）為止。結果渲染受 `maxResultChars` 限制；子模型 token 與父級保留的上下文相互獨立。

#### KV Cache 影響

僅追加；新增可見內容位于可復用請求前綴之后，不會使現有 KV Cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明該工具尚未支持什么。它們是當前約束，不是任務積壓。

- **父級輪次會阻塞到整個工作流結算**——沒有后臺啟動／輪詢接口，取消會丟棄局部輸出并返回錯誤。
- **`args` 必須是對象，Native 結果文本有界**——調用方把頂層數組／標量包裝到字段中；規范工作流結果保持完整，超過 `maxResultChars` 的 JSON 會在面向模型的投影中截斷，而不是存儲在檢索句柄背后。
- **每次工具注冊的工作流策略固定**——提供方選擇、上限與工具名稱屬于部署配置，不是模型調用參數。
- **持久記錄只覆蓋頂層且只供觀察**——嵌套 PTC mode dispatch 不記錄；記錄故障會刻意退化為不完整前綴，而不改變執行。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文：尚未決定的開放方向。它明確不具權威性——已交付的行為、限制與既定理由以上文、包代碼與相關 Agent Note 為準。

開放方向：讓父級輪次不再阻塞的后臺啟動／輪詢路徑；把截斷的 JSON 存儲在檢索句柄背后，而不是剪裁投影；記錄超出頂層的嵌套 dispatch。

</details>
