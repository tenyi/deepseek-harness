---
description: "面向選擇、組合或排查自動 Goal Round 的用戶與維護者的同會話續行驅動器說明。"
kind: "package-reference"
---

# @deepseek-ai/dsh-goal-round-driver

[English](README.md) | 中文

## 概述

`dsh-goal-round-driver` 會在同一會話內自動繼續 active goal，但前提是 agent（智能體）已空閑、續行已啟用且配置的 Round 額度仍有剩余。每個 Round 都讓模型獲得另一次推進目標的機會；只有進入模型歷史的 goal Round 才消耗額度，額度耗盡時會記錄 blocker。驅動器本身沒有配置：goal 定義 Round 上限，`dsh-tool-goal` 定義重復受阻后何時停止續行。若任務需要無人值守的多輪推進，應與 `dsh-goal` 和 `dsh-tool-goal` 一起掛載；若每一步都需要人工 steering（中途引導），則不要掛載。

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

當 active 的 goal 應在無人干預的情況下持續推進時，掛載 `dsh-goal-round-driver`。它與 goal 服務和 goal 工具組合使用：服務擁有狀態，工具讓模型控制狀態，本包負責調度輪次。

### 組合方式

把驅動器掛載在 goal 服務與 goal 工具旁邊；驅動器本身不需要任何配置。

```yaml
- id: goal
  name: '@deepseek-ai/dsh-goal'

- id: tool-goal
  name: '@deepseek-ai/dsh-tool-goal'

- id: goal-round-driver
  name: '@deepseek-ai/dsh-goal-round-driver'
```

`maxGoalRounds` 屬于 goal 定義，面向模型的阻塞閾值屬于 `dsh-tool-goal`；在驅動器中重復任一數值都可能產生分歧策略。

### 每輪做什么

當對應的活躍 agent 處于 idle，且存在 active、已啟用續行、仍有容量的 goal 時，驅動器會排入一條 goal-round 提示詞。它點明以 JSON 引用的目標、Round 編號與上限，并告訴模型以當前工作區、工具結果和持久狀態為準。被接納的 Round 會開啟獨立請求序列，因此 Chat 會在 goal 消息之前渲染其自包含請求 header。該 Round 以 goal 來源的用戶消息進入歷史；只有進入步驟的 goal 消息消耗上限，人類消息和陳舊預留不會消耗。goal 生命周期變更仍必須通過 `dsh-tool-goal` 的獨立權限檢查。

### 何時停止續行

Round 只在整個 agent 進入 idle 時啟動；完成、暫停和阻塞會阻止續行；宿主發起的暫停還會中止正在運行的輪次，而模型在自己輪次內發起的暫停會正常結束。編輯只會通過修訂柵欄使進行中的 Round 失效，驅動器會繼續新修訂。驅動器也會在以下情況自行停止：輪次因 max tokens 結束、持久性寫入失敗、agent 被取消、插件卸載，或 Round 上限耗盡——上限耗盡時它會以穩定代碼 `round-limit` 記錄一個 blocker。取消絕不會自動重啟 Round：Round 已在進行或已排入隊列的 goal 會在下一次 idle 時被暫停；與 goal 嘗試無關的取消只會停用續行。

### resume、fork 或卸載之后

