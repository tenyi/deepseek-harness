---
description: "面向開發者與維護者的 shell 執行器 seam 說明，用于選擇、組合或實現基于 ctx.shell 的命令執行。"
kind: "package-reference"
---

# @deepseek-ai/dsh-shell

[English](README.md) | 中文

## 概述

使用 `ctx.shell` 運行輸出有界的前臺 shell 命令，或啟動立即返回句柄的后臺進程。配置文件可選擇本地或沙箱化的 Bash 或 PowerShell 執行方式，而無需更改調用方。執行前解析每個請求，以顯式確定工作目錄、超時和輸出上限。命令完成、非零退出、超時和調用方中止都會作為結果返回；只有基礎設施故障才會 reject，而模型可見的渲染與沙箱指引由 `bash` 和 `pwsh` 工具負責。

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

當 agent（智能體）或進程內插件需要運行 shell 命令并讀取輸出，或啟動后臺進程并輪詢它時，使用 `ctx.shell`。它是每個 shell 執行器與面向模型的 `bash`/`pwsh` 工具共同依賴的約定，因此基于它編寫的代碼可以運行在任意執行器實現之上。

### 前臺命令

用已解析的 spec 調用 `run` 即可在前臺執行命令。promise 在命令結束時 resolve：非零退出、執行器超時終止或調用方中止終止都是結果，絕不是 rejection。`run` 只在基礎設施失敗時 reject，例如工作目錄不可用或缺少 shell。結果攜帶退出碼或信號、是超時還是中止截斷了運行，以及收集到的 stdout/stderr；流超出預算時還附帶 spill 文件路徑。

```text
const result = await ctx.shell.run(ctx.shell.resolve({ command: 'ls -la' }))
console.log(result.exitCode, result.stdout.text)
```

### 后臺進程

用已解析的 spec 調用 `start` 即可啟動后臺進程；它會立即返回句柄，且不應用任何超時。用 `readOutput()` 增量讀取輸出——連續讀取絕不會重復交付，有損讀取會指向完整流的 spill 文件。用 `kill()` 終止由提供方管理的進程范圍（直接命令結束后返回 `false`），并等待 `done` 完成直接命令結算。job id、所有權、輪詢與通知屬于通用 `ctx.jobs` 運行時，工具層會把句柄注冊進去。

### 請求與已解析 spec

每次執行都從帶可選字段的 `ShellExecRequest` 開始；執行器的 `resolve()` 在任何東西運行之前，把它變成默認值與上限都已顯式填好的 `ShellExecSpec`。這一請求/spec 拆分正是倉庫在包邊界顯式解析的模板：調用方絕不依賴 `run` 或 `start` 內部隱藏的默認值。`resolve()` 從執行器配置填充工作目錄與超時、對每次調用的覆蓋值設上限，并按原樣攜帶可選輸入——`stdin`、普通 `env` 與受信任的 `DSH_*` 快照。

### 選擇并組合一個執行器

seam 本身不是執行器：每個組合只掛載一個提供方，工具即可不加改動地工作。在 POSIX 上，`dsh-bash-local` 以全新的 `bash -c` 進程運行命令，`dsh-bash-sandbox` 則通過沙箱能力限制每條命令；在 Windows 上，對應實現是 `dsh-pwsh-local` 與 `dsh-pwsh-sandbox`。`bash` 與 `pwsh` 工具只在掛載沙箱執行器時公布升權字段。最小的組合只需執行器本身：

```yaml
- id: bash
  name: '@deepseek-ai/dsh-bash-local'
  config:
    cwd: /path/to/workspace
```

### 共享的退出狀態約定

工具結果以機器可讀的退出標記結尾——`[exit code: N]` 或 `[killed by signal: X]`——模型因此總能知道命令如何結束。seam 擁有該標記格式，以及把渲染結果拆回輸出正文與結構化退出狀態的 `parseExitStatus` 輔助函數，使 `bash` 與 `pwsh` 兩個工具永遠不會在此漂移。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋 seam 的設計并指出實現它們的代碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

