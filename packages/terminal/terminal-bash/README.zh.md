---
description: "持久終端會話的隨產品交付的 shell 后端：在共享沙箱策略下啟動交互式 bash 或 pwsh，帶就緒檢測與有界逐行輸出。"
kind: "package-reference"
---

# @deepseek-ai/dsh-terminal-bash

[English](README.md) | 中文

## 概述

`dsh-terminal-bash` 在部署的沙箱策略下啟動持久交互式 shell：會話跨工具調用存活，檢測 shell 何時可以接收輸入，并保留有界的逐行輸出供讀取。它提供 `shell` 后端類型，并通過 `shellDialect` 設置在 POSIX 上支持 bash、在 Windows 上支持 pwsh。通過已掛載的子進程提供方，同一個后端既可以與本地執行世界組合，也可以與遠程執行世界組合。全屏終端應用不在其逐行約定的范圍內。

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

當組合需要持久 shell 會話時掛載此后端——cwd、導出的變量、函數或正在運行的交互式子進程等狀態必須跨工具調用存活。它是默認的 `shell` 類型：組合只掛載 `@deepseek-ai/dsh-terminal` 而不掛載它時，將沒有任何會話可打開。

### 何時選擇

當工作需要狀態持續存在的交互式 shell 或 REPL 時選擇此后端：在調試器中單步執行、在 Python 或 Node REPL 中探索，或中斷前臺命令后回到 shell。對于應當一次調用即開始并結束的有界命令，請選擇單次 bash 工具。bash 方言面向 POSIX；pwsh 方言面向 `dsh-pwsh-local` 能解析出 pwsh 可執行文件的 Windows 主機。

### 組合方式

掛載終端服務、子進程提供方、沙箱與策略服務、此后端以及一個工具包：

```yaml
- name: '@deepseek-ai/dsh-terminal'
- name: '@deepseek-ai/dsh-subprocess-local'
- name: '@deepseek-ai/dsh-sandbox-local'
- name: '@deepseek-ai/dsh-sandbox-policy'
- name: '@deepseek-ai/dsh-terminal-bash'
- name: '@deepseek-ai/dsh-tool-terminal'
```

`danger-full-access` 直接啟動 shell。受限模式要求同一執行世界中存在 `ctx.sandbox` 提供方：缺少時，spawn 會在 shell 啟動前失敗。

### 配置

| 字段 | 默認值 | 含義 |
|---|---|---|
| `backendType` | `shell` | 注冊到 `ctx.terminals` 的后端類型 |
| `shellDialect` | `bash` | 交互式 shell 棧：`bash` 或 `pwsh` |
| `shellPath` / `shellArgs` | 按方言 | shell 可執行文件與參數；為空時選擇方言默認值 |
| `maxReadBytes` | `262144` | 一次讀取或一次結算發送返回的最大 UTF-8 字節數 |
| `timeoutMs` | `30000` | 一次發送等待的絕對上限 |
| `disposeGraceMs` | `3000` | 清理升級到 `SIGKILL` 前的寬限時間 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-terminal-bash)是每個字段的窮盡式真源，包括就緒計時（`pollIntervalMs`、`exactProbeAfterMs`、`idleSilenceMs`、`handoffGraceMs`）、終端尺寸（`rows`、`cols`）與 scrollback 上限（`scrollbackLines`、`scrollbackMaxBytes`）。

### shell 方言與就緒

兩種方言暴露相同的就緒約定，因此消費方與方言無關。當 shell 再次就緒時發送即結算：受控提示符被驗證之后、前臺進程組被證明在等待 stdin（Linux）之后、輸出靜默（`inferred_idle`）之后，或到達絕對 `timeoutMs`。`inferred_idle` 或 `timeout` 結果并不證明前臺命令已退出。

### 沙箱與安全運行

shell 在整個生命周期內運行在有效的沙箱邊界之下。當所有者仍有打開的會話或進行中的 spawn 時，改變有效沙箱模式會被拒絕——請先等待創建完成并關閉會話，避免以更寬權限打開的終端在權限降級后繼續存在。后端只提供終端專屬的環境覆蓋；共享憑據清理由子進程提供方負責。

### 可觀察結果與失敗

