---
description: "面向部署場景的自動會話壓縮（compaction）：用于選擇、調優或排查隨 token 壓力上升對較早歷史進行摘要的方式。"
kind: "package-reference"
---

# @deepseek-ai/dsh-compaction-basic

[English](README.md) | 中文

## 概述

本包讓長時 agent（智能體）會話在接近模型上下文上限時仍能正常工作。token 壓力上升時，它會把最舊的歷史壓縮為摘要并保留近期消息；上下文溢出錯誤發生后，它會壓縮并重試。你也可以通過 `/compact` 按需壓縮，并選擇先修剪超大工具輸出。壓縮使用一次額外的模型請求，并且只保留該請求返回的摘要文本。它無法縮減系統提示詞、工具或會話前綴，也無法拆分單個不可分單元（例如一次超大工具調用）。

## 目錄

- [使用本包](#use-this-package)
- [理解實現](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與暫緩事項](#known-limitations-and-deferred-work)
- [開發備注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在已提供 LLM（大語言模型）、會話存儲與 token 測量的組合中掛載本包，即可獲得自動會話壓縮。隨附 `dsh` 基礎配置默認啟用它；需要控制壓縮發生的時機時請顯式掛載。

### 你會得到什么

默認設置下你會獲得四種行為：會話向模型上下文上限增長時自動壓縮；提供方確認上下文溢出錯誤后的恢復（先壓縮再重試該請求）；通過 `/compact` 命令按需壓縮；以及——掛載修剪器時——壓縮前對超大工具輸出的修剪。

### 最小可用組合

掛載會話存儲、token 測量、可選修剪器、本后端，以及可選的按需命令：

```yaml
- name: '@deepseek-ai/dsh-session'
- name: '@deepseek-ai/dsh-token-meter'
- name: '@deepseek-ai/dsh-compaction-tool-result-pruner'
- name: '@deepseek-ai/dsh-compaction-basic'
- name: '@deepseek-ai/dsh-command-compact'
```

你可以通過觀察會話越過本來會溢出的位置繼續工作、以及運行 `/compact` 立即壓縮一次來確認成功。如果組合缺少 LLM、會話存儲或 token 測量，插件會加載失敗。同一個后端可以服務上下文大小不同的模型；用按模型覆蓋為每條路由設置各自的閾值與保留：

```yaml
- name: '@deepseek-ai/dsh-compaction-basic'
  config:
    thresholdRatio: 0.8
    retainRatio: 0.16
    modelPolicies:
      - provider: local
        model: small-context
        thresholdRatio: 0.7
        retainTokens: 2048
```

### 調整壓縮開始的時機

所有設置都可選。默認在已路由模型上下文窗口的 80% 處開始壓縮，并逐字保留最新的 16%；下表是完整的策略面，生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-compaction-basic)是窮盡式真源。

| 字段 | 默認值 | 含義 |
|---|---|---|
| `thresholdRatio` | `0.8` | 在 `floor(routedContextWindow × ratio)` 處開始壓縮。 |
| `retainRatio` | `0.16` | 以已路由上下文窗口的一部分表示逐字保留的近期對話；與 `retainTokens` 互斥。 |
| `retainTokens` | — | 逐字保留的近期對話絕對預算；與 `retainRatio` 互斥，并且必須低于已解析閾值。 |
| `summarizationProvider` | `''` | 與 `summarizationModel` 一起設置；空對使用最新已路由請求目標，再回退到 `AgentOptions` 對。 |
| `summarizationModel` | `''` | 與 `summarizationProvider` 一起設置；空對使用最新已路由請求目標，再回退到 `AgentOptions` 對。 |
| `maxTokens` | `8192` | 摘要請求的輸出上限；可包含推理 token。 |
| `compactionRetries` | `1` | 壓力仍高于閾值時，在首次壓縮后進行的額外嘗試次數。 |
| `maxOverflowRetries` | `1` | 已確認上下文窗口溢出后的最大重試次數；`0` 只禁用恢復。 |
| `modelPolicies` | `[]` | 針對個別模型路由的精確 `{ provider, model, ...partialPolicy }` 覆蓋。 |
| `auto` | `true` | 啟用自動壓縮與溢出恢復；設為 `false` 則僅手動執行。 |

配置錯誤會快速失敗：未知設置、重復的按模型覆蓋、兩種保留形式同時出現，或比例保留量不低于閾值，都會在加載時拒絕插件。任何絕對 `retainTokens` 預算——頂層或按模型——不低于其閾值時，都會在該模型首次使用時失敗，因為該比較需要模型的上下文大小。

### 壓縮運行時會發生什么

最舊的平衡范圍會被替換為一條摘要消息，近期尾部保持逐字不變；對話從摘要繼續。操作會報告壓縮了多少歷史項以及估算釋放的 token 數。如果沒有任何內容可以安全壓縮——例如整個對話就是一個不可分單元——則不會有任何改變，也不會向會話日志寫入任何內容。如果沒有模型可以撰寫摘要（既未配置目標，也還沒有已路由請求），壓縮會失敗并給出清晰錯誤，提示你配置摘要提供方與模型，或先路由一次請求。

### 通過 /compact 按需壓縮

掛載 `dsh-command-compact` 后，在聊天 UI 中輸入 `/compact` 即可立即壓縮，即使未達到壓力閾值。命令會報告壓縮了多少歷史項以及估算節省的 token 數。當 agent 正在輪次中或壓縮已在運行時，`/compact` 會報告壓縮暫不可用；運行期間你發送的提示詞會被接受，并在壓縮結束后才開始。

### 修剪超大工具輸出

在本包之前掛載 `dsh-compaction-tool-result-pruner`，即可在壓縮過程中修剪超大工具結果。修剪不發起模型調用，并可能完全省去摘要：當修剪后的對話在閾值之內時，壓縮會跳過摘要。修剪只在壓縮觸發條件滿足后運行——低于壓力的對話絕不會被觸碰。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋后端背后的設計決策；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

該后端建立在四項承諾之上：

- **一個測量服務為每個決策定價。** 單例 `ctx.tokenMeter` 會在同一個已消費日志 revision 上測量最新規范已記錄 envelope 與當前表層。路由適配器聲明請求圖片定價時，meter 會將其應用于圖片歷史。壓力、近期尾部保留、范圍選擇與縮減驗證使用同一套路由定價的節點數值；已記錄的替換影子價仍使用與路由無關的啟發式規則，使純投影 fold 保持一致。
- **日志記錄的標記對就是事務。** 所有入口點共享一個先記錄標記的區域事務：驗證范圍與活動鎖，同步追加 `compaction/start`，準備并等待摘要，重新驗證，再追加 `compaction/summary` 與替換，最后恰好進行一次閉合嘗試。自動調用與顯式范圍調用要求數字標識的開放輪次歸屬與整個表層穩定；`compactNow()` 會預留空閑接納，使用 `turn: null`，允許所選 span 之外追加僅追加上下文，flush 每次已閉合嘗試，并在 `finally` 中釋放接納預留。
- **摘要復用提供方的熱前綴。** 逐字回放 surface 節點 0 處 `system/message` 所承載的系統提示詞、上次已路由請求的工具與已遮蔽區域消息，使輔助調用成為會話的真正前綴，因此只有尾隨指令與摘要輸出未緩存。
- **`summarize()` 是唯一的子類鉤子。** 基于模板或遠程摘要器的子類可以覆蓋它，同時壓力、保留、被引用的源事件、縮減驗證與已遮蔽 token 計量仍由 token meter 負責。

### 自動觸發與溢出恢復

當 `auto: true` 時，串行 `agent/pre-step` listener 會在請求派生前檢查壓力：它通過 `ctx.tokenMeter` 為最新持久路由請求 envelope 定價，當壓力越過路由模型的閾值時，先剪枝，再在保留已定價近期尾部的同時摘要最舊的平衡范圍。每個選定范圍都從第一個不是 `system/message` 的 surface 節點開始，因此位于 surface 節點 0 的系統提示詞永不會被遮蔽；由歷史內提示詞更新追加的后續 `system/message` 是普通歷史，范圍可以遮蔽它，agent loop（智能體循環）的投影隨后會在二者文本不同時用當前提示詞替換節點 0（[決策規則](../../core/agent-loop/README.zh.md#understand-the-implementation)）。`agent/request-error` listener 響應提供方確認的 `CONTEXT_WINDOW_EXCEEDED`：它繞過常規閾值與保留策略，嘗試一次最大平衡頭部縮減，并且只在表層替換 generation 前進后才授權重試。取消全程保持最終決定權。

壓力策略從擁有持久路由的適配器解析容量。適配器無法為有效動態路由返回容量時，手動壓力路徑會拋出目標特定配置錯誤；自動 listener 會對該精確目標警告一次，并攜帶完整歷史繼續。

### 摘要機制

直接 `ctx.llm.stream()` 調用使用已配置的提供方／模型對與上限，回退到最新已記錄請求目標，然后再回退到 `AgentOptions` 對，而不運行僅用于 agent loop 的 `agent/request` 擴展點。該調用將 surface 節點 0 處派生的 `system/message` 作為 `messages` 的首項回放，后接已遮蔽區域消息（包括位于其 surface 位置的被遮蔽歷史內 `system/message`），并逐字攜帶 header 的工具——包括所選適配器必須解析或明確拒絕的圖片引用——并將壓縮指令作為最后一條 user 消息追加，從而復用提供方的熱前綴 cache，而非使它失效。空內容系統頭節點不貢獻消息，但仍處于壓縮范圍之外。調用將 `GenerateOptions.purpose` 設為 `compaction`；只有返回文本進入檢查點，推理與工具調用都會被排除。圖片輸出會以 `UNSUPPORTED_CONTENT` 失敗，而不是消失。替換 user 消息用 `<compacted-summary>` 標簽框定摘要；原始摘要保留在 `compaction/summary` 事件上。

### 區域事務

事務驗證表層范圍與持久鎖，追加 `compaction/start`，通過鉤子生成摘要，重新驗證穩定性（自動調用要求整個表層、手動調用只要求所選范圍），拒絕不縮小源內容的摘要，追加 `compaction/summary` 與替換 `user/message`，并恰好進行一次 `compaction/end` 嘗試。活動的未匹配 start 是持久鎖：位于較新 `session/end-seed` 之前的未匹配標記是先前生命周期留下的陳舊證據，不會阻塞；位于該邊界之后的標記報告 `busy`。閉合失敗會有意留下阻塞性的未匹配標記。完成清理與持久化后，取消仍具有最終決定權。

### 配置解析

`resolveConfig` 驗證并分離默認值，`resolveTargetPolicy` 將精確的提供方／模型覆蓋合并到默認值之上，`resolveCompactSpec` 使用適配器擁有的上下文容量將合并后的策略縮放為具體 token 預算。策略解析絕不咨詢模型發現（`listModels()`）；只有持久路由的容量才重要。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`BasicCompactionEngine`、自動 listener、入口點分發 |
| [`src/region.ts`](src/region.ts) | 保留選擇與共享的先記錄標記壓縮事務 |
| [`src/summarizer.ts`](src/summarizer.ts) | 默認 `ctx.llm.stream()` 摘要、檢查點框定、安全摘要投影 |
| [`src/config.ts`](src/config.ts) | 加載時驗證與路由模型策略解析 |
| [`src/types.ts`](src/types.ts) | `BasicCompactionConfig` 與已解析策略詞匯 |
| — | 不發布運行時不變式配套條目；除所屬 seam 強制執行的約定外，本包不公開獨立事件序列或可變數據關系。持久標記對仍可在會話日志中觀察。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面；它們從共享 seam 逐步進入可選配套工具與決策證據。

- [壓縮 seam](../compaction/README.zh.md)——本后端實現的壓縮約定。
- [壓縮子系統參考](../../../docs/subsystems/compaction.zh.md)——壓縮詞匯、結果與服務行為。
- [工具結果修剪器](../compaction-tool-result-pruner/README.zh.md)——先修剪超大工具輸出的可選配套工具。
- [人類 /compact 命令](../command-compact/README.zh.md)——無需等待壓力的按需壓縮。
- [Token meter](../../llm/token-meter/README.zh.md)——決定何時壓縮的測量服務。
- [生成配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-compaction-basic)——每個受支持配置字段及其源聲明。

-----

<a id="model-experience"></a>
## 模型體驗

### 會話歷史

#### 模型看到的內容

成功步驟越過閾值后，如果已加載可選修剪器，超大工具結果會先被改寫。如果仍需摘要，下一個請求會收到下方檢查點前導、一個空行、`<compacted-summary>`、根據數據生成的摘要以及 `</compacted-summary>`。溢出恢復會根據使表層前進的任何替換重建立即重試。檢查點會替換已選較早范圍，后面跟隨已保留的近期單元。

##### 會話檢查點前導

```markdown
This is an automatically generated checkpoint condensing an earlier span of the conversation to free up context. Treat the captured context as established background and build on it without restating it. Continue the task directly from the messages that follow, without acknowledging this checkpoint.
```

#### Token 影響

不依賴模型的剪枝可以完全避免輔助調用；否則它會在摘要替換較早范圍之前縮減該調用的 transcript（文本記錄）。替換會縮減未來輸入歷史，而非追加第二份副本。摘要會保留到后續壓縮將其替換，但不可分的非工具單元仍可能超出預算。

#### KV Cache 影響

它是替換，而非僅追加。每個檢查點都會使從第一個已替換歷史 token 起的復用失效；該范圍之前未更改的請求前綴仍可復用。

### 輔助摘要器請求

#### 模型看到的內容

摘要模型會接收逐字回放的會話：與上次已路由請求為已遮蔽區域發送的相同系統提示詞、工具 schema 與消息，后面跟隨一條最終 user 消息，即下方壓縮指令。會話模型絕不會看到該私有請求或其推理；只有返回文本會被存儲。

##### 壓縮指令（最終 user 消息）

```markdown
You are now acting as a compaction engine for this AI coding assistant. Condense the conversation ABOVE into a structured checkpoint that lets another model resume the work with no loss of essential context.

Output EXACTLY the Markdown structure below: keep every section, in order. Use terse bullets, not prose paragraphs. Write "(none)" for an empty section — never drop a section.

## Primary Request and Intent
- [the user's original and evolving goals; quote verbatim where the exact wording matters]

## Key Technical Concepts
- [technologies, frameworks, patterns, and conventions in play]

## Files and Code
- [exact path: why it matters, key changes or snippets]

## Errors and Fixes
- [error: how it was resolved, plus any related user feedback]

## Pending Jobs
- [explicitly requested work not yet completed]

## Current Work
- [precisely what was in progress at this checkpoint]

## Next Step
- [the single next action, directly in line with the most recent request, or "(none)"]

## Critical Context
- [decisions and their rationale, constraints, user preferences, open questions, data needed to continue]

Rules:
- Write concise English engineering prose. Preserve exact file paths, commands, error strings, identifiers, numeric values, function signatures, and syntax fragments.
- Capture user feedback and explicit instructions faithfully, especially corrections.
- Do NOT mention this summarization request or that the context was compacted.
- Output only the checkpoint text: do not call any tool or take any other action.
- If the conversation already contains a <compacted-summary> block, it is a PRIOR checkpoint. Do not copy it forward verbatim: preserve still-true facts, drop stale ones, and merge newer information into a single consolidated summary under the same structure.
```

#### Token 影響

這是一次獨立模型調用：輸入是已回放會話前綴加固定指令，輸出受 `maxTokens` 限制。收斂重試可能多次支付這項成本。

#### KV Cache 影響

已回放系統提示詞、工具與已遮蔽區域消息與會話最后一個已路由請求逐字匹配，因此提供方的熱前綴 cache 可復用至尾隨指令之前；只有該指令與摘要輸出未緩存。將摘要器路由到不同提供方／模型，或壓縮非頭部范圍，都會放棄該復用。

## 已知限制與暫緩事項

<a id="known-limitations-and-deferred-work"></a>


這些限制說明自動壓縮何時不合適，或何時需要特別注意；它們是當前包約束。

- **計量準確度取決于固定啟發式規則**——可復用提供方用量缺失時，會回退到字符數加結構開銷，而非精確的 token 化；只有在適配器聲明了請求圖片定價的路由上，圖片出現處才攜帶提供方精確的視覺 token。
- **溢出分類由適配器維護**——提供方措辭可能改變；兩個 DeepSeek 適配器將可識別的上下文限制失敗規范化為 `CONTEXT_WINDOW_EXCEEDED`。
- **部分不可分單元與僅 envelope 溢出仍不在表層壓縮范圍內**——恢復無法縮減系統／工具／前綴、拆分不可分的非工具節點，或修復不可剪枝剩余部分仍超出窗口的工具單元。可選 pruner 可以縮減原本不可分工具對內的文本型工具結果主體。
- **`compactRegion` 要求存在未結束的輪次**——在完全關閉的會話上手動調用會拋出異常（「no open turn」），而不是執行壓縮。
- **摘要失敗會保留最新持久表層**——任何替換前，自動路徑會記錄警告，并攜帶完整超預算歷史繼續。如果剪枝已落地，后續摘要失敗會從該持久剪枝表層繼續。因達到 `maxTokens` 而發生的摘要截斷（隱藏推理 token 可能會耗盡該額度）遵循同一規則。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文，明確不具權威性；已交付行為以上文、包代碼與所鏈接的 Agent Note 為準。

- **默認比例，尚未決定**——`thresholdRatio: 0.8` 與 `retainRatio: 0.16` 是固定默認值；存在通過 `modelPolicies` 進行的按模型調優，但沒有基于語料的理想值指引記錄。
- **tokenizer 精確測量，暫緩**——token meter 每 token 四字符的啟發式對 CJK 文本與 JSON Schema 定價偏低；精確 token 化仍是測量服務的開放方向。
- **規范錯誤之外的溢出恢復，尚未決定**——恢復僅針對 `CONTEXT_WINDOW_EXCEEDED` 觸發；其他提供方側上下文失敗不參與分類。

</details>
