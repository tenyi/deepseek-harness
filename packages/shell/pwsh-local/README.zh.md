---
description: "面向部署方與維護者的本地 PowerShell 執行器說明，用于選擇、配置或排查基于 shell seam 的非隔離 PowerShell 命令執行。"
kind: "package-reference"
---

# @deepseek-ai/dsh-pwsh-local

[English](README.md) | 中文

## 概述

`dsh-pwsh-local` 是 PowerShell 執行器：每條命令都以全新的非交互 `pwsh -Command` 進程運行，不加載 profile 文件，因此調用之間不會殘留任何 shell 狀態。它逐調用鏡像 `dsh-bash-local` 的語義，并額外負責 PowerShell 層事項：可執行文件解析、UTF-8 輸出固定與面向模型的終端環境。命令以 harness 進程自身的權限運行——本執行器不做任何隔離；需要沙箱能力時請組合 `dsh-pwsh-sandbox`。掛載后，面向模型的 `pwsh` 工具會與它對接。

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

當組合需要執行 PowerShell 命令——通常是在 Windows 上——且不需要隔離時，掛載此執行器。它注冊為 `ctx.shell`，面向模型的 `pwsh` 工具會立即基于它工作：agent（智能體）調用工具，命令即以全新 `pwsh -Command` 進程按下面的預算運行。

### 何時選擇

它是 `dsh-bash-local` 的 Windows 對應實現：當 `pwsh` 是平臺 shell 時選擇它，組合即可把 POSIX 行換成 pwsh 行并保持相同的語義。執行器從顯式 `pwshPath`、常見的 Windows 安裝位置、PATH 條目，或作為最后手段的 Windows PowerShell 5.1 解析 `pwsh` 可執行文件。非隔離執行時它就是默認選擇；需要沙箱能力時組合 `dsh-pwsh-sandbox`。

### 最小配置

