---
description: "本地文件系統 spill 后端：spill 文本如何保存到私有會話級文件，并用 read 或 grep 取回。"
kind: "package-reference"
---

# @deepseek-ai/dsh-spill-local

[English](README.md) | 中文

## 概述

`dsh-spill-local` 把調用方的超大文本保存到宿主文件系統中私有的會話級文件，并以該文件路徑作為定位信息返回，同時給出告訴模型讀取或搜索它的取回指引。只要組合需要在 agent（智能體）運行所在的同一臺機器上進行 spill 存儲，就掛載它。文件對當前用戶私有、名稱不可預測，且每個會話的文件歸入穩定的目錄，因此共享根目錄既不會泄露輸出，也不會被預置的符號鏈接重定向。配置選擇根目錄與啟動清理保留期；預覽與 spill 決策由其他包負責。

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

在需要把文本 spill 到本地文件系統的組合中掛載此后端。它注冊為 `dsh-spill-policy` 插件與其他調用方使用的 `ctx.spillStore` 服務。

### 最小配置

不帶配置加載插件是安全的：文件會落在操作系統臨時目錄下延遲創建的私有（0700）每進程目錄中。當文件必須位于已知位置時，設置 `root`。

```yaml
- name: '@deepseek-ai/dsh-spill-local'
  config:
    root: /absolute/path/to/spill
    cleanupPeriodDays: 30
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `root` | 私有 0700 臨時目錄 | spill 文件的根目錄；設置后可將文件保存在已知位置 |
| `cleanupPeriodDays` | `30` | 文件在一次性啟動清理中可被刪除前需經過的天數；`0` 禁用清理 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-spill-local)是每個受支持字段的窮盡式真源。

### 你會得到什么

每次 `saveText` 調用都會把完整文本寫入一個新文件，并返回三個字段：`locator`（文件路徑）、`bytes`（精確的 UTF-8 字節數）與 `retrievalHint`——"Use read with offset/limit, or grep this path to search within it."。消費方把該提示展示給模型，模型隨后可以用其常規文件工具讀取或搜索該文件。

### 文件存放位置

文件存放在 `<root>/session-<hash>/<random>-<safeName>`：`session-<hash>` 是所屬會話 id 的短哈希（讓同一會話的文件歸在一起），`<random>-<safeName>` 把不可預測的十六進制前綴與清理為單個安全路徑段的調用方建議名配對。相對 `root` 從進程工作目錄解析。

<a id="startup-cleanup"></a>
### 啟動清理

一次盡力而為的掃描會在激活后啟動，不延遲服務可用性。它掃描配置的根目錄和操作系統臨時目錄下先前的默認 `dsh-spill-*` 根目錄，刪除修改時間嚴格早于配置截止時間的常規文件，修剪空會話目錄，并只刪除已經變空的先前默認根目錄。長期運行的進程要到重啟時才會再次掃描。dispose（資源釋放）會等待掃描結束；如果清理移除了會話目錄，并發寫入會重新創建它。

掃描會解析文件系統身份，絕不跟隨或刪除符號鏈接，并跳過無關條目。在 POSIX 上，它只接受當前用戶擁有、組用戶和其他用戶不可寫、且祖先路徑能防止替換的根目錄與會話目錄；`/tmp` 等帶 sticky 位的可寫臨時目錄仍然允許使用。不安全路徑會產生警告并保持不變。文件系統和警告接收方故障都會被兜底，因此清理無法使激活或并發 spill 寫入失敗。

### 故障與恢復

真實存儲故障——權限不足、磁盤已滿、根目錄不可寫——會讓 `saveText` 調用以拒絕結束；由調用方決定如何降級。隨附策略把拒絕當作盡力而為處理并保留原始內聯結果。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋此后端背后的設計決策；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

后端只負責存儲細節，建立在一個原則之上：**spill 產物必須私有且不可重定向**。根目錄私有（0700）、會話目錄是穩定哈希、文件名不可預測、寫入采用排他且僅所有者模式。存儲機制放在與 Cordis 無關的模塊中，以便無需上下文即可單元測試。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`Config`、`LocalSpillStore` 服務、清理生命周期、定位信息與取回提示的組裝 |
| [`src/cleanup.ts`](src/cleanup.ts) | 一次性按年齡掃描、文件系統身份檢查、符號鏈接和所有權保護 |
| [`src/store.ts`](src/store.ts) | 與 Cordis 無關的存儲機制：私有根目錄、會話目錄、安全名稱編碼、排他寫入 |
| — | 不發布運行時不變式伴生入口；除由所屬 seam 強制執行的約定外，本包不暴露獨立事件序列或可變數據關系。 |

### 文件命名與寫入

`suggestedName` 是不可信輸入，因此 `encodeSegment` 會把 `[A-Za-z0-9._-]` 之外的每個字符以及 `~` 本身轉義成 `~XXXX` 形式，使映射對所有 JS 字符串都是單射：分隔符、`../`、NUL 與絕對路徑永遠無法逃出單個路徑段，整段 token `.`/`..` 也會被轉義。寫入采用 `open(path, 'wx', 0o600)`——任何已存在路徑（無論是否符號鏈接）都會失敗，因此預置目標無法重定向寫入。對同一建議名的兩次保存會得到不同的隨機前綴。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。

- [spill 存儲服務](../spill/README.zh.md)——此后端實現的 `saveText` 約定與詞匯。
- [spill 包映射](../README.zh.md)——三包家族與各自職責。
- [dsh-spill-policy](../spill-policy/README.zh.md)——結果過大時調用此后端的策略。
- [spill 子系統](../../../docs/subsystems/spill.zh.md)——窮盡式詞匯與歸屬。
- [工具輸出 spill 決策](../../../.agents/notes/implemented/architecture/2026-07-08-tool-output-spill-files.zh.md)——能力邊界與設計依據。

-----

<a id="model-experience"></a>
## 模型體驗

間接地，通過把已保存文件路徑與 read/grep 取回指引渲染給模型的 spill 消費方。

#### KV Cache 影響

無直接失效；請求前綴變更由上述消費方負責。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本地后端何時不合適或需要特別的運維注意。它們是當前的包約束。

- **長期運行的部署要等到重啟才會被掃描**——一次性掃描只在激活后運行，因此運行期間超過年齡截止值的文件會在下次啟動時回收。
- **定位信息需要與其位于同一文件系統的消費方**——遠程或虛擬部署需要另一個 `SpillStore` 后端，其定位信息與取回提示在該環境中有明確含義。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文：開放方向。它明確不具權威性。

#### 未來：工作區隔離的交互

取回模型假定模型的 `read`/`grep` 工具可以檢查返回的路徑，即使 spill 目錄在會話工作目錄之外。未來的工作區隔離策略必須顯式允許本地 spill 路徑，或者改用非文件 spill 后端。

</details>
