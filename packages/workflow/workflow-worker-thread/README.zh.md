---
description: "worker-thread 工作流引擎：在宿主事件循環之外執行由模型編寫的編排腳本，供選擇或配置執行隔離的用戶與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-workflow-worker-thread

[English](README.md) | 中文

## 概述

使用 `dsh-workflow-worker-thread` 可讓模型編寫的工作流腳本在宿主事件循環之外運行。每次運行使用獨立的 worker thread，因此同步循環不會阻塞 harness，忽略取消的腳本也可以被終止。本引擎支持已發布組合中的 `workflow` 與 `ralph` 工具，也可與 `dsh-tool-workflow` 配合，在其他組合中公開 `workflow`。這種隔離可以限制可用性故障，但不是安全邊界；真正不可信的腳本需要獨立進程或容器。

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

當組合需要工作流能力時掛載本引擎：每個編排腳本都在獨立 worker thread 中、宿主事件循環之外運行，已發布組合中的 `workflow` 與 `ralph` 工具都在其上執行。不要把它當作真正不可信腳本的沙箱——惡意代碼需要獨立進程或容器引擎。

### 最小配置

加載本引擎即注冊 `ctx.workflowEngine`；在其上添加 `dsh-tool-workflow` 會把 `workflow` 工具交給模型。每個配置字段都是可選的：