把驅動器掛載到現有 agent 上絕不會啟用任何 goal 的續行；會話 resume 或 fork 后，active 的 goal 會保持停用續行，直到用戶明確授權 resume——驅動器絕不會自行復活工作。卸載插件會取消進行中的 Round，并確保不再啟動后續 Round。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋驅動器如何在無競態的情況下調度 Round；可觀察行為已在[使用本包](#use-this-package)中說明。

### 設計

- **先預留，后準入。** idle 時驅動器為當前 `{ goalId, revision }` 預留 `roundsStarted + 1`，排入一條攜帶 goal 消息來源的 `<goal_round>` 提示詞；只有進入步驟的 `user/message` 才會增加 `roundsStarted`。因陳舊而被拒絕的預留不會消耗 Round 編號。
- **競態防護。** `agent/pre-step` 監聽器會在下游監聽器前后驗證完整的已領取記錄與當前 goal，因此陳舊、已取消或競爭中的提示詞會在其步驟進入前被拒絕。在預留前到達的人類工作會讓自動工作讓行，直到 agent 重新進入 idle。
- **持久性檢查點。** `goal/changed` 會產生持久性義務：排隊工作前，驅動器會等待 `ctx.sessions.flush()`，并在等待后重新檢查 goal revision 與競爭輸入。通過 `agent/error` 到達的 flush 失敗會停用續行，避免另一 Round 啟動。
- **fail-closed teardown。** Teardown 會關閉準入、停用所有活躍 goal 的續行、以 `parent` 原因取消進行中的工作，并在事件防護仍生效的情況下等待驅動器和 agent 完全停穩。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：驅動器狀態機、競態防護、teardown |
| [`src/prompt.ts`](src/prompt.ts) | 保留的 `<goal_round>` 續行提示詞 |
| [`src/invariant.ts`](src/invariant.ts) | 不變式伴生：goal-round 消息必須與包自有提示詞一致 |

### Round 提示詞

保留的提示詞是一個文本塊：前幾行為 JSON 引用的目標與 `round/maxGoalRounds`，其后是工作指令。不變式伴生會從持久前綴重建 goal，并拒絕內容與該提示詞不完全一致的任何 goal 來源消息。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

驅動器消費 goal 狀態并把策略交由 goal 工具處理；需要了解周邊約定與設計理由時閱讀以下頁面。

- [goal 服務](../goal/README.zh.md)——本驅動器繼續推進的 goal 狀態與生命周期。
- [goal 工具](../tool-goal/README.zh.md)——面向模型的工具及其執行時權限檢查。

-----

<a id="model-experience"></a>
## 模型體驗

### Goal Round 提示詞

#### 模型看到的內容

每個已準入 Round 都是一段保留的用戶角色 `<goal_round>` 塊，其中點明完整目標與正數 Round 編號。更早的用戶消息、goal 狀態快照、assistant 輸出與工具記錄仍保留在同一會話歷史中。

#### Token 影響

每個已準入 Round 會增加一個固定指令塊和目標。后續請求會重新發送保留的 Round，直到壓縮（compaction）將其遮蔽；不會創建新 agent，也不會復制對話前綴。

#### KV Cache 影響

在一個 epoch 內僅追加：每個已準入 Round 都會在可復用前綴后擴展現有對話。壓縮可能替換派生歷史后綴，并移動可復用邊界。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明驅動器何時不合適或需要特別注意。它們是當前包約束，不是任務積壓。

- **沒有獨立評估器**——面向模型的 goal 策略會判斷證據是否足以完成，以及 blocker 在語義上是否未變；評估器支持的認證仍保持暫緩。
- **只在同一會話執行**——此包有意不 spawn 新 agent、不 fork 會話前綴，也不實現 Ralph 風格的獨立嘗試；該工作流屬于單獨的插件層。
- **已接受隊列的卸載競態**——Cordis 插件卸載是異步的。已經被 agent inbox 接受的 goal 提示詞可以在卸載開始前啟動并消耗其 Round；teardown 隨后會取消請求、停用 goal 的續行并等待完全停穩。不會再啟動后續 Round。
- **只有 Round 上限，不是資源預算**——token、貨幣、時間與提供方配額策略保持獨立。對應的會話事件不會歸屬于 goal 消息，也不會映射為 goal 阻塞代碼。
- **異常情況不自動重試**——暫時性的提供方與持久化失敗需要之后由用戶授權 resume，而不會采用隱式重試策略。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文，明確不具權威性。開放且未決的方向：異常失敗重試策略與逐輪評估器認證；兩者按設計都留在本包之外。

</details>
