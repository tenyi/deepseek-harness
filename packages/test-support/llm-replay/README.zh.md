---
description: "面向快照測試的無密鑰 LLM（大語言模型）回放插件，供測試作者針對已記錄模型 transcript（文本記錄）啟動真實 agent（智能體）。"
kind: "package-reference"
---

# @deepseek-ai/dsh-llm-replay

[English](README.md) | 中文

## 概述

`dsh-llm-replay` 從已記錄的 Session JSONL fixture（測試前置數據）回放模型流，讓快照測試無需 API 密鑰即可運行真實 agent。每個 parent 與 subagent 會話按首次調用順序取得各自的已記錄腳本，而同一會話內的調用會獨立推進。`replay.override.json` 伴隨文件表示持久 settlement 無法重建的分片前失敗、取消、掛起與注入重試。需要以固定模型輸出確定性測試真實 loop 行為時，可在 ACP（Agent Client Protocol）、headless 與 Web 瀏覽器場景中使用本包。

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

本包讓無密鑰測試擁有帶固定模型 transcript 的真實 agent：把它掛載到真實 LLM 適配器的位置，指向已記錄的 fixture，然后就像模型真的產生了已記錄輸出那樣運行場景。

### 掛載它

配置 `providers` 后，插件會注冊僅用于回放的適配器，其模型目錄可供測試模型發現功能的場景使用；未配置 `providers` 時，它安裝無需模型發現功能的測試所用的 catch-all `llm/stream` waterfall（瀑布式事件）：

