---
description: "面向 Windows 上選擇、配置或排查受限令牌進程隔離的用戶與維護者的 Windows 寫入限制沙箱后端。"
kind: "package-library"
---

# @deepseek-ai/dsh-sandbox-windows-acl

[English](README.md) | 中文

## 概述

在 Windows 上，本包將子進程的寫入限制在工作區和私有臨時目錄內。`workspace-write` 授予對這兩個位置的寫入權限，`read-only` 則均不授予。掛載 `dsh-sandbox-local` 后，受限的 bash 和 PowerShell 命令會自動獲得此行為；調用方也可以直接使用公開 `AclSandbox` API，并捕獲標準流。任何 Win32 操作失敗都會阻止子進程在不受限制的情況下啟動。該保證特意標記為部分強制，因為進程啟動會保留 Everyone 訪問權限，NTFS 硬鏈接也可以通過其他路徑暴露同一文件；調用方可通過報告的 `partial` 強制級別檢測此限制。

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

在 Windows 上，掛載本地沙箱提供方后，此后端就是 `ctx.sandbox` 背后的 runner——無需額外配置。要在 harness 之外 spawn 受限子進程時，直接嵌入 `AclSandbox` API。

### 何時選擇

為在 `read-only` 或 `workspace-write` 下隔離子進程文件操作的 Windows 組合選擇它。當子進程還需要讀側隔離或網絡限制時請另選機制：`WRITE_RESTRICTED` 只交叉檢查寫訪問，因此請把此后端與讀側策略或 AppContainer 能力令牌配對以獲得更強隔離。

### 直接 API

`AclSandbox` 以捕獲 stdio 的方式 spawn 受限子進程（runner 風格使用可用繼承 stdio）。它要求顯式提供私有臨時目錄，或用 `tempDir: null` 禁用臨時寫入——環境臨時根目錄絕不會被隱式授權。

```ts
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AclSandbox, tempWriteSid, workspaceWriteSid } from '@deepseek-ai/dsh-sandbox-windows-acl'

const workspaceRoot = process.cwd()
const tempDir = mkdtempSync(join(tmpdir(), 'dsh-'))

// mode selects the token's restricting-SID list (see Modes below) and must
// match the grant shape. workspace-write requires distinct workspace and
// private-temp identities; pass tempDir: null to disable temp writes.
const sandbox = new AclSandbox({
  writableDirs: [workspaceRoot],
  tempDir,
  writeSid: workspaceWriteSid(workspaceRoot),
  tempWriteSid: tempWriteSid(tempDir),
  mode: 'workspace-write',
})
await sandbox.init() // throws on ANY Win32 failure — never spawns unrestricted

const child = sandbox.spawn({ command: 'pwsh', args: ['-NoProfile', '-Command', '...'], cwd: workspaceRoot })
const { stdout, stderr, exitCode } = await child.wait()

sandbox.dispose() // revokes the revocable (temp) grant, keeps the standing workspace ACE; reports every cleanup failure
rmSync(tempDir, { recursive: true, force: true })
```

工作區 ACE 以常駐方式授予——`dispose()` 保留它們，因為它們是跨實例的復用緩存——而不同的臨時 SID 以可回收方式授予。服務端對應實現是 `AclWriteGrant` 類：每個目錄一次 `add(path, standing)`，`dispose()` 撤銷可回收路徑并釋放 SID。

### 隔離給你帶來什么

在 `workspace-write` 下，子進程可以寫入工作區及其私有臨時目錄；受 ACL 管轄的其他寫入都會被拒絕，已記錄的 Everyone 與硬鏈接邊界除外。在 `read-only` 下不存在顯式寫入授權，因此寫入會被拒絕，同樣帶有已記錄的邊界。

臨時隔離按每個活躍的會話/工作區對進行：共享工作區的會話共享其寫權限，但無法寫入彼此的臨時目錄。新的提供方總會選擇新的臨時路徑和 SID，因此崩潰殘留既無法阻止恢復的會話，也無法向其授權。

### 失敗與恢復

`init()` 在任何 Win32 失敗時拋出——子進程絕不會不受限制地 spawn。執行命令前失敗的 runner 會向 stderr 打印 `windows-acl-run: <detail>` 并以 127 退出，seam 的 runner 失敗規則將其歸類為損壞的沙箱，而非拒絕。清理按設計盡力而為：`dispose()` 會嘗試全部臨時撤銷并把失敗聚合為 `AggregateError`。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋受限令牌機制、令牌列表、runner 約定與已驗證邊界；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 機制

