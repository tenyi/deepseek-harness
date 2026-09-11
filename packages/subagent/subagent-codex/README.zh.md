---
description: "面向用戶與維護者的一次性 Codex subagent 提供方，用于選擇產品后端、安裝 Profile bundle 或配置無人值守的 Codex 委派。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-subagent-codex

[English](README.md) | 中文

## 概述

當委派工作需要在父會話工作區中的真實無人值守 Codex 會話內運行時，把 `@deepseek-ai/dsh-subagent-codex` 安裝進 Profile。每次委派都會為一個自包含文本任務使用全新且隔離的 Codex 線程，并且只返回其最終答案或安全失敗診斷。原生 Codex 配置和身份驗證繼續作為權威來源，而 `permissionMode` 選擇非交互式審批和沙箱行為。Bundle 會提供兼容的原生 Codex 載荷，但只有配置委派工具后才會向模型公開相應能力。

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

當委派應以父級工作區中的真實 Codex 會話運行時，掛載本提供方。常用路徑是顯式的：把 Bundle 安裝進 Profile，可選地配置提供方行，并通過委派工具行把它暴露給模型。

### 安裝 Bundle

把包安裝進目標 Profile，然后重啟該 Profile。安裝會把官方 wrapper 與一個兼容的原生平臺載荷帶入 Profile；聲明的 patch 層只注冊休眠的提供方，不啟動任何 Codex 進程。

```sh
dsh plugin --profile <name> add @deepseek-ai/dsh-subagent-codex
dsh plugin --profile <name> remove @deepseek-ai/dsh-subagent-codex
dsh --profile <name>
```

移除包后，下一次 Profile 啟動會撤回提供方及其私有運行時閉包。安裝決定 Host 可用性，而不是模型權限：模型只能通過你組合的委派工具行觸達提供方。

### 配置

| 字段 | 默認值 | 含義 |
|---|---|---|
| `providerName` | `codex` | `ctx.subagents` 上的非空注冊名稱；每個已掛載實例都需要唯一值 |
| `model` | Codex 原生設置 | 為本提供方實例的每個線程固定的可選非空模型名稱；省略時不發送 app-server 覆蓋 |
| `env` | `{}` | 疊加在已清理憑據的父環境之上的顯式子進程環境 |
| `permissionMode` | `never` | 為本提供方實例的每個線程固定的原生非交互審批與沙箱模式 |
| `disposeGraceMs` | `3000` | 共享 managed-range owner 各終止層級之間的寬限 |

| `permissionMode` 值 | `thread/start` 字段 | 原生行為 |
|---|---|---|
| `never` | `approvalPolicy: never`；省略 sandbox | 永不請求審批；在原生 sandbox 下發生的執行失敗會返回給模型 |
| `approve-for-me` | `approvalPolicy: on-request`、`approvalsReviewer: auto_review`、`sandbox: workspace-write` | 由 Codex 自動評審權限請求，不等待人工 |
| `dangerously-bypass-approvals-and-sandbox` | `approvalPolicy: never`、`sandbox: danger-full-access` | 跳過審批與 sandbox；必須顯式選擇該值 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-subagent-codex)是每個受支持字段及其 JSDoc 的窮盡式真源。已配置的 `model` 會原樣傳給每個臨時 `thread/start`；省略時保留原生模型選擇。提供方不會發現模型、改寫別名、選擇 `modelProvider` 或 `serviceTier`，也不會設置 fallback。具有憑證特征的環境變量會在顯式 `env` 覆蓋生效前被移除，因此供子進程使用的 API 密鑰必須在該配置中顯式提供。

### 暴露工具

每個委派工具行指名一個提供方，并需要獨立的 `toolName`，因此模型看到的是靜態工具，而不是動態提供方選擇器。完整 Agent Preset 攜帶對應的默認工具行并設置 `disabled: true`；復制一個 preset 后刪除該字段，即可只向由該副本組裝的 agent 暴露 `subagent_codex`。

```yaml
- id: jobs
  name: '@deepseek-ai/dsh-jobs-local'
- id: tool-jobs
  name: '@deepseek-ai/dsh-tool-jobs'
- id: tool-subagent-codex
  name: '@deepseek-ai/dsh-tool-subagent'
  config:
    provider: codex
    toolName: subagent_codex
    backgroundMode: one-shot
    maxDepth: provider-managed
```

