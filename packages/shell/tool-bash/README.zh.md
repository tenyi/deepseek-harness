---
description: "面向模型的 bash 工具，供選擇、配置或排查一次性命令執行、后臺任務與沙箱升權的使用者與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-bash

[English](README.md) | 中文

## 概述

`dsh-tool-bash` 讓 agent（智能體）運行一次性 `bash` 命令，并接收 stdout、stderr 與退出標記。每次調用都使用全新 shell，因此 cwd、變量和函數不會保留；`run_in_background` 可啟動長時間運行的工作，agent 能用 `job_output` 檢查、用 `job_kill` 停止。命令會收到受管 `DSH_*` 環境；沙箱拒絕后，可攜帶更寬的 `sandbox_permissions`、一句 `justification` 并經用戶批準重試一次。非零退出會作為結果報告，因此由 agent 決定如何響應；請使用 `dsh-bash-local` 或 `dsh-bash-sandbox` 等執行器，并加載 `dsh-shell-env`。

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

在 agent 需要運行 bash 命令的任何組合中加載本插件：一旦掛載執行器提供方與 `dsh-shell-env` 注冊表，它就注冊 `bash` 工具，并在 `tools`、`shell`、`systemPrompt` 與 `shellEnv` 服務就緒之前保持等待。

### 最小配置

常用路徑是執行器提供方、環境注冊表與本工具；當 agent 需要后臺運行命令時，再添加任務運行時。

```yaml
- name: '@deepseek-ai/dsh-bash-local'
- name: '@deepseek-ai/dsh-shell-env'
- name: '@deepseek-ai/dsh-tool-bash'

# Optional: background jobs
- name: '@deepseek-ai/dsh-jobs-local'
- name: '@deepseek-ai/dsh-tool-jobs'
```

唯一的配置字段用于開關后臺支持。

| 字段 | 默認值 | 含義 |
|---|---|---|
| `enableRunInBackground` | `true` | 暴露 `run_in_background`；為 `false` 時拒絕強制后臺調用 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-bash)是每個受支持字段及其 JSDoc 的窮盡式真源；生成的[工具目錄](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-bash)攜帶完整參數 schema。

### 運行命令

工具執行 `bash -c <command>` 并返回合并后的輸出。命令每次調用都運行在全新 shell 中，因此狀態從不保留——請傳 `workdir` 而不是 `cd`。非零退出以 `[exit code: N]` 報告給 agent 解讀，而不是作為工具錯誤拋出。主動語態的 `description`（5–10 個詞）在 UI 中標注該調用；`timeoutMs` 覆蓋執行器的默認值與上限。超出執行器流上限的輸出會被截斷為尾部，完整輸出保存到 spill 文件并報告其路徑。

### 后臺運行長時間命令

傳入 `run_in_background: true` 會立即返回 job id，不應用超時；命令繼續運行，agent 同時處理其他事情。agent 用 `job_output` 讀取輸出（除非 `wait: true`，否則非阻塞）、用 `job_list` 列出任務、用 `job_kill` 停止任務；完成的任務會在會話內通知擁有它的 agent。后臺支持需要掛載通用任務運行時（`dsh-jobs-local`）及其控制工具（`dsh-tool-jobs`）。

### 沙箱執行與升權

當已掛載的執行器約束命令（例如 `dsh-bash-sandbox`）時，被阻止的文件操作會報告為 `[sandbox: file access denied under <mode> mode]`——這是策略拒絕，不是命令失敗。模型隨后可以在同一輪次中用 `sandbox_permissions`（滿足需要的最窄更寬模式）與一句 `justification` 重試完全相同的命令一次；該重試引發的審批提示就是用戶同意的方式。升權絕不能預先推測：沒有真實拒絕依據的請求，或沒有嚴格寬于當前模式的請求，都會直接失敗且不執行任何操作；被拒絕的升權對該命令即為最終結果。

### 可能出什么問題

沒有執行器提供方的組合永遠不會激活該工具。沒有任務運行時的后臺調用會以 `background jobs unavailable: load @deepseek-ai/dsh-jobs and @deepseek-ai/dsh-tool-jobs` 失敗；沒有沙箱執行器時的 `sandbox_permissions` 會以 `sandbox_permissions is not available in this composition (no sandboxing executor to escalate)` 失敗。`enableRunInBackground: false` 會移除該參數，并在執行時拒絕強制后臺調用。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋工具背后的設計決策，并指出實現它們的代碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

