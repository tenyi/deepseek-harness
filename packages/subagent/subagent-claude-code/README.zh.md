---
description: "面向用戶與維護者的一次性 Claude Code subagent 提供方，用于選擇產品后端、安裝 Profile bundle 或配置無人值守的 Claude Code 委派。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-subagent-claude-code

[English](README.md) | 中文

## 概述

當委派任務應在父工作區中以全新、無人值守的 Claude Code 會話運行時，安裝這個 Profile Bundle。每次運行接受一個自包含文本任務，并返回最終答案或安全的失敗診斷；推理、工具通信、stderr、用量信息和工作區差異不會進入父 Session。Claude 原生設置與身份驗證繼續是權威來源，而 Profile 配置選擇模型、環境和 `permissionMode`。針對平臺鎖定的運行時僅在需要時啟動，并且絕不會回退到宿主 `claude` 可執行文件。當隔離和真實 Claude Code 行為比續接或提示更重要時，選擇本包。

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

當委派應以父級工作區中的真實 Claude Code 會話運行時，掛載本提供方。常用路徑是顯式的：把 Bundle 安裝進 Profile，可選地配置提供方行，并通過委派工具行把它暴露給模型。

### 安裝 Bundle

把包安裝進目標 Profile，然后重啟該 Profile。安裝會把鎖定的 Agent SDK 與一個兼容的平臺 CLI 載荷帶入 Profile；聲明的 patch 層只注冊休眠的提供方，不啟動任何 Claude 進程。

```sh
dsh plugin --profile <name> add @deepseek-ai/dsh-subagent-claude-code
dsh plugin --profile <name> remove @deepseek-ai/dsh-subagent-claude-code
dsh --profile <name>
```

移除包后，下一次 Profile 啟動會撤回提供方及其私有運行時閉包。安裝決定 Host 可用性，而不是模型權限：模型只能通過你組合的委派工具行觸達提供方。

### 配置

| 字段 | 默認值 | 含義 |
|---|---|---|
| `providerName` | `claude-code` | `ctx.subagents` 上的非空注冊名稱；每個已掛載實例都需要唯一值 |
| `model` | Claude 原生設置 | 為本提供方實例的每次運行固定的可選非空模型名稱；省略時不發送 SDK 覆蓋 |
| `env` | `{}` | 疊加在已清理憑據的父環境之上的顯式 SDK/CLI 環境 |
| `permissionMode` | `dontAsk` | 為本提供方實例的每次運行固定的原生非交互權限策略 |
| `disposeGraceMs` | `3000` | 共享 managed-range owner 各終止層級之間的寬限 |

| `permissionMode` 值 | 原生行為 |
|---|---|
| `dontAsk` | 不彈出提示，直接拒絕尚未獲授權的操作 |
| `acceptEdits` | 接受文件編輯；其余權限提示由無人值守回調拒絕 |
| `auto` | 由 Claude Code 原生分類器允許或拒絕權限請求 |
| `plan` | 使用原生規劃模式，拒絕執行審批，并把完整計劃作為最終答案返回 |
| `bypassPermissions` | 顯式設置 SDK 的危險確認并跳過權限檢查 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-subagent-claude-code)是每個受支持字段及其 JSDoc 的窮盡式真源。已配置的 `model` 會原樣傳給該提供方實例的每次 query；省略時保留原生模型選擇。具有憑證特征的環境變量會在顯式 `env` 覆蓋生效前被移除，因此供子進程使用的 API 密鑰必須在該配置中顯式提供。提供方省略 SDK 的 `settingSources` 選項，因此 Claude Code 會相對于父會話 cwd 讀取宿主機常規的用戶、項目與本地設置。它不會復制或過濾這些文件、創建或修改登錄狀態、檢查 `PATH`，也不會回退到宿主 `claude` 可執行文件。

### 暴露工具

每個委派工具行指名一個提供方，并需要獨立的 `toolName`，因此模型看到的是靜態工具，而不是動態提供方選擇器。完整 Agent Preset 攜帶對應的默認工具行并設置 `disabled: true`；復制一個 preset 后刪除該字段，即可只向由該副本組裝的 agent（智能體）暴露 `subagent_claude_code`。

