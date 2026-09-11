---
description: "抽象代碼執行 seam（`ctx.codeRuntime`），供用戶與維護者組合、消費或構建后端，以針對宿主提供的綁定運行一段模型編寫的程序。"
kind: "package-reference"
---

# @deepseek-ai/dsh-code-runtime

[English](README.md) | 中文

## 概述

使用 `dsh-code-runtime`，可通過已配置的后端，針對宿主提供的異步函數運行一段模型編寫的程序。請求返回無損 JSON 值、通道內有序的日志或結構化錯誤；程序失敗在結果中 resolve，而 Promise reject 表示調用方誤用。每次運行都與先前運行隔離，且運行時不了解工具或會話。執行后端需另行選擇；其語言與隔離描述符標明所需的源語言和執行基底，但這些描述符本身不承諾安全邊界。

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

當你要組合一個執行模型程序的部署、直接消費 `ctx.codeRuntime`，或構建運行程序的后端時，選擇本包。在已發布的組合中，`dsh-tools` 里的 PTC mode 是消費方：只有程序打印和返回的內容重新進入對話。

### 運行一個程序

向運行時提供程序源碼與一個或多個綁定命名空間。每個命名空間會成為程序內的一個全局異步函數對象——PTC mode 在 `tools` 下傳入一個。程序作為異步函數的函數體運行，因此頂層 `await`／`return` 可用；無損 JSON 完成值成為 `result.value`，每個輸出通道在 `result.logs` 中保留自身順序而跨通道交錯由后端決定，任何失敗都以 `result.error` 報告并帶有可分支的 kind。運行時絕不會因程序失敗而 reject——reject 意味著你誤用了 seam，例如在 dispose（資源釋放）后提交運行。

```text
const result = await ctx.codeRuntime.run({
  program: 'return await tools.add({ a: 1, b: 2 })',
  bindings: [{ global: 'tools', functions: { add: async (args) => args.a + args.b } }],
})
// result.value === 3
```

### 選擇后端

后端聲明兩個你可以依賴的描述符：`language`——程序必須使用的源語言，已知值為 `'typescript'` 與 `'python'`——以及 `isolation`——執行基底（`'worker-thread'`、`'process'`、`'container'`），僅供部署與診斷使用，不構成安全聲明。[`dsh-code-runtime-worker-thread`](../code-runtime-worker-thread/README.zh.md) 在全新的 Node Worker 線程中執行 TypeScript；私有的 [`dsh-experimental-code-runtime-python`](../../experimental/code-runtime-python/README.zh.md) 包在全新的 CPython 子進程中執行 Python，供選擇性組合使用。

### 可移植地命名綁定

binding-global 與 error-class 名稱是語言可移植的：必須匹配 `[A-Za-z_][A-Za-z0-9_]*`，避開每個可移植目標語言的保留字，并避開后端擁有的槽位，因此同一份命名空間列表對每個后端都有效。`$tools`、`lambda` 或 `console` 之類的名稱會在運行開始前失敗；確切的排除集是 seam 約定的一部分。

### 可能出什么問題

失敗以 `result.error` 返回，并帶正交的 `kind`：程序拋出或解析失敗（`exception`）、預算到期（`timeout`）、運行被中止（`abort`）、執行基底終止（`worker-exit`）、完成值不是無損 JSON（`invalid-output`），或序列化輸出超過上限（`output-limit`）。每種 kind 都帶一條可反饋給模型的消息。`run()` 只在 seam 誤用時 reject，例如在 dispose 后提交運行，或綁定名稱不符合可移植標識符規則。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋 seam 背后的設計；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

本包是代碼執行能力 seam 的 Service Definition 角色（[能力 seam](../../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.zh.md)）：一個注冊為 `ctx.codeRuntime` 的抽象 `CodeRuntime extends Service`，加上兩個后端與消費方共享的詞匯。提供方繼承 `CodeRuntime`、實現 `run` 并注冊服務；消費方（`dsh-tools` 中的 PTC mode）生成面向模型的 SDK 并橋接工具分發。按約定，運行時不了解工具與會話：它接收程序與具名異步綁定，返回 `{ value, logs, error? }`。

### 服務 API

約定是后端實現的三個成員：`run(request)` 針對請求的綁定執行一段程序，并把每個程序結果——解析／轉換失敗、拋出異常、無效完成值、輸出溢出、預算到期、中止或基底終止——都作為結果 `error` 字段 resolve，reject 只留給調用方誤用，例如在 dispose 后提交運行；`language` 與 `isolation` 是只讀描述符，為部署與診斷標注源語言與執行基底。

窮盡式語義見[代碼運行時子系統參考](../../../docs/subsystems/code-runtime.zh.md)；確切簽名見 [`src/index.ts`](src/index.ts)。

