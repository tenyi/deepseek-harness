---
description: "面向用戶與維護者的進程外 SDK subagent 后端，用于選擇委派提供方、配置子 Harness 運行時，或排查本地嵌套子 agent（智能體）的運行問題。"
kind: "package-reference"
---

# @deepseek-ai/dsh-subagent-dsh-sdk

[English](README.md) | 中文

## 概述

`dsh-subagent-dsh-sdk` 在全新的 DeepSeek Harness 子進程中運行每個委派任務，子進程擁有自己的 profile、會話、模型路由與工具。父級提供任務與工作目錄，每個子進程使用其已配置的運行時，并與父級對話保持隔離。父級只會收到子進程最終的 assistant 文本或安全錯誤；中間消息與工具流量保留在子進程內。當委派需要完整的 Harness 運行時而不是共享進程內狀態時，選擇此后端，并接受每次運行都要啟動新進程的成本。

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

當委派應以完整 Harness 運行時在獨立進程中運行時，掛載本提供方。常用路徑是顯式的：掛載 seam、掛載本提供方，按需配置 `dshBin`，并選擇子級 `profile` 與有序 `patches`。

### 何時選擇

當子進程必須是完整的 harness 對等體——擁有自己的組合、會話持久化、模型路由與工具——而不是共享父進程的 agent 時，選擇此后端。當子進程必須共享父級組合或遵守父級強制的非路由能力時，請選擇進程內后端：本提供方接受 agent 路由選項，但會拒絕結構化輸出、深度上限、工具過濾或 persona，而不是靜默省略。

提供方聲明 `agentOptions: true`，同時保持 `outputSchema`/`depthLimit`/`toolFilter`/`persona` 為 false，并且 `inheritsParentContext: false`。不可變的 `agentRouteDefaults` 會在模型覆蓋與確切路由預檢前，把配置的 provider／model 基線公開給 `dsh-tool-subagent`；`start()` 則為直接調用方獨立應用同一份配置默認值，包括 `maxTokens`。agent 路由值通過顯式白名單跨越 SDK 協議；子進程仍是另一進程里的全新運行時，唯一從父 agent 本身派生的值是工作區 cwd。基于本提供方的 `dsh-tool-subagent` 部署應設置 `maxDepth: 'provider-managed'`——子 harness 擁有自己的遞歸預算。

### 配置

| 字段 | 默認值 | 含義 |
|---|---|---|
| `providerName` | `dsh-sdk` | `ctx.subagents` 上的注冊表名稱 |
| `dshBin` | SDK 依賴 | 顯式 dsh CLI（命令行界面）模塊，在插件加載時解析并校驗；省略則使用 SDK 依賴 |
| `profile` | `sdk` | 具名子 profile |
| `patches` | `[]` | 每次啟動的有序 profile patch 文件，在插件加載時解析并校驗 |
| `dshHome` | 必填 | 每個嵌套子進程的絕對隔離 Harness home |
| `cwd` | 父會話 cwd | 子進程及其 SDK 會話的工作目錄覆蓋值 |
| `provider` | `deepseek-official` | 寫入子進程 `initialize` 的提供方路由 |
| `model` | `deepseek-v4-flash` | 寫入子進程 `initialize` 的模型 |
| `maxTokens` | 適配器／提供方路由默認值 | 寫入子進程 `initialize` 的單次請求輸出 token 上限 |
| `env` | `{}` | 疊加在已清理憑據的父環境之上的顯式子環境 |
| `shutdownTimeoutMs` | `1000` | dispose（資源釋放）期間協議 `shutdown` 交換的時限 |
| `disposeEofGraceMs` | `6000` | stdin EOF 之后、平臺終止之前的寬限 |
| `disposeGraceMs` | `3000` | 終止后的退出確認寬限 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-subagent-dsh-sdk)是每個受支持字段及其 JSDoc 的窮盡式真源。

請求 `agentOptions` 會分別覆蓋 `provider`、`model` 與 `maxTokens`。`reasoningEffort` 沒有提供方實例默認值：請求省略時保持缺省，由所選子模型解析自身默認值。面向模型的 subagent 工具可在每次調用時選擇提供方／模型／推理強度；`maxTokens` 仍由工具配置或本提供方默認值在部署側控制。