```yaml
- id: jobs
  name: '@deepseek-ai/dsh-jobs-local'
- id: tool-jobs
  name: '@deepseek-ai/dsh-tool-jobs'
- id: tool-subagent-claude
  name: '@deepseek-ai/dsh-tool-subagent'
  config:
    provider: claude-code
    toolName: subagent_claude_code
    backgroundMode: one-shot
    maxDepth: provider-managed
```

`one-shot` 策略會讓省略 `run_in_background` 或傳入 `false` 的調用繼續在前臺等待，而顯式傳入 `true` 會返回由父 agent 擁有的 job id，供 `job_output` 或 `job_kill` 使用；base host（基礎宿主）與完整 preset 已提供通用作業注冊表和控制工具。

### 你會得到什么

前臺調用會把嚴格的最終 Claude Code 答案交給模型；運行失敗時則返回帶停止原因與可選安全診斷的錯誤。后臺調用先返回 job id；隨后通用作業控制面會送達完成通知，并通過 `job_output` 公開同一最終答案或失敗狀態。Claude Code 的推理、工具活動、中間消息、stderr 與工作區差異絕不會進入父級會話。

### 失敗與恢復

省略 optional dependencies、當前平臺不受支持或所選載荷缺失的安裝會讓提供方保持休眠，并在第一次委派時于 SDK 啟動邊界報告安全的 `query-start` / `unknown` 失敗事實；不存在宿主 CLI 回退。原始產品錯誤只保留在內部 cause 鏈與提供方 Host 日志中。被取消的運行以 `aborted` 結算。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋提供方如何驅動真實 Claude Code CLI，以及可觀察行為從何而來；完整約定見[使用本包](#use-this-package)。

### 設計理念

- **每次運行一個全新 query。** 每次運行都擁有獨立的 SDK query、取消控制器、CLI 進程與不持久化的產品會話；沒有續接、恢復或池化。
- **原生設置是權威。** 提供方故意省略 SDK 的 `settingSources` 選項，因此 Claude Code 讀取宿主機常規的用戶、項目與本地設置；可選 `model` 與必需的 `permissionMode` 是僅有的 query 級覆蓋。
- **刻意無人值守。** `AskUserQuestion` 被禁用，除 bypass 模式外權限提示都會被拒絕，因此 query 絕不會等待用戶界面。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：配置 schema、提供方注冊 |
| [`src/run.ts`](src/run.ts) | SDK query 生命周期、結果接受與權限處理 |
| [`src/process.ts`](src/process.ts) | dispose（資源釋放）時的 managed-range 逐級終止 |
| [`cordis.patch.yml`](cordis.patch.yml) | 注冊休眠提供方的 Profile patch 層 |

### 運行流程

一次啟動只接受非空的文本塊序列，并根據父會話確定子級 cwd。它創建私有 `AbortController`，用精確拼接的任務調用官方 SDK `query()`，并僅在 SDK 的 custom-spawn 鉤子已經提供由子進程 seam 管理的活動 CLI 句柄后發布運行。提供方完整迭代消息流，只接受滿足 `subtype: "success"`、`is_error: false` 且 `result` 非空白、隨后迭代器正常結束的 `result` 消息。其余一切結果都映射為帶固定類別的 `error` 診斷，命名生命周期階段與已觀測進程結果——類別集合見 [`src/run.ts`](src/run.ts)。本地取消會在結果競態中勝出并映射為 `aborted`，且不附帶失敗診斷。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從本提供方逐步進入它接入的 seam 與兄弟產品提供方。

- [Subagent 子系統](../../../docs/subsystems/subagent.zh.md)——服務約定、提供方約定與終態結果語義。
- [dsh-subagent seam](../subagent/README.zh.md)——本提供方注冊于其上的注冊表與啟動 API。
- [Codex subagent 提供方](../subagent-codex/README.zh.md)——經官方 app-server 協議的兄弟產品后端。
- [Claude Code 與 Codex 后端](../../../.agents/notes/implemented/feature/2026-08-04-claude-code-and-codex-subagent-backends.zh.md)——產品提供方的設計記錄。
- [生成配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-subagent-claude-code)——每個受支持配置字段及其源聲明。

-----

<a id="model-experience"></a>
## 模型體驗

### 子級請求

#### 模型看到什么

Claude Code 子級會在一個全新的 SDK query 中接收獨立文本任務。它的工作區是父會話 cwd；所選提供方實例會固定已配置的模型、環境與非交互權限模式，而省略的模型及其余產品設置來自 Claude 原生配置。可執行版本來自 Bundle 鎖定的 SDK 平臺載荷。

#### Token 影響

子級需為獨立的 Claude Code 上下文和 query 承擔 token 成本。子級 token 不會進入父級上下文。

#### KV Cache 影響

與父級請求緩存相互獨立。能否復用只取決于 Claude Code 自身的模型、指令、工具、原生設置和全新 query。

### 父級調度與結果（間接）

#### 模型看到什么

通過 `dsh-tool-subagent`，前臺調用會讓父級模型看到符合嚴格成功條件的 Claude Code 最終答案；若結果未完成，錯誤中會包含終止原因和可選的安全診斷。該診斷可以區分粗粒度行動類別、生命周期階段和已觀測的進程結果，而不復制原始產品文本或版本專屬 subtype 名稱。后臺調用會先返回 job id；隨后通用作業控制面會送達完成通知，通過 `job_output` 公開同一最終答案或失敗狀態詳情，并允許 `job_kill` 請求取消。Claude Code 的推理、工具活動、中間消息、stderr、工作區差異、用量信息、產品標識符、工具輸入和原始協議載荷均不會復制到父會話。

#### Token 影響

前臺輸入會增加工具結果中保留的最終答案或錯誤內容。后臺輸入還會包含啟動確認、完成通知，以及 `job_output`、`job_kill` 或后續狀態結果；子任務 token 仍不會進入父級上下文。本提供方自身不添加父級工具 schema。

#### KV Cache 影響

僅追加：前臺會在可復用的父請求前綴后增加一個結果，后臺則會繼續追加 Job 啟動確認、通知以及后續控制或收集結果。后臺調度可能增加一個由通知喚醒的輪次，但這些消息都不會改寫更早的前綴。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本提供方何時不合適，或何時需要特別的運維注意。它們是當前包約束，不是通用 Claude Code 對比或任務積壓。

- **每次運行均新建一個 query 和一個進程**——不支持續接、恢復、池化、進度流或產品會話持久化。
- **靜態選擇實例**——Profile 配置項固定提供方名稱、可選模型與工具綁定；調用無法動態選擇或修改提供方與模型，而且每個公開工具都需要唯一的 `toolName`。
- **宿主設置有意保持權威**——省略 `model` 時由項目與用戶設置選擇模型；原生設置始終保留其余工具和行為，本提供方不提供經過篩選或與宿主環境隔離的生產模式。
- **身份驗證與賬戶狀態仍由原生機制管理**——Bundle 會提供 CLI，但不會創建賬戶、登錄或改寫 Claude 設置；配置與身份驗證失敗會公開其生命周期階段與安全的 `unknown` 回退，而不會增加單獨的公開分類。
- **委派時必須存在 SDK 平臺載荷**——省略 optional dependencies 的安裝、不受支持的平臺以及缺失或損壞的載荷都會在第一次 query 時失敗；不會回退到宿主 CLI。
- **沒有人工交互路徑**——`AskUserQuestion` 被禁用，權限提示會被拒絕，MCP elicitation 會被拒絕，阻塞對話會以拒絕方式失敗而不會掛起。
- **assistant 載荷僅包含最終文本**——失敗運行可以額外公開獨立的安全診斷；推理、中間消息、工具通信、用量信息、stderr 和工作區差異仍只保留在產品內部，通用 Job id、通知與狀態來自共享作業運行時。
- **沒有可選的共享能力**——對于本提供方，共享服務會拒絕 `agentOptions`、輸出 schema、子任務角色設定、工具篩選和 harness 深度強制約束。
- **沒有按實際經過時間觸發的超時或副作用回滾**——長時間運行的工作由調用方取消，且取消前已更改的文件或外部系統不會恢復原狀。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文：開放問題與尚未決定的探索方向。它明確不具權威性——已交付的行為與限制以上文和包代碼為準。

- **載荷體積披露**——當前 darwin-arm64 平臺載荷壓縮后約 92 MB、解包后約 325 MB；這些是披露數字，不是安裝閾值。
- **版本鎖定的協議**——運行時依賴鎖定為 Agent SDK 0.3.263；升級會鎖定新的 SDK 版本，并需要重新運行無密鑰真實產品與 loader 組合證據。

</details>

**運行時不變式：** 不發布伴生入口。生命周期配對屬于共享 subagent 服務，受管范圍的所有權屬于 subprocess 服務。
