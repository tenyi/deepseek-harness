---
description: "面向模型的持久 pwsh 工具，供選擇、配置或排查跨調用保留的按所有者隔離 PowerShell 狀態的使用者與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-pwsh-persistent

[English](README.md) | 中文

## 概述

`dsh-tool-pwsh-persistent` 為每個 agent（智能體）提供 `pwsh` 工具，跨調用保留其當前目錄、環境變量、函數與后臺任務。同一 agent 的命令串行運行，不同 agent 維護相互隔離的 shell 狀態。多步 PowerShell 工作應選擇本包；若每條命令都應從干凈狀態開始，請使用 `dsh-tool-pwsh`，需要交互 stdin 時則使用 terminal 工具。請配置支持 pwsh 的后端和單條命令超時；超時或顯式 `exit` 會丟棄 shell，因此下次調用從全新狀態開始。

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

在 agent 需要在命令之間保持 PowerShell 狀態的任何組合中加載本插件——它是 `dsh-tool-pwsh` 的持久對應物，用于依賴跨調用狀態的工作。它注冊 `pwsh` 工具，需要 `ctx.tools` 與 `ctx.terminals` 服務，并在執行時需要擁有者 agent 會話。

### 何時選擇

當工作依賴跨調用 PowerShell 狀態時選擇持久工具；當每條命令都應從已知、干凈的環境開始時選擇 `dsh-tool-pwsh`。這里不支持需要交互 stdin 的命令——讀取輸入的前臺子進程會一直阻塞到命令超時，隨后重置 shell——因此交互工作屬于 terminal 工具。

### 最小配置

默認的 `shell` 后端通過配置了 `shellDialect: pwsh` 的 `dsh-terminal-bash` 實例啟動 PowerShell shell；部署方可以注冊其他 pwsh 方言 PTY 后端并按名稱選擇。