```yaml
- name: '@deepseek-ai/dsh-workflow-worker-thread'
- name: '@deepseek-ai/dsh-tool-workflow'
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `provider` | `spawn` | `agent()` 調用使用的宿主側 subagent 提供方。 |
| `maxConcurrentAgents` | `0` | 并發 `agent()` 上限；`0` 會根據可用 CPU 并行度解析。 |
| `maxTotalAgents` | `1000` | 一次運行最多啟動的 `agent()` 調用總數——失控循環的后備閘。 |
| `maxItemsPerCall` | `4096` | 一次 `parallel()` 或 `pipeline()` 調用接受的條目數。 |
| `syncTimeoutMs` | `5000` | 腳本最初同步片段的 VM 超時時間，單位為毫秒。 |
| `disposeGraceMs` | `5000` | 強制結算與終止 worker 前的期限；同時約束 `dispose()`。 |

負責該引擎的消費方可以為一次運行設置 `WorkflowStartRequest.subagentProvider` 與 `WorkflowStartRequest.maxTotalAgents`——這是引擎級策略，不是腳本鉤子；普通 `workflow` 工具兩者都不設置，單次運行的子 agent 總數上限可以降低、但絕不能提高已配置的上限。生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-workflow-worker-thread)是每個受支持字段的窮盡式真源。

### 運行會得到什么

運行啟動后，腳本正文在 worker 中以頂層 `await` 執行，并可使用鉤子 `agent()`、`parallel()`、`pipeline()`、`phase()` 與 `log()`；`meta` 與 `args` 以普通 JSON 數據到達，絕不作為代碼求值。每次 `agent()` 調用都會在配置的提供方下啟動一個宿主側 subagent，并以運行的父級作為每個子 agent（智能體）的父級。運行以腳本的最終 JSON 值結算；普通子 agent 失敗會把 `agent()` 兌現為 `null`，由腳本處理。

格式錯誤的 meta 塊、無法解析的正文、不可用的提供方路由或高于上限的單次運行上限，都會在 worker 存在之前被同步拒絕，調用方因此看到違規清單并可以修正調用。執行期間，鉤子誤用與超出上限會用致命工作流錯誤終止腳本。取消是有界的：忽略取消的腳本會在 `disposeGraceMs` 后被強制以取消狀態結算，其 worker 被終止。

### 信任預期

腳本的 CPU 工作與同步自旋不會占用宿主事件循環，`worker.terminate()` 為 dispose（資源釋放）提供真實的最終停止手段，worker 以清理后的環境啟動——只注入平臺臨時路徑以及（源碼模式下）`TSX_TSCONFIG_PATH`——因此環境憑據不會通過 `process.env` 跨越邊界。宿主／worker 消息使用結構化克隆數據，并在腳本邊界執行普通 JSON 校驗。

以上都不是安全邊界：有意不注入 timer、文件系統 API 或 Node 全局變量，但逃逸代碼仍可以 worker 的進程權限觸達 Node。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋引擎的隔離設計與運行機制；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

每次運行一個 worker thread，讓行為異常的腳本無法拖垮宿主，并使強制終止成為可能：腳本在 worker 內可逃逸的 `node:vm` 上下文中運行，`agent()` 調用通過帶類型的宿主／worker 協議回到 `ctx.subagents`。vm 上下文塑造腳本的 API 表面；它不是安全沙箱。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`Config` schema、前置校驗、`start()` 接線 |
| [`src/host.ts`](src/host.ts) | 一次運行的宿主側：worker 啟動、子 agent 編排、結算、dispose |
| [`src/worker.ts`](src/worker.ts) | worker 入口：腳本執行、鉤子實現、值物化 |
| [`src/runtime.ts`](src/runtime.ts) | 腳本運行時：鉤子約定、`parallel()` 與 `pipeline()` 組合器 |
| [`src/realm.ts`](src/realm.ts) | 跨 realm 物化：普通 JSON 的接受與拒絕規則 |
| [`src/protocol.ts`](src/protocol.ts) | 帶類型的宿主／worker 消息協議 |
| [`src/meta.ts`](src/meta.ts) | `meta` 形狀校驗與規范化 |
| [`src/session.ts`](src/session.ts) | 子 agent 運行在跨入 worker 前的投影與快照 |
| — | 不發布運行時不變式伴生入口；該進程邊界實現不公開同進程事件關系；worker 協議與構建后 worker 測試對此提供覆蓋。 |

### 運行順序

`start()` 在創建 worker 或發布 `workflow/start` 之前校驗 meta 塊、解析正文、解析提供方路由并解析單次運行的子 agent 總數上限。ready/go 握手可以避免啟動信號取消與 worker 啟動發生競態、導致腳本最初的同步片段被執行；源代碼模式通過 data URL bootstrap 安裝 TypeScript 轉換，構建模式則傳入同級 `lib/worker.cjs` 包。

每次 `agent()` 調用，worker 都會發送 `child-start`；宿主通過 subagent seam 啟動提供方（請求的覆蓋值，或配置的提供方），把子 agent 歸屬于運行的父級，并回報啟動成功或啟動錯誤。提供方選擇應用于該運行的每個子 agent，對腳本不可見。提供方啟動與已發布子 agent 分開跟蹤，因此當取消、worker 死亡或正常結算關閉接納時，待處理啟動會被共享信號中止。

### 值邊界

離開腳本的值會經過 realm 物化；該過程接受普通無損 JSON 數據，拒絕特殊原型、函數、symbol、循環、稀疏數組、非有限數與嵌套 `undefined`。子 agent 結果在從宿主跨入 worker 之前先投影并快照——這是真正近似進程的序列化邊界，刻意區別于同進程工作流事件以不可變方式借用的值。

### 取消與 dispose

`cancel()` 記錄第一個原因、通知 worker 取消、中止所有待處理與已發布子 agent 共享的唯一信號，并啟動 `disposeGraceMs` 定時器；worker 鉤子隨后在下次 await 時拋出 `CANCELLED`。如果運行到期限仍未結算，宿主會將其以取消狀態兌現、為懸空的子 agent 生命周期事件配對，并終止 worker。

`dispose()` 是冪等的：它取消運行、立即啟動宿主驅動的 dispose、在同一寬限期內等待結果與子 agent 完全停穩、無條件終止 worker，并執行最后一次幸存項掃描。每個子 agent 的 dispose 都會記憶化，使 worker RPC、宿主取消、死亡清理與公開 dispose 都匯入同一操作。

### 結果與事件保證

在宿主的認領點，終態結果遵循先到者勝：已接受的外部取消會覆蓋后到的非取消 worker 結果，先認領的結果或 worker 死亡不能被可重入清理回調改寫。worker 錯誤、消息失敗或提前退出會在清理前關閉消息接納，然后以 `error` 兌現；除非取消已接管該運行。

宿主維護已轉發子 agent 啟動的臺賬；優雅退出的 worker 提供對應的結束事件，死亡或強制終止則把缺失的結束事件合成為已取消——每個已轉發的 `workflow/agent-start` 都會且只會配對一次。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當引擎級約定不夠用時閱讀以下頁面。它們從 seam 契約逐步進入面向模型的消費方與設計決策。

- [工作流子系統](../../../docs/subsystems/workflow.zh.md)——本引擎實現的 seam 約定。
- [工作流 seam](../workflow/README.zh.md)——`ctx.workflowEngine` 背后的運行與結果詞匯。
- [workflow 工具](../tool-workflow/README.zh.md)——在本引擎上運行腳本的模型側消費方。
- [組地圖](../README.zh.md)——工作流能力家族及其包。
- [動態工作流 Agent Note](../../../.agents/notes/implemented/feature/2026-07-05-dynamic-workflows.zh.md)——seam 設計及其決策。

-----

<a id="model-experience"></a>
## 模型體驗

### 子 agent 請求

#### 模型看到什么

腳本每次調用 `agent()`，都會把提示詞原樣發送給 subagent 提供方，并附帶可選模型或結構化輸出 schema。每個子 agent 看到該提供方自己的上下文；phase 與 log 敘述只留在觀察器事件中。

#### Token 影響

可能需要為許多獨立子 agent 上下文支付 token，數量受 `maxConcurrentAgents`、`maxTotalAgents` 與 `maxItemsPerCall` 限制；這些上下文絕不會直接加入父級歷史。

#### KV Cache 影響

與父級請求緩存及同級子 agent 相互獨立。每個子 agent 只能在其自身提供方、模型、提示詞與 schema 下復用逐字節相同的前綴；其后續歷史僅追加增長。

### 父級工具結果（間接）

#### 模型看到什么

通過 [`dsh-tool-workflow`](../tool-workflow/README.zh.md)，成功結果只會在該消費方的包裝層中公開實體化的最終 JSON 值與子 agent 數量。本引擎提供穩定錯誤，包括 `workflow script does not parse: <error>`、`invalid meta: <violations>`、`agent() requires a non-empty prompt string`、`agent() could not start a child: <error>` 與 `child agent run failed: <error>`，以及其精確的 `parallel()`、`pipeline()`、`phase()`、選項、schema 與 JSON 邊界校驗消息。中間子 agent 輸出可供腳本使用，但不提供給父模型。

#### Token 影響

本引擎不會直接向父級添加 token。最終結果大小由工具消費方限制，并保留到壓縮（compaction）為止。

#### KV Cache 影響

僅追加；新增可見內容位于可復用請求前綴之后，不會使現有 KV Cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本引擎何時不合適，或何時需要特別的運維注意。它們是當前約束，不是任務積壓。

- **worker 與 vm 不是安全邊界**——模型編寫的代碼可以逃逸 `node:vm` 并取得 worker 的進程權限；不可信代碼部署需要獨立進程或容器引擎。
- **每次運行都要支付一個 worker thread**——沒有池、預熱運行時或跨運行腳本緩存。
- **不注入默認可用的定時器、文件系統或網絡，但逃逸代碼仍可觸達 Node**——缺失的全局變量屬于可移植性 API，而非隔離措施。
- **終止只能報告宿主觀察到的啟動**——`agentsStarted` 不包括因并發限制仍在 worker 側排隊、且在強制終止后無法得知的調用。
- **跨 realm 錯誤在腳本內無法通過 `instanceof Error`**——工作流作者必須根據 `name` 與 `code` 等穩定字段分支。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文：實測產物與尚未決定的探索方向。它明確不具權威性——已交付的行為、限制與既定理由以上文、包代碼與相關 Agent Note 為準。

開放方向：用池化或預熱運行時與跨運行腳本緩存來避免每次運行一個 worker；在同一 seam 背后為不可信腳本提供真正的進程或容器引擎。構建產物 `./worker` 入口以 CommonJS 包形式發布，因為 pkg 的虛擬文件系統（VFS）鉤子要求 CommonJS；源代碼模式通過 data URL bootstrap 安裝 tsx 轉換。

</details>
