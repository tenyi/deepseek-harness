---
description: "面向組合作者與能力消費方的子進程服務（`ctx.subprocess`）說明：啟動、觀察并終止受管子進程與終端會話。"
kind: "package-reference"
---

# @deepseek-ai/dsh-subprocess

[English](README.md) | 中文

## 概述

`ctx.subprocess` 可解析可執行文件、啟動顯式指定的子進程或真實終端會話、流式讀取或有界收集輸出，并終止完整的受管進程范圍。每個組合配置一個 subprocess 實現，并根據命令運行位置選擇本地或遠程執行。每次請求都指定 argv、工作目錄、stdio、環境覆蓋、終止寬限期與取消信號，不會添加 shell 解釋或隱藏的執行默認值。子進程環境會先移除環境中的憑據與 `DSH_*` 值，再應用顯式覆蓋；時限、拆卸策略與面向模型的渲染由調用方負責，收集的輸出在進程退出后仍可讀取。

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

在需要運行子進程的組合中掛載一個 subprocess 提供方，并從擁有該命令的能力調用 `ctx.subprocess`。常用路徑是顯式的：解析可執行文件、用完全明確的請求 spawn、讀取你要的輸出，并在工作完成時終止受管范圍。

### 掛載服務

每個組合由唯一一個提供方注冊 `ctx.subprocess`；把它與經由它 spawn 的消費方放在一起加載——bash 執行器、LSP 主機、PTY shell 后端或進程外 subagent 后端。加載第二個提供方會快速失敗（每個上下文只有一個服務，這是 Cordis 的標準行為）。

```yaml
- name: '@deepseek-ai/dsh-subprocess-local'
- name: '@deepseek-ai/dsh-bash-local'
```

### 啟動受管進程

請求完全明確：程序與參數、工作目錄、每條流一種 stdio 處置方式、終止寬限期、可選的中止信號與可選的環境覆蓋。目標與受管范圍標識保留在提供方內部。`done` 以直接命令的退出事實（`exitCode` 與 `signal`）resolve，并在 spawn 或提供方失敗時 reject；收集輸出在退出后仍可讀取。

```text
const executable = await ctx.subprocess.resolveExecutable('bash')
const handle = ctx.subprocess.spawn({
  argv: [executable, '-c', 'echo hello'],
  cwd: '/workspace',
  stdio: { stdin: 'ignore', stdout: { maxBytes: 64 * 1024 }, stderr: 'inherit' },
  graceMs: 5000,
})
const { exitCode, signal } = await handle.done
const output = handle.collected.stdout?.readFrom(0)
```

### 選擇輸出投遞方式

- `'pipe'` 把原始流交給你做自己的協議分幀——LSP 主機用 JSON-RPC，ACP（Agent Client Protocol）后端用 ndjson。
- `'inherit'` 讓子進程直接寫父進程自己的流，用于直通診斷輸出。
- 收集對象（collect object）在內存中緩沖一段有界尾部；加上 `spill` 上限后，完整流還可以從 spill 文件中恢復。

讀取基于偏移量且從不消費：后臺讀取與最終批量讀取可以共享同一條流，而不會搶走彼此的字節。

### 管理進程生命周期

終止與等待使用同一個由提供方管理的范圍。`terminate()` 會啟動提供方記錄的流程，具有冪等性，并在該范圍為空后成為空操作；請求的中止信號會啟動同一流程。`waitForExit()` 觀察同一范圍，只在提供方證明它完全停穩后 resolve，因此直接命令結束不會掩蓋仍存活的后代。所選 owner 無法再證明完全停穩時，它會 reject。提供方記錄其 native owner 與較弱 fallback；時限、拆卸階梯與原因分類歸調用方所有。

### 運行終端會話

對于交互式程序，`spawnTerminal` 分配真實 PTY：寫入文本、讀取 UTF-8 輸出、檢查當前前臺進程組并向其發送信號，以及等待一次 `terminate()`，讓提供方仍可觀察到的每個會話成員完全停穩。就緒狀態、scrollback 與提示符策略仍歸 PTY 消費方所有。

### 每個子進程起步時的環境

子進程永遠不會隱式繼承 harness 的環境秘密：形似憑據的名稱與環境中的 `DSH_*` 事實都會被清除，調用方顯式的 `env` 在該清除之后合并。有意轉發的憑據或當前的 `DSH_*` 部署事實仍會到達子進程；顯式的 `undefined` 墓碑值則移除一個普通的環境項。

### 可能出錯的地方