本包是標準能力 seam 中的一個角色：命名執行器約定的 Service Definition，Service Provider 與 Consumer 各自拆分，使每個角色都能獨立演進（見[能力 seam 筆記](../../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.zh.md)）。兩項決策錨定了該約定：

- **邊界處的顯式解析。** `resolve(request)` 是應用默認值與上限的唯一位置；`run` 與 `start` 只接受已解析的 spec，絕不再次默認化，因此實現內部不會藏有隱藏的兜底值。
- **無任務語義的后臺句柄。** `start` 返回不帶 id 或所有者的 `ShellProcess`；job 身份、所有權與生命周期屬于通用 `ctx.jobs` 運行時，使執行器與會話保持獨立。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：抽象 `ShellExecutor` 服務與共享設置命名空間 |
| [`src/types.ts`](src/types.ts) | 請求/spec 詞匯、`ShellRunResult`、`ShellProcess` 與沙箱事實 |
| [`src/render.ts`](src/render.ts) | `parseExitStatus`：shell 工具共享的退出狀態標記約定 |
| — | 不發布運行時不變式伴生入口；該無狀態 Service Definition 負責請求／結果類型，執行器與策略負責觀察。 |

### 設置命名空間

`SHELL_SETTINGS_NAMESPACE` 由此處導出而非由某個提供方導出，因為它命名的是能力而不是實現：一個宿主只組裝一個 `ctx.shell` 提供方，因此各提供方共享同一個命名空間而永不沖突，在平臺間攜帶的設置文檔也能在兩邊繼續解析。

### 后臺生命周期與歸屬

后臺進程屬于 subprocess 服務而非執行器：它能在僅重載執行器后存活，并在組合拆解時被終止并 join。實現必須遵守 seam 的語義——`run` 只在基礎設施失敗時 reject；`start` 立即返回且不設超時，其 `done` 絕不 reject（subprocess provider rejection 以 `killed` 結算，并把不聲明階段的錯誤寫入 stderr）；`readOutput` 是消費式的，有損讀取會報告 spill 文件。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當 seam 約定不夠用時閱讀以下頁面。它們從共享子系統參考逐步進入具體執行器與面向模型的工具。

- [Bash 執行器子系統](../../../docs/subsystems/shell.zh.md) —— 請求/spec 詞匯、結果與完整的服務約定。
- [bash-local](../bash-local/README.zh.md) —— 默認 POSIX 執行器：全新的 `bash -c` 進程、預算與 deadline。
- [bash-sandbox](../bash-sandbox/README.zh.md) —— 沙箱執行器：沙箱模式、拒絕與升權。
- [tool-bash](../tool-bash/README.zh.md) —— 基于該 seam 的面向模型 `bash` 工具。
- [能力 seam 筆記](../../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.zh.md) —— 本 seam 遵循的 Service Definition / Provider / Consumer 拆分。

-----

<a id="model-experience"></a>
## 模型體驗

通過 `dsh-tool-bash` 間接影響；該工具會將執行器輸出與沙箱事實轉為指引和保留的工具結果 token。

#### KV Cache 影響

不會直接導致 KV Cache 失效；請求前綴的任何變更由具名消費方負責。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明該 seam 不提供什么。它們是當前包約束，不是路線圖。

- **沒有交互式輸入詞匯**——`stdin` 只在 spawn 時寫入一次并關閉；seam 沒有向運行中任務繼續輸入的通道，也沒有 PTY 會話概念。
- **前臺超時始終由執行器負責**——seam 上由調用方負責 deadline 的模式已由[工具調用超時策略筆記](../../../.agents/notes/implemented/architecture/2026-07-07-tool-call-timeout-policy.zh.md)明確延期。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

None.

</details>
