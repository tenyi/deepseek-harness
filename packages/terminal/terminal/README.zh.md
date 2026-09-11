---
description: "面向部署方與消費方的持久終端會話說明，用于選擇、組合或擴展限定所有者范圍的 ctx.terminals 服務。"
kind: "package-reference"
---

# @deepseek-ai/dsh-terminal

[English](README.md) | 中文

## 概述

`dsh-terminal` 為 harness 提供持久且限定所有者范圍的終端會話：會話讓 shell 或 REPL 狀態跨工具調用存活，且每個操作都被限制在創建它的那個確切 agent（智能體）內。本包提供 `ctx.terminals` 服務，負責生成不透明的會話 id、通過已注冊的后端路由會話創建，并在所有者或服務 dispose（資源釋放）時等待完全停穩的清理。它本身不定義任何終端機制：`dsh-terminal-bash` 之類的后端負責啟動與就緒檢測，`dsh-tool-terminal` 中的面向模型工具負責呈現。會話只存在于進程本地：harness 重啟后不會恢復。

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

當組合需要狀態跨工具調用存活的終端會話時，掛載 `@deepseek-ai/dsh-terminal`。單獨的服務本身沒有用處：請與 `@deepseek-ai/dsh-terminal-bash` 之類的后端、`@deepseek-ai/dsh-tool-terminal` 之類的工具包配對，并在同一個組合中一起加載。

### 何時選擇

當工作狀態存在于終端而非文件時，選擇持久終端：在調試器中單步執行、在 Python 或 Node REPL 中探索，或中斷前臺命令后回到 shell。對于有界操作，請選擇單次 bash、read、write 與 edit 工具——它們保留更強的校驗、審批、輸出上限與回放約定。會話只存在于進程本地：harness 進程退出時它們會消失，因此需要持久的工作應寫入文件或其他持久系統。

### 組合方式

將會話服務與后端、工具包一起加載：

```yaml
- name: '@deepseek-ai/dsh-terminal'
- name: '@deepseek-ai/dsh-terminal-bash'
- name: '@deepseek-ai/dsh-tool-terminal'
```

后端提供一個穩定類型——隨附的 shell 后端提供 `shell`——工具按該類型打開會話。shell 后端還額外要求沙箱、沙箱策略與子進程提供方；完整組合見其 [README](../terminal-bash/README.zh.md)。

### 會話能做什么

會話存在后，消費方可以：打開會話并獲得其 id 與有界啟動輸出；發送文本（可選地提交 Enter）并等待 shell 再次就緒或發送超時；讀取有界保留輸出；向前臺進程組投遞一個允許的信號；關閉會話并等待其進程樹結束；以及列出調用方擁有的會話。每個會話同一時間最多有一個活躍發送；第二次發送會失敗，直到第一次結算。

### 所有權與隔離

每個會話都由打開它的確切 agent 擁有。凡是指名會話的操作，只要調用方不是該 agent 就會被拒絕，因此即使模型獲知另一個 agent 的會話 id，也無法操作其終端。可選的會話 `name` 是所有者本地的顯示元數據——例如 `main` 或 `gdb` 這樣的標簽——并且只在所有者范圍內唯一。

### 可觀察結果與失敗

