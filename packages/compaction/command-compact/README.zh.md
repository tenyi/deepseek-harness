---
description: "面向交互式組合的按需 /compact 命令：它做什么、你會看到什么，以及如何掛載。"
kind: "package-reference"
---

# @deepseek-ai/dsh-command-compact

[English](README.md) | 中文

## 概述

`dsh-command-compact` 為聊天 UI 添加 `/compact` 命令：輸入它，對話就會按需壓縮（compaction）——即使尚未觸發自動壓力，較早歷史也會被替換為一條摘要。該命令適用于任何壓縮后端，且不消耗模型輪次；完成后你會看到壓縮了多少歷史項以及估算節省的 token 數。當 agent（智能體）正在執行輪次或壓縮已在運行時，它會告訴你壓縮暫不可用。運行期間你發送的提示詞會保持排隊，并在壓縮結束后才開始。

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

當對話已經很長、想立即壓縮時，在聊天 UI 中輸入 `/compact`。隨附 `dsh` 基礎配置把該命令掛載在默認后端旁，因此它通常已經可用。

### 使用命令

| 輸入 | 結果 |
|---|---|
| `/compact` | 即使未達到自動壓力，也壓縮一段有效、平衡的較早范圍，然后報告被替換的歷史項數量與估算 token 數。 |
| `/compact`，但沒有可壓縮歷史 | `No compactable history yet.`——不會有任何改變。 |
| `/compact <anything>` | `Usage: /compact (no arguments)`——該命令不接受參數。 |

### 你會看到什么

命令會把每個預期失敗轉換為可直接展示的穩定消息；左列的情形產生右列的消息。

| 情形 | 你看到的消息 |
|---|---|
| 壓縮已在運行，或 agent 正在輪次中 | `Compaction is unavailable because this process has an active compaction, or the agent is not idle.` |
| 壓縮過程中歷史發生了變化 | `The history selected for compaction changed before it could be replaced. The conversation is unchanged; the attempt is recorded in the session log.` |
| 無法產生有用的摘要 | `Compaction could not produce a useful summary. The conversation is unchanged; the attempt is recorded in the session log.` |
| 壓縮未干凈地完成 | `Compaction did not finish cleanly; some session history may have changed. Inspect the current session state before retrying.` |
| 會話無法保存 | `Compaction finished, but the session could not be saved.` |

取消命令會停止等待：后端完成必需的清理，命令以 `Compaction cancelled.` 結算，UI 停止等待。除這些預期情形外的失敗會以錯誤形式呈現，而不會被靜默轉換。

### 組合命令

掛載命令注冊表、一個壓縮后端與本插件：

```yaml
- id: commands
  name: '@deepseek-ai/dsh-commands'
- id: compaction-basic
  name: '@deepseek-ai/dsh-compaction-basic'
- id: command-compact
  name: '@deepseek-ai/dsh-command-compact'
```

隨附 `dsh` 基礎配置把它掛載在默認后端旁，Web 客戶端提供命令適配器。未組合命令適配器的自動化接口只保留自動壓縮。

### 對話會發生什么

命令成功時，所選較早范圍會被替換為一條摘要，近期歷史不受影響；命令會報告壓縮的項目數與估算 token 數。壓縮運行期間你提交的提示詞會被接受，并只在壓縮結束后才開始——不會被丟失或重排。命令生命周期記錄在會話日志中，但絕不進入模型歷史。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋命令背后的設計決策；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

該命令建立在三項承諾之上：

- **與后端無關的控制。** 處理器只依賴 `compactNow(agent, signal)`，因此可與任何 `CompactionEngine` 實現協作。調用該命令的 agent 就是操作的確切目標，發起分發的 UI 會通過 seam 轉發取消信號。
- **命令生命周期不進入模型歷史。** `command/run` 與 `command/done` 都是僅日志事件；`sourceEventSeq` 將成功結果與 `compaction/summary` 事件關聯，不依賴文本或行相鄰關系。
- **資源銷毀必須完全停穩。** 生命周期 effect 會先注銷 `/compact`，再等待已開始處理器結算，因此已中止命令的閉合與 flush 工作會在根級資源釋放完成前結算完畢。

