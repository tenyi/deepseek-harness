---
description: "為配合取消的工具調用設置協作式時間上限，并在超時流程完成后映射為清晰的模型錯誤，供選擇或排查此插件的用戶與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-call-timeout-policy

[English](README.md) | 中文

## 概述

使用本包可為工具調用執行其配置的協作式時間上限，并在取消完成后向模型返回清晰的超時錯誤。按時完成的調用保持不變。忽略或緩慢處理取消的工具仍可能讓調用方繼續等待，因為本包無法硬性停止下游工作。每個工具分別提供自己的限時；本包無需配置，并隨 `dsh` 基礎組合包默認啟用。

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

常用路徑只有一行：把插件加入組合——`dsh` 基礎組合包已經包含它。配置了限時的工具會被自動保護；其余工具完全不受影響。

### 何時選擇

當模型會調用耗時很長的工具、這些工具會遵守 `exec.signal`，且你希望在取消完成后得到可預期的超時答復時，選擇它。當工具必須在到達限時后被硬性停止時——插件只能請求工具停止，因此忽略取消的工具會繼續運行并讓調用方繼續等待——以及當你希望為所有工具設置一個統一默認限時時（因為每個工具的限時來自該工具自身的配置），避免使用它。

### 設置

無需任何配置即可掛載插件：

```yaml
- name: '@deepseek-ai/dsh-tool-call-timeout-policy'
```

限時在配置工具的位置設置。例如，`dsh-tool-web` 的 `fetchTimeoutMs`／`searchTimeoutMs` 設置（默認 30,000 ms）把限時放到 `web_fetch` 與 `web_search` 上。沒有限時的工具——隨附的 `bash`、`read`、`write`、`edit`——絕不會被切斷。生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-web)列出會產生限時的工具設置。

### 你會得到什么

截止時間觸發時，插件會中止派生的 `exec.signal`。下游代碼遵守取消且 `next()` 完成后，模型會收到標記為錯誤的 `Error: tool call timed out after <ms>ms` 工具結果，從而決定重試、調整或放棄。忽略或緩慢處理該信號的工具會讓調用方繼續等待，并且在自身完成前不會產生超時結果；按時完成的調用保持不變。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋插件如何在每次分發周圍設置截止時間并將其映射為 `TOOL_TIMEOUT` 結果，并指出實現它的代碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

包裝層建立在四項承諾之上：

- **強制執行歸屬，而非庫。** `dsh-timeout` 負責時序與分類（`deadline`、`timeoutOf`）；本插件負責 `tools/execute` 上的單次調用接線；各能力負責終止。該拆分記錄在[超時截止時間庫 Agent Note](../../../.agents/notes/implemented/architecture/2026-07-06-timeout-deadline-library.zh.md) 中。
- **工具聲明自己的預算。** `timeoutMs` 位于工具的 `ToolDefinition` 上，從注冊表讀取（`ctx.tools.get(exec.name, exec.agent)?.timeoutMs`），因此不可能拼錯工具名，未聲明工具原樣委派。
- **作用域分類。** `TOOL_TIMEOUT` 同時用作內部 `deadline` 分類碼與結構化錯誤 `code`；把 `timeoutOf` 限定到它，可避免嵌套的外層截止時間（先觸發的另一包裝層計時器）被誤讀為本插件的超時——它讀作普通的上游取消。
- **先交換信號，再恢復。** Cordis `next()` 忽略傳入參數，因此包裝層原地修改共享 `exec`：分發時把派生的截止時間信號換到 `exec` 上，并在 `finally` 中恢復調用方信號，使 `tools/post-execute` 監聽器永遠看不到本插件可能已中止的信號。

### 截止時間如何設置與映射

一個 `tools/execute` 監聽器從注冊表讀取已分發工具聲明的限時（`ctx.tools.get(exec.name, exec.agent)?.timeoutMs`）；沒有限時的工具原樣委派。對有限時的工具，`deadline(exec.signal, timeoutMs, TOOL_TIMEOUT)` 構建融合信號，包裝層在分發時把它換到 `exec` 上并在 `finally` 中恢復，使 `tools/post-execute` 監聽器永遠看不到派生信號。當包裝層自己的計時器觸發時——`timeoutOf(d.signal, 'TOOL_TIMEOUT')` 以代碼限定作用域，因此嵌套的外層截止時間讀作普通的上游取消——已被分發規范化為錯誤結果的分發結果會被替換為結構化結果：`isError: true`、內容 `Error: tool call timed out after <ms>ms`、錯誤信息 `{ name: 'ToolTimeoutError', code: 'TOOL_TIMEOUT' }`。

### 與其他包裝層組合

多個 `tools/execute` 監聽器按 Cordis 注冊順序組合，注冊順序決定語義：超時注冊在外層時覆蓋整個重試操作，注冊在內層時覆蓋每次嘗試。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`TOOL_TIMEOUT`、`name`／`inject`／`apply`、`tools/execute` 包裝層 |
| — | 不發布運行時不變式伴生入口；此無狀態策略插件不擁有包級事件歷史，也不擁有所攔截 seam 之外的可變數據關系。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從工具調用流水線逐步進入超時庫拆分、被執行的限時與 guard 組映射。

- [工具子系統參考](../../../docs/subsystems/tools.zh.md)——本包裝層掛鉤的 `tools/execute` waterfall（瀑布式事件）與決策形態。
- [超時截止時間庫 Agent Note](../../../.agents/notes/implemented/architecture/2026-07-06-timeout-deadline-library.zh.md)——時序／終止拆分以及截止時間為何只通知。
- [生成配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-web)——策略所執行的 `dsh-tool-web` 的 `fetchTimeoutMs`／`searchTimeoutMs` 預算。
- [guard 組映射](../README.zh.md)——同組的 guard 包與循環衛生家族。

-----

<a id="model-experience"></a>
## 模型體驗

### 條件工具結果

#### 模型看到什么

此插件不添加提示詞或 schema。如果已聲明的截止時間先到且下游取消完成，它會用 `Error: tool call timed out after <ms>ms` 與結構化 `TOOL_TIMEOUT` 錯誤替換提供方結果；否則原結果保持不變。永不完成的下游調用無法產生超時結果。

#### Token 影響

未超時的調用不會增加 token。超時會添加一條會被保留的簡短錯誤結果，并可防止體積更大、較晚返回的提供方結果進入上下文。

#### KV Cache 影響

僅追加；新可見內容位于可復用請求前綴之后，不會使現有 KV Cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明策略何時不合適。它們是當前包約束，不是任務積壓。

- **協作式，絕不是硬終止**——截止時間只通過 `exec.signal` 通知；忽略該信號的工具不會在超時時停止，包裝層仍停留在 `await next()` 內，模型要等下游完成后才可能收到超時結果。
- **沒有統一預算**——只有聲明 `timeoutMs` 并將其放在 `ToolDefinition` 上的工具才會獲得截止時間；未聲明工具（隨附的 `bash`、`read`、`write`、`edit` 有意不聲明）沒有注冊表級默認值。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文：開放問題與尚未決定的探索方向。它明確不具權威性——已交付的行為、限制與既定理由以上文、包代碼和相關 Agent Note 為準。

`src/index.ts` 中的 FIXME 要求確定 `@deepseek-ai/dsh-timeout-guard` 改名；[改名臺賬](../../../.agents/notes/archived/architecture/2026-08-11-repository-naming-contract-and-rename-ledger.md) 已把 `@deepseek-ai/dsh-tool-call-timeout-policy` 記錄為既定名稱，因此該 FIXME 已陳舊，待代碼清理。

</details>
