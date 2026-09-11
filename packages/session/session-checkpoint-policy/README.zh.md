---
description: "面向用戶與維護者的語義會話持久性檢查點說明，用于部署不會在崩潰時丟失模型請求或工具副作用的持久化 agent（智能體）。"
kind: "package-reference"
---

# @deepseek-ai/dsh-session-checkpoint-policy

[English](README.md) | 中文

## 概述

將本包與會話持久化后端配合使用，可在模型請求之前、頂層工具可能產生外部副作用之前以及下一 agent 步驟開始之前持久記錄工作。每個檢查點之后，即使發生崩潰，系統也能從已存儲的請求、工具調用、響應與結果恢復工作，而不會丟失這些工作。檢查點失敗按失敗即阻止原則處理：持久寫入成功前，模型適配器或頂層工具正文不會運行。本包沒有配置，也不添加提示詞或工具 schema；未完成的 Assistant 流保持瞬態，而中斷的工具調用會以未知結果恢復，不會自動重試。

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

在持久化會話、且必須在崩潰時不重做或丟失工作的任何組合中掛載本插件。持久化與檢查點調度是獨立插件：后端存儲事件日志，本策略決定何時必須刷新存儲。

### 何時選擇

為每個可能被中斷的持久化 agent 選擇它——已記錄工具調用與其結果之間、或模型請求與其響應之間的崩潰，正是本策略遏制的那類故障。不帶它加載后端是有效的但更弱：仍位于后端批處理窗口內或尚未完成的寫入可能丟失。當沒有任何組件持久化會話，或專用部署刻意替換檢查點調度時，跳過本策略。

### 最小配置

不存在配置字段；插件只需與一個持久化后端一起加載：

```yaml
- id: session-persistence
  name: '@deepseek-ai/dsh-session-persistence-jsonl'

- id: session-checkpoints
  name: '@deepseek-ai/dsh-session-checkpoint-policy'
```

### 什么會變得持久

三個屏障會被檢查點化。模型請求在適配器流構造前被刷新，因此響應前的崩潰不會重放未持久化的請求。頂層工具調用在工具正文運行前被刷新，因此已記錄調用在任何外部副作用前已持久；嵌套工具分派復用外層調用的檢查點。在每個 `agent/pre-step` 邊界，前一步驟提交的一切——其響應與有序工具結果——在派生下一個請求前被刷新。

### 可觀察行為與失敗

檢查點之后，被檢查點化的工作即已持久：恢復像任何持久化會話一樣從存儲還原它。如果取消在工具檢查點 flush 等待期間到達，包裝層會返回規范的 `ABORTED_BEFORE_DISPATCH` 結果，絕不進入工具正文。檢查點拒絕在兩個邊界都按失敗即阻止處理——適配器或頂層工具正文不運行——步驟邊界的拒絕會在另一個請求開始前使輪次失敗。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節說明該策略如何接入 loop 與持久化 seam；可觀察約定已在[使用本包](#use-this-package)中說明。

### 設計理念

該插件只是對三個 seam 的純監聽組合，自身沒有狀態：它包裝 `llm/stream`，使下游流只在活動會話中緩沖的請求事件已持久后構造；在預執行策略與防護之后包裝 `tools/execute`，使頂層工具正文只在已記錄調用已持久后運行；并監聽 `agent/pre-step`，在派生請求前持久化前一響應/結果批次。會話存儲的 flush 是共享持久性屏障；并發工具檢查點經它串行化，不會產生重復序列號。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`apply` 安裝三個檢查點監聽器 |
| — | 不發布運行時不變式伴生入口；順序由被攔截的 seam 強制。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從持久性模型逐步進入它所加入的 seam 與隨產品交付的后端。

- [會話持久化子系統](../../../docs/subsystems/persistence.zh.md)——每個后端共享的 flush 檢查點、批處理窗口與崩潰恢復。
- [會話包映射](../README.zh.md)——相鄰的持久化、投影、標題與遙測包。
- [會話持久化 seam](../session-persistence/README.zh.md)——本策略經由其刷新的 `ctx.sessionPersistence` 服務。
- [JSONL 持久化后端](../session-persistence-jsonl/README.zh.md)——本策略通常與之一起加載的隨產品交付后端。

-----

<a id="model-experience"></a>
## 模型體驗

### 中斷調用

#### 模型看到什么

插件不添加提示詞或工具 schema。工具檢查點后、結果前的硬崩潰會留下持久的未匹配調用；會話恢復提供由 `dsh-session` 負責的模型可見 `TOOL_OUTCOME_UNKNOWN` 結果。該消息允許重試只讀或冪等工作，并要求對可能有副作用的調用驗證狀態或請求用戶確認。

#### Token 影響

成功檢查點不添加 token，也不改變請求。恢復會添加一條短工具結果消息，以平衡中斷的 transcript（文本記錄）。

#### KV Cache 影響

修復結果追加在可重用前綴之后，因此不會使較早的緩存條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制界定本策略持久性保證的終點。它們是當前包約束，不是任務積壓。

- **持久記錄執行意圖，而非恰好一次副作用**——策略記錄的是調用已分派，而非其外部副作用已完成。當提供方支持時，有副作用的工具應將 `exec.callId` 作為冪等鍵轉發。
- **活躍模型 attempt 內沒有檢查點**——硬崩潰可能丟失尚未進入持久 `assistant/message` 或 `assistant/attempt` settlement 的瞬態 Assistant frame。
- **記錄未知結果，而非自動重試**——沒有結果的持久調用無法證明其外部副作用是否完成，因此恢復記錄未知結果，而不是自動重試。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