打開會返回會話 id 與有界啟動消息。發送以四種等待原因之一與一個會話狀態結算；`session_exit` 表示頂層 shell 已退出。設置失敗會拒絕打開：受限模式下缺少沙箱提供方、shell 在啟動期間退出、shell 未能在啟動超時前達到就緒，或調用方取消。清理失敗會拒絕關閉，而不是聲稱成功。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋后端背后的設計并指出實現它們的代碼位置；可觀察行為已在[使用本包](#use-this-package)中說明。

### 設計理念

一個后端服務兩種方言：bash 與 pwsh 共享同一套會話機制——清理器、有界緩沖區、就緒輪詢、取消與關閉——只在 argv、環境與提示符安裝方式上不同。bash 通過 `PS1` 加 `PROMPT_COMMAND` 接收私有標記。pwsh 會寫入提示符函數、固定 UTF-8 控制臺編碼，并只在后端報告 `stdin_read` 后發布啟動；回顯的設置文本不能發布 shell。一個不保留 scrollback 的 `@xterm/headless` 實例會消費原始 PTY 數據，并通過同一句柄返回終端協議響應；逐行 sanitizer 仍是唯一輸出投影。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 后端注冊、沙箱模式限制、argv 與環境組裝、啟動序列 |
| [`src/config.ts`](src/config.ts) | 方言解析、默認值與每個計時字段的校驗 |
| [`src/session.ts`](src/session.ts) | `LocalPtySession`：發送生命周期、就緒輪詢、scrollback、信號、關閉 |
| [`src/sanitize.ts`](src/sanitize.ts) | 流式控制序列清理器與行規范化 |

### 就緒模型

三個有界檔位結算一次發送：來自子進程提供方的精確 stdin 等待證據（僅 Linux）、帶精確可打印尾部的受控私有提示符標記，以及輸出靜默（`inferred_idle`）；絕對超時始終限制等待。pwsh 啟動的完整設置循環共用同一個截止時間，因此 `inferred_idle` 后續發送不會重新計時。提供方寫入前收集的證據會在寫入邊界丟棄，早于寫入的 stdin 等待不算寫入后就緒，未知的前臺狀態絕不是精確空閑的正向信號。

### 發送取消與關閉

取消先把排隊輸入標記為已取消，再在任何在途的提供方寫入結算后向當前前臺進程組發送真正的 `SIGINT`；它絕不會通過寫入 `\x03` 模擬中斷。關閉會停止就緒輪詢、終止提供方擁有的進程樹、等待完全停穩，并把活躍發送結算為 `session_exit`。

### 沙箱模式限制

當所有者存在打開的會話或進行中的 spawn 時，凡是會改變有效沙箱模式的寫入都會在 `sandbox/mode` 事件提交前被拒絕。該限制綁定到確切所有者，并在保留現有會話的提供方重新加載后依然有效。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從共享終端模型進入服務、工具與執行世界基底。

- [終端子系統參考](../../../docs/subsystems/terminal.zh.md)——此后端實現的服務約定與生成的 `ctx.terminals` 接口面。
- [terminal 服務](../terminal/README.zh.md)——后端注冊、所有者限制與清理語義。
- [tool-terminal 工具](../tool-terminal/README.zh.md)——操作會話的面向模型工具。
- [子進程 seam](../../../docs/subsystems/subprocess.zh.md)——負責 PTY 分配與進程樹清理的終端原語。
- [持久 PTY Agent Note](../../../.agents/notes/implemented/feature/2026-07-16-persistent-pty-sessions.zh.md)——能力設計與暫緩邊界。
- [持久 pwsh Agent Note](../../../.agents/notes/archived/architecture/2026-08-11-pwsh-persistent-pty.md)——Windows 基底與 pwsh 方言。

-----

<a id="model-experience"></a>
## 模型體驗

### 間接消費方

#### 模型看到什么

此包不注冊提示詞或工具。模型通過 `@deepseek-ai/dsh-tool-terminal` 或其他 PTY 消費方可能收到有界的啟動輸出、發送增量、scrollback 頁、就緒原因與清理錯誤。

#### Token 影響

在消費方返回有界輸出之前，保留的 PTY scrollback 不會進入模型歷史。

#### KV Cache 影響

不會直接失效；消費方結果保持僅追加。

### 沙箱策略上下文

#### 模型看到什么

組合此后端期間，`sandbox-policy` 歸屬方會向提示詞貢獻與具體能力無關的 `sandbox:policy` 運行時上下文子句。

#### Token 影響

后端掛載期間，請求中會包含該策略子句。

#### KV Cache 影響

常駐策略發生變化時，會在保留的歷史之后追加一份取代先前狀態的運行時上下文快照。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明后端何時不合適或需要特別的運維注意。它們是當前包約束，不是通用 shell 對比或任務積壓。

- **僅逐行輸出**——headless xterm 只為終端協議響應維護控制序列狀態。返回輸出仍按行規范化；不支持全屏備用緩沖區交互。
- **沒有精確檔時，就緒是啟發式的**——精確 stdin 等待檢測取決于已掛載的子進程提供方；無法證明該狀態的提供方（macOS、Windows）按提示符標記與靜默／超時就緒結算。
- **受限沙箱中的 pwsh 引導**——提示符函數與 UTF-8 編碼固定操作通過 `[Console]::` 寫入，Windows ACL 沙箱的只讀模式可能拒絕。若因此無法獲得標記就緒狀態，啟動會在 `timeoutMs` 到期時拒絕，而不會發布不完整的 shell。
- **清理保證屬于提供方**——進程樹清理是 `SubprocessTerminalHandle` 的約定，而不是此后端的。
- **會話不隨進程退出存活**——harness 重啟會銷毀所有會話。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。就緒狀態、終端緩沖區與進程樹狀態都是各會話私有的實現狀態，后端不發布獨立的生命周期流或快照。
