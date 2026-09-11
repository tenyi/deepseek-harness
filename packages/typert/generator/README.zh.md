---
description: "構建時 Typert 生成器：源代碼類型分析、與編譯器無關的模型與產物生成，供接入 Typert 發布或消費生成產物的維護者閱讀。"
kind: "package-library"
---

# @deepseek-ai/dsh-typert-generator

[English](README.md) | 中文

## 概述

`dsh-typert-generator` 讓維護者把公開的 TypeScript 類型轉換為構建產物和與編譯器無關的模型。包通過 `./typert` 和可選的 `./client/typert` 導出選擇加入；如果聲明、發布清單、Remote 導出或 Zod 投影無法被正確表示，生成過程就會失敗。倉庫構建可以生成可執行 schema 與配套聲明，工具也可以調用 `WorkspaceAnalyzer` 完成檢查或目錄生成而不發布產物。生成過程只在構建時運行，絕不會進入實時 agent（智能體）會話。

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

本包供把 Typert 生成接入構建或消費生成產物的包維護者與倉庫維護者使用。發布是選擇加入的：聲明導出入口、運行構建，產物即出現在 `lib/` 中；靜態分析則不需要產物。

### 從包中發布 Typert 產物

參與貢獻的包在 `package.json` 中聲明宿主側產物導出；同時貢獻兩側的包還要聲明 `./client/typert`，含 Remote 方法的包還要聲明 `./remote`：

```yaml
exports:
  "./typert":
    types: "./lib/typert.host.d.ts"
    default: "./lib/typert.host.js"
files:
  - "lib/typert.host.js"
  - "lib/typert.host.d.ts"
```

構建完成后，`lib/typert.host.js` 與 `lib/typert.host.d.ts` 即存在，[loader](../loader/README.zh.md) 會在 Loader 組合中注冊該貢獻。生成的聲明文件把 `TYPERT` 暴露為 `unknown`，因此參與貢獻的包永遠不會依賴運行時注冊表。當聲明缺失、指向錯誤文件，或在沒有 Remote 方法的情況下發布 Remote 產物時，生成器會使構建失敗；不支持的 Zod 投影會以 `TypertEmitError` 指明具體構造并失敗，而不會展平或弱化源類型。

### 靜態分析工作區

靜態消費方直接針對工作區的 `tsconfig.host.json` 與 `tsconfig.client.json` 聚合配置調用 `WorkspaceAnalyzer`，選擇 face 與包子集，并在不生成或加載運行時產物的前提下讀取生成的 `FaceModel` 與類型圖。`analyzeInBatches()` 通過有界的編譯器程序處理大批量包選擇，模型形態保持一致；`discoverPackages()` 無需構建類型檢查程序即可找出參與貢獻的包。

### 在 tsdown 構建中運行生成