調用者令牌被復制為 `WRITE_RESTRICTED` 受限令牌，其 restricting SIDs 攜帶彼此獨立的工作區與私有臨時目錄能力。Windows 執行兩次訪問檢查——先對正常 SID，再對 restricting SID——并且只在兩次檢查都通過時才授予寫類訪問。工作區 SID 由規范工作區路徑確定性派生（`workspaceWriteSid`），因此工作區根目錄 ACE 每臺機器每個工作區只物化一次，之后每次會話、調用或重啟都命中精確 ACE 跳過。每個活躍的會話/工作區對則獲得一個隨機私有臨時目錄，以及一個從該路徑派生的 SID（`tempWriteSid`），因此各會話共享預期的工作區權限，卻不會繼承彼此的臨時目錄權限。每個策略專用 Win32 調用和 [`dsh-win32-process`](../../subprocess/win32-process/README.zh.md) 提供的進程原語都有檢查；失敗拋出攜帶 API 名、精確錯誤碼、系統文本與失敗上下文的 `Win32Error`——從構造上 fail-closed。

### 模式與令牌列表

`workspace-write`（登錄 SID、Everyone、工作區 SID、臨時 SID）為工作區與會話的私有臨時子目錄分別授予 Write；`read-only`（登錄 SID、Everyone——不含寫入 SID）不授予任何內容。保活組（登錄 SID + Everyone）在兩種模式下都存在：沒有它，早期 DLL 初始化會以 `0xC0000142` 死亡、CNG 會讓 pwsh 以 `0xE0434352` 崩潰。寫入 SID 有意留在 read-only 列表之外：先前 workspace-write 時期留下的常駐授權 ACE 仍然失效，因為 write-restricted 的 pass-2 檢查只授予 restricting 列表所攜帶的內容，而常駐 ACE 讓重新升級免于重新傳播。

NUL 寫入是環境性的、不是被授權的：設備 DACL 授予 Everyone 讀+寫+執行（`0x1201BF`），因此訪問掩碼落在其內的打開者（cmd 的 `> NUL`、node 的 `\\.\NUL`）在兩種模式下都能寫。`Set-Content NUL` 在兩種模式下都失敗（PowerShell/.NET 層效應，非設備 DACL 所致），而 PowerShell 的 `> $null` 重定向不受影響。

Authenticated Users 在兩種列表中都不存在——WMI 命名空間安全檢查失敗（`0x80041003`），因此 CIM cmdlet 與 `Get-ComputerInfo` 在所有受限模式下都不可用，且 C:\-root 樹創建逃逸被關閉。INTERACTIVE/LOCAL 同樣不存在：宿主的 Public 樹向 INTERACTIVE 授予寫權限，因此 Public 寫入被拒絕。

### 隔離 runner

面向 seam 的形態是 runner 入口（`./runner`）：`dsh-sandbox-local` 在調用者命令的位置 spawn 的 argv 前綴包裝——與 bwrap/landlock-run/sandbox-exec 同一架構。runner 創建受限令牌，在它之下 spawn 包裝后的 argv，調用者的 stdio 直接透傳，把子進程包進 `KILL_ON_JOB_CLOSE` job，鏡像子進程的退出碼，并在退出時撤銷其自行管理的臨時授權。每個 runner 側失敗都會向 stderr 打印 `windows-acl-run: <detail>` 并以 127 退出——seam 的 runner 失敗規則匹配該簽名。

```sh
node runner.js --workspace <dir> --temp <dir> --mode <read-only|workspace-write> [--write-sid <S-1-4-…> --temp-write-sid <S-1-4-…>] -- <argv...>
```

seam 先把確定性工作區 SID 的 ACE 常駐物化（每個工作區每服務器生命周期一次——復用緩存），再為每個活躍的會話/工作區對創建隨機私有臨時目錄和不同的可回收 SID，把兩種身份作為必須成對出現的 `--write-sid`/`--temp-write-sid` 傳入；runner 對照各自所屬路徑驗證二者，既不授權也不撤銷（`manageDacls: false`）。fork 獲得不同的臨時能力；即使恢復的是同一會話，新的提供方也會給出新的路徑和 SID，因此崩潰殘留只是失效垃圾。如果不帶這一對標志，`--temp` 指定的是根目錄：無 agent（智能體）/獨立的 workspace-write runner 會創建隨機私有子目錄，自行管理其臨時 SID，重寫 TMP/TEMP，并在退出時移除該子目錄。重啟后重新授權常駐工作區 ACE 是冪等的：`grantWrite` 讀取當前 DACL，當完全相同的 ACE 已存在時跳過重新傳播。工作區若等于或包含臨時根目錄，會在任何授權前被拒絕。