按你需要的預算加載執行器；每個字段都有默認值，因此最小的組合就是單獨一個插件條目。當組合了設置提供方時，用戶段會疊加在該條目之上，預算無需重載即可在運行時變更（見[運行時調整預算](#adjusting-budgets-at-runtime)）。

```yaml
- id: bash
  name: '@deepseek-ai/dsh-pwsh-local'
  config:
    cwd: C:\path\to\workspace
    timeoutMs: 120000
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `cwd` | `process.cwd()` | 命令的默認工作目錄 |
| `timeoutMs` | `120,000` | 默認前臺超時，單位為毫秒 |
| `maxTimeoutMs` | `600,000` | 每次調用超時覆蓋值的上限 |
| `maxOutputBytes` | `64,000` | 每流內存輸出上限；溢出后 spill 到臨時文件 |
| `maxSpillBytes` | `67,108,864` | 每流完整輸出的 spill 上限 |
| `graceMs` | `3,000` | 終止升級與退出后管道排空的寬限時間 |
| `pwshPath` | 自動解析 | 顯式 pwsh 可執行文件；否則依次探測常見位置，再查 PATH |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-pwsh-local)是每個受支持字段及其 JSDoc 的窮盡式真源。

### 運行命令

用 `run` 運行命令并從結果讀取輸出；非零退出、超時或取消都會返回描述性結果，只有基礎設施失敗才會導致調用被拒絕。命令字符串作為單個參數傳給 `-Command`：由 PowerShell 自己解析文本，不存在中間 shell，因此沒有需要轉義的 shell 引號層，原生 Win32 路徑也原樣通過。每條命令都先固定 UTF-8 輸出，因此即使在 Windows PowerShell 5.1 兜底上，非 ASCII 輸出也不會亂碼。環境默認面向模型：`NO_COLOR=1 PAGER=cat GIT_PAGER=cat`（沒有 `TERM=dumb`——那是 POSIX 概念），調用方顯式提供的條目仍然優先。

```text
const result = await ctx.shell.run(ctx.shell.resolve({ command: 'Get-ChildItem' }))
if (result.timedOut) console.log('timed out after', result.timeoutMs)
```

### 后臺進程

調用 `start` 即可在后臺運行命令；它立即返回句柄，且不應用任何超時。`readOutput()` 把流增量合并為一次消費式讀取，并在 `[stderr]` 分段下標記 stderr；`kill()` 終止由提供方管理的 range；`done` 在 direct command 關閉時結算且絕不 reject。job id、所有權、輪詢與通知屬于通用 `ctx.jobs` 運行時，工具層會把句柄注冊進去。

<a id="adjusting-budgets-at-runtime"></a>
### 運行時調整預算

當組合了設置提供方時，本執行器注冊該能力共享的 `shell` 設置命名空間——與 POSIX 家族共用同一個，因為一個宿主只組裝一個 `ctx.shell` 提供方——因此 `settings.yaml` 中的用戶段會疊加在組合條目之上，下一條命令即按新預算運行。schema 無法判定的值——正有限數字與 `graceMs` 的定時器上界——會在寫入時被拒絕，運行中的執行器保持它最后一份可用的段。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋執行器的設計并指出實現它們的代碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計概念

本執行器是基于 subprocess 能力的 `ctx.shell` seam 的 PowerShell Service Provider：它負責所有 pwsh 層職責——可執行文件解析、命令默認化與上限、deadline 融合與原因分類、UTF-8 輸出固定、面向模型的終端環境，以及后臺讀取合并——而 managed-range 機制（有界 spill 輸出、憑據清除、終止升級、完全停穩與 dispose（資源釋放））屬于 subprocess 服務。每次調用都 spawn 全新的非交互 `pwsh -Command`，并帶 `-NoLogo -NoProfile -NonInteractive`，因此命令是確定性的，profile 狀態絕不會在調用之間泄漏。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`PwshLocalExecutor`、`Config`、設置接線、argv seam |
| [`src/resolve.ts`](src/resolve.ts) | 純函數 `resolvePwshPath`/`candidatePwshPaths` 可執行文件解析 |
| — | 不發布運行時不變式伴生入口；除所屬 seam 強制執行的約定外，本包不公開獨立的事件序列或可變數據關系。 |
| `tests/` | 已演練的行為：預算、分類、解析、后臺句柄 |

### 主要流程

一次調用分三步：`resolve()` 從配置填充 `workdir`/`timeoutMs`/`stdoutMaxBytes`（并限制每次調用的 `timeoutMs` 覆蓋值）；執行器構建 pwsh argv——`pwsh -NoLogo -NoProfile -NonInteractive -Command <編碼 preamble + 命令>`——把按配置鉗位的超時與調用方的中止信號融合為一個 deadline，再以顯式字節上限與 `graceMs` 通過 `ctx.subprocess` spawn；結算的結果被分類并投影為 `ShellRunResult`。Windows 把強制終止報告為退出碼 1 且無信號，因此帶信號標記的事實在那里僅限 POSIX；超時/取消分類則與平臺無關。

### 不變式與歸屬

- `graceMs` 預算必須為正有限值且不大于 `MAX_TIMER_DELAY_MS`，這樣 Node 就能用一個定時器表示它；無效值在寫入處被拒絕。
- 環境分層固定：先是終端覆蓋值，然后是調用方的 `env`，最后才是受信任的 `dshEnv` 快照；subprocess 服務獨立清除環境中的憑據與繼承的 `DSH_*` 名稱。
- 可執行文件解析是 `(configured, env, platform)` 的純函數，僅當存儲的 `pwshPath` 與當前可執行文件所依據的值不同時才重新探測文件系統。
- 后臺進程屬于 subprocess 服務：它能在僅重載執行器后存活，并在服務 dispose 時被終止并 join。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當執行器約定不夠用時閱讀以下頁面。它們從 seam 延伸到提供隔離的同類包與 PowerShell 工具。

- [shell seam](../shell/README.zh.md) —— 本提供方實現的執行器約定，包括請求/spec 拆分。
- [bash-local](../bash-local/README.zh.md) —— 本執行器逐調用鏡像的 POSIX 對應實現。
- [pwsh-sandbox](../pwsh-sandbox/README.zh.md) —— 需要沙箱能力時改為組合的隔離執行器。
- [tool-pwsh](../tool-pwsh/README.zh.md) —— 基于本執行器的面向模型 `pwsh` 工具。
- [Bash 執行器子系統](../../../docs/subsystems/shell.zh.md) —— 請求/spec 詞匯、結果與完整的服務約定。

-----

<a id="model-experience"></a>
## 模型體驗

通過 `dsh-tool-pwsh` 間接影響；該工具會渲染本執行器有界的 stdout/stderr 尾部、后臺進程增量（經通用任務運行時）、spill 文件路徑與基礎設施失敗。

#### KV Cache 影響

不會直接導致 KV Cache 失效；請求前綴的任何變更由具名消費方負責。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本執行器何時不合適。它們是當前包約束，不是路線圖。

- **自身不提供隔離**——命令以 harness 進程的權限運行；需要隔離的部署組合沙箱執行器或策略。
- **沒有持久 shell 或 PTY**——每次調用都啟動全新的 `pwsh -Command`。
- **命令字符串是 PowerShell 文本**——`-Command` 域沒有 shell 引號層，但面向模型的命令由 PowerShell 自己解析，因此 PowerShell 語法錯誤是命令失敗，而非啟動失敗。
- **后臺提供方失敗提示只投遞一次**——`SubprocessHandle.done` 可能在目標開始執行前或后被拒絕，因此執行器會將不指明失敗階段的 `subprocess failed before reporting an outcome: …` 注入且僅注入一個 `readOutput()` 增量；丟棄該增量的讀取方無法恢復它。
- **Windows 終止不報告信號**——被強制終止的進程以退出碼 1、`signal: null` 結算，因此基于信號的狀態分類在 Windows 上不適用；`kill()` 發起的停止仍會直接標記為 `killed`。
- **編碼 preamble 位于命令之前**——PowerShell 要求 `param(...)`、`#requires` 與 `using` 語句位于腳本最頂部，因此以其中一種開頭的命令無法在 UTF-8 輸出 preamble 下運行；`param(...)` 腳本請包進 `& { … }`，`using`/`#requires` 腳本請改從文件運行。
- **Windows PowerShell 5.1 下的非 ASCII stdin 可能被錯誤解碼**——preamble 只固定輸出編碼；`[Console]::InputEncoding` 保持主機默認，因為在重定向 stdin 下設置它會拋出異常；pwsh 7 默認 UTF-8，不受影響。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