`one-shot` 策略會讓省略 `run_in_background` 或傳入 `false` 的調用繼續在前臺等待，而顯式傳入 `true` 會返回由父 agent 擁有的 Job id，供 `job_output` 或 `job_kill` 使用；base host（基礎宿主）與完整 preset 已提供通用作業注冊表和控制工具。

### 你會得到什么

前臺調用會把選定的最終 Codex 答案交給模型；運行失敗時則返回帶停止原因與可選安全診斷的錯誤。后臺調用先返回 Job id；隨后通用作業控制面會送達完成通知，并通過 `job_output` 公開同一最終答案或失敗狀態。Codex 的過程說明、推理、工具活動、原始 stderr 與工作區差異絕不會進入父級會話。

### 失敗與恢復

省略 optional dependencies、當前平臺不受支持或所選載荷缺失的安裝會讓提供方保持休眠，并在第一次委派時于 `initialize` 階段以安全 `unknown` 類別和任何已觀測進程結果失敗；不存在宿主 CLI 回退。原始 wrapper 文本只保留在 Host stderr。被取消的運行以 `aborted` 結算。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋提供方如何驅動真實 Codex app-server，以及可觀察行為從何而來；完整約定見[使用本包](#use-this-package)。

### 設計理念

- **每次運行一個全新進程、線程與輪次。** 每次運行都會 spawn 全新 app-server、創建一個臨時線程并恰好執行一個輪次；沒有續接、恢復或池化。
- **原生配置是權威。** Codex 配置與身份驗證經父級 cwd、`HOME` 與 `CODEX_HOME` 保持原生；提供方只覆蓋可選模型以及線程的 approval、reviewer 與 sandbox 字段。
- **刻意無人值守。** 審批、用戶輸入與 MCP 請求都會在無人參與的情況下被應答或拒絕；未知服務器請求會使運行失敗。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：config schema、提供方注冊 |
| [`src/run.ts`](src/run.ts) | 運行生命周期、輪次執行、結果選擇與診斷 |
| [`src/wire.ts`](src/wire.ts) | 最小的 app-server JSON-RPC 協議實現 |
| [`cordis.patch.yml`](cordis.patch.yml) | 注冊休眠提供方的 Profile patch 層 |

### 運行流程

一次啟動只接受非空的文本塊序列，并根據父會話確定子級 cwd。它經子進程 seam spawn 固定命令，完成 `initialize` → `initialized` 握手，把 Profile 選擇的模式與可選模型映射為官方 `thread/start` 字段并與 `{ cwd, ephemeral: true }` 一起發送，且僅在 Codex 返回有效的臨時線程后發布運行。已發布的結果恰好啟動一個輪次，只接受與此次運行的線程和輪次匹配的通知，并等待權威的 `turn/completed` 終態。以最后一條 `phase: "final_answer"` 的 `agentMessage` 為準；若 Codex 沒有發出明確的最終階段，則以最后一條 `phase: null` 的消息作為兼容性回退。成功完成的輪次若沒有非空白答案，結果也會判為錯誤。失敗輪次使用粗粒度類別 `limit`、`access-policy`、`service`、`transport`、`product-error`、`invalid-result` 或 `unknown`；app-server 提前退出使用 `process`，適用的連接與 stream 失敗保留數值 `httpStatusCode`。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從本提供方逐步進入它接入的 seam 與兄弟產品提供方。

- [Subagent 子系統](../../../docs/subsystems/subagent.zh.md)——服務約定、提供方約定與終態結果語義。
- [dsh-subagent seam](../subagent/README.zh.md)——本提供方注冊于其上的注冊表與啟動 API。
- [Claude Code subagent 提供方](../subagent-claude-code/README.zh.md)——經官方 Agent SDK 的兄弟產品后端。
- [Claude Code 與 Codex 后端](../../../.agents/notes/implemented/feature/2026-08-04-claude-code-and-codex-subagent-backends.zh.md)——產品提供方的設計記錄。
- [生成配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-subagent-codex)——每個受支持配置字段及其源聲明。

-----

<a id="model-experience"></a>
## 模型體驗

### 子級請求

#### 模型看到什么

Codex 子級會在一個全新的臨時線程中，以單個輪次接收這些獨立文本塊。它的工作區是父會話 cwd；所選提供方實例會固定已配置的模型、環境、非交互審批策略與沙箱模式，而省略的模型及其余產品設置來自 Codex 原生配置。可執行版本來自 Bundle 鎖定的平臺載荷。

#### Token 影響

子級需為獨立的 Codex 上下文和輪次承擔 token 成本。子級 token 不會進入父級上下文。

#### KV Cache 影響

與父級請求緩存相互獨立。能否復用只取決于 Codex 自身的提供方、模型、指令、工具和臨時線程請求。

### 父級調度與結果（間接）

#### 模型看到什么

通過 `dsh-tool-subagent`，前臺調用會讓父級模型看到選定的 Codex 最終答案；若結果未完成，錯誤中會包含終止原因和可選的安全診斷。該診斷可以區分粗粒度行動類別、協議階段、適用的數值 HTTP status 和已觀測的進程結果，而不復制產品正文或 stderr。后臺調用會先返回 Job id；隨后通用作業控制面會送達完成通知，通過 `job_output` 公開同一最終答案或失敗狀態詳情，并允許 `job_kill` 請求取消。Codex 的過程說明、推理（reasoning）、工具活動、原始 stderr、工作區差異、用量信息、產品標識符、命令、路徑和協議載荷均不會復制到父會話。

#### Token 影響

前臺輸入會增加工具結果中保留的最終答案或錯誤內容。后臺輸入還會包含啟動確認、完成通知，以及 `job_output`、`job_kill` 或后續狀態結果；子任務 token 仍不會進入父級上下文。本提供方自身不添加父級工具 schema。

#### KV Cache 影響

僅追加：前臺會在可復用的父請求前綴后增加一個結果，后臺則會繼續追加 Job 啟動確認、通知以及后續控制或收集結果。后臺調度可能增加一個由通知喚醒的輪次，但這些消息都不會改寫更早的前綴。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本提供方何時不合適，或何時需要特別的運維注意。它們是當前包約束，不是通用 Codex 對比或任務積壓。

- **每次運行均新建一個進程、一個線程和一個輪次**——不支持續接、恢復、池化、進度流或產品會話持久化。
- **靜態選擇實例**——Profile 配置項固定提供方名稱、可選模型與工具綁定；調用無法動態選擇或修改提供方與模型，而且每個公開工具都需要唯一的 `toolName`。
- **身份驗證與賬戶狀態仍由原生機制管理**——Bundle 會提供 CLI，但不會創建賬戶、登錄、信任項目或改寫 Codex 設置；配置與身份驗證失敗會公開其生命周期階段與安全的 `unknown` 回退，而不會增加單獨的公開分類體系。
- **委派時必須存在原生平臺載荷**——省略 optional dependencies 的安裝、不受支持的平臺以及缺失或損壞的載荷都會在第一次運行時失敗；不會回退到宿主 CLI。
- **兼容性由開發證據鎖定**——若要從已驗證的 0.153.4 協議基線升級，必須重新生成上游 schema 證據，并重新運行握手、答案選擇、審批、取消、無密鑰真實產品以及帶密鑰的 DeepSeek 隨機數測試。
- **沒有人工審批路徑**——已知的無人值守審批請求會被拒絕，未知服務器請求會以默認拒絕方式使運行失敗；三種 Profile 模式都不會創建 DSH 交互通道或逐次調用 allow 策略。
- **assistant 載荷僅包含最終文本**——失敗運行可以額外公開獨立的安全診斷；推理、過程說明、中間消息、工具通信、用量信息、原始 stderr 和工作區差異不會進入父會話，通用 Job id、通知與狀態來自共享作業運行時。
- **沒有可選的共享能力**——對于本提供方，共享服務會拒絕 `agentOptions`、輸出 schema、子任務角色設定、工具篩選和 harness 深度強制約束。
- **沒有按實際經過時間觸發的超時或副作用回滾**——長時間運行的工作由調用方取消，且取消前已更改的文件或外部系統不會恢復原狀。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文：開放問題與尚未決定的探索方向。它明確不具權威性——已交付的行為與限制以上文和包代碼為準。

- **載荷體積披露**——當前 darwin-arm64 平臺載荷壓縮后約 114 MB、解包后約 282 MB；這些是披露數字，不是安裝閾值。
- **版本鎖定的協議**——運行時依賴鎖定為 `@openai/codex@0.153.4`；升級需要重新生成上游 schema 證據并重新運行帶憑證的隨機數測試。

</details>

**運行時不變式：** 不發布伴生入口。生命周期配對屬于共享 subagent service，受管范圍的所有權屬于 subprocess service。
