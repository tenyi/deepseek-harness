---
description: "子進程服務的本地宿主提供方：在宿主機器上運行由 OS 所有的受管范圍與真實終端會話，并明確披露較弱的 fallback。"
kind: "package-reference"
---

# @deepseek-ai/dsh-subprocess-local

[English](README.md) | 中文

## 概述

在任何于宿主機上運行子進程的組合中掛載 `dsh-subprocess-local`。它解析本地可執行文件，為普通 Linux 與 Windows 命令以及受支持的 Linux 終端會話提供由 OS 所有的受管范圍，并通過 `node-pty` 提供真實終端會話；不受支持的宿主使用明確披露的較弱 fallback。它沒有任何配置，因此每項處置方式、限制、終端尺寸與寬限期都隨 spawn 請求來自調用方能力 seam。輸出收集在內存中保留一段有界尾部，并可選地用 spill 文件恢復完整流；子進程從清理后的環境起步；dispose（資源釋放）會終止并等待每個選定范圍或會話完全停穩。

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

把提供方與它的消費方掛載在同一組合中，并完全按子進程服務的規定啟動進程；本包只決定這些進程在宿主機上如何運行。在 Windows 上，非終端子進程與 `taskkill` 輔助進程會隱藏窗口，因此后臺操作不會搶占焦點。遵循進程啟動可見性設置的 GUI 窗口也會被隱藏。

### 掛載提供方

在與消費方相同的組合中加載本提供方。它沒有任何配置字段：每項選擇都隨 spawn 請求到達，因此隨部署變化的決策留在調用方的配置里。

```yaml
- name: '@deepseek-ai/dsh-subprocess-local'
- name: '@deepseek-ai/dsh-bash-local'
```

### 解析可執行文件

絕對可執行文件路徑會被驗證；裸名稱根據清理后的 PATH 并以平臺感知的可執行文件擴展名（Windows 上為 `.COM`/`.EXE`/`.BAT`/`.CMD`）解析。含分隔符的相對路徑會被拒絕——請提供絕對路徑或裸 PATH 名稱——相對 PATH 條目從宿主進程 cwd 解析。

### 收集輸出

收集模式在內存中保留一條流的最后 `maxBytes`——錯誤與最終結果通常聚集在末尾——并在配置了 `spill` 上限時把完整流追加到 OS 臨時目錄下每進程目錄中的私有文件（`0700` 目錄、`0600` 隨機命名文件）。某條流大于 spill 上限時，會丟棄不完整的 spill，只返回帶截斷標記的尾部。讀取基于偏移量且從不消費，因此后臺讀取與批量讀取在退出前后都可以共存。

### 運行終端會話

`spawnTerminal` 分配真實 PTY 并橋接 UTF-8 文本；你可以檢查當前前臺進程組并向其發送信號，還可以等待一次 `terminate()` 操作。在受支持的 Linux 宿主上，原始終端 argv 直接在 user-systemd scope 內運行；node-pty PID、會話 leader、控制終端、前臺 `inputWaiting` 與就緒狀態保持不變，而 scope 會擁有已重新設定父進程或調用 `setsid` 的后代。在 fallback 宿主上，清理會保留根進程樹和可觀察會話中的精確身份，但無法重新發現每個已經逃逸的后代。Linux 的精確輸入等待要求前臺線程的 fd 0 標識 shell 的控制終端，且線程當前的 syscall 正在等待該 fd；如果內核拒絕 syscall 探測，上層 PTY 后端會改用空閑推斷。在 Windows 上，SIGINT 以 Ctrl-C 輸入寫入投遞，SIGTSTP 與 SIGHUP 不受支持，拆卸會通過進程表驗證 shell 已終止，因為被外部終止的 shell 可能永遠不會觸發 PTY 退出通知。

### 關閉行為

正常 dispose 會終止每個仍在運行的受管范圍與終端會話并等待其完全停穩。在 JavaScript 可觀察的宿主退出期間——直接 `process.exit()`、默認未捕獲異常、默認未處理 rejection——同步最終清理會請求 Linux scope 終止其成員，同步終止每個 Windows runner 以關閉其唯一 Job handle，并為 fallback 使用既有 PGID、`taskkill` 或已捕獲身份操作。它不創建 Promise 或定時器，也不聲稱已經完全停穩。同一退出階段會刪除未持有任何已完成 spill 文件的每進程私有 spill 目錄；已完成的 spill 文件作為完整輸出恢復產物保留，直到外部機制清理。未處理的 `SIGTERM`/`SIGINT`/`SIGHUP`、`SIGKILL`、fatal OOM、native crash 與斷電需要外部 supervisor。

Linux 普通進程和終端進程即使在 bootstrap 消費啟動請求前被取消，也會保留實際觀察到的終止信號。如果沒有請求對應的終止信號，未消費的請求仍會報啟動失敗；已記錄的 pre-exec 錯誤始終優先。`waitForExit()` 獨立證明 scope 已為空，其中也包括 payload 在進入該 scope 的 cgroup 前就被殺死、manager 因此讓它保持 active 卻沒有任何進程的 scope。

