---
description: "面向用戶與維護者的進程沙箱服務約定，用于組合、使用或擴展與宿主共享文件系統和內核的子進程限制機制。"
kind: "package-reference"
---

# @deepseek-ai/dsh-sandbox

[English](README.md) | 中文

## 概述

使用 `dsh-sandbox`，可以讓子進程及其派生的所有進程在逐調用文件訪問策略下運行。命令可以禁止寫入（`read-only`）、只寫入工作區（`workspace-write`），或不受限制地運行（`danger-full-access`）。無法強制執行所請求的模式時，調用以 `SANDBOX_UNAVAILABLE` 失敗，絕不會不受限制地運行。調用被拒絕后，模型可以請求一個嚴格更寬的模式，交由人類批準一次。這種限制只適用于與宿主共享內核和文件系統的進程；需要隔離整個環境時，請使用容器、microVM 或遠程執行器。

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

將此服務與一個后端和一個受限消費方組合，消費方運行的每條命令都會在你解析的策略下執行——你只看到隔離結果及其強制執行完整度，永遠看不到 runner。

### 何時選擇

當組合需要在宿主機上隔離子進程時選擇本包：本地后端與受限執行器都實現這個約定，因此在 `ctx.sandbox` 后掛載 `sandbox-local`、在 `ctx.shell` 后掛載受限執行器，就能使每次 bash 或 pwsh 調用默認在限制下運行。當進程必須在隔離環境中運行時請另選方案——容器、microVM 或遠程執行器會替換整個 `ctx.shell`/`ctx.fs` 能力，而不是在這里添加后端。

### 隔離命令

掛載服務、后端與受限執行器；隨附的組合由[基礎組合包（base bundle）](../../bundle/base/cordis.patch.yml)定義。

```yaml
- id: sandbox
  name: '@deepseek-ai/dsh-sandbox-local'     # the per-platform backend provider (ctx.sandbox)
- id: sandbox-policy
  name: '@deepseek-ai/dsh-sandbox-policy'    # the deployment default mode and workspace-write root
  config:
    mode: workspace-write                    # the deployment default every session starts from
    workspaceRoot: !!js process.cwd()        # the boundary workspace-write may write under
- id: bash
  name: '@deepseek-ai/dsh-bash-sandbox'      # the confined executor behind ctx.shell
```

使用該組合時，bash 調用在 `workspace-write` 下受限運行：工作區內寫入成功，工作區外寫入被拒絕，模型可以通過下面的升權流程恢復。

### 模式與強制執行

模式指明命令可以執行的文件操作；強制執行完整度報告后端對這些操作的管轄程度。

| 模式 | 效果 |
|---|---|
| `read-only` | 拒絕寫入，必需 sink（如 `/dev/null`）除外 |
| `workspace-write` | 允許寫入工作區根目錄及后端定義的臨時區域 |
| `danger-full-access` | 繞過隔離；消費方直接 spawn 原始 argv |

強制執行逐調用報告：`full` 表示后端管轄模式承諾的每個文件操作，`partial` 表示活動后端或較舊的內核 ABI 只管轄子集——Windows ACL 檔與較舊的 Landlock ABI 是當前的部分強制執行情形，需要絕對邊界的消費方可以拒絕或向上暴露它們。

### 被拒絕的調用與升權

受限調用被拒絕時，操作會報告指明模式的拒絕標記——`[sandbox: file access denied under <mode> mode]`——組合聲明升權能力時還會給出升權提示。模型可以用 `sandbox_permissions`（足以放行的最窄更寬模式）加 `justification` 重試一次完全相同的調用；用戶會看到一次審批提示，可以選擇允許一次、拒絕或取消。升權必須嚴格寬于調用的生效模式，且只作用于該次調用。

### 故障關閉行為

沒有后端能強制執行所請求的模式時，調用以 `SANDBOX_UNAVAILABLE` 失敗，而不是不受限制地運行；錯誤文本會指明缺失的平臺 runner。啟動后失敗的后端還會報告結構化的 runner 失敗簽名，因此損壞的沙箱可以與命令失敗區分開。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋約定背后的設計決策，并指出實現它們的代碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

- **約定只支持與宿主共享文件系統和內核的限制。** `ctx.sandbox` 在宿主路徑文件策略下包裝 argv；容器、microVM 與遠程執行會替換周邊能力 seam。
- **策略隨調用傳遞。** `SandboxPolicy` 逐調用攜帶，絕不在提供方上固定：兩個消費方可以同時按不同策略隔離，獲批的升權重試只是用更寬策略發起的新調用。默認與解析是消費方顯式步驟。
- **故障關閉。** `confine()` 返回用于強制執行限制的 argv，或拋出 `SandboxUnavailableError`；絕不允許靜默無限制放行，功能探測用于仲裁多 runner 鏈。
- **統一的拒絕與升權詞匯。** 標記與提示文本以及嚴格更寬階梯都放在這里，使 bash 與 fs 家族不會漂移。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`SandboxProvider` 服務、模式/強制執行/策略類型、故障關閉錯誤 |
| [`src/escalation.ts`](src/escalation.ts) | 升權詞匯：更寬模式階梯、參數校驗、拒絕與提示標記、審批編排 |
| [`src/roots.ts`](src/roots.ts) | 可寫根目錄推導，Seatbelt profile 與進程內 fs 柵欄共享 |
| — | 不發布運行時不變式伴生入口；除所屬 seam 強制執行的約定外，本包不公開獨立的事件序列或可變數據關系。 |

