---
description: "面向部署方與維護者的沙箱 Bash 執行器說明，用于選擇、配置或排查受限命令執行及其拒絕與升權事實。"
kind: "package-reference"
---

# @deepseek-ai/dsh-bash-sandbox

[English](README.md) | 中文

## 概述

使用 `dsh-bash-sandbox` 運行每條 Bash 命令，使其文件訪問受到限制，而不是使用 harness 進程的完整權限。結果會報告所選模式、被拒絕的文件操作，以及 runner 是否完整實施該模式。如果沒有 runner 能實施受限模式，命令會以 `SANDBOX_UNAVAILABLE` 失敗，絕不會無隔離地運行。部署需要文件隔離時選擇它；網絡訪問和進程可見性不在其保證范圍內。

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

當命令不得以 harness 進程的完整文件權限運行時，用本執行器替代 `dsh-bash-local`。它注冊為 `ctx.shell`，并要求一個 `ctx.sandbox` 提供方加上 `ctx.sandboxPolicy`；面向模型的 `bash` 工具基于它不加改動地工作，并公布 `sandbox_permissions` 與 `justification` 升權字段。

### 何時選擇

當部署需要為 Bash 命令提供文件級隔離時選擇它：已配置的策略決定默認模式與工作區根目錄，每個會話還可以通過工具的升權流程按調用使用不同模式。模式只約束文件影響——網絡仍不受限制，進程可見性因后端而異。需要非隔離執行，或平臺沒有可用沙箱后端時，請改為掛載 `dsh-bash-local`。

### 模式與文件影響

| 模式 | 文件影響 |
|---|---|
| `read-only`（默認） | 任何位置都不可寫；在 `/dev` 中只有 `/dev/null` 節點可寫，因此 `>/dev/null` 仍可正常工作 |
| `workspace-write` | 只能寫入策略的工作區根目錄加 `/tmp`（bwrap 下為臨時目錄，Landlock 下為宿主 `/tmp`，Seatbelt 下為 `/private/tmp` 加每用戶臨時目錄） |
| `danger-full-access` | 不作限制；絕不咨詢提供方，結果攜帶 `sandbox: { mode, denied: false }` |

### 最小配置

本執行器自身不攜帶任何沙箱配置：默認模式與工作區根目錄來自 `ctx.sandboxPolicy`，runner 選擇屬于 `ctx.sandbox` 提供方。它自己的配置就是本地執行器的旋鈕，逐字繼承；生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-bash-sandbox)是窮盡式真源。

```yaml
- id: sandbox
  name: '@deepseek-ai/dsh-sandbox-local'
- id: sandbox-policy
  name: '@deepseek-ai/dsh-sandbox-policy'
  config:
    mode: read-only
    workspaceRoot: !!js process.cwd() # fallback for calls without a session cwd
- id: bash
  name: '@deepseek-ai/dsh-bash-sandbox'
```

### 拒絕是結果事實

被拒絕的命令會被報告，而不是靜默重試：結果攜帶 `sandbox: { mode, denied: true }`，面向模型的工具會追加拒絕標記。當升權可用時，模型可以用最窄的充分寬模式與一句理由重試同一條命令一次；批準提示會詢問用戶，未經批準絕不執行任何東西。本執行器自身絕不協商權限——覆蓋值由工具層驅動。

### 失敗與恢復

如果沒有 runner 能強制執行受限模式，前臺調用以 `SANDBOX_UNAVAILABLE` 失敗，后臺進程則記錄 runner 失敗事實——絕不會靜默無隔離運行。只有當 provider rejection 的 `ENOENT`/`EACCES` 路徑或 syscall 獨立指向 `argv[0]` 時，才把它歸因于 confinement runner；其他 rejection 保持本地執行器不聲明階段的 provider-failure 語義。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋執行器的設計并指出實現該設計的代碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計概念

本執行器是 `ctx.shell` seam 的沙箱 Service Provider：它繼承 `dsh-bash-local` 的進程機制，把每條命令的精確 `['bash', '-c', command]` argv 經 `ctx.sandbox.confine()` 重新包裝，并直接 spawn 返回的 argv。由哪種平臺 runner 限制命令、以及是否有 runner 可用，屬于提供方職責；本包只負責 bash 側：所選模式、強制執行完整度，以及結果上的拒絕分類。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`SandboxBashExecutor`、按進程保留事實、run/start 包裝 |
| [`src/helpers.ts`](src/helpers.ts) | 拒絕、runner 失敗與 runner spawn 失敗分類 |
| — | 不發布運行時不變式伴生入口；分類可在結果中觀察，且除歸屬 seam 所強制執行的約定外，本包不公開獨立事件序列或可變數據關系。 |
| `tests/` | 跨 bwrap、Landlock 與 Seatbelt runner 演練的行為 |

### 主要流程

對受限模式，`resolve()` 標記每次調用的策略（會話的模式覆蓋值，或部署回退）；`run` 與 `start` 把 bash argv 經提供方包裝，再把受限 argv 交給繼承的 subprocess 路徑。結算時執行器對結果分類：runner 失敗優先于拒絕（命令從未運行），stderr 攜帶后端拒絕方言的失敗運行報告 `denied: true`，每次受限運行都攜帶模式與強制執行事實。`danger-full-access` 完全繞過提供方，并標記 `denied: false`。

