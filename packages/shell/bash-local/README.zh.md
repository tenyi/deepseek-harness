---
description: "面向部署方與維護者的默認 POSIX Bash 執行器說明，用于選擇、配置或排查基于 shell seam 的非隔離命令執行。"
kind: "package-reference"
---

# @deepseek-ai/dsh-bash-local

[English](README.md) | 中文

## 概述

`dsh-bash-local` 是 POSIX 上的默認 Bash 執行器：每條命令都以全新的非登錄 `bash -c` 進程運行，不讀取 rc 文件，因此調用之間不會殘留任何 shell 狀態。它會為每條命令應用已配置的預算——工作目錄、超時、輸出上限——對超時與取消進行分類，并在流溢出時返回有界輸出與 spill 文件恢復。命令以 harness 進程自身的權限運行：本執行器不做任何隔離，需要沙箱能力時請組合 `dsh-bash-sandbox`。掛載后，面向模型的 `bash` 工具會與它對接。

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

當組合需要在 POSIX 上執行 Bash 命令且不需要隔離時，掛載此執行器。它注冊為 `ctx.shell`，面向模型的 `bash` 工具會立即基于它工作：agent（智能體）調用工具，命令即以全新 `bash -c` 進程按下面的預算運行。

### 最小配置

按你需要的預算加載執行器；每個字段都有默認值，因此最小的組合就是單獨一個插件條目。當組合了設置提供方時，用戶段會疊加在該條目之上，預算無需重載即可在運行時變更（見[運行時調整預算](#adjusting-budgets-at-runtime)）。

```yaml
- id: bash
  name: '@deepseek-ai/dsh-bash-local'
  config:
    cwd: /path/to/workspace
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

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-bash-local)是每個受支持字段及其 JSDoc 的窮盡式真源。

### 運行命令

用 `run` 運行命令并從結果讀取輸出。非零退出、超時或取消都會 resolve 為描述性結果——只有基礎設施失敗才 reject。每次調用的 `timeoutMs` 覆蓋值受配置上限約束，`workdir` 未設置時則回退到配置的默認值；受信任的前臺調用方還可以為單次調用提高 stdout 捕獲預算，而 stderr 與后臺運行仍使用 `maxOutputBytes`。環境默認面向模型：`NO_COLOR=1 TERM=dumb PAGER=cat GIT_PAGER=cat` 可防止分頁器與 ANSI 顏色破壞輸出，調用方顯式提供的條目仍然優先。

```text
const result = await ctx.shell.run(ctx.shell.resolve({ command: 'ls -la' }))
if (result.timedOut) console.log('timed out after', result.timeoutMs)
```

### 后臺進程

調用 `start` 即可在后臺運行命令；它立即返回句柄，且不應用任何超時。`readOutput()` 把流增量合并為一次消費式讀取，并在 `[stderr]` 分段下標記 stderr；`kill()` 終止提供方管理的 range；`done` 在直接命令關閉時結算且絕不 reject。job id、所有權、輪詢與通知屬于通用 `ctx.jobs` 運行時，工具層會把句柄注冊進去。

<a id="adjusting-budgets-at-runtime"></a>
### 運行時調整預算

當組合了設置提供方時，本執行器以組合條目為 base 注冊該能力共享的 `shell` 設置命名空間，因此 `settings.yaml` 中的用戶段會疊加其上，下一條命令即按新預算運行。schema 無法判定的值——正有限數字與 `graceMs` 的定時器上界——會在寫入時被拒絕，運行中的執行器保持它最后一份可用的段；沒有提供方時，運行的就是組合條目。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋執行器的設計并指出實現它們的代碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計概念

本執行器是基于 subprocess 能力的 `ctx.shell` seam 的 Service Provider：它負責所有 bash 層職責——命令默認化與上限、deadline 融合與原因分類、面向模型的終端環境，以及后臺讀取合并——而 managed-range 機制（有界 spill 輸出、憑據清除、終止升級、完全停穩與 dispose（資源釋放））屬于 subprocess 服務。每次調用都 spawn 全新的非登錄 `bash -c`，不讀取 rc 文件，因此命令是確定性的，shell 狀態絕不會在調用之間泄漏。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`LocalBashExecutor`、`Config`、設置段接線 |
| — | 不發布運行時不變式伴生入口；除由所屬 seam 強制執行的約定外，本包不公開獨立的事件序列或可變數據關系。 |
| `tests/executor.spec.ts` | 已演練的行為：預算、分類、后臺句柄、歸屬 |
| `tests/settings.spec.ts` | 設置段疊加在組合條目之上 |

### 主要流程

一次調用分三步：`resolve()` 從配置填充 `workdir`/`timeoutMs`/`stdoutMaxBytes`（并限制每次調用的覆蓋值）；`run` 把按配置鉗位的超時與調用方的中止信號融合為一個 deadline，再以顯式字節上限與 `graceMs` 通過 `ctx.subprocess` spawn `['bash', '-c', command]`；結算的 subprocess 結果被分類——只有執行器自身的超時報告 `timedOut`，上游取消報告 `aborted`，自身因信號終止的命令兩者皆不報告——并投影為帶收集輸出的 `ShellRunResult`。

### 不變式與歸屬

- `graceMs` 預算必須為正有限值且不大于 `MAX_TIMER_DELAY_MS`，這樣 Node 就能用一個定時器表示它；無效值在寫入處被拒絕。
- 環境分層固定：先是終端覆蓋值，然后是調用方的 `env`，最后才是受信任的 `dshEnv` 快照；subprocess 服務獨立清除環境中的憑據與繼承的 `DSH_*` 名稱。
- 后臺進程屬于 subprocess 服務：它能在僅重載執行器后存活，并在服務 dispose 時被終止且等待退出。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當執行器約定不夠用時閱讀以下頁面。這些頁面從 seam 講到提供隔離的同級包及其底層機制。

- [shell seam](../shell/README.zh.md) —— 本提供方實現的執行器約定，包括請求/spec 拆分。
- [bash-sandbox](../bash-sandbox/README.zh.md) —— 需要沙箱能力時，應改為組合此隔離執行器。
- [tool-bash](../tool-bash/README.zh.md) —— 基于本執行器的面向模型 `bash` 工具。
- [Bash 執行器子系統](../../../docs/subsystems/shell.zh.md) —— 請求/spec 詞匯、結果與完整的服務約定。
- [subprocess-local](../../subprocess/subprocess-local/README.zh.md) —— 本執行器背后的 managed-range 機制。

-----

<a id="model-experience"></a>
## 模型體驗

通過 `dsh-tool-bash` 間接影響；該工具會渲染本執行器有界的 stdout/stderr 尾部、后臺進程增量、spill 文件路徑與基礎設施失敗。

#### KV Cache 影響

不會直接導致 KV Cache 失效；請求前綴的任何變更由具名消費方負責。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本執行器何時不合適。它們是當前包約束，不是路線圖。

- **自身不提供隔離**——命令以 harness 進程的權限運行；需要隔離的部署組合 `dsh-bash-sandbox`，每次調用的 allow/deny/ask 策略則屬于工具的 `pre-execute` waterfall（瀑布式事件）。
- **沒有持久 shell 或 PTY**——每次調用都啟動全新的非登錄 `bash -c`；僅持久化 cwd 與交互式終端會話均繼續延期，直到真實工作流需要它們。
- **僅支持 POSIX**——`bash` 二進制已硬編碼，底層服務的進程組語義也是 POSIX 的；不支持 Windows。
- **后臺提供方失敗提示只交付一次**——`SubprocessHandle.done` 可能在目標命令開始執行前或后被拒絕，因此執行器把不聲明失敗階段的 `subprocess failed before reporting an outcome: …` 注入恰好一個 `readOutput()` 增量；丟棄了該增量的讀取方無法再恢復它。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
