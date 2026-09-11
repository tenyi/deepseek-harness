---
description: "凍結的已發布 v1 Session 讀取器，以及把 Assistant 流嵌入已發布 v2 事件的基數變化遷移。"
kind: "package-reference"
---

# @deepseek-ai/dsh-session-format-v1-to-v2

[English](README.md) | 中文

## 概述

`dsh-session-format-v1-to-v2` 通過一個有狀態事件 Stage，把已發布 v1 Session 轉換為已發布 v2 事件模型。它會消費頂層 `assistant/chunk` 事件，把精確的帶時間流嵌入匹配的 `assistant/message`，并在失敗、重試、取消或 stream error attempt 已到達 settlement、但沒有產生 surface message 時記錄 `assistant/attempt`。該遷移邊會密集重映射存活事件和每個已聲明的同 Session 序號引用；v2 codec 則讓每行只存一個事件，并從帶標記的 `session/end-seed` 事件推導繼承切點。

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

### 何時使用

持久化通過 `dsh-session-format-catalog` 獲取該遷移邊；功能組合不會掛載它。只有在裝配或測試靜態已發布格式目錄，或檢查精確的 v1 到 v2 轉換時，才直接導入本包。它不發布運行時不變式伴生入口，因為本包沒有狀態可能彼此分歧的、可獨立觀測的運行時注冊項；decoder 與 transformer 狀態只屬于一次還原。

### 入口

```text
const decoder = releasedV1SessionFormatCodec.createDecoder(physicalHeader, 'strict')
for (const row of physicalRows) decoder.decodeRow(row, migrationContext)
const stage = sessionFormatV1ToV2.createStage(stageInput)
stage.transformEvent(event, migrationContext)
const targetInheritedEventCount = stage.finish(migrationContext)
const headerRecord = releasedV2SessionFormatCodec.encodeHeader(currentHeader, targetInheritedEventCount)
const eventRecord = releasedV2SessionFormatCodec.encodeEvent(currentEvent)
```

`releasedV1SessionFormatCodec` 逐行讀取凍結的 v1 物理語言。`sessionFormatV1ToV2` 創建改變事件基數的 Stage，靜態 catalog 把它連接到 decoder，且不保留 v1 事件數組。Catalog 會重映射已聲明引用，并校驗 released-v2 envelope、inherited cut、事件準入與關系。持久化在發布前通過 Worker 執行完整 installed-current 校驗。`releasedV2SessionFormatCodec` 創建已發布 v2 格式的逐行 decoder，并逐條編碼 v2 header 與事件。

成功的 v1 `assistant/message` 必須引用其完整有序 attempt。遷移會移除這些頂層 chunk 和已停用的 message provenance，在不合并 token 邊界的前提下壓縮 chunk，并把 stream 存到該 message 上。未被 message 認領的 attempt 會在其最后一個 chunk 的位置變成一個僅日志可見的 `assistant/attempt`。無關的交錯事件保持相對順序。

該 edge 還會閉合一種有限的舊版恢復模式：非空的 `next-turn` inbox 插入后直接出現下一個 `turn/start`，但缺少前一輪的 `turn/end`；遷移將前一輪記錄為 interrupted。舊版 round-zero goal mutation 會變成一個 `goal/change`，隨后保留原本模型可見的 message 并改用普通 plugin attribution，因此持久 goal 狀態與歷史模型輸入都會保留。

如果引用指向被消費的 chunk，遷移會失敗，而不會把它重定向到語義不同的事件。它會重映射已聲明的事件 provenance、surface replacement、command source event、compaction range 與 list，以及 title message list。已經對模型可見的 `session/title-llm-request.messages` 文本會在源校驗后保持逐字節不變，因此目標校驗不會重新解釋該 prompt 中嵌入的舊序號。帶 seed 的源若讓繼承切點切開一個 Assistant attempt，也會遷移失敗；目標會用 `session/end-seed { inherited: true }` 標出精確切點。

v2 物理 header 要求 `isSeeded`，且不存儲數值切點。編解碼器從最后一個 inherited end-seed marker 推導切點，每行寫入一個事件，只對 `sourceEventSeqs` 做范圍編碼，并對普通事件詞匯與 payload 擴展保持中立。Released-current restoration 準入 installed Session package 已知的事件 type，以及攜帶 `ignorable: true` 的未知事件，并校驗事件 member 與關系。普通 Session restore 只檢查 runtime 直接依賴的 settlement 字段，不重放嵌入 stream；persistence publication 與凍結的 writer-image fixture validator 保留完整 stream verification。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

增量遷移邊會保留一個尚未結算的 Assistant attempt、輸出位置取決于該 attempt 的事件，以及密集的舊序號到新序號映射。它按源順序發出已結算的存活事件，并且只重寫凍結事件清單聲明的引用字段。Released-current 校驗會拒絕轉換無法保留的任何關系。

| 文件 | 職責 |
|---|---|
| [`src/migration.ts`](src/migration.ts) | Attempt 分組、settlement 替換、密集序號映射與引用重寫 |
| [`src/codec.ts`](src/codec.ts) | 已發布 v2 header、每行一個事件的編碼、provenance 范圍與可恢復前綴解碼 |
| [`src/validation.ts`](src/validation.ts) | v2 物理 envelope／cut 校驗，以及 released-current 事件準入與關系校驗 |
| [`src/dispositions.ts`](src/dispositions.ts) | 凍結的已發布 v2 事件與 payload 成員清單 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [已發布 v0 到 v1 遷移邊](../session-format-v0-to-v1/README.zh.md)——本包復用的源編解碼器與凍結歷史詞表。
- [靜態目錄](../session-format-catalog/README.zh.md)——構建擁有的編解碼器與遷移順序。
- [Session 持久化子系統](../../../docs/subsystems/persistence.zh.md)——不可變 generation 選擇與發布。
- [嵌入式 Assistant stream 決策](../../../.agents/notes/implemented/architecture/2026-09-01-v2-embedded-assistant-streams.zh.md)——理由、替代方案與后果。

-----

<a id="model-experience"></a>
## 模型體驗

### 歷史還原

#### 模型看到什么

成功的 Assistant message 會保留從同一 v1 stream 組裝出的 content、provider、model、usage 與 replay state。失敗或放棄的 attempt 會通過 `assistant/attempt` 保留為持久診斷事實，但不會進入 `deriveMessages()`。

#### Token 影響

遷移不會添加模型可見內容。它會保留派生 message history，只從當前邏輯事件序列中移除頂層 chunk 信封。

#### KV Cache 影響

還原后的模型 message 序列保持不變，因此遷移本身不會改變請求前綴的緩存身份。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **封閉的第一方源清單**——未知 v1 事件會使遷移失敗，包括帶有 `ignorable: true` 的事件。
- **線性重映射狀態**——流式處理不保留完整 v1 事件數組，但最終 v2 事件數組和舊到新序號映射仍為 O(事件數)。
- **不負責發布或兼容回退**——持久化擁有排他 successor 發布，保留的 v1 generation 不是自動 downgrade 或 restore 輸入。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