### 生命周期與關聯

每次完成的調用都會記錄執行器所屬的僅日志事件對 `command/run` / `command/done`；兩者都不進入模型歷史。成功時，`command/done.sourceEventSeq` 會指明該事務的 `compaction/summary` 事件，讓呈現層無須解析結果文本或假定兩行相鄰，即可將命令生命周期歸并到對應檢查點中。busy 結果有意限定在進程范圍內：活動的未匹配標記會阻塞，而早于最新 `session/end-seed` 的標記已陳舊，不會阻塞。插件會跟蹤每個真實處理器 promise，并在排空已開始處理器之前注銷 `/compact`，因此根級 teardown 不會越過已中止命令的閉合或 flush 邊界。壓縮運行期間提交的提示詞仍會按 agent 的普通 FIFO 獲得接納，并且只在壓縮的顯式持久性檢查點和接納預留釋放后啟動；空閑注入的上下文可以位于 `compaction/start` 與 `compaction/end` 之間，并在檢查點之后保持可見。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`/compact` 注冊、參數拒絕、錯誤碼映射、生命周期排空 |
| — | 不發布運行時不變式伴隨條目；該命令適配器不擁有任何狀態或事件流；壓縮 seam 擁有平衡且具持久性的事務，命令注冊表擁有注冊與分發生命周期。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面；它們從命令逐步進入 seam、隨附后端與設計決策。

- [壓縮 seam](../compaction/README.zh.md)——本命令觸發的壓縮約定。
- [壓縮基礎后端](../compaction-basic/README.zh.md)——自動與按需壓縮的隨附后端。
- [命令包](../../interaction/commands/README.zh.md)——聊天命令背后的注冊表與分發約定。
- [壓縮子系統參考](../../../docs/subsystems/compaction.zh.md)——壓縮詞匯、結果與服務行為。
- [排隊手動壓縮 Agent Note](../../../.agents/notes/implemented/feature/2026-07-30-queued-manual-compaction.zh.md)——按需壓縮如何與運行中的輪次串行化。

-----

<a id="model-experience"></a>
## 模型體驗

### 用戶 `/compact` 控制

#### 模型看到的內容

斜杠輸入與直接結果絕不會進入模型請求。已獲接納的壓縮會另外在獨立的 `compaction/* { turn: null }` 標記對內，用后端的 user 角色檢查點替換一段較早范圍。

#### Token 影響

命令生命周期不會增加模型 token。成功壓縮會用一份帶框架的摘要替換所選范圍，從而減少后續請求；摘要生成本身需要一次輔助請求。

#### KV Cache 影響

命令發現與簿記不會影響緩存。已獲接納的 surface 替換會從第一個被遮蔽的歷史 token 起使復用失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明該命令何時不合適；它們是當前包約束。

- **僅限空閑狀態**——當輪次或已獲接納的喚醒提示詞擁有優先權時，`/compact` 會報告壓縮暫不可用；命令本身不會排隊。
- **不接受范圍或策略參數**——無參數形式使各命令適配器的行為保持穩定。顯式范圍仍由編程接口 `compactRegion()` 處理。
- **僅限命令適配器**——沒有 `ctx.commands` 的接口無法調用該命令，只能依賴自動壓力壓縮。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文，明確不具權威性；已交付行為以上文、包代碼與所鏈接的 Agent Note 為準。

- **命令排隊，尚未決定**——輪次擁有優先權時提交的 `/compact` 會報告 `busy`；將請求排隊而非拒絕仍是開放方向。
- **范圍與策略參數，尚未決定**——無參數形式的穩定性是有意的；增加參數需要在每個命令適配器間共享語法。

</details>
