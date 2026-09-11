---
description: "共享遠程沙箱內的 shell 命令與終端：agent（智能體）可以在那里運行什么、輸出如何處理，以及可以期待什么——面向 E2B 家族的部署方與維護者。"
kind: "package-reference"
---

# @deepseek-ai/dsh-subprocess-e2b

[English](README.md) | 中文

## 概述

`dsh-subprocess-e2b` 讓 agent 的 shell 命令與交互式終端在 E2B 遠程沙箱而非宿主中運行。現有的命令、終端與語言服務器工作流無需 E2B 專用工具即可繼續使用。宿主環境變量與密鑰不會傳入沙箱；只有顯式請求的環境條目會進入沙箱。請與 `dsh-e2b`、`dsh-fs-e2b` 一起使用，讓命令、終端與文件共享同一個沙箱。遠程執行會增加延遲，因為每條命令都需要異步初始化。

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

當 agent 的 shell 命令與終端應在遠程沙箱內而非你的機器上運行時，使用本包。它負責 E2B 家族中的命令執行部分：命令、終端與文件共享同一個遠程執行環境。

### 何時選擇

當組合已經使用 E2B 沙箱且希望命令與終端在其中運行時，選擇本包。宿主執行請選擇本地子進程包。

### 配置

唯一設置是包檢查運行中命令狀態的頻率；默認值適合大多數部署，調大它可以減少遠程請求，代價是退出檢測略慢。

| 字段 | 默認值 | 含義 |
|---|---|---|
| `pollMs` | `20` | 包檢查運行中命令狀態的頻率（毫秒） |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-subprocess-e2b)是每個受支持字段及其 JSDoc 的窮盡式真源。

### 運行命令

agent 可以在沙箱中按指定的工作目錄與環境運行命令，選擇輸出的交付方式（實時流式、在大小上限內捕獲，或路由到應用自身的輸出），并在命令卡住時停止它——停止會先禮貌地請求命令退出，短暫寬限期后再強制終止，因此卡住的命令不會殘留。非常大的輸出可以保存到沙箱中的文件里，供 agent 稍后讀取。命令的退出碼會正常報告；如果命令運行期間沙箱消失，該命令會被視為已結束而不是報錯。

### 使用終端

agent 可以在沙箱中打開交互式終端、發送輸入、讀取輸出，并向其中運行的程序發送信號——提示符、交互式工具與全屏程序的行為與本地完全一致。scrollback 與就緒檢測等終端功能由終端工具提供，無需改動即可工作。

### 保持環境干凈

命令在干凈、沙箱原生的環境中運行：宿主變量與形似憑據的值不會被隱式傳入，只有 agent 顯式請求的條目才會被設置。這使密鑰不會進入沙箱。

### 如果沙箱消失

沙箱是短暫的：如果命令或終端運行期間沙箱被刪除——無論是到期、關閉還是被別處移除——受影響的命令會被視為干凈地結束。不要指望任何工作在沙箱刪除后繼續存在。

默認沙箱鏡像自帶命令工作所需的運行時與工具：`node`、`bash`、`setsid`、`ps`、`awk`、`tr`、`env`、`base64`、`chmod`、`tee`、`head`、`rm`、`kill`、`id` 與 `getent`。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋提供方背后的設計決策，并指出實現它們的代碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

