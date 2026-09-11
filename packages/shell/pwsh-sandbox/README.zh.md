---
description: "面向部署方與維護者的沙箱 PowerShell 執行器說明，用于選擇、配置或排查受限 PowerShell 命令執行及其拒絕事實。"
kind: "package-reference"
---

# @deepseek-ai/dsh-pwsh-sandbox

[English](README.md) | 中文

## 概述

`dsh-pwsh-sandbox` 是沙箱消費型 PowerShell 執行器：每條命令都以全新的 `pwsh -Command` 進程運行，經 `ctx.sandbox` 能力隔離，并在每個已結算的結果上標記所選模式、強制執行完整度與拒絕事實。在 Windows 上，沙箱 seam 解析到 ACL 受限令牌 runner 鏈；在 Linux 與 macOS 上則使用 bwrap、Landlock 或 Seatbelt。當沒有 runner 能強制執行受限模式時，調用按失敗關閉原則拋結構化 `SANDBOX_UNAVAILABLE` 錯誤，絕不無隔離地運行。它是 `dsh-bash-sandbox` 的 pwsh 孿生，逐調用鏡像。

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

當 PowerShell 命令不得以 harness 進程的完整文件權限運行時，用本執行器替代 `dsh-pwsh-local`。它注冊為 `ctx.shell`，繼承 `dsh-pwsh-local` 的進程機制，并要求一個 `ctx.sandbox` 提供方加上 `ctx.sandboxPolicy`。

### 何時選擇

當部署需要為 PowerShell 命令提供文件級隔離時選擇它，通常是在 Windows 上。隔離實體本身是平臺無關的：沙箱 seam 選擇平臺的 runner——Windows 上是 ACL 受限令牌鏈，其他平臺是 bwrap/Landlock/Seatbelt——而本執行器只負責 pwsh 側。沙箱策略（模式加工作區根目錄）不是本包的配置：它隨每次調用從 `ctx.sandboxPolicy` 而來，工具調用傳調用會話解析后的策略，直接調用回退到部署策略。

### 模式與文件影響

| 模式 | 文件影響 |
|---|---|
| `read-only`（默認） | 寫入被拒絕；由于受限令牌必須保留 Everyone，邊界仍是不完整的 |
| `workspace-write` | 只能寫入策略的工作區根目錄加一個私有臨時目錄；spawn 前 `TMP`/`TEMP` 會被重寫到該目錄 |
| `danger-full-access` | 不作限制；絕不咨詢提供方，結果攜帶 `sandbox: { mode, denied: false }` |

### 最小配置

在 Windows 上掛載 ACL 受限令牌提供方；在 Linux 與 macOS 上則改掛本地 runner 提供方。執行器自身的配置與本地 pwsh 執行器的配置項完全相同；生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-pwsh-sandbox)是完整真源。

```yaml
- id: sandbox
  name: '@deepseek-ai/dsh-sandbox-windows-acl'
- id: sandbox-policy
  name: '@deepseek-ai/dsh-sandbox-policy'
  config:
    mode: read-only
    workspaceRoot: !!js process.cwd() # fallback for calls without a session cwd
- id: bash
  name: '@deepseek-ai/dsh-pwsh-sandbox'
```

### 拒絕與升權

被拒絕的命令作為事實被報告：結果攜帶 `sandbox: { mode, denied: true }`，工具層把它轉成標準的權限拒絕面——與 bash 工具使用同一個。當升權可用時，模型可以使用范圍最小的更寬松模式并附上一句理由，對同一條命令重試一次；批準提示會詢問用戶，獲得批準前不會執行任何命令。本執行器自身絕不協商權限。

### 失敗與恢復

如果沒有 runner 能強制執行受限模式，前臺調用以 `SANDBOX_UNAVAILABLE` 失敗，后臺進程則記錄 runner 失敗事實——絕不會靜默無隔離運行。只有當提供方拒絕中的 `ENOENT`/`EACCES` 路徑或 syscall 獨立指向 `argv[0]` 時，才將其歸因于隔離 runner；否則仍沿用本地執行器不區分階段的提供方失敗語義。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋執行器的設計并指出實現它們的代碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計概念

