---
description: "面向組合壓縮（compaction）部署場景的工具輸出修剪：選擇大小限制或排查超大工具結果為何被縮短。"
kind: "package-reference"
---

# @deepseek-ai/dsh-compaction-tool-result-pruner

[English](README.md) | 中文

## 概述

`dsh-compaction-tool-result-pruner` 防止超大工具輸出填滿上下文窗口。壓縮觸發條件滿足后，它會把超出預算的文本替換為長度受限的頭部、簡短的「middle pruned」標記與長度受限的尾部；未達到壓力閾值的對話保持不變。完整原始結果仍保留在會話日志中，可供精確回放與檢查。修剪不發起模型調用，并可能充分緩解 token 壓力，使壓縮跳過摘要。字符預算只能近似 token 用量；token meter 負責判定壓力是否得到緩解。

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

當工具輸出經常主導對話窗口時，在 `dsh-compaction-basic` 旁掛載本包。修剪會改變模型看到的內容——更短的結果——并讓壓縮有更少的歷史需要壓縮。

### 最小可用組合

按此順序掛載 token 測量、本包與后端：

```yaml
- name: '@deepseek-ai/dsh-token-meter'
- name: '@deepseek-ai/dsh-compaction-tool-result-pruner'
- name: '@deepseek-ai/dsh-compaction-basic'
```

有了這些配置行，超大工具結果會在壓縮過程中自動被修剪。你可以通過檢查后續請求是否顯示修剪后的結果來確認成功；完整原始內容仍保留在會話日志中。

### 什么會被修剪

每個文本超過閾值的工具結果都會被替換為修剪版本：配置的頭部、簡短的「middle pruned」標記與配置的尾部。圖片與結構化塊等富內容保持原有順序。替換保留工具調用、步驟、錯誤與元數據——只有文本內容發生變化。如果替換無法被記錄，運行會失敗，已應用的修剪仍會保留。

### 設置大小限制

所有設置都可選；默認會把文本超過 8,192 個字符的結果修剪為其前 4,096 加后 1,024 個字符，并用標記連接。生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-compaction-tool-result-pruner)是涵蓋所有配置字段的真源。

| 字段 | 默認值 | 含義 |
|---|---|---|
| `thresholdChars` | `8192` | 合并文本超過此 Unicode 碼點數時修剪。 |
| `headChars` | `4096` | 保留的開頭 Unicode 碼點數。 |
| `tailChars` | `1024` | 保留的末尾 Unicode 碼點數。 |

字符數以 Unicode 碼點計，因此切片絕不會拆分 emoji 對，但多字符字素仍可能被切斷。頭部加標記加尾部之和必須不超過閾值，因此有效配置可以修剪每個超出預算的結果，不會增長或重復改寫。未知設置會導致插件在構造時被拒絕。

### 修剪何時運行

修剪只在壓縮觸發條件滿足后運行：`dsh-compaction-basic` 在壓力或溢出確認后、選擇要壓縮的內容之前調用它。低于壓力時不會修剪任何內容，修剪本身也不發起模型調用。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋修剪器背后的設計決策；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

該修剪器建立在三項承諾之上：

- **確定性的單次收斂。** 按 Unicode 碼點以固定預算切片，因此每個發出的結果在文本碼點上都精確包含已配置的頭部、標記與尾部，不大于 `thresholdChars`，且嚴格小于觸發輸入。
- **可安全回放的替換。** 原始事件保留在僅追加日志中；替換通過 `sourceEventSeqs` 引用它，因此回放可以恢復產生已剪枝結果的精確輸入。
- **影子價格協議。** `compaction/prune` 會緊鄰替換事件并位于其前，通過注入的 token meter 為被替換的精確范圍定價，使純消費方無需每節點狀態即可減去它——即 `compaction/prune` 事件上記錄的共享協議。

### 剪枝機制

剪枝按 Unicode 碼點測量 `text` 塊（非文本塊計為零），生成長度受限的替換——內容已在預算內時則不替換——并把每個超出預算的工具結果換為一條新追加的 `tool/result`，該事件替換原始事件并通過 `sourceEventSeqs` 引用它，前面緊跟一條 `compaction/prune` 影子價格事件。會話拒絕替換時，運行會同步失敗；本次掃描中先前已提交的替換仍會保留。非文本塊保持原始相對位置，切片絕不會拆分 UTF-16 代理項對。精確簽名見 [`src/index.ts`](src/index.ts)。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`ToolResultPruner` 服務、`pruneSession` / `pruneContent` / `measureContent` |
| [`src/config.ts`](src/config.ts) | `PRUNE_MARKER`、默認值、碼點計數、預算驗證 |
| [`src/types.ts`](src/types.ts) | `ToolResultPruneConfig`、`ResolvedConfig`、`PrunedEntry`、`PruneResult` |
| — | 不發布運行時不變式伴生入口；Session 會驗證每次僅改寫內容的操作，其伴生條目負責維護跨事件包圍關系。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面；它們從消費后端逐步進入共享 seam 與定價服務。

- [壓縮基礎后端](../compaction-basic/README.zh.md)——在壓縮前修剪超大工具輸出的后端。
- [壓縮 seam](../compaction/README.zh.md)——本包接入的壓縮約定。
- [壓縮子系統參考](../../../docs/subsystems/compaction.zh.md)——壓縮詞匯、結果與服務行為。
- [Token meter](../../llm/token-meter/README.zh.md)——判定修剪是否緩解壓力的測量服務。
- [生成配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-compaction-tool-result-pruner)——每個受支持配置字段及其源聲明。

-----

<a id="model-experience"></a>
## 模型體驗

### 已剪枝的工具結果

#### 模型看到的內容

一旦滿足壓縮觸發條件，后續請求看到的將是保留的頭部、`\n\n[... tool result middle pruned ...]\n\n` 和保留的尾部，而非被移除的文本。富內容塊保持原有順序。模型不會看到原文的第二份副本。

#### Token 影響

每個已改寫工具結果最多包含 `thresholdChars` 個文本碼點。剪枝本身不會發起模型調用；重新測量的請求低于壓力閾值時，compaction-basic 會跳過摘要，否則摘要器會讀取已剪枝的表層。

#### KV Cache 影響

替換較早的結果會使從第一個改變的 token 起的復用失效。當其路由、envelope 與之前的歷史保持一致時，已剪枝前綴可以復用。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明修剪何時不合適，或何時需要特別注意；它們是當前包約束。

- **字符預算不是 token 預算**——不同提供方的 token 密度各異，因此 `ctx.tokenMeter` 仍負責判定修剪是否緩解了請求壓力。
- **剪枝只基于語法**——它保留開頭與結尾，不解釋中間哪些行在語義上重要。
- **字素簇可能被拆分**——按碼點切片可保護代理項對，但不會執行考慮區域設置的字素簇分割。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文，明確不具權威性；已交付行為以上文、包代碼與所鏈接的 Agent Note 為準。

- **語義化中間選擇，尚未決定**——剪枝盲目保留頭部與尾部；判斷中間哪些行重要需要模型或結構化啟發式，兩者都未隨附。
- **基于 token 的預算，暫緩**——預算以 Unicode 碼點計；改為基于 token 的預算需要 token meter 未暴露的估算器約定。

</details>
