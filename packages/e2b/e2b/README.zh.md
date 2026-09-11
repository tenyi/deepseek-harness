---
description: "E2B 文件與命令工作的共享遠程 Linux 沙箱：配置、生命周期，以及啟動與關閉時會發生什么。"
kind: "package-reference"
---

# @deepseek-ai/dsh-e2b

[English](README.md) | 中文

## 概述

`dsh-e2b` 讓 agent（智能體）的文件操作、shell 命令與終端在一個共享的遠程 Linux 沙箱內運行，而不是在你的機器上。應用啟動時會創建沙箱，并在配置的生命周期到期或應用關閉時刪除它，因此其中保存的一切都是短暫的。請配置 API 密鑰、絕對遠程工作目錄與沙箱生命周期。請與 `dsh-fs-e2b`、`dsh-subprocess-e2b` 一起使用；單獨使用它不會帶來任何用戶可見的能力。它不會向模型發送任何內容，而且任何已發布的組合都不會默認啟用 E2B。

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

當你希望 agent 的文件操作與命令執行在遠程 Linux 沙箱而非你的機器上進行時，使用本包。它是 E2B 家族的基礎：掛載文件系統與子進程包之后，所有這些工作都會共享同一個遠程工作目錄與進程環境。

### 何時選擇

當工作應與宿主機器隔離時——例如你希望 agent 的文件編輯與命令運行發生在某個可丟棄的環境中——選擇 E2B 家族。當在宿主上運行沒有問題的時候，選擇本地的文件系統與子進程包。本包對模型不可見，也不增加任何請求成本。

### 最小配置

三個設置很重要：API 密鑰（或 `E2B_API_KEY` 環境變量）、絕對遠程工作目錄與沙箱生命周期。密鑰錯誤、相對工作目錄或無效生命周期都會在任何遠程工作開始前拒絕啟動。

```yaml
- name: '@deepseek-ai/dsh-e2b'
  config:
    apiKey: <E2B API key>
    cwd: /home/user/workspace
    timeoutMs: 300000

- name: '@deepseek-ai/dsh-subprocess-e2b'
- name: '@deepseek-ai/dsh-fs-e2b'
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `apiKey` | `E2B_API_KEY` | 宿主 SDK 連接的 API 密鑰；絕不會安裝進沙箱 |
| `cwd` | `/home/user/workspace` | 家族共享的遠程工作目錄；必須是絕對 POSIX 路徑 |
| `timeoutMs` | `300,000` | 沙箱生命周期（毫秒）；到期后沙箱被刪除 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-e2b)完整列出了每個受支持字段及其 JSDoc，是這些信息的真源。

### 你能得到什么

掛載本包后，文件讀寫、shell 命令與終端都會在沙箱的工作目錄內運行，因此 agent 看到的是一個一致的遠程世界：它用文件功能寫入的內容，正是它的命令能夠讀取的內容，反之亦然。遠程工作目錄若不存在，會自動創建。

### 沙箱的啟動與停止

加載插件會在后臺啟動沙箱；文件系統與子進程功能在其就緒后即可使用。沙箱存活時間為配置的生命周期（默認五分鐘），除非應用先停止——兩種情況下沙箱都會被刪除，因此請在此之前保存你仍需要的內容。如果運行期間沙箱消失（到期或被別處刪除），家族會將其視為正常終止，而不是錯誤。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋所有者背后的設計決策，并指出實現它們的代碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

- **一個沙箱，一個句柄。** 所有適配器都等待同一個 `getSandbox()` promise，因此文件系統與進程操作共享同一個遠程 Linux 世界。
- **構造即安全。** 沙箱以 `secure: true` 和 `lifecycle: { onTimeout: 'kill' }` 創建，因此超時必定刪除它。
- **隔離的控制 shell。** `e2bControlEnvs()` 為每個內部命令 shell 提供全新隨機生成的 `HOME`，`quoteE2BShellArg()` 則通過 SDK 不可避免的 `/bin/bash -l -c` 層保留不透明參數。

### 源碼索引

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`E2BRuntime` 服務、`Config` schema、校驗、沙箱創建與拆除 |
| — | 不發布運行時不變式伴生入口；沙箱創建與拆除只有一個 SDK promise，沒有可交叉核對的獨立事件或可變數據關系。 |

### 生命周期

`open()` 創建沙箱、準備 `cwd` 與私有運行時根目錄、拒絕非目錄或符號鏈接的運行時根目錄，并執行 `chmod 700`。dispose（資源釋放）會阻止新的句柄獲取、等待初始化完成并刪除沙箱，把 `SandboxNotFoundError` 視為完全停穩。`getSandbox()` 在等待就緒后重新檢查已釋放標志，因此與就緒發生競態的資源釋放仍會拒絕獲取句柄；預先發起的連接即使失敗也會保持可觀察狀態，但不會導致插件加載失敗；`getSandbox()` 會將該失敗暴露給調用方。

### 初始化失敗處理

任何目錄初始化失敗都會嘗試刪除一次并保留原始錯誤；回滾失敗由 E2B 配置的沙箱超時約束（見開發備注）。提供方插件必須在該所有者之后加載、并在其之前 dispose，因為每個適配器都等待同一個句柄。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從家族組合逐步進入子進程 seam 表面，以及遠程執行世界背后的決策證據。

- [E2B 提供方家族地圖](../README.zh.md)——三個包與可選組合。
- [子進程子系統](../../../docs/subsystems/subprocess.zh.md)——子進程 seam 約定與生成的 Cordis 表面，包括 `ctx.e2b`。
- [可移植執行世界決策](../../../.agents/notes/implemented/architecture/2026-07-28-portable-execution-world-consumers.zh.md)——消費方為何委托給 `ctx.fs` 與 `ctx.subprocess`，以及留在宿主中的內容。
- [生成配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-e2b)——每個受支持配置字段及其源聲明。

-----

<a id="model-experience"></a>
## 模型體驗

無。本共享遠程運行時所有者不注冊任何模型上下文；提供方適配器與消費方擁有所有渲染效果。

#### KV Cache 影響

不會直接失效：所有者不貢獻任何請求 token，也從不改變請求前綴，因此提供方緩存復用不受影響。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明 E2B 家族何時不合適，或何時需要特別的運維注意。它們是當前包約束，不是任務積壓。

- **不是完整的 harness 運行時**：Cordis 服務、agent／會話狀態、會話日志、LLM（大語言模型）請求、skill（技能）和 SDK 側緩沖仍留在宿主進程中。
- **沙箱狀態是短暫的**：dispose 與超時都會刪除沙箱；重新連接、pause/leave 保留、模板、卷和快照均不在本 POC 范圍內。
- **沒有配置部署平臺**：網絡策略、宿主工作區同步與沙箱發現均不在本 POC 范圍內。
- **`cwd` 是解析約定，而不是包含邊界**：適配器與命令可以訪問沙箱中的其他路徑；E2B 網絡訪問也繼續采用基礎鏡像的策略。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文：開放問題與尚未決定的探索方向。它明確不具權威性——已交付的行為、限制與既定理由以上文和包代碼為準。

#### 開放：沙箱初始化回滾

`open()` 的失敗路徑只會嘗試刪除一次，并保留原始初始化失敗。除非真實的雙重失敗超出 E2B 配置的沙箱超時，否則重試狀態保持延后（TODO(e2b-setup-rollback)）。

</details>