```yaml
- name: '@deepseek-ai/dsh-terminal'
- name: '@deepseek-ai/dsh-terminal-bash'
  config:
    shellDialect: pwsh
- name: '@deepseek-ai/dsh-tool-pwsh-persistent'
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `backendType` | `shell` | 用于每個 agent shell 的已注冊 PTY 后端 |
| `timeoutMs` | `300,000` | 單條命令的墻鐘上限；超時關閉 shell |
| `maxOutputChars` | `16,000` | 保留的命令輸出字符上限；固定診斷信息在其后追加 |
| `description` | `Run commands in a persistent PowerShell shell. State, including the current directory and exported environment variables, persists across calls for this agent.` | 面向模型的環境約定；部署方可描述自己的環境 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-pwsh-persistent)是每個受支持字段及其 JSDoc 的窮盡式真源。

### agent 可以依賴什么

命令共享每個 agent 一個 shell，因此 cwd、`$env:` 變量、函數與后臺任務都會跨調用保留。結果排除私有完成標記、shell 提示符與回顯的輸入行。非零的包裝命令追加 `[exit code: N]`——命令運行原生程序時給出確切原生退出碼，PowerShell 終止錯誤則為 `1`。在報告該狀態前就退出的 shell 改為追加 `[shell exited: code N]`、`[shell killed by signal: SIG]` 或 `[shell exited]`（Windows 強制終止報告 exit 1 且沒有信號），然后重置并告訴 agent 下一次調用從全新狀態開始。長輸出保留最早的已保留前綴并附裁剪通知；若 terminal 已經丟棄該前綴，結果會明確說明。

### 可能出什么問題

沒有擁有者 agent 會話的調用會以 `pwsh requires an owning agent session` 失敗，沒有 pwsh 方言 PTY 后端的組合會激活該工具，但首次調用以 `no PTY backend registered for "shell"` 失敗。模型重定義 `prompt` 函數會移除就緒標記，shell 隨后在靜默層級而非標記快路徑上結算。命令內的原始 ESC 字符會在執行前被 PSReadLine 消費，不受支持。超時或取消會關閉不確定的 shell、丟棄結果并報告重置。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋工具背后的設計決策，并指出實現它們的代碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

- **`dsh-tool-bash-persistent` 的刻意孿生。** 會話注冊表、輪詢循環與重置約定按設計鏡像持久 bash 工具（[pwsh 持久 PTY Agent Note](../../../.agents/notes/archived/architecture/2026-08-11-pwsh-persistent-pty.md)）。
- **prompt 函數就緒。** 工具安裝自己的 `prompt` 函數，打印 BEL 結尾的 OSC 標記加可打印提示符；OSC 標記攜帶最后的退出碼，可打印提示符讓每條命令都能結算，因此模型重定義 `prompt` 會把就緒降級到靜默層級。
- **PSReadLine 回顯靠錨定剝離。** PowerShell 會把提交的輸入渲染回流中；標記錨定提取與包裝源碼剝離移除回顯，而跨終端寬度換行的包裝可能在部分輸出結果中留下部分回顯。
- **重置，而非修復。** 任何不確定狀態——顯式 `exit`、超時、發送失敗、中止——都會關閉 shell 并讓下一次調用從全新狀態開始。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：shell 注冊表、prompt 設置、命令包裝、scrollback 輪詢、提取與渲染 |
| — | 不發布運行時不變式伴生入口；適配器私有的 owner-to-shell 緩存不存在可觀察的事件或數據關系。生命周期測試無需僅為不變式增加公共 API 即可驗證其清理。 |

### 命令流程

首條命令通過 `ctx.terminals.spawn` 生成 shell，安裝 `prompt` 覆蓋，并等待就緒。隨后每條命令都包裝成一行物理文本——`Write-Output` 起始標記、用反引號轉義進雙引號字符串的命令體、`Write-Output` 結束標記加退出狀態——因此 PSReadLine 對換行包裝的回顯無法偽造完成。工具以 1,000 行一頁輪詢 scrollback，直到出現結束標記或完成的提示符，提取區間、剝離回顯的包裝與提示符，并連同任何狀態標記一起渲染。超時會中止截止時間、捕獲部分輸出并重置 shell。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從 terminal 家族逐步進入 seam、后端，以及持久 shell 設計背后的設計筆記。

- [terminal 包映射](../../terminal/README.zh.md)——持久 PTY 能力家族。
- [terminal seam](../../terminal/terminal/README.zh.md)——工具背后的 `ctx.terminals` 服務。
- [terminal-bash 后端](../../terminal/terminal-bash/README.zh.md)——默認后端，配置 `shellDialect: pwsh`。
- [pwsh 持久 PTY Agent Note](../../../.agents/notes/archived/architecture/2026-08-11-pwsh-persistent-pty.md)——pwsh 側會話設計及其理由。
- [持久 PTY 會話 Agent Note](../../../.agents/notes/implemented/feature/2026-07-16-persistent-pty-sessions.zh.md)——按所有者會話的設計及其理由。
- [生成的工具目錄](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-pwsh-persistent)——`pwsh` 參數 schema 的確切內容。
- [生成的配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-pwsh-persistent)——每個受支持配置字段及其源聲明。

-----

<a id="model-experience"></a>
## 模型體驗

### 工具 schema

#### 模型看到什么

生成的 [`pwsh` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-pwsh-persistent)，包括配置的 `description`。本插件不貢獻獨立的系統提示詞區段；人設與環境指引由部署方負責。

#### Token 影響

`pwsh` 可見期間產生固定 schema 開銷。

#### KV Cache 影響

只要配置的描述與 schema 不變，前綴就保持穩定。

### 工具結果

#### 模型看到什么

命令共享每個 agent 一個 shell，因此 cwd、`$env:` 變量、函數與后臺任務都會跨調用保留。結果排除私有完成標記、shell 提示詞與回顯的輸入行（PSReadLine 會把提交的輸入渲染回流中；標記錨定提取與包裝源碼剝離會移除它）。非零的包裝命令追加 `[exit code: N]`——命令運行原生程序時給出確切原生退出碼，PowerShell 終止錯誤則為 `1`。在報告該狀態前就退出的 shell 改為追加 `[shell exited: code N]`、`[shell killed by signal: SIG]`，或后端兩者都未提供時的 `[shell exited]`（Windows 強制終止報告 exit 1 且沒有信號），然后重置并告訴模型下一次調用從全新狀態開始。長輸出保留最早的已保留前綴并附裁剪通知；若 terminal 已經丟棄該前綴，結果會明確說明。超時返回有界部分輸出、關閉不確定的 shell 并報告重置。

#### Token 影響

依數據而定。`maxOutputChars` 限制保留的命令輸出；固定的裁剪、丟失前綴、狀態、超時與重置診斷可能延長結果。

#### KV Cache 影響

僅追加的工具結果位于可復用請求前綴之后。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明工具何時不合適或需要特別小心。它們是當前包約束，不是任務積壓。

- **工具需要擁有者 agent 與帶 pwsh 方言的真實 terminal 后端**——Windows ConPTY 或 POSIX pwsh。
- **輸入回顯不可避免**——PowerShell 的 PSReadLine 會把提交的輸入渲染回終端流，而且沒有 `stty -echo` 等價物。標記錨定提取在完整結果中排除回顯；包裝源碼剝離覆蓋回退路徑，但跨終端寬度換行的包裝可能在部分輸出結果中留下部分回顯，受 `maxOutputChars` 設界。
- **模型命令內的原始 ESC 字符不受支持**——PSReadLine 會在執行前消費它們。包裝器會轉義它需要的控制字節（`[char]27` 構造的 OSC 標記、正文的反引號轉義）。
- **模型重定義 `prompt` 函數會移除就緒標記**——shell 隨后在靜默層級而非標記快路徑上結算。
- **命令期間沒有交互 stdin**——讀取輸入的前臺命令會一直阻塞到命令超時，隨后重置 shell。
- **Windows 上 SIGTSTP/SIGHUP 不可用**（后端拒絕）；SIGINT 以控制臺級 Ctrl-C 輸入寫入投遞，在提示詞處會取消待處理行而不是向進程發信號。
- **在 Windows ACL 沙箱的只讀模式下，pwsh 以 ConstrainedLanguage 啟動**，可能拒絕引導的 `[Console]::` 編碼固定與 prompt 標記。命令仍可通過可打印提示詞與靜默層級結算，但非 ASCII 輸出可能跟隨宿主代碼頁。
- **BEL 結尾的 OSC 標記目前只是就緒信號**——通向模型的 BEL 事件通道仍被推遲，與當前實現保持一致。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