- **shell seam 的模型側消費方。** 本工具是 bash 能力的消費方角色：它注冊 `bash` schema、渲染結果并解析每次調用的策略，進程機制歸執行器 seam 所有。
- **請求只來自命名參數。** 工具從不暴露 `stdin`、`env` 或 `stdoutMaxBytes`；它只用命令／workdir／超時／信號字段加上注冊表收集的 `dshEnv` 構建每個請求，因此模型提供的鍵無法替換受管值。
- **非零退出只報告、不失敗。** 只有基礎設施故障（spawn 錯誤、中止）才會作為工具錯誤暴露；模型解讀退出碼與標記。
- **后臺工作歸任務運行時。** 后臺調用把進程句柄注冊到 `ctx.jobs`；job id、所有權、完成通知與釋放都是運行時的職責，本工具只把 bash 退出與沙箱事實映射為任務輸出。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：工具注冊、提示詞區段、參數校驗、升權、請求組裝 |
| [`src/background.ts`](src/background.ts) | 把已結算的后臺進程映射為通用任務結果詞匯 |
| [`src/render.ts`](src/render.ts) | 模型側結果文本：流、標記、截斷通知 |
| — | 不發布運行時不變式伴生入口；環境注冊表在每次變更和讀取時校驗所有權及收集值，且不發布可供伴生入口交叉核對的獨立快照；執行關系由能力 seam 負責。 |

### 請求解析

工具在 `ctx.shell.resolve()` 運行前解析 workdir：顯式的相對 `workdir` 相對會話 cwd 解析，沙箱策略的規范化 workspace root 優先，使約束與啟動使用同一身份。沙箱策略通過 `ctx.sandboxPolicy` 按調用解析；升權請求在任何執行前經由 `ctx.approval`，若執行器會約束命令卻沒有掛載策略服務，工具在加載時失敗。

### 渲染故事

結果文本為 stdout，然后是帶標記的 `[stderr]` 區段，再是條件標記：截斷通知、沙箱拒絕（組合聲明升權時附帶同輪次升權提示）、超時、信號與退出碼——每個占一行。退出標記同時充當 UI 卡片的退出狀態 pill：`dsh-shell` 共享的 `parseExitStatus` 會從輸出體中消費它，因此回放顯示 pill 而不重復標記。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從 shell 家族逐步進入執行器 seam、任務運行時，以及行為背后的決策筆記。

- [shell 包映射](../README.zh.md)——bash 能力家族及其角色。
- [Bash 執行器子系統](../../../docs/subsystems/shell.zh.md)——請求／spec 詞匯、結果與后臺進程。
- [shell-env](../shell-env/README.zh.md)——每次調用都會收到的受管 `DSH_*` 環境。
- [tool-jobs](../../jobs/tool-jobs/README.zh.md)——后臺運行的 `job_output`、`job_list` 與 `job_kill` 控制。
- [沙箱 Agent Note](../../../.agents/notes/implemented/feature/2026-07-06-sandbox.zh.md)——升權與模式切換的理由。
- [生成的工具目錄](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-bash)——`bash` 參數 schema 的確切內容。
- [生成的配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-bash)——每個受支持配置字段及其源聲明。

-----

<a id="model-experience"></a>
## 模型體驗

### 系統提示詞

#### 模型看到什么

以下 bash 指引會以第一方順序值 1000 出現在該插件注冊作用域內的每次請求中。策略歸屬方通過其緩存安全的運行時上下文貢獻當前沙箱狀態，而不修改本區段。按作用域實施的工具限制可以隱藏 schema，卻不會移除這個獨立注冊的區段。

##### Bash 指引

```markdown
Check the [exit code: N] marker on every bash result; investigate failures before moving on.
```

#### Token 影響

插件激活期間，每次請求都會產生少量固定的輸入 token 開銷，不隨沙箱模式或模式切換而變。

#### KV Cache 影響

