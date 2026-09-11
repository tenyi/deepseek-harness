---
description: "進程本地后臺任務注冊表，供組合、容量評估或排查進程內任務的用戶與維護者閱讀：按所有者的準入、生命周期與銷毀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-jobs-local

[English](README.md) | 中文

## 概述

`dsh-jobs-local` 在 harness 進程內運行后臺任務：工作會在 agent（智能體）繼續推進的同時保持運行，擁有它的 agent 可以讀取、等待、列出和取消它；同時掛載 `dsh-tool-jobs` 時，完成以會話內通知送達。它用內存記錄實現 `dsh-jobs` 約定，并且只交出全新快照，從不交出實時狀態。按所有者的并發上限（默認 10）約束一個 agent 同時處于運行或停止中的任務數量；任務會隨 harness 進程終止而消失，無法跨重啟持久。

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

當組合需要進程內后臺任務時加載本插件：長時間運行的工具注冊其工作，擁有它的 agent 在不阻塞自身輪次的情況下讀取、等待、列出和取消。它實現 [`dsh-jobs`](../jobs/README.zh.md) 約定；模型側的 `job_output`、`job_list` 與 `job_kill` 工具來自 [`dsh-tool-jobs`](../tool-jobs/README.zh.md)。

### 何時選擇

當任務應存活于 harness 進程內、并隨進程終止時選擇它。當工作必須跨重啟存活或跨進程存在時避免它：記錄保存在內存中，持久或跨進程后端必須以不同方式實現同一約定。

### 最小配置

加載插件即注冊 `ctx.jobs`；`maxConcurrentJobsPerOwner` 可選，默認為 `10`。