```yaml
- id: llm-replay
  name: '@deepseek-ai/dsh-llm-replay'
  config:
    providers:
      - id: deepseek-official
        name: DeepSeek
        retryPolicy:
          mode: normal
          backoff:
            initialDelayMs: 1
            maxDelayMs: 1
            jitterRatio: 0
        models:
          - id: deepseek-v4-flash
            contextWindow: 128000
          - id: deepseek-v4-pro
  # file/overrideFile/childFiles default to $DSH_SNAPSHOT_FILE /
  # $DSH_SNAPSHOT_OVERRIDE / $DSH_SNAPSHOT_CHILD_FILES, set by the snapshot
  # harness per scenario.
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `file` | `$DSH_SNAPSHOT_FILE` | 選定 primary fixture 路徑：v0 為 `session.jsonl`，正 generation 為 `session.vN.jsonl`；必需（config 或 env） |
| `overrideFile` | `$DSH_SNAPSHOT_OVERRIDE` | 主會話的可選 `ReplayOverrideDoc` 伴隨文件 |
| `childFiles` | `$DSH_SNAPSHOT_CHILD_FILES` | 嵌套場景中已記錄的 subagent 子會話日志 |
| `providers` | 無 | 可選的僅回放提供方與模型目錄；模型可聲明 `contextWindow`、文本／圖片模態、圖片模型使用的正整數 `imageRequestTokens`，以及讓無密鑰場景演練歷史內系統提示詞替換的 `systemPromptUpdate: in-history`；非法值會在加載時失敗（`llm-replay: provider "…" model "…" systemPromptUpdate must be "in-history" when present`），路由絕不執行提供方 I/O |
| `paceMs` | 無（突發） | 可選的每分片延遲（毫秒），用于真正的增量投遞 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-llm-replay)是每個受支持字段及其 JSDoc 的窮盡式真源。

### fixture 的工作方式

fixture 是運行一次真實 agent 所產生的一份選定持久化 Session generation 投影，本插件不錄制。快照 harness 會提供數值最高的規范 parent 路徑（v0 為 `<scenario>/session.jsonl`，正 generation 為 `<scenario>/session.vN.jsonl`），并在回放前校驗文件名與 header 一致。fixture 保留 header 與每個事件 payload，但省略正文的 `seq`/`time` envelope（歷史 packed row 使用 `seq0`/`time0`）。回放會補充連續序號與確定性時間戳，恢復被快照 token 替換的類型化值，拒絕不完整或混合 envelope，通過構建期靜態 Session 格式 catalog 解碼完整物理產物，并在公開事件或繼承 cut 前于內存中遷移歷史輸入；當前輸入直接 restore。僅對投影 v0 header，缺失的 `delegationDepth` 表示 `0`。parser 從不重寫或重命名 fixture。運行時持久化繼續寫入完整日志。回放會展開當前視圖中每個 `assistant/message` 或 `assistant/attempt` 的緊湊流，因此已記錄 fixture 會回放出與在線模型產生的相同邏輯流。fixture 的 `request/header` 內容可能 token 化為 `{{system}}`/`{{tools}}`；回放會物化僅用于校驗的值，而派生只讀取 Assistant settlement、帶標記的 summary 事件與 Session metadata。每個回放 fixture 與比較 fixture 都必須通過同一個只基于內容的 catalog 校驗；回放絕不修復被拒絕的產物。比較編碼保留已接受的 catalog 輸出，包括擴展 request-header 字段；當前版本的 `header.system` 會被拒絕。協議通知的預期輸出直接與當前寫入器輸出比較，保留事件順序、插入的系統消息、包裝層字段，以及不透明的交付和捕獲代際值；只有完整 Session 產物使用格式遷移 catalog。

### 嵌套 agent

parent agent 委托給進程內 subagent 的場景會為每個 Session 記錄一個角色：parent 為 `session[.vN].jsonl`，隨后是連續 child `session.<ordinal>[.vN].jsonl`。snapshot harness 只提供每個角色的最高 generation。live Session id 每次運行都會重新隨機生成，因此 replay 按首次調用順序把每個 live Session 綁定到已記錄腳本：第一個發起模型調用的 live Session 取得 parent 腳本，下一個新 Session 取得下一條 child 腳本，依此類推，每個 Session 分別推進自己的 cursor。不同 live Session 數量超過已記錄腳本數時會明確報錯。

### 失敗模式與覆蓋

當回放在帶有 `ctx.deepseekLlmApiExtensions` 的組合中服務 `deepseek-official` 時，它會在選擇有效腳本條目后、產生首個分片前準備并接受這些字段。這與實時適配器的 2xx 后提交點一致，因此持久接受水位與 SDK 事件通知在錄制和回放中行為相同。回放提供合成 `{ messages: [] }` 基礎 body：它證明接受副作用，而非準備后的字段字節。

有兩種失敗模式無法僅根據持久 Assistant settlement 重建：任何 chunk 之前的純 throw 沒有攜帶異常的 stream member，而 cancel/hang 需要的是不終止語義，不能用有限前綴回放。需要這些行為的場景可提供可選伴隨文件（`<scenario>/replay.override.json`）：它用裸 `ReplayEntry[]` 替換派生腳本，或用 `{ patches: [{ at, entry }] }` 增補——保留所有派生調用，只替換指定的從 0 開始計數的調用索引；當 `at` 等于派生長度時，則在注入瞬態異常后的重試位置追加。有前綴分片的 `throw` 條目會接受 DeepSeek 請求擴展；零分片 throw 默認表示 2xx 前未接受，也可設 `accepted: true` 表示 2xx 后無分片失敗。`hang` 條目可以指定 `readyFile`，回放在等待取消前寫入它，使外部 driver 可以確定性取消。

### 可能出什么問題

- **fixture 未被完全消費**——在測試中直接安裝回放時調用 `assertConsumed()`，它會把場景靜默驅動的模型調用少于記錄數轉換為明確診斷。
- **未記錄的會話發起調用**——回放會明確報錯，并提示你重新錄制場景。
- **腳本占位符匹配不到內容**——`{{fromRequest:<regex>}}` 解析會校驗模式與請求語料，匹配不到、模式非法或占位符未閉合都會明確報錯。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋回放插件的設計；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計

回放把選定的投影 Session generation 視為 fixture。一個 parser 補全投影 envelope，通過 `sessionFormatCatalog` 校驗并遷移完整產物，再以一個結果返回當前 header、繼承 cut 與事件列表。`deriveReplayScript` 按日志順序展開每個 `assistant/message` 或 `assistant/attempt` 流，因此每個持久 settlement 都成為一條 `chunks` 條目；非空流缺少 `finish` 分片是 `stream()` 拋出異常的指紋，必須通過 override 伴隨文件表達。攜帶 `llmStreamCall: true` 與完整 `rawOutput` 的 `compaction/summary` 會在該事件位置回放為一條規范成功流。腳本字符串可以內嵌 `{{fromRequest:<regex>}}`；流輸出時每個 placeholder 針對 live request 的 string leaf 解析，取該 pattern 的最后一次 match，用其第一個 capture group（無 capture group 時用整個 match）原位替換。

[已提交語料測試](tests/session-format-corpus.spec.ts) 通過真實 catalog 還原 `snapshots/`、`packages/` 與 `scripts/snapshots/python-sdk-single-exe/` 下每個帶版本的 `session*.jsonl`，且不改變源字節。其[清單](tests/session-format-corpus-inventory.ts) 按路徑、源代際、錯誤類型與精確原因固定有意拒絕的歷史轉換；拒絕消失或變化都會使測試失敗。當前代際產物不能獲得例外。不含 header 的快照 harness 協議示例具有獨立的顯式豁免。其他所有還原錯誤都攜帶產物路徑并使測試失敗；歷史文件保持不變，原生當前 fixture 則由 owner 修正。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 類型、fixture 派生、override 校驗、占位符解析、會話綁定、`installLlmReplay` 與插件導出 |
| [`tests/session-format-corpus.spec.ts`](tests/session-format-corpus.spec.ts) | 已提交代際還原與精確歷史拒絕檢查 |
| — | 不發布運行時不變式伴生入口；該僅測試適配器消費固定的回放腳本；其流語法由 LLM 伴生插件與 fixture 派生測試檢驗。 |

### 綁定與流式流程

`installLlmReplay` 加載有序腳本，然后安裝路由回放適配器（`providers` 非空時）或 catch-all `llm/stream` waterfall 監聽器。每次實時 `stream()` 調用以其調用會話 id 為鍵：新會話認領下一個未認領腳本（父會話在前，因為它必須先開始流式輸出才能委托），沒有 `sessionId` 的調用共享一個綁定主腳本的匿名會話。返回的 `ReplayHandle` 攜帶用于 HMR（熱模塊替換）安全的 disposer，以及 `assertConsumed()`——除非每個已記錄腳本都綁定到實時會話且每個已綁定游標都已耗盡，否則它會拋出異常。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從回放適配器逐步進入錄制 fixture 的 harness 與消費流的 loop。

- [session-snapshot](../session-snapshot/README.zh.md)——錄制 fixture 并驅動回放、錄制與刷新模式的快照支持。
- [LLM 包](../../llm/llm/README.zh.md)——回放實現的提供方流約定與適配器注冊表。
- [測試策略](../../../docs/testing.zh.md)——無密鑰快照層及其適用時機。
- [test-support 組地圖](../README.zh.md)——兄弟 harness 與支持包。

-----

<a id="model-experience"></a>
## 模型體驗

無。該無密鑰測試適配器不向提供方模型發送請求，只將已記錄 assistant 分片回放到測試 loop 中。

#### KV Cache 影響

無；本包既不組裝也不發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明何時回放無法代替在線模型。它們是當前包約束，不是任務積壓。

- **首次調用順序腳本綁定假設串行委托**——并發運行同級 subagent 的實現會非確定性地將實時會話綁定到已記錄腳本；在這種場景出現前暫不實現更強的鍵控。
- **只有普通 loop 分片與帶標記的本地壓縮輸出才能派生**——在產生分片前直接拋出、取消/掛起，或未標記的外部摘要器調用場景需要 `replay.override.json` 伴隨文件；替換與補丁兩種形式都只影響主會話，子會話腳本仍從各自日志派生。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