### 已驗證邊界

- **Everyone 授權仍是環境中的寫權限來源。** Everyone 必須保留在兩種 restricting 列表中（移除它會破壞早期 DLL 初始化與 CNG）；外部 NTFS 對象若其 DACL 向 Everyone 授予所請求的寫權限，就會同時通過兩次檢查，并在兩種模式下保持可寫。
- **硬鏈接是文件對象別名，而非路徑別名。** 傳播到已有硬鏈接上的可繼承工作區 ACE 會修改底層同一文件的安全描述符，因此同一對象也可通過外部別名寫入；拒絕工作區中的所有多鏈接文件不具可行性，因為普通 pnpm 安裝會使用硬鏈接。
- **寫入受限；讀取、網絡與進程可見性不受限。** `WRITE_RESTRICTED` 只交叉檢查寫訪問，因此受限子進程可以讀取調用者可讀的任何文件并打開套接字；`read-only` 因而需要讀側策略才能表達。
- **控制臺隔離不可用。** 以 `CREATE_NO_WINDOW` / `CREATE_NEW_CONSOLE` 創建的子進程在 DLL 初始化期間以 `STATUS_DLL_INIT_FAILED`（`0xC0000142`）死亡；子進程共享宿主控制臺，基于管道的 stdio 重定向不受影響。
- **ACL 授權是對真實目錄的駐留改動。** 工作區 ACE 按設計常駐（復用緩存，絕不撤銷）；臨時 ACE 由 `dispose()` 撤銷；手工 `icacls` 清理無法在本平臺回收它們（`ERROR_NONE_MAPPED` 1332），請通過本模塊回收。
- **被授權目錄必須由調用者擁有。** 所有者的隱式 `WRITE_DAC` 是沙箱無需提權即可編輯 DACL 的原因。
- **環境臨時根目錄絕不會被隱式授權。** 直接調用方必須提供已存在的私有 `tempDir` 及其不同的 `tempWriteSid`，或用 `tempDir: null` 禁用臨時寫入；實際臨時目錄不得與任何可寫根目錄重疊。
- **受限子進程的臨時能力按每個活躍的會話/工作區對私有。** runner 在 spawn 之前把 TMP/TEMP 改寫為該私有目錄；共享同一工作區 SID 的兩個令牌無法寫入彼此的臨時目錄。
- **受限令牌下 `whoami` 與令牌檢查 cmdlet 會失敗。** 子進程對復制令牌的 `GetTokenInformation` 部分不可用，這是診斷噪音而非運行故障。

### 頭文件驗證與源碼索引

