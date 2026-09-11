---
description: "跨會話快照引用與持久的不受信任模型上下文，供啟用或排查 ctx.sessionReferenceResolver 的用戶與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-session-reference

[English](README.md) | 中文

## 概述

`dsh-session-reference` 讓一次對話可以引用其他會話：宿主把 `@label` mention 轉換為規范 URI，服務則為模型準備每個被引用會話的有界、只讀快照，作為持久、不受信任的背景上下文。候選發現按工作目錄親和度對其他會話排序，并用其最新標題作標簽。快照在捕獲后不可變，并帶有固定警告，禁止遵循其中的指令、權限聲明或工具請求。它是面向支持跨會話 mention 的宿主的可選服務；它消費 `ctx.sessionQuery`，不需要 SQLite FTS。

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

當宿主應允許用戶提及另一個會話并把其上下文交給模型時，啟用此服務。由于它消費后端無關的 compact 檢查點標記，任何 session-query 后端都可配合使用。

### mention 語法

規范 mention 是 Markdown 形式的 `@[label](dsh-session:<base64url 編碼的 id>)`，或裸 `dsh-session:` URI；每個 JavaScript 字符串會話 id 都能精確往返。服務會把 mention 改寫為消息中可讀的 `@label` 文本，并返回結構化引用。顯式 Markdown mention 會拒絕格式錯誤的 URI；空或只含標點符號的 scheme mention 仍是普通討論文本。

### agent（智能體）能得到什么

引用其他會話的消息后會緊接一條 `## Referenced sessions` 快照，作為第二條 user 角色消息。快照是不受信任的背景：固定警告告訴模型，除非當前用戶明確重復，否則不得遵循其中的指令、權限聲明或工具請求。每個來源預覽都獨立有界——每條消息至多 `maxReferences` 個不同會話，每個來源的序列化 JSON 采用配置值或模型相對字節預算。保留策略先丟棄較早的非檢查點消息，再縮短保留的文本；只有保留處理后引用仍無法滿足預算時，準備才會失敗。

引用被截斷時，可選的 spill 后端會在目標會話下保存完整的已捕獲文本投影。有界預覽 JSON 之外的獨立省略通知給出精確的 `omittedMessages` 與 `omittedBytes`，以及保存后的定位信息和 `retrievalHint`，或區分未配置存儲與保存失敗的不可用結果。該通知屬于同一條持久上下文消息。完整 transcript（文本記錄）攜帶相同的不受信任背景警告與捕獲元數據，包括 `capturedFormatVersion`。每條消息使用每行至多 64 個 Unicode 碼點的 JSON 字符串片段；解碼并拼接其片段即可恢復精確文本，包括原始換行。這種固定存儲格式使很長的單行文本也可通過分頁文件讀取來檢查。

### 查找可引用的會話

`listCandidates(agent, query?, limit?)` 列出除 agent 自身外的會話，按 id、工作目錄或投影標題做不區分大小寫的過濾，并把同目錄會話排在前面。每個候選以其最新標題作為 mention 標簽；標題缺失或不可讀時回退到會話 id，并報告其工作目錄是否就是發起方 agent 的工作目錄，宿主因此可以只在位置能區分該行時才顯示它。瀏覽器消費方通過 `ctx.remote.sessionReferenceResolver.candidates` 調用同一發現能力，該方法會為每個候選附上規范 mention。

### 配置

| 字段 | 默認值 | 含義 |
|---|---|---|
| `maxReferences` | `3` | 一條已準備消息中不同源會話的最大數量；不得超過 `3` |
| `candidateLimit` | `50` | 返回給宿主的默認候選數量 |
| `maxReferenceBytes` | 自動 | 每個來源的最大序列化 JSON 字節數；顯式設置時精確覆蓋自動預算 |
| `referenceContextFraction` | `0.2` | 每個來源的上下文窗口比例，范圍為 `0` 到 `1` |