```yaml
- id: subagent-dsh-sdk
  name: '@deepseek-ai/dsh-subagent-dsh-sdk'
  config:
    providerName: dsh-sdk
    profile: sdk
    patches: ['./profiles/research-child.cordis.yml']
    dshHome: !!js dshHomePath('children')
    maxTokens: 49152
    env:
      DEEPSEEK_API_KEY: !!js process.env.DEEPSEEK_API_KEY
- id: tool-subagent
  name: '@deepseek-ai/dsh-tool-subagent'
  config: { provider: dsh-sdk, toolName: subagent, maxDepth: 'provider-managed' }
```

### 你會得到什么

成功的運行會把子進程最終的 assistant 文本（或取消后累積的部分文本）作為結果輸出返回。子進程的模型路由、工具與會話來自子運行時自身——父級提供任務、工作目錄與 `initialize` 路由。子進程最后一個持久化 `turn/end` 會映射進 seam 詞匯：`completed` 與 `max-tokens` 原樣通過，`blocked` 變為 `refusal`，意外終態或缺少終態變為 `error`。`aborted` 結果保持中止；只有子進程側 `disposed` 原因會附加 `child-disposed` 診斷。

### 失敗與恢復

已取消的請求會在路徑解析或 spawn 之前失敗。路由、spawn、握手或發布前取消失敗通常只在子進程被回收后拒絕；如果初始化與清理均失敗，有序安全事實會保留兩項失敗，而不會宣稱已完全停穩。子運行時在發布后失敗時會通過運行本身結算，而不是拒絕；部分輸出與安全診斷保持分離。診斷只公開提供方、`initialize`、`session-run` 或 `shutdown` 階段，以及固定類別。SDK 消息、stderr、路徑、任務內容、環境值、憑據和協議載荷絕不會復制到診斷中。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋后端如何驅動子 Harness 運行時，以及可觀察行為從何而來；完整約定見[使用本包](#use-this-package)。

### 設計理念

- **完整 harness 對等體。** 每個子進程都是獨立進程中的完整 Harness 運行時——擁有自己的組合、會話、模型路由與工具；只有解析后的工作目錄與 `initialize` 路由從父級跨越。
- **每次運行一個運行時。** 每次運行都 spawn 全新運行時進程；沒有進程池。
- **JSON-RPC 協議格式（wire format）是序列化邊界。** 同進程 subagent 值不會為防御目的克隆；協議才是校驗不可信輸入的地方。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：config schema、提供方注冊 |
| [`src/run.ts`](src/run.ts) | SDK 運行生命周期、答案提取與停止原因映射 |

### 運行流程

一次啟動會在 spawn 前解析子進程工作目錄與一條進程級 SDK 路由。`request.agentOptions` 中每個已聲明字段（`provider`、`model`、`reasoningEffort` 或 `maxTokens`）都會覆蓋對應的提供方實例默認值；省略時保留已配置的提供方／模型與可選上限，而推理強度只有在請求提供時才會出現。隨后，提供方通過 SDK 客戶端 spawn 運行時，并在履行前完成 `initialize` 握手，其中包括確切模型與推理強度校驗。路由、spawn、握手或發布前取消失敗時，只會在子進程被回收后拒絕；工作目錄解析失敗則會在尚未 spawn 任何內容時拒絕。發布后，提供方擁有一段 SDK 活動，并從子會話事件中讀取答案：最后一條完整且非空的 `assistant/message`（記錄 usage 的空內容消息會被跳過）；若沒有這類消息，則取累積的 `text-delta` 流。dispose 是冪等的：先在本地把結果確定為 `aborted`，發出有界的協議 `shutdown` 請求，再經 stdin EOF → SIGTERM → SIGKILL 升級到實際退出。

### 停止原因映射

子進程最后一個 `turn/end` 的原因會映射進共享的停止原因詞匯，實現見 [`src/run.ts`](src/run.ts)。

### 進程邊界

子進程環境以子進程 seam 中已清除憑據的父環境為基礎，并在清除之后合并顯式 `config.env` 值。子進程由 SDK 客戶端 spawn，而不是經由 `ctx.subprocess`——這是 SDK 托管傳輸的文檔化例外——因此本后端會自行執行環境清理。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從本后端逐步進入它接入的 seam 與它驅動的 SDK。

- [Subagent 子系統](../../../docs/subsystems/subagent.zh.md)——服務約定、提供方約定與終態結果語義。
- [dsh-subagent seam](../subagent/README.zh.md)——本提供方注冊于其上的注冊表與啟動 API。
- [ACP subagent 后端](../subagent-acp/README.zh.md)——經 Agent Client Protocol 的兄弟進程外提供方。
- [TypeScript SDK 客戶端](../../sdk/client/README.zh.md)——本后端用以驅動子進程的 stdio JSON-RPC 客戶端。
- [生成配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-subagent-dsh-sdk)——每個受支持配置字段及其源聲明。

-----

<a id="model-experience"></a>
## 模型體驗

### 子 agent 請求

#### 模型看到什么

子運行時的模型會收到作為用戶消息的獨立任務，以及該運行時自身配置的系統提示詞、工具和全新會話。它不會收到父級對話。父級工具調用可以為本次運行選擇子級提供方、模型與推理強度；所選路由和由部署控制的可選輸出上限會固定到這個新子進程。persona、工具過濾、深度強制與結構化輸出仍不受支持，并會被拒絕而不是靜默省略。

#### Token 影響

子運行時會為獨立的完整上下文及其多步驟歷史消耗 token。這些 token 絕不會進入父級上下文。

#### KV Cache 影響

與父級請求緩存相互獨立。每個 SDK 子進程只能復用其自身提供方、模型、組合和歷史均相同時的前綴；除此之外，子 agent 的步驟僅追加增長。

### 父級工具結果（間接）

#### 模型看到什么

經由 `dsh-tool-subagent`，父級只會收到子運行時最終的 assistant 文本（或累積的部分文本），或該消費方給出的精確停止原因錯誤；不會收到中間消息或工具流量。帶診斷的非完成結果會先呈現安全診斷，再單獨呈現保留的部分 assistant 輸出；啟動與 shutdown 錯誤使用同一固定事實，不公開原始 SDK 文本。

#### Token 影響

父級輸入只增加最終結果或錯誤，其大小取決于數據，并保留到壓縮（compaction）為止。本提供方自身不會向父級添加任何 schema。

#### KV Cache 影響

僅追加；新增可見內容位于可復用請求前綴之后，不會使現有 KV Cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本后端何時不合適，或何時需要特別的運維注意。它們是當前包約束，不是通用 SDK 對比或任務積壓。

- **每次運行都使用全新的運行時進程**——不使用進程池；harness 運行時需要啟動完整的插件樹，因此每次運行的 spawn 成本高于 ACP 后端通常使用的子進程。
- **不支持路由之外的啟動時能力**——父級可以選擇子 agent 路由，但無法在子進程內強制執行 `outputSchema`、深度限制、工具過濾或 persona；應改為配置所選子 profile 及其有序 patch。
- **子進程的 transcript（文本記錄）保留在其自身的會話根目錄中**——父級日志只記錄委派工具調用與結果；流式 `session.event` 通道只用于提取輸出，不會橋接到父級日志中。
- **僅支持本地子進程**——解析出的工作目錄是本地路徑；遠程運行時需要獨立的后端。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文：開放問題與尚未決定的探索方向。它明確不具權威性——已交付的行為與限制以上文和包代碼為準。

- **Spawn 成本**——每次運行加載完整插件樹是徹底隔離的代價；池化會改變這一權衡。
- **遠程運行時**——遠程運行時需要獨立的后端與工作區映射。

</details>

**運行時不變式：** 不發布伴生入口。run 生命周期配對由 subagent seam 的不變式檢查；本后端自身的狀態位于子進程中，不在當前上下文的事件流內。
