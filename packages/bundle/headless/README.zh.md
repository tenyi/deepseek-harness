---
description: "dsh 的一次性任務模式：從命令行運行單個任務并打印最終答案，供用戶腳本化或自動化 dsh。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-headless

[English](README.md) | 中文

## 概述

`dsh-headless` 從命令行運行一個 dsh 任務并打印最終答案，然后退出——沒有 GUI、沒有服務器、沒有瀏覽器。輸入 `dsh --profile headless "run the tests"`，agent（智能體）會以與所有其他表層相同的模型、工具與安全默認值完成該任務。它非常適合腳本、CI 與一次性任務：進程不打開任何端口，也不會留下任何后臺運行的東西。退出碼告訴你結果——任務完成時為 0，中止或出錯時為 1。主要邊界：每次調用只運行一個任務，沒有交互式后續。

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

運行一個任務，獲得最終答案，然后退出。任務就是命令行本身，因此整條命令就是最小的可運行示例。

### 運行一次性任務

```sh
dsh --profile headless "run the tests"
```

agent 會完成該任務，把提供方的每個非空推理（reasoning）增量流式寫入 stderr 的 `dsh: reasoning:` 段，然后把最終答案寫入 stdout 并退出。連續推理增量保持在同一段中；提供方未給尾換行時，runner 會在后續輸出前結束該段。沒有推理內容的成功運行保持 stderr 為空；失敗時退出碼為 1，并以 `dsh: <code>: <message>` 向 stderr 寫入錯誤。缺失或空白任務會在任何執行開始之前被拒絕。任務文本通過唯一的 `task` 設置提供：

| 字段 | 默認值 | 含義 |
|---|---|---|
| `task` | 必填 | 單次運行的任務文本 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-headless)是所有受支持字段及其 JSDoc 的完整真源。

### 何時使用

在腳本化或自動化的 dsh 運行中使用 headless——CI 步驟、批處理任務、從終端快速獲取答案。當需要多輪交互會話或 GUI 時請避免它；瀏覽器表層（[dsh-web-app](../web-app/README.zh.md)）負責這類場景。進程只為本次運行而存活，不打開監聽端口，并且自行退出，因此適合等待進程結束的流水線。

### 幫助與任務錯誤

`dsh --profile headless --help` 打印該命令的幫助文本并直接退出，不運行任何內容。缺失或只有空白的任務屬于用法錯誤：什么都不運行，進程退出 1。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

runner 是核心 API 載體之上的直接驅動器：它通過注冊表創建一個全新的 Agent，并把所屬的持久化事件區間折疊成一個進程級結果。

### 運行流程

runner 等待整個應用結算（`ctx.get('loader')?.await()`），確保已組合的工具與適配器不會半掛載，讀取共享的 [`agentDefaultModel`](../../core/agent-default-model/README.zh.md) 選擇，用該提供方與模型創建一個全新的持久化 Agent，并把任務作為普通用戶消息提交。它把該 Agent 的非空推理增量流式寫入 stderr、等待完全停穩，然后對會話執行 flush，并把所屬區間（從 `firstSeq` 起）折疊為最后一條非空 `assistant/message` 文本與最終 `turn/end` 原因。最后，它把最終文本寫入 stdout 并請求退出。

### 基于 base 的 patch 內容

patch 疊加在 `dsh-base` 之上：繼承投影緩存，在基礎 `system-prompt` 行上設置編碼 persona 前綴與獨立的 cwd 后綴，保留與 Web 表層相同的臨時進程級 PTC mode 開關（`DSH_TOOLS_MODE`），禁用共享的 HMR（熱模塊替換）行，把 PTC mode 的 worker 作為核心執行能力插入，并掛載啟動提供方與 runner。緩存為每個已持久化的一次性會話寫入檢查點，供后續消費方使用；其持久性屏障會在發布緩存行前 flush 所覆蓋的日志前綴，因此可能拆分原本會合并的 JSONL 連續段。啟動提供方（[`src/startup.ts`](src/startup.ts)）注入 `ctx.cmdlineArgs`（[`dsh-cmdline`](../../boot/cmdline/README.zh.md)），讀取位置參數、打印應用自己的 `--help`，并提供 `headlessStartup`；runner 注入該服務，再從惰性配置中讀取任務。

### 退出映射

最終 `turn/end` 完成時退出碼為 0；任何其他結果——aborted、error，或所屬區間內沒有輪次——退出碼為 1。結束原因為 `error` 時還會向 stderr 寫入 `dsh: <code>: <message>`。直接驅動器失敗（例如 Agent 創建失敗）向 stderr 寫入 `dsh: <message>` 并退出 1。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | `headless-runner` 插件：運行流程、輸出約定、退出映射 |
| [`src/startup.ts`](src/startup.ts) | `headless-startup` 提供方：任務位置參數與 `--help` |
| [`cordis.patch.yml`](cordis.patch.yml) | 疊加在 `dsh-base` 之上的一次性 patch |
| — | 不發布運行時不變式伴生入口；runner 的可觀察約定（stderr 中的提供方推理、stdout 中的最終文本、按輪次結束原因決定的退出碼）屬于進程級，并由啟動器 e2e 負責；runner 不注冊任何內容，樹內也沒有任何可變關系可審計。 |
| [`tests/headless.spec.ts`](tests/headless.spec.ts) | 運行流程、匯總、flush 與退出映射 |
| [`tests/startup.spec.ts`](tests/startup.spec.ts) | 在真實 Loader 樹上的命令行解析 |

### 不變式歸屬

不發布不變式伴生入口，因為 runner 的可觀察約定（stdout 的最終文本、按輪次結束原因決定的退出碼）是進程級的、由啟動器 e2e 負責；插件不注冊任何內容，樹內也沒有任何可變關系可審計。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當你想深入了解共享核心、同級 GUI 或命令行交接時，閱讀以下頁面。

- [組合包索引](../README.zh.md)——基于同一核心構建的表層。
- [dsh-base](../base/README.zh.md)——headless 運行其上的共享核心。
- [dsh-web-app](../web-app/README.zh.md)——用于多輪工作的同級交互式瀏覽器入口。
- [dsh-cmdline](../../boot/cmdline/README.zh.md)——啟動器如何把命令行交給應用。
- [生成配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-headless)——每個受支持配置字段及其源聲明。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為 runner 把任務作為普通用戶消息提交，提示詞與工具由組合出的 base 與 headless 行提供。

#### KV Cache 影響

runner 不向請求前綴添加任何內容；它只是驅動組合出的配置樹處理一條用戶消息。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制告訴你 headless 何時不適用、它需要 `dsh` 啟動器提供什么。它們是當前包約束，不是通用的 CLI（命令行界面）對比或任務積壓。

- **每次運行一個任務**——任務得到回答后進程即退出；沒有交互式后續，因此多步工作請拆成多次運行。
- **通過 `dsh` 啟動器運行**——以其他方式啟動 headless profile 會在啟動時失敗，因為只有啟動器能請求進程退出。
- **首個 token 前沒有心跳**——提供方發出第一個非空推理增量前，stderr 保持靜默；延遲首個 token 的提供方不會更早給出進度信號。
- **推理進入 stderr 日志**——重定向與監督進程可能保留顯著更多且可能敏感的模型輸出；需要時應把 stderr 路由到受控位置。
- **只打印推理和最終答案**——沒有 assistant 消息的運行向 stdout 打印空行并以 1 退出；中間工具輸出不會打印。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