成功打開會返回會話 id、類型、后端提供的 pid（如有）、狀態與有界啟動消息。發送以等待原因結算：`stdin_read`（shell 正在等待輸入）、`inferred_idle`（輸出靜默）、`timeout` 或 `session_exit`（頂層 shell 已退出）。失敗攜帶穩定的機器可路由錯誤碼：后端類型缺失（`NO_BACKEND`）、會話未知（`NO_SESSION`）、屬于其他 agent 的會話（`FOREIGN_SESSION`）、并發第二次發送（`SEND_ACTIVE`），或所有者不再存活（`OWNER_NOT_LIVE`）。后端設置失敗會在發布任何內容之前拒絕打開；清理失敗會拒絕關閉，而不是聲稱成功。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋服務背后的設計并指出實現它們的代碼位置；可觀察行為已在[使用本包](#use-this-package)中說明。

### 設計理念

服務擁有終端機制以外的一切：會話身份、發布、授權與清理。后端負責會話如何啟動、檢測就緒、保留輸出與關閉；服務只在后端設置成功后發布會話。這個拆分讓同一個注冊表可用于不同的終端基底。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | `TerminalSessionService`：后端注冊表、spawn/send/read/signal/kill/list、所有者清理與 dispose |
| [`src/types.ts`](src/types.ts) | 共享約定：后端接口、會話類型、等待原因、信號集合、錯誤碼 |
| — | 不發布運行時不變式伴生入口；后端與限定所有者范圍的會話注冊表均為私有可變狀態，且服務既不暴露獨立的生命周期流，也不暴露不限定范圍的快照。 |

### 數據模型與生命周期

每個已發布會話是一條記錄，包含其 id、所有者、可選名稱、后端類型、后端會話，以及當前唯一的活躍發送。未發布的 spawn 按所有者以預留形式跟蹤，并持有服務擁有的中止信號。dispose 會中止待完成的 spawn、等待其結算與回滾，然后關閉每個擁有的會話并等待完全停穩，最后運行所有者分離器；清理失敗會拒絕生命周期，而不是聲稱成功。

### 所有權與清理規則

- 限制基于確切的 `Agent` 對象：`hasOwnerActivity(owner)` 覆蓋從尚未發布的設置到最終關閉的全過程，沒有發布競態，因此生命周期策略可以精確限制所有者。
- 無法清理部分啟動資源的后端會以 `TerminalBackendCleanupError` 拒絕；服務會將該失敗保留為受跟蹤的所有者活動，直到所有者或服務 dispose 消費并報告它。
- 調用方取消保留其確切的 `AbortSignal.reason`；`kill()` 與 dispose 只在后端捕獲的進程樹完全停穩后完成。

### 發送預留

服務在返回操作之前同步為一個活躍發送預留會話，包括在后臺任務的 job id 可見之前；第二次發送會以 `SEND_ACTIVE` 失敗，因此輸出與取消永遠不會跨操作所有權。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從共享終端模型進入隨附后端、工具與設計證據。

- [終端子系統參考](../../../docs/subsystems/terminal.zh.md)——共享類型、后端與會話約定，以及生成的 `ctx.terminals` 接口面。
- [terminal/ 包映射](../README.zh.md)——三包家族及其組合方式。
- [terminal-bash 后端](../terminal-bash/README.zh.md)——提供 `shell` 類型的隨附 shell 后端。
- [tool-terminal 工具](../tool-terminal/README.zh.md)——操作會話的 6 個面向模型工具。
- [持久 PTY Agent Note](../../../.agents/notes/implemented/feature/2026-07-16-persistent-pty-sessions.zh.md)——設計理由、備選方案與暫緩邊界。

-----

<a id="model-experience"></a>
## 模型體驗

### 間接消費方

#### 模型看到什么

沒有直接可見內容。此包不注冊提示詞或工具；可見 schema 與結果文本由 `@deepseek-ai/dsh-tool-terminal` 負責。

#### Token 影響

沒有直接影響。活躍會話狀態保留在進程本地，直到消費方返回有界結果。

#### KV Cache 影響

不會直接失效；請求前綴變更由 `@deepseek-ai/dsh-tool-terminal` 負責。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明服務何時不合適。它們是當前包約束，不是任務積壓。

- **進程本地會話**——會話與原始 scrollback 只存在于本進程中，harness 重啟后不會恢復；需要持久的工作必須寫入文件或其他持久系統。
- **不支持跨 agent 共享**——會話有意保持單一所有者，沒有共享或轉移會話的途徑。
- **沒有聲明式自動啟動**——會話只在 agent 工具調用期間創建。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文，明確不具權威性：已交付的行為、限制與既定理由以本文檔上文、包代碼與所鏈接的 Agent Note 為準。

#### 未決方向

- 共享會話設計需要獨立的權限約定。
- 聲明式自動啟動功能需要通過尚未發布的 agent 設置組合而成。

</details>