### 詞匯

`CodeRunRequest`（`program`、`bindings`、`signal?`）攜帶運行時操作所需的全部內容；默認值（時間預算、輸出上限）來自各提供方的已驗證配置，絕不是 `run()` 內部隱藏的 `??`。`bindings` 是 `CodeBindingNamespace` 列表（`global` + `functions` + 可選 `errorClass`），每個命名空間作為程序內的一個全局異步可調用函數對象公開，返回 `CodeJsonValue`——seam 的結構性無損 JSON 類型。`errorClass` 描述符點名真實的程序全局構造器，以及用于接收被拒絕成員名稱的自有屬性，因此后端永遠不會得知 `ToolCallError` 之類的 Consumer 術語。`CodeRunResult` 報告無損 JSON 完成值 `value?`、通道內有序且跨通道交錯由后端決定的 `logs: string[]`，以及 `error?`（`CodeRunFailure`：正交 `kind` + 可反饋給模型的 `message`）。完整約定見 `src/types.ts`。

### 可移植標識符

binding-global 與 error-class 名稱是語言可移植的：必須匹配標識符子集 `[A-Za-z_][A-Za-z0-9_]*`（不含 JS 專有的 `$`）并通過 seam 導出的排除集，因此同一份 `bindings` 列表對每個后端都有效。本包導出每個后端都執行的約定——`PORTABLE_RESERVED_WORDS`（ECMAScript ∪ Python 保留字）、`RESERVED_BINDING_GLOBALS`（如 `console`、`__dsh_main__` 等后端擁有的 global）、`RESERVED_ERROR_MEMBERS` 與 `DUNDER_MEMBER`（error-member 排除）——因此 `$tools`、`lambda` 或 `__dsh_main__` 之類的名稱會讓 `run()` 在任何后端上作為 seam 誤用而 reject。確切集合見 `src/index.ts`。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：抽象 `CodeRuntime` 服務與可移植標識符排除集 |
| [`src/types.ts`](src/types.ts) | 詞匯：`CodeRunRequest`、`CodeBindingNamespace`、`CodeJsonValue`、`CodeRunResult`、`CodeRunFailure` |
| — | 不發布運行時不變式伴生入口；本包不公開任何獨立的事件序列或可變數據關系，相關約束僅由其所屬 seam 的約定實施。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下內容。它們從 PTC mode 消費方進入后端與能力 seam 模型。

- [PTC mode Agent Note](../../../.agents/notes/implemented/feature/2026-06-15-ptc.zh.md)——工具注冊表如何消費 `ctx.codeRuntime` 并把 `run_code` 呈現給模型。
- [Worker 線程后端](../code-runtime-worker-thread/README.zh.md)——已發布的 TypeScript 執行后端。
- [實驗性 Python 后端](../../experimental/code-runtime-python/README.zh.md)——私有的 CPython 子進程提供方及其 fd-3 協議。
- [代碼運行時子系統參考](../../../docs/subsystems/code-runtime.zh.md)——請求／結果詞匯、綁定與 `ctx.codeRuntime` 的 cordis 接口面。
- [能力 seam](../../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.zh.md)——Service Definition / Service Provider / Consumer 拆分。

-----

<a id="model-experience"></a>
## 模型體驗

通過 `dsh-tools` 中的 PTC mode 間接提供；后者公開 `run_code`，并將程序日志、值或失敗作為保留的工具結果 token 返回。

#### KV Cache 影響

不會直接失效；由上述消費方負責請求前綴變更。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明 seam 不能做什么；它們是當前包約束，不是任務積壓。

- **`run()` 是一次性的**——`logs` 只有在 `CodeRunResult` resolve 后才能獲得；seam 不提供正在運行的程序所產生輸出的流式日志或進度接口。
- **運行之間不保留狀態**——每次請求都在全新環境中運行；持久 REPL 風格內核在某個后端帶來自己的日志方案之前保持延期。
- **worker 線程后端已發布；Python process 后端是私有實驗包；`'container'` 沒有實現**——強安全邊界需要等待容器后端。
- **中間 binding 值沒有字節上限**——實現仍受 structured-clone 成本與進程內存約束，而提供方或執行器可能已經應用自己的獲取上限。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文：尚未決定的方向與開放問題。它明確不具權威性——已交付的行為與限制以上文和包代碼為準。

#### 未來：持久內核后端

跨 `run_code` 調用保留狀態的 REPL 風格內核仍未決定；它需要自己的日志方案，因為「運行之間不保留狀態」的約定正是讓每次請求僅憑會話日志即可重建的原因。

#### 未來：容器后端

容器級后端將為代碼與 shell 執行都提供硬性的多租戶邊界；除已知的 `isolation` 值外，暫無任何決定。

</details>
