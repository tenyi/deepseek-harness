---
description: "面向用戶與維護者的進程外 ACP（Agent Client Protocol）subagent 后端，用于選擇委派提供方、配置子 ACP agent（智能體）命令或排查遠程子 agent 運行問題。"
kind: "package-reference"
---

# @deepseek-ai/dsh-subagent-acp

[English](README.md) | 中文

## 概述

使用本包可將任務委派給運行在全新子進程中的 ACP 兼容 agent；子 agent 擁有獨立的運行時、會話、模型和工具。每次運行只共享選定的工作目錄，通過 ACP 發送任務，并返回子 agent 的最終答案或安全錯誤；中間消息和工具流量不會進入父級對話。權限提示由配置的策略自動應答，無需人工介入。當委派需要進程隔離或需要使用非 Harness ACP agent 時選擇本包；當子 agent 必須共享父級能力時，選擇進程內后端。

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

當組合需要一個支持 Agent Client Protocol、完全隔離且在進程外運行的子 agent 時，掛載本提供方。常用路徑是顯式的：掛載 seam、掛載本提供方，并給出一個啟動 ACP agent 的命令。

### 何時選擇

當子 agent 必須在獨立進程中運行、擁有自己的運行時、模型和工具時選擇此后端——例如來自其他項目的 ACP agent——或者你希望委派完全無法觸及父 harness 時。當子 agent 必須共享父級組合或遵守父級強制執行的能力約束時，請選擇進程內后端：本提供方不聲明任何可選啟動時能力，因此 seam 會拒絕要求 `agentOptions`、結構化輸出、深度上限、工具過濾或 persona 的請求，而不是靜默省略。

### 配置

| 字段 | 默認值 | 含義 |
|---|---|---|
| `providerName` | `acp` | `ctx.subagents` 上的注冊表名稱 |
| `command` | 必填 | 每次運行時 spawn 的可執行文件（子 ACP agent） |
| `args` | `[]` | 命令參數 |
| `cwd` | 父會話 cwd | 子進程及其 ACP 會話的工作目錄覆蓋值 |
| `permission` | `reject` | 自動應答權限請求：拒絕，或選擇第一個 `allow_once` 或 `allow_always` 選項（`allow`） |
| `env` | `{}` | 疊加在已清理憑據的父環境之上的顯式子環境 |
| `disposeEofGraceMs` | `6000` | stdin EOF 之后、平臺終止之前的寬限 |
| `disposeGraceMs` | `3000` | 失敗后觀察結構化進程事實的時限；在 POSIX 上也是 SIGTERM 到 SIGKILL 的寬限 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-subagent-acp)是每個受支持字段及其 JSDoc 的窮盡式真源。

DeepSeek Harness 子進程使用產品啟動器和一個顯式的絕對路徑 `DSH_HOME`。隔離的 home 可防止嵌套運行時發現啟動者個人的 profile 或憑據；通用 ACP 提供方不會把這一要求強加給非 DSH agent。

```yaml
- id: subagent-acp
  name: '@deepseek-ai/dsh-subagent-acp'
  config:
    providerName: acp
    command: dsh
    args: ['--profile', 'acp', '--patch', '/absolute/path/to/acp.patch.yml']
    permission: reject
    env:
      DSH_HOME: /absolute/path/to/isolated-child-home
      DEEPSEEK_API_KEY: !!js process.env.DEEPSEEK_API_KEY
```

### 你會得到什么

成功的運行會把子 agent 最終的流式 assistant 文本作為結果輸出返回。子 agent 的會話、模型與工具來自子進程自身——父級只提供任務與工作目錄。停止原因把 `end_turn` 映射為 `completed`、`max_tokens` 映射為 `max-tokens`、`refusal` 映射為 `refusal`、`cancelled` 映射為 `aborted`，其余值映射為 `error`。已發布運行失敗時，部分 assistant 文本保留在 `output`，安全的結構化詳情則單獨放在 `diagnostic`。

### 失敗與恢復

spawn、初始化或新建會話失敗會在發布前拒絕，通常先證明 managed range 已經完全停穩。如果清理也失敗，拒絕會保留有序、安全的啟動與拆卸事實，但不會聲稱整個 range 已經停穩。非取消錯誤只暴露固定的提供方、階段與類別事實；原始失敗保留在內部 cause 鏈與 Host 診斷中。發布后，提示詞、傳輸或進程提前退出會以攜帶安全診斷的 `error` 結算；本地取消則以不帶失敗詳情的 `aborted` 結算。

### 安全診斷