### 升權編排

階梯是封閉表——`read-only` 可升權到 `workspace-write` 或 `danger-full-access`，`workspace-write` 只能升權到 `danger-full-access`——在執行時檢查，絕不寫入工具 schema，schema 的枚舉保持封閉的目標詞匯。[`approveEscalation`](src/escalation.ts) 校驗 `sandbox_permissions`/`justification` 配對、不提示人類就拒絕非加寬請求，并在任何執行前把每個審批結果映射到各自的錯誤。

### 可寫根目錄

`workspace-write` 意味著「工作區根目錄加宿主臨時區域」：`writableRoots` 以規范化方式推導該白名單，解析符號鏈接并去重，使 Seatbelt profile 與進程內 fs 柵欄授予完全相同的根目錄。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

先從子系統參考文檔了解窮盡式約定，再看實現它的后端、消費方與策略來源。

- [進程沙箱子系統](../../../docs/subsystems/sandbox.zh.md)——完整詞匯、逐調用策略與分類方言。
- [子進程沙箱決策](../../../.agents/notes/implemented/feature/2026-07-06-sandbox.zh.md)——能力邊界、升權設計與延期階段。
- [本地沙箱后端](../sandbox-local/README.zh.md)——`ctx.sandbox` 背后的各平臺 runner。
- [Bash 沙箱執行器](../../shell/bash-sandbox/README.zh.md)——受限的 bash 消費方。
- [沙箱策略包](../sandbox-policy/README.zh.md)——逐調用模式與工作區根目錄的來源。

-----

<a id="model-experience"></a>
## 模型體驗

### 間接的限制錯誤

#### 模型看到什么

通過 [`dsh-bash-sandbox`](../../shell/bash-sandbox/README.zh.md) 和 [`dsh-tool-bash`](../../shell/tool-bash/README.zh.md)，請求的受限模式沒有可用后端時會產生錯誤碼 `SANDBOX_UNAVAILABLE` 及下方精確錯誤；執行期 runner 失敗會追加 ` Runner failure: <detail>`。

##### 精確錯誤

```markdown
sandbox mode "<mode>" is requested but no sandbox backend is usable on this host; refusing to run the command unconfined. Install bubblewrap or run a Landlock-enforcing kernel (Linux), ensure sandbox-exec is usable (macOS), or ensure the ACL restricted-token runner can start (Windows) — otherwise switch the consumer to danger-full-access.
```

#### Token 影響

條件性錯誤文本對該次調用可見，并保留在歷史中直到壓縮（compaction）。

#### KV Cache 影響

僅追加；新可見內容位于可復用請求前綴之后，不會使現有 KV Cache 條目失效。

### 升權請求與結果

#### 模型看到什么

被拒絕的調用會呈現標記 `[sandbox: file access denied under <mode> mode]`，組合聲明升權能力時還會呈現提示 `[sandbox: escalation available — retry this exact <subject> once with sandbox_permissions (the narrowest wider mode that suffices) + justification; the approval prompt asks the user]`。重試攜帶 `sandbox_permissions` 與 `justification`；用戶的 `allowed-once`／`rejected`／`cancelled` 決定成為該調用的結果文本。

#### Token 影響

只有被拒絕調用的錯誤與任何升權結果文本可見；兩者都會保留在歷史中直到壓縮。

#### KV Cache 影響

僅追加；升權文本位于保留前綴之后，不會使已緩存條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明該 seam 何時不合適，或何時需要特別運維。它們是當前包約束，不是通用沙箱對比或任務積壓。

- **文件操作是完整的策略詞匯**——該 seam 不表達網絡、進程、系統調用、設備或憑據限制。
- **只支持與宿主共享文件系統和內核的限制**——容器、microVM 與遠程執行需要替換能力實現，而不是在此添加提供方。
- **拒絕報告是一種 stderr 方言**——該 seam 返回后端簽名，而非類型化運行時拒絕通道，需要分類的消費方必須從子進程輸出推斷。
- **Runner 診斷使用帶內通道**——退出狀態與 stderr 證據無法證明匹配行由哪個進程寫入，因此故意模仿 runner 的受限子進程可能造成錯誤的可用性或診斷歸因；這無法繞過隔離，帶外 runner 狀態通道暫緩實現。
- **每個上下文只有一個提供方**——同時組合不同沙箱機制需要提供方級階梯或獨立 Cordis 上下文；調用方逐調用選擇策略，而非后端標識。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文：未決方向與開放問題。它明確不具權威性——已交付的行為、限制與既定理由以上文、包代碼和相關 Agent Note 為準。

#### 未來：消費方與環境

[沙箱決策](../../../.agents/notes/implemented/feature/2026-07-06-sandbox.zh.md)列出延期階段——可選的 `subagent-acp` 消費方（隔離子 agent（智能體），默認不隔離）與環境一致的能力組示例。兩者均未決定；該筆記列為延期的 Windows 鏈已通過 `sandbox-local` 的 ACL 受限令牌檔交付。

</details>