- **提供方私有的遠程身份。** 同步 seam 從不阻塞在網絡請求上。包裝層的私有文件會異步發布進程組身份，供 stdin、觀察、終止與完全停穩檢查使用，同時發布直接退出碼與 spill 有效性；該身份不是請求目標的 PID。
- **單一終止階梯。** 終止、回滾與資源釋放共享同一條進程組信號路徑——先 `SIGTERM`，再 `SIGKILL` 加 SDK kill 回退——并把已證明的完全停穩視為最終狀態。
- **環境必須顯式。** 宿主內容與形似憑據的內容都不會隱式進入沙箱；每個環境值都會被清理，每個 `spec.env` 條目都是顯式選擇。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`E2BSubprocessRuntime`、`Config`、spawn 與 spawnTerminal、資源釋放 |
| [`src/process.ts`](src/process.ts) | `E2BSubprocessHandle`：遠程包裝層、發布、終止、輸出投影 |
| [`src/terminal.ts`](src/terminal.ts) | `E2BTerminalHandle`：PTY 分配、會話拆除 |
| [`src/environment.ts`](src/environment.ts) | 遠程環境探測、清理、序列化 |
| [`src/output.ts`](src/output.ts) | base64 解碼器與有界輸出讀取器 |
| [`src/remote.ts`](src/remote.ts) | 共享控制 shell 輔助：選項構造、輪詢 tick、進程組信號 |
| — | 不發布運行時不變式伴生入口；存活的遠程句柄是拆除邏輯持有的私有狀態，E2B 命令事件流是判定結果的唯一權威來源。 |

### 遠程包裝層

引導腳本會從沙箱 PATH 解析自身所需的工具，拒絕任何缺失或不可執行的路徑，通過 `env -i` 與 `setsid --wait` 執行 exec，把進程組 ID 與退出碼發布到 `ctx.e2b.runtimeRoot/processes` 下的私有文件，并把 stdout 與 stderr 重定向到帶保留完成幀的 base64 編碼器；`tee` 與 `head -c` 約束可選 spill 文件的大小。

### 私有進程身份與發布

同步 seam 會立即返回句柄，同時命令異步啟動。包裝層會發布私有進程組 ID，供 stdin、觀察、終止與完全停穩檢查使用，但該 ID 不是請求目標的 PID。啟動信號會在分配前中止環境與私有狀態準備；分配開始后，取消會等待可清理的臨時 SDK 句柄。

### 環境邊界

一次受信任的控制 shell 探測會從 passwd 條目解析沙箱用戶的登錄主目錄，以 base64 ASCII 傳輸沙箱環境，再進行一次嚴格 UTF-8 解碼；隨后包裝層移除環境中的 `DSH_*` 與形似憑據的名稱（`*KEY*`、`*SECRET*`、`*TOKEN*`），并把每個有效的 `spec.env` 條目恢復為調用方顯式選擇。空名稱、`=` 與違反 NUL 分幀規則的條目會在啟動前被拒絕；在用戶 profile 腳本運行前，此后的命令與 PTY 登錄 shell 會獲得位于根目錄下、全新隨機生成的 `HOME`，并為每個被清理的環境變量名設置空值覆蓋。私有環境文件在使用后會被刪除。

### 輸出處理

遠程包裝層先把原始字節分流到可選的有界 spill 文件，再把每個實時分片編碼為換行分隔的 base64 ASCII 幀；宿主會跨任意 SDK 回調邊界增量恢復字節。pipe 模式把字節寫入宿主 Node 流，inherit 模式寫入 harness 進程流，collect 模式保留有界的宿主尾部并支持偏移讀取。對于 collect 或 inherit 輸出，超過 `graceMs` 后適配器會斷開未完成的 SDK 流并扣留其不完整的 spill；原始 pipe 自然完成時則會等待無損傳輸并保留背壓。批量與流式 stdin 都使用 SDK 句柄。

### 終止階梯

終止與回滾共享同一條容錯信號路徑（`signalRemoteGroups`），在寬限期滿時從 `SIGTERM` 升級到 `SIGKILL`，以 SDK kill 作為回退，并在報告成功前用有界進程表探測證明完全停穩；僅含僵尸進程的進程組視為空，`SandboxNotFoundError` 視為完全停穩。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從家族組合逐步進入子進程 seam 表面，以及渲染它的消費方。