```yaml
- name: '@deepseek-ai/dsh-jobs-local'
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `maxConcurrentJobsPerOwner` | `10` | 每個精確所有者，或共享的無主桶中，`running` 加 `stopping` 任務的最大數量 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-jobs-local)是每個受支持字段的窮盡式真源。

### 每個所有者得到什么

上限統計精確所有者的 `running` 與 `stopping` 記錄；所有無主任務共享另一個獨立的服務級桶。終止歷史不占用容量，只有生產方的 `done` 結算才釋放一個停止中任務的名額。達到上限時，`start()` 會在生產方運行前失敗，錯誤會指出上限并告訴 agent 終止一個不需要的任務、等它結束后再重試——注冊表既不排隊也不搶占。

### 生命周期

任務屬于其所有者和后端，而非生產方工具，因此重載生產方或控制器不會停止任務。擁有任務的 agent 被釋放時，其任務會被取消、生產方會被等待、快照會被移除；服務釋放對每個剩余任務執行同樣的操作。銷毀期間拋出的取消會強制失敗記錄并警告工作可能成為孤立工作，因此銷毀永遠不會死鎖。

### 可能出什么問題

沒有服務于所有者的控制器時無法啟動工作——加載 `dsh-tool-jobs` 即附加一個，否則 `start()` 會以指出它的消息拒絕。返回但始終未結算 `done` 的生產方取消與緩慢停止無法區分，可能使銷毀停滯并持續占用一個容量名額。每條記錄都會在 harness 進程退出時消失。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋注冊表背后的設計決策，并指出實現它們的代碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

- **內存記錄，全新快照。** `LocalJobRegistry` 為每個任務保存一條 `TrackedTask`，每次調用都投影出新的只讀快照；調用方永遠不會拿到實時狀態。
- **按所有者分層，一個進程級注冊表。** 控制器、完成監聽器與變更觀察者歸檔到注冊方所在的 scope（`ScopedLayers`），讀取把全局層與所有者的 scope 鏈求并集——因此某個 preset 的任務控制絕不會為自身組合未加載任何控制器的 agent 保持 `start()` 可用，一次結算也只會抵達其所有者所屬組合注冊的監聽器。
- **啟動前先預檢。** `start()` 在調用生產方之前檢查控制器服務、spec 有效性、仍存活的所有權與容量，因此拒絕不會留下 job id 或執行資源；注冊一旦提交，后續不再有可失敗步驟。
- **結算首次優先，完成最后。** 最早的終止結果只記錄一次，釋放等待方，并只通知監聽器一次，各監聽器故障單獨隔離；完成在記錄提交且可見集變更發布之后才宣布，因為報告方可能同步開啟一個模型輪次。
- **銷毀永不死鎖。** 拋出的取消會強制失敗記錄并報告可能的孤立工作，而不是讓釋放停滯。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`Config` schema、`LocalJobRegistry`、準入、生命周期、銷毀 |
| — | 不發布運行時不變式伴生入口；快照的標識、狀態、時間戳與所有者檢查位于 `@deepseek-ai/dsh-jobs/invariant`。此提供方的準入決策使用私有配置，并且必須在后端啟動器運行前失敗；當前生產方由 `LocalJobRegistry.start()` 同步執行該決策。發布后再重復聚合只會向 companion 暴露私有配置，也無法驗證失敗發生在啟動前。 |

### scope 分層

`attachController`、`onJobDone` 與 `onJobsChanged` 注冊到調用上下文所在的 scope 層。控制器問題（`servesOwner`）與監聽器投遞（`listenersFor`、`changedFor`）走同一條鏈：先是全局層，再沿所有者的鏈逐層。注冊是無名 token，因此重復標簽仍可獨立釋放。

### 準入與結算

`activeTaskCount` 按精確所有者或共享無主桶統計權威記錄。`settle` 在存在掛起等待方時把任務標為已報告，解析每個等待方，記錄終止快照，宣布可見集變更，然后通知完成監聽器。掛起的等待會在監聽器運行前把任務標為已報告，因此完成報告方不會重復通知；銷毀時的取消出于同樣理由標記——面向正在被銷毀的所有者的通知不會有人讀到。

### 銷毀

所有者釋放（`disposeOwned`）會取消該所有者的任務、等待其結算、移除其記錄，并宣布移除——這是任何逐任務記錄都無法表達的可見集變更。服務釋放（`disposeAll`）會關閉監聽器、取消所有存活任務、等待結算、清空存儲、向不同的所有者宣布清空，然后分離跨 fiber 的所有者清理 effect。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從注冊表約定逐步進入模型側控制與設計記錄。

- [后臺任務運行時子系統](../../../docs/subsystems/jobs.zh.md)——任務類型、快照字段與 `ctx.jobs` 的 Cordis 接口面。
- [jobs 組映射](../README.zh.md)——同級組頁面及其包表格。
- [注冊表約定](../jobs/README.zh.md)——本包實現的抽象 `ctx.jobs` 服務。
- [模型側任務控制](../tool-jobs/README.zh.md)——`job_output`、`job_list` 與 `job_kill` 工具及完成通知。
- [通用長時間運行工具運行時 Agent Note](../../../.agents/notes/implemented/architecture/2026-06-20-generic-long-running-tool-runtime.zh.md)——后臺任務運行時背后的設計。
- [任務注冊表 seam Agent Note](../../../.agents/notes/archived/architecture/2026-07-26-job-registry-seam.md)——按所有者隔離的注冊表約定及其理由。

-----

<a id="model-experience"></a>
## 模型體驗

通過生產方插件與 `dsh-tool-jobs` 間接影響模型，注冊表后端把全部模型渲染委托給它們。

#### KV Cache 影響

不會直接導致 KV Cache 失效；請求前綴變更由上述消費方負責。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明注冊表何時不合適。它們是當前包約束，不是任務積壓。

- **任務只存在于進程本地**——記錄會隨 harness 進程終止而消失；持久或跨重啟執行需要一個單獨實現該 seam 的后端。
- **靜默無效的取消可能使銷毀停滯并持續占用容量**——如果 `cancel` 返回后始終未結算 `done`，注冊表就無法將其與緩慢停止區分開；該任務會在服務剩余生命周期內持續占用一個桶名額，只有顯式拋出異常才能安全地強制標為失敗。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