無法解析可執行文件時，服務會明確報出穩定的錯誤。從未啟動成功的 spawn 會讓 `done` reject；從未運行過的進程沒有任何緩沖輸出。提供方無法證明所選范圍為空時，`waitForExit()` 也會 reject；提供方 fallback 可能無法擁有逃離其進程組或已觀察會話的后代。當傳輸擁有自己的 spawn（SDK 客戶端、MCP）時，請繞開本服務并直接導入 `scrubbedParentEnv`，讓環境策略保持單一來源。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋 seam 背后的設計決策，并指出實現它們的代碼位置；可觀察行為已在[使用本包](#use-this-package)中說明。

### 設計理念

本 seam 建立在一個分離之上：服務負責進程坐標與生命周期；消費方負責定義進程的含義，以及決定塑造該進程的每一項默認值。正因如此，spawn 請求完全明確——沒有任何隱藏的子進程服務默認值——`SubprocessOutcome` 也只攜帶退出事實：時限、拆卸階梯與原因分類歸調用方所有。`dsh-shell` 的 request/spec 拆分是這條規則的所屬模板。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：抽象 `SubprocessRuntime`、`ctx.subprocess` 注冊、共享的 `scrubbedParentEnv` 清除 |
| [`src/types.ts`](src/types.ts) | 詞匯：spawn spec、stdio 模式、句柄、讀取器、結果、`DSH_*` 命名空間 |
| — | 不發布運行時不變式伴生入口；這個無狀態 Service Definition 負責 spawn spec 與句柄類型，觀察則由 Service Providers 負責。 |

### 數據模型與流程

spawn 會立即返回活動句柄，而不公開目標身份。`done` 獨立報告直接命令的結果或失敗，`waitForExit()` 則報告受管范圍是否完全停穩。請求的中止信號驅動與 `terminate()` 相同的終止流程。收集模式的讀取器無游標：偏移量是調用方擁有的全流字節坐標，因此獨立讀取器不會消費彼此的輸出，偏移量滑出內存尾部的讀取標記為 `lossy`，并在 spill 文件存在時指向它。`spawnTerminal` 是一項底層原語，因為普通管道無法分配控制終端或清理終端會話成員。

### 生命周期與不變式

每個上下文只注冊一個實現；加載第二個會拋錯（Cordis 標準行為）。服務自身的 dispose（資源釋放）會終止所有仍在運行的受管進程并等待其退出，因此進程生命周期在消費方重載后依然延續。`argv` 絕不經過 shell 解釋；需要 shell 的消費方自行傳入 `['bash', '-c', command]`。終端分配的取消（spec 信號）與已發布句柄的生命周期相互獨立。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從窮盡式類型參考逐步進入各提供方，以及 seam 背后的決策證據。

- [子進程子系統](../../../docs/subsystems/subprocess.zh.md)——spawn spec、輸出讀取器、結果與完整的 `DSH_*` 環境。
- [dsh-subprocess-local](../subprocess-local/README.zh.md)——實現本約定的本地宿主提供方。
- [dsh-subprocess-e2b](../../e2b/subprocess-e2b/README.zh.md)——同一 seam 的遠程 E2B 提供方。
- [dsh-bash-local](../../shell/bash-local/README.zh.md)——最大的消費方：經由本服務運行 bash 命令。
- [subprocess seam Agent Note](../../../.agents/notes/archived/architecture/2026-07-26-subprocess-seam.md)——進程部分為何成為獨立的 seam，以及隨之遷移的內容。

-----

<a id="model-experience"></a>
## 模型體驗

通過消費方 seam（例如 bash 執行器家族）間接影響，它們負責進程輸出與生命周期的全部面向模型渲染。

#### KV Cache 影響

不會直接導致 KV Cache 失效；請求前綴變更由上述消費方負責。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明該 seam 何時不合適，或何時把工作留給消費方。它們是當前包約束，不是對比或任務積壓。

- **由 SDK 管理的 spawn 仍在服務之外**——擁有內部 spawn 的傳輸（SDK 客戶端、MCP）無法把該調用路由到本服務；它仍可導入 `scrubbedParentEnv`，使環境策略保持單一來源。
- **拆卸階梯歸消費方所有**——該 seam 只提供信號動詞與受管范圍等待，不提供現成的完全停穩序列；每個進程外消費方自行編碼其子進程的配合方式（ACP 后端以 stdin EOF 打頭的階梯是倉庫內模板）。
- **可觀察性取決于提供方**——native 提供方可以通過 systemd scope 或 Windows Job 擁有逃逸后代，fallback 提供方則只暴露較弱的進程組、進程樹或會話可見性。該 seam 不新增持續的進程表監視器。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文：開放設計問題與尚未決定的探索方向。它明確不具權威性——已交付的行為、限制與既定理由以上文、包代碼和相關 Agent Note 為準。

未來：非 shell 運行器。該 seam 拆分的目的就是讓直接 argv 執行器或 worker supervisor 無需深入 bash 內部即可消費它；目前尚無任何實現交付，終端原語也把就緒策略留在其消費方。

</details>