### 不變式

- **失敗關閉**——受限模式沒有可用 runner 時拋 `SANDBOX_UNAVAILABLE`；受限策略絕不會出現無隔離直通。
- **seam 只報告拒絕**——本執行器從不授予權限；批準流程位于工具層。
- **按進程保留事實**——隔離事實在結算前按句柄保留，因為提供方可能在重疊調用之間改變強制執行方式。
- **只約束文件影響**——模式詞匯只聲稱文件影響。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當執行器約定不夠用時閱讀以下頁面。它們從 seam 進入本執行器所消費的沙箱能力。

- [shell seam](../shell/README.zh.md) —— 本提供方實現的執行器約定，包括請求/spec 拆分。
- [bash-local](../bash-local/README.zh.md) —— 本執行器繼承的進程機制。
- [sandbox seam](../../sandbox/sandbox/README.zh.md) —— 隔離能力、其模式與失敗關閉約定。
- [sandbox-policy](../../sandbox/sandbox-policy/README.zh.md) —— 本執行器遵守的每會話模式與工作區根目錄。
- [sandbox-local](../../sandbox/sandbox-local/README.zh.md) —— 隨附的 runner 后端：bwrap、Landlock 與 Seatbelt。
- [tool-bash](../tool-bash/README.zh.md) —— 面向模型的 `bash` 工具及其升權面。
- [沙箱 Agent Note](../../../.agents/notes/implemented/feature/2026-07-06-sandbox.zh.md) —— 沙箱設計、升權與切換約定。

-----

<a id="model-experience"></a>
## 模型體驗

### 間接的 Bash 工具 schema

#### 模型看到的內容

基線是生成的 [`dsh-tool-bash` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-bash)。通過公布表明啟用隔離的 `sandboxMode` 能力，此后端會為 `bash` 增加 `sandbox_permissions`（enum 為 `workspace-write` | `danger-full-access`）與 `justification`。策略歸屬方會另行貢獻當前且不區分具體能力的 `sandbox:policy` 上下文。

#### Token 影響

在 `bash` 可見的請求上，schema 固定增加少量內容，另有一條由 `dsh-sandbox-policy` 負責的當前策略子句。

#### KV Cache 影響

常駐策略變化會在保留的歷史之后追加一份由歸屬方渲染的完整上下文快照，并使既有 system/history 前綴保持逐字節不變。更改執行器能力會改變 `bash` schema。

### 間接的 Bash 工具結果

#### 模型看到的內容

在普通有界輸出之后，被拒絕的調用會精確追加 `[sandbox: file access denied under <mode> mode]`。當升權可用時，接下來精確追加 `[sandbox: escalation available — retry this exact command once with sandbox_permissions (the narrowest wider mode that suffices) + justification; the approval prompt asks the user]`。已結算的后臺 runner 失敗則追加 `[sandbox: the sandbox runner itself failed under <mode> mode — the command did not run; this is a sandbox problem, not a command failure]`。

#### Token 影響

除普通輸出外，正常允許的運行不會增加 token。拒絕或失敗會增加上述有條件標記，并保留到上下文壓縮（context compaction）。

#### KV Cache 影響

僅追加；新可見內容位于可復用請求前綴之后，不會使現有 KV Cache 條目失效。

### 間接的 Bash 工具錯誤

#### 模型看到的內容

如果沒有 runner 能強制執行受限模式，前臺調用會傳播來自 sandbox seam 的 `SANDBOX_UNAVAILABLE` 錯誤。當提供方拒絕帶有 `ENOENT`／`EACCES` 路徑或 syscall 證據并指向 `argv[0]` 時，會把原始錯誤作為 runner 失敗詳情；其他拒絕仍是與階段無關的提供方錯誤。已結算的 runner 失敗以匹配到的致命 stderr 行作為詳情，并保留原始 stderr 收集結果；追加的 `Runner failure: <detail>` 是權威診斷，優先于通用的 `SANDBOX_UNAVAILABLE` 前綴。

#### Token 影響

該次調用會在相應條件下顯示錯誤文本，該文本會保留在歷史記錄中直到上下文壓縮。

#### KV Cache 影響

僅追加；新可見內容位于可復用請求前綴之后，不會使現有 KV Cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本執行器何時不是通用安全邊界。它們是當前包約束，不是路線圖。

- **限制只覆蓋文件影響**——不提供網絡限制和統一的進程可見性保證，因此這些模式不是通用安全沙箱。
- **拒絕從失敗命令的 stderr 推斷**——后端特征使該推斷可跨平臺使用，但包含相同特征的應用錯誤可能被分類為拒絕，也可能遺漏未出現在保留尾部中的拒絕。
- **異步觀測到的后臺 runner 失敗沒有即時錯誤通道**——它記錄在已結算進程上，并在調用方用 `job_output` 讀取通用任務時呈現；同步拋出且指明 runner 路徑的子進程錯誤則會讓 `start()` 立即失敗。
- **`danger-full-access` 有意繞過 `ctx.sandbox`**——它是顯式無約束模式，不是更寬的沙箱 profile。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