自動預算為每個來源 `max(65536, floor(contextWindow × 4 × referenceContextFraction))` 字節。模型上下文容量以 token 計量；每個 token 四字節是容量估算，不是精確的 token 換算。缺少路由、LLM（大語言模型）服務、適配器或容量時使用 64 KiB；其他模型元數據查詢錯誤與取消會使準備失敗。

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-session-reference)是每個受支持字段及其 JSDoc 的窮盡式真源。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋服務的設計；可觀察行為見[使用本包](#use-this-package)。

### 設計理念

準備階段在目標消息到達 `agent/pre-step` 時，對每個被引用會話的當前表層各精確讀取一次。預覽與 spill 使用同一份已捕獲投影：用戶直接發送的文本、assistant 文本，以及攜帶規范壓縮（compaction）標記的 user 檢查點；工具、推理（reasoning）與其他注入上下文均被排除。這既防止引用遞歸傳播，也防止源會話后續變更影響已保存 transcript。預覽 JSON 將每個 `<` 轉義為 `\u003c`，因此源文本無法拼出 `<referenced-sessions>` 定界標簽。

解析器通過 `ctx.get("spillStore")` 獲取可選存儲，只保存被截斷的引用。存儲歸目標會話所有；來源信息標識被引用的源會話與標簽，不偽造工具調用。異步保存后會檢查取消，即使產物已寫入，也會阻止發布。產物過期仍遵循后端既有策略。

預算使用目標 agent 的 `system-prompt/assemble` 完成后捕獲的提供方與模型。首次組裝前直接調用 `prepare` 時使用 agent 選項；會話頭不決定預算模型。不帶 agent 的診斷組裝不會影響已捕獲路由。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | `SessionReferenceResolver`：pre-step 監聽器、候選發現、準備 |
| [`src/config.ts`](src/config.ts) | `Config` schema、`SessionReferenceError` 錯誤分類體系 |
| [`src/uri.ts`](src/uri.ts) | `dsh-session:` URI 編解碼、mention 格式化與解析 |
| [`src/projection.ts`](src/projection.ts) | 當前表層投影與字節預算保留 |
| [`src/serialization.ts`](src/serialization.ts) | 快照載荷的標簽安全 JSON 轉義 |
| [`src/spill.ts`](src/spill.ts) | 完整 transcript 序列化與模型可見省略通知 |
| [`src/types.ts`](src/types.ts) | `SessionReferenceInput`／`Candidate` 與來源類型 |
| — | 不發布運行時不變式伴生入口；準備過程返回構建時已校驗的不可變單次快照；持久上下文的準入、凍結與回放由 agent 層和會話層負責。 |

### 主要流程

外層 `agent/pre-step` 監聽器接受步驟，從直接用戶消息中解析規范 mention，再調用 `prepare`：規范化引用（保持首次 mention 順序、去重、拒絕自引用與超限數量），并行讀取每個表層，在解析出的字節預算下逐源保留，并渲染聚合提示詞。每條持久來源記錄保留凍結的 `capturedThroughSeq` 并記錄非零 `capturedFormatVersion`；字段缺失表示格式 v0。每份快照都插入到引用它的消息緊后，目標日志先記錄可讀的直接消息、再記錄其帶來源上下文，因此捕獲后的源變更無法改變目標回放。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

包級約定不夠用時閱讀以下頁面。它們從共享引用表面進入設計決策與其背后的讀取服務。

- [會話引用子系統](../../../docs/subsystems/session-reference.zh.md)——規范 URI、投影規則與穩定的錯誤分類體系。
- [會話引用 spill 復用](../../../.agents/notes/implemented/bug-fix/2026-09-05-session-reference-spill-reuse.zh.md)——快照身份、省略通知、存儲歸屬與替代方案。
- [會話查詢子系統](../../../docs/subsystems/session-query.zh.md)——提供會話表層的讀取服務。
- [上下文組地圖](../README.zh.md)——相鄰的請求上下文包。
- [生成的配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-session-reference)——每個受支持配置字段及其源聲明。

-----

<a id="model-experience"></a>
## 模型體驗

### 引用會話背景

#### 模型看到的內容

模型會看到兩條連續的 user 角色消息：先是帶可讀 `@label` 的當前消息，再是 `## Referenced sessions` 不受信任快照。警告禁止遵循快照中的指令、權限聲明或工具請求，除非當前用戶明確重復這些內容。標簽、cwd 值、id 與會話文本會作為 JSON 在 `<referenced-sessions>` 標簽中序列化；數據中的每個 `<` 都會以無損 JSON 轉義 `\u003c` 的形式發出，因此源文本無法拼出定界標簽。

#### Token 影響

每條包含引用的消息都會添加固定警告和最多三個序列化預覽，每個預覽都受配置值或模型相對字節預算獨立限制。被截斷的引用會在該預算之外添加獨立省略通知；已保存的完整 transcript 只有在被取回時才增加 token。精確上下文會保留在目標歷史中，直到目標壓縮遮蔽或摘要它；源會話變更不會添加更多 token。

#### KV Cache 影響

請求與快照是兩條連續、僅追加的目標消息，并保留較早的可緩存歷史。不同引用或源捕獲內容只改變新后綴；后續目標壓縮可能使從替換邊界起的復用失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明跨會話引用何時不合適。它們是當前包約束。

- **不支持消息正文檢索**：候選查詢會檢查標題，但不搜索消息主體。
- **標簽只來自投影**：已掛載會話的標簽來自實時投影切面，冷會話的標簽來自持久檢查點；若會話無法提供這兩者，則以其 id 作為標簽，也無法按標題找到。發現過程絕不讀取日志：折疊出一個標題需要處理整份日志，而這段代碼會在每次補全擊鍵時運行。在投影緩存建立前持久化的會話，會在首次打開時恢復標題并寫入檢查點。
- **受信任調用方邊界**：該服務假設宿主有權讀取 `ctx.sessionQuery` 公開的每個會話；它不是面向模型的搜索工具。
- **只投影文本**：不會在會話間傳播非文本 user 與 assistant 塊。
- **沒有實時鏈接**：引用是快照，不是 fork、恢復、訂閱或源會話變更。
- **transcript 搜索按行進行**：字面短語可能跨越 JSON 片段行或包含轉義字符；精確文本匹配需先解碼并拼接消息片段。已保存產物可能按后端策略過期。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