沙箱擁有的 SID、ACL、令牌、文件與鎖聲明由 [`verify/abi-probe.cpp`](verify/abi-probe.cpp) 對照 Windows 頭文件檢查。共享進程、stdio 與 Job ABI 由 [`@deepseek-ai/dsh-win32-process`](../../subprocess/win32-process/README.zh.md#header-verification) 歸屬并驗證。

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | `AclSandbox`：受限令牌策略、DACL 授權、fail-closed 的 spawn 與 dispose |
| [`src/runner.ts`](src/runner.ts) | 基于共享 Win32 進程原語的 runner 入口 |
| [`src/grant.ts`](src/grant.ts) | `AclWriteGrant`：服務端授權物化與撤銷 |
| [`src/token.ts`](src/token.ts) + [`src/acl.ts`](src/acl.ts) | 沙箱背后的 Win32 令牌與 DACL 原語 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

先從子系統參考文檔了解共享詞匯，再看掛載此檔的提供方、其消費方與設計決策。

- [進程沙箱子系統](../../../docs/subsystems/sandbox.zh.md)——模式、逐調用策略與強制執行語義。
- [本地沙箱后端](../sandbox-local/README.zh.md)——把此后端掛載為 win32 檔的提供方。
- [沙箱 seam 包](../sandbox/README.zh.md)——此后端實現的服務約定。
- [Win32 進程庫](../../subprocess/win32-process/README.zh.md)——共享的受限進程、stdio、Job、等待與句柄清理原語。
- [Bash 沙箱執行器](../../shell/bash-sandbox/README.zh.md)與[pwsh 沙箱執行器](../../shell/pwsh-sandbox/README.zh.md)——消費它的受限執行器。
- [Windows ACL 受限令牌沙箱決策](../../../.agents/notes/implemented/feature/2026-08-08-windows-acl-restricted-token-sandbox.zh.md)——為何選擇原始 ACL 受限令牌而非 mxc 與 AppContainer。

-----

<a id="model-experience"></a>
## 模型體驗

間接地通過 [`dsh-bash-sandbox`](../../shell/bash-sandbox/README.zh.md)、[`dsh-pwsh-sandbox`](../../shell/pwsh-sandbox/README.zh.md) 及其工具呈現；它們渲染此后端的部分強制執行與拒絕事實（工具層通過 `denialSignatures` 分類的受限 stderr），而 [`dsh-sandbox`](../sandbox/README.zh.md) seam 擁有 `SANDBOX_UNAVAILABLE` 文本、`sandbox-local` 擁有 runner 選擇。

#### KV Cache 影響

無直接影響；拒絕面屬于工具層。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明后端何時不合適，或何時需要特別運維。它們是當前包約束，不是通用 Windows 對比或任務積壓。

- **每個工作區一個寫入白名單**——寫入 SID 是白名單的基本單位，且就是工作區身份；同一沙盒實例跨兩個工作區復用時，兩個根目錄會互相擴大授權面。請按工作區根目錄各建一個實例——seam 正是這樣做的，以工作區路徑為鍵。
- **清理按設計盡力而為**——`dispose()` 會嘗試全部臨時撤銷并把失敗聚合為 `AggregateError`；清理失敗可能留下隨機目錄及其僅含臨時 SID 的 ACE。進程退出后，不會再有令牌攜帶該 SID，因此殘留保持失效，直到 OS 臨時目錄衛生或手動移除目錄將其回收。
- **常駐工作區 ACE 是不可見殘留。** 工作區改名會派生新的 SID；舊路徑上的舊 ACE 留在原地（失效、僅含寫入 SID），未來的清理命令可以回收它們。
- **NULL-DACL 目錄在 grant+revoke 往返下不保持身份。** 帶 NULL DACL 的目錄意味著「所有人完全控制」；`grantWrite` 從該 null 構建新 ACL，撤銷往返后留下的是 EMPTY（全部拒絕）DACL 而非原始 NULL DACL。真實工作區與臨時目錄都帶真實 DACL，因此這仍是記錄在案的邊界情形。
- **受限孫進程的管道 stdio 捕獲不可用。** libuv 的管道 stdio 用的是 NAMED pipe，其 client 端打開所請求的寫訪問沒有任何 restricting SID 被授予（是 Win32 層的默認 SD 模板，而非令牌默認 DACL），因此受限進程內 `spawn(..., { stdio: 'pipe' })` 以 EPERM 失敗；繼承與忽略 stdio 的 spawn 可用，匿名管道（PowerShell 的管道）因受限令牌默認 DACL 攜帶 restricting SID 全權 ACE 而可用。
- **授權物化是急切的全樹傳播。** 在帶可繼承 ACE 的目錄上調用 `SetNamedSecurityInfoW` 會立即遍歷每個后代（大型工作區樹上以數十秒計）；按工作區身份每臺機器每個工作區只付一次，精確 ACE 跳過讓后續每次供給都很便宜。
- **讀側隔離與網絡策略不在范圍內**——`WRITE_RESTRICTED` 只交叉檢查寫訪問；將此后端與讀側策略配對以獲得更強隔離。
- **寬目錄與 FAT 卷警告已推遲；FAT 類目標保持可寫。** UI 側警告尚未實現，FAT 卷作為授權根會大聲失敗，而授權根之外的 FAT 類目標沒有安全描述符，因此在兩種受限模式下都可寫；FAT 被視為遺留殘留。
- **PowerShell 語言模式因受限模式而異。** 在 `read-only` 下，PowerShell 無法在臨時目錄中創建 AppLocker 探針文件，因此會保守地以 ConstrainedLanguage 啟動（`Add-Type`、非核心 .NET 靜態調用、COM 與反射失敗）；交付的 `workspace-write` 路徑可讓探針完成，因此除非主機范圍的 WDAC/AppLocker 策略另有規定，否則 pwsh 保持 FullLanguage，而直接使用 `AclSandbox` 并配置 `tempDir: null` 時則沒有這一保證。這一區別屬于 PowerShell 啟動行為，不是 ACL 寫入邊界的一部分。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文：未決方向與開放問題。它明確不具權威性——已交付的行為、限制與既定理由以上文、包代碼和相關 Agent Note 為準。

#### 未來：警告與清理表面

對異常寬的目錄與 FAT 類卷的僅警告立場已記錄在上方限制中但尚未實現，回收改名工作區常駐 ACE 的清理命令也尚未決定。兩者都是開放方向，不是已交付行為。

</details>

**運行時不變式：** 不發布伴生入口。本包沒有獨立事件序列或可變數據關系；fail-closed 約定在每個 Win32 調用處強制。