包的 `./tsdown` 子路徑為根 tsdown 配置提供 `typertPlugin()`：它在打包前轉換 TypeScript 依賴中的標準裝飾器，并在包輸出根目錄生成模型驅動的 face 產物。`package` 模式只生成當前打包的包；`workspace` 模式對每個顯式貢獻方各生成一次。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋生成器如何得到與編譯器無關的模型以及它生成什么；可觀察的構建行為已在[使用本包](#use-this-package)中說明。

### 設計理念

生成器遵循一項核心分離原則：提取與生成通過與編譯器無關的模型解耦。`WorkspaceAnalyzer` 讀取以 face aggregate tsconfig 為種子的 TypeScript 程序，產出 `FaceModel` 與 `TypeGraph` 數據；`FaceModelEmitter` 只消費該模型，絕不接收編譯器節點。模型保留聲明標識、泛型參數及應用、顯式繼承、條件類型與映射類型、導入屬性、abstract 修飾符與源碼 JSDoc，并排除構造函數、靜態成員與非公共成員。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 公共 API：分析器、生成器、工作區生成器、渲染器、目錄投影 |
| [`src/analyzer.ts`](src/analyzer.ts) | `WorkspaceAnalyzer`：face 程序、check/write 模式、分批、發現、源碼索引 |
| [`src/model.ts`](src/model.ts) | 與編譯器無關的模型類型 |
| [`src/emitter.ts`](src/emitter.ts) | `FaceModelEmitter`：Zod schema 與聲明生成、Remote 聲明 |
| [`src/workspace.ts`](src/workspace.ts) | `WorkspaceTypertGenerator`：發現、生成、導出與文件清單校驗 |
| [`src/tsdown-plugin.ts`](src/tsdown-plugin.ts) | tsdown 插件面：裝飾器轉換與產物生成 |
| [`src/cordis-catalog.ts`](src/cordis-catalog.ts) | 生成 Cordis 目錄所用的目錄投影 |

### 分析與 face

Host 與 Client 是兩個獨立的 TypeScript 程序。直接項目引用確定編譯器 face 的成員歸屬，`dsh.client` 包子路徑則確定運行時 face 的貢獻；`package.json#exports` 劃定所有跨包公開邊界，跨 face 的邊只能來自導入或重新導出。解析到本包內部模塊的相對導入會沿該模塊的重新導出繼續追蹤，直到出現包說明符，因此包內轉發模塊保留原始聲明引用；解析到其他包的相對導入會失敗。`check` 模式遇到語法或語義診斷、缺失的公開類型標注、跨包私有引用，以及模型無法無損保留的可達聲明合并時都會失敗；`write` 模式插入類型檢查器推導出的標注，并返回無診斷的 check 模式模型。NPM 依賴擁有的類型繼續以 `external` 引用表示，不會被展開。

### 生成與發布約定

`FaceModelEmitter` 輸出包含受支持 Zod schema 與 `TYPERT` 貢獻的可執行 JavaScript，以及把 schema 通過包的公開導出標注為 `z.ZodType<SourceType>` 的聲明文件；不支持的 Zod 投影會失敗。含 Remote 方法的 Host face 還會額外為 Client 生成 Host Remote 約定的 `typert.remote-client.*` 投影。`WorkspaceTypertGenerator` 校驗每個貢獻方的 `package.json`：`./typert` 與 `./client/typert`（存在 Remote 方法時還有 `./remote`）必須指向精確的生成文件，且 `files` 清單必須包含它們。

### 目錄投影

根導出包含本倉庫 Cordis 目錄使用的模型驅動提取邏輯、完整性檢查與確定性文本渲染器。它們接受 `CordisCatalogPolicy`；由倉庫持有的類型鏈接、基礎類型／豁免分類與繼承的 Cordis 條目仍位于 `scripts/gen-cordis-catalog.ts`，由調用方顯式傳入，因此本包只包含投影機制，不會隱式復制倉庫的文檔分類體系。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面；它們從生成模型逐步進入運行時與 Remote 調用路徑。

- [Typert 子系統參考](../../../docs/subsystems/typert.zh.md)——生成器建模的 Remote 約定與注冊表接口。
- [Typert 協議](../protocol/README.zh.md)——生成產物所擴展并消費的聲明。
- [Typert 注冊表](../registry/README.zh.md)——生成產物所供給的運行時存儲。
- [API 網關參考](../../../docs/api-gateway.zh.md)——生成的 Remote 描述符如何端到端被調用。
- [與編譯器無關的模型 Agent Note](../../../.agents/notes/implemented/architecture/2026-07-27-compiler-independent-typert-model.zh.md)——模型設計、備選方案與后果。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為構建時生成器在任何 agent 運行時之外運行，不觸及任何模型請求。

#### KV Cache 影響

無直接影響；生成產物只有在消費方將其放入請求時才會觸及請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明生成器無法建模或生成的構造；它們是當前包約束，不是任務積壓。

- **包導出模式會被跳過**——參與貢獻的包需要具體的導出目標；通配符導出模式不會被分析。
- **跨 face 的命名空間重新導出會失敗**——具名與星號重新導出會生成鏈接，但在 `TypeTargetModel` 能夠不經展平表示模塊命名空間之前，命名空間重新導出無法表示。
- **Zod 生成器只支持有意限定的子集**——泛型 schema 聲明，以及以條件類型或映射類型為 schema 根的計算構造，都會失敗，直到存在明確的 schema 工廠策略。
- **沒有生成的 schema 跨 face 導入**——跨 face 鏈接會在模型中表示以供分析，但生成的 schema 均不需要跨 face 的運行時 Zod 導入。
- **發現范圍只覆蓋具體公開導出**——既未導出、也未由可達圖導入的聲明按設計排除在包模型之外。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。源碼項目分析器與構建時 emitter 均不在任何 Cordis 運行時中運行；模型快照、可執行產物與消費方包的類型檢查會強制執行其輸出約定。
