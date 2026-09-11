---
description: "面向模型的持久 bash 工具，供選擇、配置或排查跨調用保留的按所有者隔離 shell 狀態的使用者與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-bash-persistent

[English](README.md) | 中文

## 概述

本包為 agent（智能體）提供 `bash` 工具，使 cwd、導出的變量、函數與后臺任務跨調用保留。每個 agent 都有隔離的 shell，其命令串行執行。需要跨調用狀態的工作流應選擇本包；每條命令都應從干凈環境開始時使用 `dsh-tool-bash`。配置 PTY 后端與單條命令的超時；`exit`、超時或取消會重置 shell，而等待 stdin 的交互式命令可能一直運行到超時。

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

在 agent 需要在命令之間保持 shell 狀態的任何組合中加載本插件——例如長時間構建會話、已激活的環境，或為后續步驟導出變量的腳本。它注冊 `bash` 工具，需要 `ctx.tools` 與 `ctx.terminals` 服務，并在執行時需要擁有者 agent 會話。

### 何時選擇

當工作依賴跨調用狀態時選擇持久工具：一次性 `dsh-tool-bash` 調用無法記住 `cd` 或導出的變量。當每條命令都應從已知、干凈的環境開始，或命令又短又獨立時，選擇一次性工具。這里不支持需要交互 stdin 的命令——讀取輸入的前臺子進程會一直阻塞到命令超時——因此交互工作屬于 terminal 工具。

### 最小配置

默認的 `shell` 后端通過 `dsh-terminal-bash` 啟動交互式 bash；部署方可以注冊其他 PTY 后端并按名稱選擇。

