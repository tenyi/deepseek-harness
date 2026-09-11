---
description: "后臺任務注冊表約定，供組合、實現或排查后臺工作的用戶與維護者閱讀：id、歸屬、生命周期與完成監聽器。"
kind: "package-reference"
---

# @deepseek-ai/dsh-jobs

[English](README.md) | 中文

## 概述

`dsh-jobs` 讓工具可以在 agent（智能體）繼續推進時保持長時間工作運行。每項任務都會獲得穩定的 `<kind>-N` id，擁有它的 agent 可以讀取輸出、帶超時等待或請求取消。歸屬范圍限定在 agent 會話內，因此其他 agent 無法查看或停止任務；任務完成時會通過會話內通知送達，無需輪詢。只有部署提供任務執行能力時，后臺任務才能啟動。

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

在組合后臺任務能力或編寫注冊長時間工作的生產方時使用本包。本包本身定義約定；組合通過加載 `dsh-jobs-local` 這樣的實現，以及模型側的 `dsh-tool-jobs`，獲得該功能。

### 后臺任務提供什么

生產方以 kind 和一行標簽注冊工作；注冊表返回 `<kind>-N` id，例如 `bash-1`。擁有任務的任何一方都可以讀取輸出、列出任務、帶超時等待結算或請求取消——每次調用都返回任務狀態的全新快照，從 `running`、`stopping` 到終止態的 `completed`、`killed` 或 `failed`。任務結算時，擁有它的 agent 會通過 `dsh-tool-jobs` 轉成會話內通知的完成監聽器得到通知，因此無需輪詢。生產方還可以附加可選的字節上限，讓每次完整的模型側輸出讀取或完成通知保持有界。

### 歸屬邊界

任務屬于啟動它的 agent 會話：其他 agent 無法讀取或停止它。`bash-1` 這樣的 id 可預測，因此這道隔離是授權，而非保密。沒有所有者啟動的任務對任何調用方開放，并持續到服務被釋放為止。

### 啟動后臺工作需要一個控制器

只有附加了服務于所有者的控制器時，生產方才能啟動工作——加載 `dsh-tool-jobs` 即附加一個。組合中未加載任何控制器的 agent 無法啟動后臺工作；`start()` 會以指出缺失控制器的消息失敗，而不會啟動 agent 永遠無法收集或停止的工作。

### 最小可用組合

```yaml
- name: '@deepseek-ai/dsh-jobs-local'
- name: '@deepseek-ai/dsh-tool-jobs'
```

在已提供 agent、工具與系統提示詞服務的 harness 基礎上加載這兩個插件，即可獲得完整功能：`dsh-jobs-local` 提供進程內后臺任務注冊表，`dsh-tool-jobs` 提供 `job_output`、`job_list`、`job_kill` 工具以及完成通知投遞。

### 可能出什么問題

任何預檢拒絕都不會留下 job id 或已注冊的工作。由隨附的進程內注冊表管理的任務會隨 harness 進程終止而消失；跨重啟的持久執行需要一個實現本約定的不同后端。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋約定背后的設計決策，并指出實現它們的代碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

- **約定與實現分屬不同包。** `JobRegistry` 是抽象 Cordis 服務；直接加載該類會拋出異常，因此錯誤配置的組合會在加載時失敗，而不是注冊一個空的 `ctx.jobs`。
- **每個進程一個注冊表，按所有者返回結果。** 一個實例服務進程內的每套組合，因此注冊與投遞都相對注冊方所在 scope：從不帶 scope 的上下文注冊的控制器或監聽器服務于每個所有者；在某套 agent 組合的 scope 下注冊的，恰好服務于該組合下組合出的 agent。
- **訪問以所有者的會話 id 為界。** id 可預測，因此是授權——而非保密——構成邊界。
- **結算首次優先，完成最后宣布。** 一條終止記錄、釋放的等待方，以及一輪受到隔離的監聽器通知；完成在記錄提交且該結算的所有其他觀察者都已看到之后才宣布，因為報告方可能同步開啟一個模型輪次。
- **注冊的存續期長于生產方與控制器 fiber。** 所有者與服務釋放會取消正在運行的工作并等待守約的生產方；銷毀期間的取消若拋出異常，只會將記錄強制標記為失敗。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：抽象 `JobRegistry` 服務及其約定 |
| [`src/types.ts`](src/types.ts) | 共享詞匯：`JobKindMap`、`JobStart`、`JobHooks`、`JobSnapshot`、監聽器類型 |
| [`src/brand.ts`](src/brand.ts) | `JobId` 帶類型標記的標識符，無需 agent 依賴即可導入 |
| [`src/invariant.ts`](src/invariant.ts) | 不變式伴生插件：校驗快照標識、狀態、時間戳與所有者字段 |

### 服務操作

每個操作都是已注冊任務之上的薄投影：`get` 與 `list` 返回非消費式快照，`read` 推進唯一的流游標，`kill` 在改變狀態前調用生產方取消，`wait` 最多阻塞至超時，`start()` 在調用生產方 `run()` 一次之前預檢訪問、校驗與準入，同時拒絕任何沒有已附加控制器服務的所有者；監聽器按所有者粒度觀察終止記錄與可見集變化，`attachController` 把控制器可用性限定在其 effect 生命周期內。確切簽名與行為見 [`src/index.ts`](src/index.ts) 的 JSDoc 與生成的 [`ctx.jobs` Cordis 接口面](../../../docs/subsystems/jobs.zh.md)。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從任務類型逐步進入隨附實現、模型側控制與設計記錄。

- [后臺任務運行時子系統](../../../docs/subsystems/jobs.zh.md)——任務類型、快照字段與 `ctx.jobs` 的 Cordis 接口面。
- [jobs 組映射](../README.zh.md)——同級組頁面及其包表格。
- [進程本地注冊表](../jobs-local/README.zh.md)——在本進程中運行任務的隨附實現。
- [模型側任務控制](../tool-jobs/README.zh.md)——`job_output`、`job_list` 與 `job_kill` 工具及完成通知。
- [通用長時間運行工具運行時 Agent Note](../../../.agents/notes/implemented/architecture/2026-06-20-generic-long-running-tool-runtime.zh.md)——后臺任務運行時背后的設計。
- [任務注冊表 seam Agent Note](../../../.agents/notes/archived/architecture/2026-07-26-job-registry-seam.md)——按所有者隔離的注冊表約定及其理由。

-----

<a id="model-experience"></a>
## 模型體驗

通過生產方插件與控制器插件間接影響模型；它們負責基于任務注冊表完成所有面向模型的渲染。

#### KV Cache 影響

不會直接導致 KV Cache 失效；請求前綴變更由上述消費方負責。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明約定何時不合適。它們是當前包約束，不是任務積壓。

- **約定是進程內的**——`JobStart.run()` 傳入回調和確切的 `Agent` 對象；持久化或跨進程后端必須先重塑身份、重啟、所有權與觀察語義，才能實現此 seam。
- **流輸出只有一個消費游標**——獨立觀察者需要游標或快照 API。
- **前臺工作無法轉為后臺**——生產方在啟動前選擇前臺或后臺。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