通用診斷使用固定的一行：`Subagent failure (provider: ACP; stage: <stage>; category: <category>; ...)`。可選的停止原因、退出碼與信號只來自封閉協議或受管進程事實。stderr、異常文本、任務內容、工具輸入、路徑、環境值、憑據與協議載荷絕不會進入診斷；共享結果邊界把診斷限制在 4096 個 UTF-8 字節內。請求過權限且未完成的運行可以增加一行固定的策略、工具種類與決定。成功運行和本地取消不包含該行。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋后端如何經 ACP 驅動子 agent，以及可觀察行為從何而來；完整約定見[使用本包](#use-this-package)。

### 設計理念

- **完全進程隔離。** 每個子 agent 在全新子進程中運行，擁有自己的會話、模型與工具；只有解析后的工作目錄來自父級。
- **每次運行一個進程。** 每次運行都 spawn 新進程；沒有進程池。
- **ACP 協議格式（wire format）是序列化邊界。** 同進程 subagent 值不會為防御目的克隆；協議才是校驗不可信輸入的地方。

### 啟動與所有權流程

一次啟動先解析子 agent 的工作目錄（配置的 `cwd` 覆蓋值，否則取父會話 cwd），經子進程 seam spawn 命令，完成 ACP `initialize` 與 `newSession` 握手，然后才發布運行。兌現意味著遠程會話已就緒、所有權已轉移給調用方。dispose（資源釋放）是冪等的：先關閉 stdin 并按配置的寬限等待協作式完全停穩，再經 SIGTERM 升級到 SIGKILL，并等待整個 managed range 退出。清理失敗會作為有序的安全事實保持可觀察，且絕不聲稱已經完全停穩。

### 停止原因映射

運行結果會把 ACP 終態映射進共享的停止原因詞匯（`completed`、`max-tokens`、`refusal`、`aborted` 或 `error`），實現見 [`src/run.ts`](src/run.ts)。

### 進程邊界

子進程經子進程 seam spawn：先清除疑似憑據的環境變量，再合并顯式 `config.env` 值。stderr 繼承到父級流，dispose 先應用本提供方的 EOF 窗口，再執行共享的逐級終止。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從本后端逐步進入它接入的 seam 與它驅動的協議。

- [Subagent 子系統](../../../docs/subsystems/subagent.zh.md)——服務約定、提供方約定與終態結果語義。
- [dsh-subagent seam](../subagent/README.zh.md)——本提供方注冊于其上的注冊表與啟動 API。
- [Agent Client Protocol 自動化服務器](../../acp/acp/README.zh.md)——本提供方作為客戶端驅動的僅自動化服務器。
- [dsh-subprocess seam](../../subprocess/subprocess/README.zh.md)——每次運行背后的進程 spawn 與清理機制。
- [生成配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-subagent-acp)——每個受支持配置字段及其源聲明。

-----

<a id="model-experience"></a>
## 模型體驗

### 子 agent 請求

#### 模型看到什么

遠程子 agent 通過 ACP 接收獨立任務內容，并使用其自身進程配置的系統提示詞、工具和全新會話。它不接收父級對話。本提供方不聲明可選啟動時能力，因此本地服務會拒絕要求 `agentOptions`、persona、工具過濾、深度強制或結構化輸出的請求，而不是靜默省略。

#### Token 影響

子 agent 為獨立的完整上下文及其多步驟歷史支付 token 成本。這些 token 絕不會進入父級上下文。

#### KV Cache 影響

與父級請求緩存相互獨立。每個 ACP 子 agent 只能在其自身提供方、模型、組合和歷史均相同時復用前綴；其余情況下，子 agent 步驟僅追加增長。

### 父級工具結果（間接）

#### 模型看到什么

通過 `dsh-tool-subagent`，父級只接收子 agent 最終的流式 assistant 文本或該消費方給出的精確停止原因錯誤，不接收中間消息或工具流量。未完成的結果會先呈現安全診斷，再單獨保留部分 assistant 輸出。發布前已經取消的請求會精確變為 `Error: subagent request was aborted before the ACP child started`；其他啟動失敗只包含固定的 `Subagent failure (...)` 行。

#### Token 影響

父級輸入只增加最終結果或錯誤，其內容依賴數據，并保留到壓縮（compaction）為止。本提供方自身不會添加父級 schema。

#### KV Cache 影響

僅追加；新增可見內容位于可復用請求前綴之后，不會使現有 KV Cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本后端何時不合適，或何時需要特別的運維注意。它們是當前包約束，不是通用 ACP 對比或任務積壓。

- **每次運行使用全新進程**——沒有進程池；每次委派都要付出完整的 spawn 與 ACP 握手成本。
- **僅支持本地工作區**——解析后的工作目錄是交給同一臺機器上子進程的本地路徑；遠程工作區映射尚未設計。
- **不支持可選啟動時能力**——本提供方無法在遠程進程內應用 `agentOptions`、`outputSchema`、深度上限、工具過濾器或 persona，因此 seam 會拒絕需要它們的請求。
- **只收集已提交的 `agent_message_chunk` 文本**——自動化服務器把推理（reasoning）、工具活動、計劃和其他 trace 數據保留在子 agent 會話日志中，不通過 ACP 發出。
- **權限提示自動應答**（`permission: allow | reject`）——不會把子 agent 的 `session/request_permission` 呈現給人。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文：開放問題與尚未決定的探索方向。它明確不具權威性——已交付的行為與限制以上文和包代碼為準。

- **進程池**——持久進程復用是可能的未來優化，但會改變每次運行的隔離模型。
- **遠程工作區**——映射遠程 ACP agent 的工作區需要獨立的后端能力。
- **可繼續執行的 ACP 子 agent**——需要持久化遠程會話 id，并為每個子 agent 聲明繼續執行能力。

</details>

**運行時不變式：** 不發布伴生入口。本包沒有獨立事件序列或可變數據關系，相關約定在所屬 seam 強制執行。