- [E2B 提供方家族地圖](../README.zh.md)——沙箱所有者與三包組合。
- [子進程子系統](../../../docs/subsystems/subprocess.zh.md)——子進程 seam 約定與生成的 Cordis 表面。
- [子進程 seam 包](../../subprocess/subprocess/README.zh.md)——本提供方實現的抽象約定。
- [Bash 執行器](../../shell/bash-local/README.zh.md)——向模型渲染所啟動命令的消費方。
- [PTY 終端后端](../../terminal/terminal-bash/README.zh.md)——渲染終端會話的消費方。
- [生成配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-subprocess-e2b)——每個受支持配置字段及其源聲明。

-----

<a id="model-experience"></a>
## 模型體驗

通過消費方 seam 間接影響模型，例如 bash 執行器家族；它們渲染遠程輸出、退出事實、后臺增量與 spill 路徑。

#### KV Cache 影響

不會直接失效：請求前綴變更由消費方 seam 負責；本后端的傳輸永遠不會進入請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本提供方何時不合適，或何時需要特別的運維注意。它們是當前包約束，不是任務積壓。

- **SDK 仍會在宿主內存中保留完整命令輸出**：即使本適配器公開的是有界原始字節尾部，E2B `CommandHandle.stdout` 與 `.stderr` 仍會累積 base64 傳輸內容，因此無法達到子進程 seam 通常提供的宿主內存邊界，而且傳輸保留量大于源數據流。
- **私有狀態隨沙箱生命周期存在**：進程目錄與有效的 spill 文件會留在 `.dsh-e2b` 下，直到所有者刪除沙箱；本 POC 不提供沙箱內清理。
- **控制狀態與沙箱用戶同 UID**：E2B 以同一默認用戶運行每條命令，因此 `0700`/`0600` 權限無法把 `.dsh-e2b` 控制文件與并發運行的沙箱進程隔離開；真正的隔離需要 E2B 提供按命令用戶或帶外控制通道。
- **數值進程身份沒有復用圍欄**：E2B 公開基于數值 PID/PGID 的輸入、信號發送與清理操作，卻沒有與身份原子綁定的替代方案；在 E2B 新增身份原語，或實際故障證明需要更窄的協議之前，替代方案繼續延后。
- **初始環境探測會繼承沙箱默認值**：E2B 會把命令覆蓋與默認環境條目合并，因此探測無法在枚舉未知且形似憑據的名稱之前將它們置空；因此，該 POC 不支持把 secret 放入沙箱默認環境變量。
- **E2B 不公開信號事實**：適配器請求的 `SIGTERM` 或 `SIGKILL` 只有在包裝層發布的直接退出碼沒有勝出時才報告為信號；其他未請求的 SDK 退出始終保留為退出碼，包括等于 `128 + signal` 的值。
- **無法精確檢查終端 stdin 等待狀態**：E2B 會公開前臺進程組，但不提供證明其正在等待 fd 0 所需的 syscall 證據，因此通用 PTY 后端會回退到受控提示符標記與有界靜默機制。
- **依賴 Linux 工具與 E2B 傳輸語義**：沒有 Windows、逃逸會話恢復或網絡分區的保真層。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文：開放問題與尚未決定的探索方向。它明確不具權威性——已交付的行為、限制與既定理由以上文和包代碼為準。

#### 開放：數值進程身份

E2B 公開基于數值 PID/PGID 的輸入、信號發送與清理操作，卻沒有與身份原子綁定的替代方案。適配器會盡量減少宿主往返，并在 E2B 新增身份原語或實際故障證明需要更窄的協議之前，繼續延后替代方案（TODO(e2b-pgid-identity)）。

#### 開放：替換環境與狀態觀察

由于 E2B 會合并命令覆蓋，初始環境探測會繼承沙箱默認值；又因為 E2B 無法獨立于后代持有的輸出觀察直接命令的退出，collect/inherit 命令狀態需要控制面輪詢。兩者都只能靠 E2B 的新原語來彌合（TODO(e2b-replace-environment)、TODO(e2b-status-watch)）。

</details>