本執行器是 `dsh-bash-sandbox` 的 pwsh 孿生：它繼承 `dsh-pwsh-local` 的進程機制，消費其 argv 級 seam（`argv()`/`runArgv()`/`startArgv()`/`onProcessDone()`），并在 spawn 前把精確的 pwsh 調用經 `ctx.sandbox.confine()` 包裝。隔離實體本身是平臺無關的——沙箱 seam 解析到平臺的 runner——而本包只負責 pwsh 側：所選模式、強制執行完整度，以及結果上的拒絕分類。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`SandboxPwshExecutor`、按進程保留事實、run/start 包裝 |
| [`src/helpers.ts`](src/helpers.ts) | 拒絕、runner 失敗與 runner spawn 失敗分類 |
| — | 不發布運行時不變式伴生入口；除所屬 seam 所執行的約定外，本包不暴露獨立事件序列或可變數據關系；分類可在結果中觀察。 |
| `tests/` | 跨 ACL 與平臺 runner 演練的行為 |

### 主要流程

對受限模式，`resolve()` 標記每次調用的策略；`run` 與 `start` 把 pwsh argv 經提供方包裝，再把受限 argv 交給繼承的子進程路徑。結算時執行器對結果分類：runner 失敗優先于拒絕（命令從未運行），stderr 攜帶 runner 拒絕方言的失敗運行報告 `denied: true`，每次受限運行都攜帶模式與強制執行事實。`danger-full-access` 完全繞過提供方，并標記 `denied: false`。

### 不變式

- **失敗關閉**——受限模式沒有可用 runner 時拋 `SANDBOX_UNAVAILABLE`；受限策略絕不會出現無隔離直通。
- **seam 只報告拒絕**——本執行器從不授予權限；批準流程位于工具層。
- **按進程保留事實**——隔離事實在結算前按句柄保留，因為提供方在不同的重疊調用中可能采用不同的強制執行方式。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當執行器約定不夠用時閱讀以下頁面。它們從 seam 進入隔離后端與 pwsh 工具。

- [shell seam](../shell/README.zh.md) —— 本提供方實現的執行器約定，包括請求/spec 拆分。
- [bash-sandbox](../bash-sandbox/README.zh.md) —— 本執行器的 bash 孿生，共享拒絕與升權面。
- [pwsh-local](../pwsh-local/README.zh.md) —— 本執行器繼承的進程機制。
- [sandbox-windows-acl](../../sandbox/sandbox-windows-acl/README.zh.md) —— Windows 受限令牌 runner 鏈。
- [Bash 執行器子系統](../../../docs/subsystems/shell.zh.md) —— 請求/spec 詞匯、結果與完整的服務約定。
- [pwsh 執行器與工具筆記](../../../.agents/notes/archived/feature/2026-08-01-pwsh-tool-and-executor.md) —— pwsh 執行器與工具這一對背后的決策。

-----

<a id="model-experience"></a>
## 模型體驗

### 隔離生效，拒絕以命令失敗呈現

#### 模型看到的內容

受限命令自身的 stderr——例如 Windows ACL runner 下的 `Access to the path '...' is denied.`；工具層把分類后的拒絕轉成標準權限拒絕面，與 bash 工具完全一致。

#### Token 影響

除命令 stderr 與工具層標準拒絕面外，無額外模型可見文本。

#### KV Cache 影響

無直接影響；拒絕呈現面屬于工具層。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本執行器在 Windows 上只是不完整的邊界。它們是當前包約束，不是路線圖。

- **Windows 上讀不受限**——ACL runner 只限寫；讀邊界文檔在 `@deepseek-ai/dsh-sandbox-windows-acl`。
- **Windows workspace-write 的臨時權限按每個活躍的會話/工作區對私有**——無 agent（智能體）的調用每次都獲得一個新的私有目錄；環境臨時根目錄絕不會被授權，runner 會在 spawn 前將 `TMP`/`TEMP` 重寫為該私有目錄。
- **Windows read-only 不授予任何顯式可寫根目錄，但仍為部分強制執行**——受限令牌必須保留 Everyone；DACL 向 Everyone 授予寫訪問的對象——包括以兼容方式打開的 NUL 設備——仍構成環境權限來源，而 PowerShell 的 `> $null` 重定向仍可工作，且不會打開 NUL。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