```yaml
- name: '@deepseek-ai/dsh-terminal'
- name: '@deepseek-ai/dsh-terminal-bash'
- name: '@deepseek-ai/dsh-tool-bash-persistent'
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `backendType` | `shell` | 用于每個 agent shell 的已注冊 PTY 后端 |
| `timeoutMs` | `300,000` | 單條命令的墻鐘上限；超時關閉 shell |
| `maxOutputChars` | `16,000` | 保留的命令輸出字符上限；固定診斷信息在其后追加 |
| `description` | `Run commands in a persistent bash shell. State, including the current directory and exported environment variables, persists across calls for this agent.` | 面向模型的環境約定；部署方可描述自己的環境 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-bash-persistent)是每個受支持字段及其 JSDoc 的窮盡式真源。

### agent 可以依賴什么

命令共享每個 agent 一個 shell，因此狀態一直保留到 `exit`、超時或重置——每一種都會關閉 shell 并告訴 agent 下一次調用從工作區的新目錄與環境開始。結果排除私有完成標記；每條完成的命令都追加 `[Command finished with exit code N]`，而在報告該狀態前就退出的 shell 改為追加 `[shell exited: code N]`、`[shell killed by signal: SIG]` 或 `[shell exited]`，然后重置。長輸出保留最早的已保留前綴并附裁剪通知；若 terminal 已經丟棄該前綴，結果會明確說明，而不是把尾部當作完整輸出呈現。

### 可能出什么問題

沒有擁有者 agent 會話的調用會以 `bash requires an owning agent session` 失敗，沒有 PTY 后端的組合會激活該工具，但首次調用以 `no PTY backend registered for "shell"` 失敗。交互式前臺子進程（例如 REPL）只有在后端證明其 stdin 等待時才提前返回部分輸出；否則調用一直運行到 `timeoutMs`，隨后關閉不確定的 shell 并報告重置。取消也會重置并丟棄結果，即使完整狀態標記已經可觀察。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋工具背后的設計決策，并指出實現它們的代碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

- **每個 owner 一個 shell，互不共享。** shell 注冊表按調用方 `Agent` 為每個會話建鍵，因此并發 agent 永不共享狀態，同一 agent 的命令通過按 owner 的隊列串行化。
- **標記錨定提取。** 每條命令都用攜帶退出狀態的唯一起止標記包裝；工具輪詢 PTY scrollback 并提取真實標記之間的區間，因此提示符與回顯輸入永不泄漏進結果。
- **重置，而非修復。** 任何不確定狀態——顯式 `exit`、超時、發送失敗、中止——都會關閉 shell 并讓下一次調用從全新狀態開始，因為半知情的 shell 不如干凈的 shell。
- **按 owner 的生命周期。** shell 在首次使用時惰性創建，在插件釋放或 owner 拆除時終止；按所有者隔離的 `ctx.terminals` 服務把每個操作都圍欄到擁有它的 agent。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：shell 注冊表、命令包裝、scrollback 輪詢、提取與渲染 |
| — | 不發布運行時不變式伴生入口；適配器私有的 owner-to-shell 緩存沒有可觀察的事件或數據關系。shell 復用仍可通過工具執行觀察。生命周期測試會驗證其清理行為，無需僅為不變式增加公共 API。 |

### 命令流程

首條命令通過 `ctx.terminals.spawn` 生成 shell，禁用輸入回顯（`stty -echo`），并等待就緒。隨后每條命令都包裝成一行物理文本——printf 起始標記、用 `$'…'` 轉義的命令體、printf 結束標記加 `$?`——因此內嵌換行無法把終端提示符泄漏進結果。工具以 1,000 行一頁輪詢 scrollback，直到出現結束標記，提取區間并連同任何狀態標記一起渲染。超時會中止截止時間、捕獲部分輸出并重置 shell。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從 terminal 家族逐步進入 seam、后端，以及按所有者會話背后的設計筆記。

- [terminal 包映射](../../terminal/README.zh.md)——持久 PTY 能力家族。
- [terminal seam](../../terminal/terminal/README.zh.md)——工具背后的 `ctx.terminals` 服務。
- [terminal-bash 后端](../../terminal/terminal-bash/README.zh.md)——默認的 `shell` 后端。
- [tool-terminal](../../terminal/tool-terminal/README.zh.md)——面向交互工作的六個模型側 terminal 工具。
- [持久 PTY 會話 Agent Note](../../../.agents/notes/implemented/feature/2026-07-16-persistent-pty-sessions.zh.md)——按所有者會話的設計及其理由。
- [生成的工具目錄](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-bash-persistent)——`bash` 參數 schema 的確切內容。
- [生成的配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-bash-persistent)——每個受支持配置字段及其源聲明。

-----

<a id="model-experience"></a>
## 模型體驗

### 工具 schema

#### 模型看到什么

生成的 [`bash` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-bash-persistent)，包括配置的 `description`。本插件不貢獻獨立的系統提示詞區段；人設與環境指引由部署方負責。

#### Token 影響

`bash` 可見期間產生固定 schema 開銷。

#### KV Cache 影響

只要配置的描述與 schema 不變，前綴就保持穩定。

### 工具結果

#### 模型看到什么

命令共享每個 agent 一個 shell，因此 cwd、導出的變量、已激活的環境、函數與后臺任務都會跨調用保留。結果排除私有完成標記。當 shell 在沒有打印完成標記的情況下再次讀取 stdin——`exec`、中斷，或提供方證明其 stdin 等待的交互式前臺子進程之后——調用返回捕獲的部分輸出，它可能以后端自己的提示符文本結尾。每條完成的命令都追加 `[Command finished with exit code N]`；在報告該狀態前就退出的 shell 改為追加 `[shell exited: code N]`、`[shell killed by signal: SIG]`，或后端兩者都未提供時的 `[shell exited]`，然后重置并告訴模型下一次調用從全新狀態開始。長輸出保留最早的已保留前綴并附裁剪通知。若 PTY 已經丟棄該前綴，結果會明確說明，而不是把尾部當作完整輸出呈現。超時返回有界部分輸出并追加 `[Command timed out or OOM]`、關閉不確定的 shell 并報告重置。

#### Token 影響

依數據而定。`maxOutputChars` 限制保留的命令輸出；固定的裁剪、丟失前綴、狀態、超時與重置診斷可能延長結果。

#### KV Cache 影響

僅追加的工具結果位于可復用請求前綴之后。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明工具何時不合適或需要特別小心。它們是當前包約束，不是任務積壓。

- **工具需要擁有者 agent 與真實的 PTY 后端**——無 agent 的調用與無法啟動交互 shell 的后端都會失敗。
- **交互式前臺子進程只在子進程提供方證明其 stdin 等待時才提前返回部分輸出**——否則調用一直運行到 `timeoutMs`。
- **顯式 `exit` 與超時會丟棄 shell 狀態**——取消同樣重置并丟棄結果，即使完整狀態標記已經可觀察；下一次調用啟動全新 shell。
- **網絡訪問與包鏡像等環境事實屬于配置的 `description`**——而不是本包的默認描述。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