只要注冊作用域與提示詞文本不變，前綴就保持穩定。插件激活或釋放可能使從該提示詞區段起的復用失效；沙箱模式切換不會。

### 工具 schema

#### 模型看到什么

模型會看到生成的 [`bash` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-bash)。僅當本生產方啟用 `run_in_background` 時，該字段才會出現；僅當已掛載執行器聲明支持沙箱時，`sandbox_permissions` 和 `justification` 才會出現。按 agent 作用域限制工具可以移除該 agent 的定義。

#### Token 影響

工具可見的每個請求都會產生固定 schema 開銷；沙箱支持會增加升權字段及其條件說明段落。

#### KV Cache 影響

只要可見性、后臺支持與執行器沙箱能力不變，前綴就保持穩定。限制、配置或執行器發生變化時，可能從首個變化的工具定義開始使復用失效。

### 前臺結果

#### 模型看到什么

renderer 輸出依數據而定的 stdout 尾部，再輸出可選的 `[stderr]` 和 stderr 尾部。沒有輸出時，它精確輸出 `(no output)`。條件行精確為 `[output truncated; full output: <path-or-(unavailable)>]`、`[sandbox: file access denied under <mode> mode]`、`[timed out after <timeoutMs>ms]`、`[killed by signal: <signal>]` 與 `[exit code: <exitCode>]`；沙箱升權與 runner 故障行原文列于 [`dsh-bash-sandbox`](../bash-sandbox/README.zh.md)。

#### Token 影響

調用前的結果 token 為零。每條流的輸出有界，每個已輸出行則會保留在歷史中，直至壓縮（compaction）。

#### KV Cache 影響

僅追加；新可見內容位于可復用請求前綴之后，不會使現有 KV-cache 條目失效。

### 后臺任務上下文與結果

#### 模型看到什么

啟動會精確返回 `started background job <jobId>`。本生產方會向通用任務運行時提供增量進程輸出、可選的 `[some output was dropped from memory; full output: <paths-or-(unavailable)>]`、沙箱事實，以及 `exit code: <exitCode>` 或 `signal: <signal>` 等終止詳情。[`dsh-tool-jobs`](../../jobs/tool-jobs/README.zh.md) 負責模型可見的狀態行、完成通知、列表和取消響應。

#### Token 影響

啟動確認很短且會保留；收集到的輸出依數據而定，并受執行器流緩沖區限制。消費式讀取不會重復先前輸出。

#### KV Cache 影響

僅追加；新可見內容位于可復用請求前綴之后，不會使現有 KV-cache 條目失效。

### 工具錯誤

#### 模型看到什么

驗證與策略失敗統一為 `Error: <message>`。本包的穩定消息包括 `invalid command: expected a non-empty string`、`invalid description: expected a non-empty string`、`invalid timeoutMs: expected a positive number, got <value>`、升權配對失敗、`run_in_background is disabled for this deployment (enableRunInBackground: false)`、`background jobs unavailable: load @deepseek-ai/dsh-jobs and @deepseek-ai/dsh-tool-jobs`、`sandbox_permissions is not available in this composition (no sandboxing executor to escalate)`、審批不可用／拒絕／取消變體，以及 `tool call aborted`。

#### Token 影響

只有失敗調用會增加這些保留 token；升權被拒時命令不會運行，因此不會添加命令輸出。

#### KV Cache 影響

僅追加；新可見內容位于可復用請求前綴之后，不會使現有 KV-cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明工具何時不合適或需要特別小心。它們是當前包約束，不是任務積壓。

- **回放的退出 pill 從結果文本解析**——輸出最后一行恰好是 `[exit code: N]` / `[killed by signal: …]` 時，會話回放會顯示錯誤的 pill 并從卡片正文丟失該行，因為解析把它當作要消費的標記；這是僅影響顯示的已知殘留。
- **`bash` 工具不參與 `timeout-policy` 預算**——它保留執行器自有的 `BASH_TIMEOUT` 路徑，見[工具調用超時策略 Agent Note](../../../.agents/notes/implemented/architecture/2026-07-07-tool-call-timeout-policy.zh.md)。
- **后臺進程沒有執行器超時**——工作不再需要時，調用方必須使用 `job_kill`，或依賴持有者／服務的釋放。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