### 可能出錯的地方

無法解析的可執行文件會明確報出穩定錯誤。當 spawn 或提供方故障使 direct outcome 無法產生時，`done` 會 reject；該 rejection 不能證明 target 是否已經開始執行。若所選 owner 無法再證明其范圍為空，`waitForExit()` 會 reject，清理仍會嘗試終止。越過保留尾部的讀取是 `lossy` 的，并在 spill 文件存在時指向它。fallback 進程組或已觀察終端 session 可能遺漏在觀察前逃逸的后代——見下文限制。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋提供方背后的設計決策，并指出實現它們的代碼位置；可觀察行為已在[使用本包](#use-this-package)中說明。

### 設計理念

每次 spawn 都為信號發送與完全停穩選擇同一個 owner。受支持的 Linux 普通命令與終端啟動使用臨時 user-systemd scope，受支持的 Windows 普通命令使用由 helper 持有、關閉時終止成員的 Job。macOS、舊版或不可用的 user-systemd，以及不可用的 Windows 原生支持使用既有 detached 進程組、`taskkill` 或終端會話觀察，并只告警一次。native 路徑可能已經啟動命令后，本提供方絕不會通過 fallback 重放該命令。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 服務接線：存活句柄集合、dispose、宿主退出最終清理、可執行文件查找 |
| [`src/spawn.ts`](src/spawn.ts) | 共享進程管道：直接結果、保尾收集、spill 文件與 fallback spawn |
| [`src/managed-owner.ts`](src/managed-owner.ts) | 每個普通句柄使用的私有信號與等待 owner |
| [`src/linux-scope.ts`](src/linux-scope.ts) | Linux user-systemd 能力檢查、scope 啟動、信號發送與完全停穩 |
| [`src/linux-execve.ts`](src/linux-execve.ts) | Linux libc 進程映像替換與繼承標準文件描述符保留 |
| [`src/windows-job.ts`](src/windows-job.ts) | Windows Job 能力檢查與 helper 啟動 |
| [`src/runner-launch.ts`](src/runner-launch.ts) | source、built 與 packaged 私有 runner 選擇 |
| [`src/spawn-runner.ts`](src/spawn-runner.ts) | Linux 一次性 exec bootstrap 與 Windows Job runner |
| [`src/runner-protocol.ts`](src/runner-protocol.ts) | 嚴格定義的 Linux launch／startup 文件與 Windows IPC 消息 |
| [`src/terminal.ts`](src/terminal.ts) | `node-pty` 終端句柄：Linux scope 綁定、前臺檢查與 fallback 清理 |
| [`src/process-inspector.ts`](src/process-inspector.ts) | POSIX 進程樹與會話檢查 |
| [`src/windows-inspector.ts`](src/windows-inspector.ts) | 經 koffi 的 Windows Toolhelp32 進程表檢查 |
| — | 不發布運行時不變式伴生入口；除所屬 seam 強制執行的約定外，本包不公開獨立的事件序列或可變數據關系。 |

### 主流程

一次 spawn 會同步校驗最終 argv、cwd 與環境，在用戶命令可能運行前選擇 containment，并在目標身份保持私有的情況下返回句柄。Linux 普通命令與終端啟動使用私有的一次性請求；scope 內的 bootstrap 會恢復目標 cwd 與環境、解析可執行文件、清除 fd 0 至 fd 2 的 close-on-exec 標記，再以原始 argv 進入 libc `execve()`。Windows 普通命令會隔離 runner 的 fd 0 至 fd 2、把 fd 3 留給 IPC，并用 fd 4 至 fd 6 承載 target stdio；runner 把這些 CRT 描述符解析成 OS handle，以 suspended 狀態創建 target，將其加入 Job、恢復運行，再只關閉 carrier 描述符。`done` 會在 direct command 及其 stdio 屏障結算后完成，`waitForExit()` 則分別等待所選 scope、Job、進程組或已觀察會話變空。

### 安全不變式

spill 文件以 `0600` 權限、`O_EXCL` 與隨機名稱在 `0700` 每進程目錄下創建，可抵御共享臨時目錄中的符號鏈接植入；最終關閉失敗時不公布 spill 路徑。fallback 進程身份攜帶啟動時間，因此清理絕不會跟隨 PID 復用。選定的 native 路徑失敗時會報告錯誤，而不會通過 fallback 重放 argv；受管范圍只有在清理完成后才從存活集合移除，否則失敗仍保持可觀察。宿主退出最終清理不創建 Promise 或定時器，保留宿主退出碼與診斷，分別包含每個目標的失敗，也不會聲稱已經完全停穩。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當提供方級約定不夠用時閱讀以下頁面。它們從窮盡式類型參考逐步進入抽象約定，以及宿主機制背后的決策。

- [子進程子系統](../../../docs/subsystems/subprocess.zh.md)——spawn spec、輸出讀取器、結果與完整的 `DSH_*` 環境。
- [dsh-subprocess](../subprocess/README.zh.md)——本提供方實現的抽象約定。
- [dsh-bash-local](../../shell/bash-local/README.zh.md)——最大的消費方及其請求的具體 stdio 形態。
- [subprocess seam Agent Note](../../../.agents/notes/archived/architecture/2026-07-26-subprocess-seam.md)——進程部分為何成為獨立的 seam。
- [同步子進程退出清理](../../../.agents/notes/archived/bug-fix/2026-08-11-synchronous-subprocess-exit-cleanup.md)——宿主退出最終清理決策及其失敗模式。

-----

<a id="model-experience"></a>
## 模型體驗

通過消費方 seam（例如 bash 執行器家族）間接影響，它們負責所 spawn 進程的輸出與生命周期的全部面向模型渲染。

#### KV Cache 影響

不會直接導致 KV Cache 失效；請求前綴變更由上述消費方負責。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本提供方何時不合適，或何時需要特別的運維注意。它們是當前包約束，不是通用平臺對比或任務積壓。

- **native ownership 有明確宿主要求**——Linux 需要可讀的 user manager 與 `systemd-run --expand-environment=no`；舊版 systemd 使用帶告警的 PGID fallback。macOS 因沒有受支持的公開 persistent owner，始終使用該 fallback。
- **native 選擇具有有界的每次 spawn 成本**——Linux 會重復檢查 bootstrap 入口、libc `execve`/`fcntl` bindings、存活的 user manager 與 literal-argv scope 支持，直到這套完整探測首次成功；后續符合條件的普通命令或終端 spawn 只重新檢查存活的 user manager。Windows 會在每次普通 spawn 前重新檢查 runner 入口、bindings 與當前 Job 支持。Linux 深度探測的成功狀態與 fallback 告警去重會在提供方生命周期內持續保留。所有探測都會在用戶命令可能運行前完成，子進程探測的超時為 5 秒。每次 Linux 啟動都會創建私有請求目錄，以 50 毫秒間隔檢查尚未確定的 scope 建立狀態；scope 已建立且仍 active 后，查詢間隔按指數增長，最多為 5 秒。Windows 普通命令會保留一個 runner 與一條 IPC 通道，直到 Job 報告活動進程數為零。目標會直接繼承標準句柄，不使用 named-pipe stdio 或結果文件。
- **Windows Job inheritance 有明確排除項**——普通后代默認繼承 Job，但 breakaway 進程不在保證范圍。目標只在 Job 分配后啟動；runner 若在 create-to-assignment 極窄區間遭外力終止，可能留下 suspended target。
- **Windows 終端信號是控制臺級的**——SIGINT 以 `\x03` Ctrl-C 輸入寫入投遞，由 conhost 轉為控制臺級 CTRL_C 事件；SIGTSTP 與 SIGHUP 被拒絕（不可用）；不帶 `/F` 的 `taskkill` 無法終止控制臺進程，因此拆卸的 TERM 檔是 `/F` 升級前的寬限等待。Windows 就緒沒有精確的 stdin-wait 檔：prompt-marker 快路徑把 shell pid 作為偽前臺進程組比較，其余由靜默與計時檔覆蓋。
- **fallback 終端 ownership 仍依賴觀察**——在 macOS 或缺少可用 user-systemd 的 Linux 上，子進程如果在任何前臺檢查快照之前重新設定父進程，或離開自有終端會話，就可能逃出進程表掃描。本地提供方不會新增持續進程表監視器；受支持的 Linux native 模式改由 scope membership 持有這些后代。
- **進程內清理要求退出階段仍能執行 JavaScript**——直接 `process.exit()`、默認未捕獲異常和默認未處理 rejection 會發出 Node 同步 `exit` 事件。未安裝 handler 時，`SIGTERM`、`SIGINT` 或 `SIGHUP` 的默認 OS 處置不會發出該事件；應用只有安裝執行正常 dispose 或調用 `process.exit()` 的 handler 才能覆蓋這些信號。`SIGKILL`、fatal OOM、`process.abort()`、native crash、斷電，以及任何無法運行 JavaScript 的故障，都需要外部 supervisor、容器 init 或等價的 OS owner 負責。
- **憑據清除依賴名稱啟發式規則**——只匹配 `*KEY*`／`*PASSWORD*`／`*SECRET*`／`*TOKEN*`；名稱不同的 secret（例如 `*PASSPHRASE*`）會繼續傳遞，對誤刪變量引入白名單屬于已記錄的后續工作。
- **不會刪除已完成的 spill 文件**——有界的完整輸出恢復文件會在 OS tmpdir 下累積，直到外部機制進行清理；每進程私有 spill 目錄僅在未持有任何已完成 spill 文件時于 JavaScript 可觀察的退出階段刪除。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
