---
description: "Worker 線程代碼執行，面向組裝、容量規劃或調試已發布 TypeScript 后端的用戶與維護者；該后端在全新的 Node worker 中運行每個程序。"
kind: "package-reference"
---

# @deepseek-ai/dsh-code-runtime-worker-thread

[English](README.md) | 中文

## 概述

本包讓 PTC 組合能夠使用宿主提供的綁定執行模型編寫的 TypeScript，并取得完成值、順序日志或結構化失敗。每次請求都不繼承先前運行的狀態；語法錯誤、預算到期、中止、內存耗盡和輸出溢出等失敗會作為結果返回，而不是拋出。應將執行的代碼視為與 bash 擁有同等權限：本包限制環境暴露和資源使用，但不將代碼與宿主隔離。可配置的計算時間、墻鐘時間、堆和輸出上限會終止運行并限制其結果大小。

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

當組合需要執行模型編寫的 TypeScript 程序時，連同 code-runtime seam 一起掛載此后端；只要模型調用 `run_code`，`dsh-tools` 中的 PTC mode 就會通過 `ctx.codeRuntime` 驅動它。每個執行上限都是已驗證的配置，因此你可以從 `cordis.yml` 為部署調整運行時規模。

### 最小配置

```yaml
- name: '@deepseek-ai/dsh-code-runtime'
- name: '@deepseek-ai/dsh-code-runtime-worker-thread'
  config:
    computeMs: 60000            # busy-time budget (measured event-loop active time)
    maxWallMs: 600000           # wall-clock ceiling; never pauses for anything
    maxOutputBytes: 67108864    # combined serialized outer-output cap (64 MiB)
    maxOldGenerationSizeMb: 512 # worker heap cap
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `computeMs` | `60,000` | 忙碌時間預算：worker 實測事件循環活躍時間超過該值時，運行以 `timeout` 失敗 |
| `maxWallMs` | `600,000` | 墻鐘上限，為忙碌時間無法觀測的等待兜底；最大 `2_147_483_647` |
| `maxOutputBytes` | `67,108,864` | 序列化日志加完成值或失敗消息的硬上限；至少 `4` |
| `maxOldGenerationSizeMb` | `512` | worker 堆上限；溢出會殺死 worker，并以 `worker-exit` 呈現 |

每個字段在加載時都會驗證并提供默認值；沒有其他可調項。生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-code-runtime-worker-thread)是所有受支持字段的完整參考。

### 運行返回什么

成功的運行把程序的無損 JSON 完成值作為 `result.value` 返回，把程序打印的文本按順序作為 `result.logs` 返回。頂層 `await`／`return` 可用，程序可以把宿主提供的綁定函數（PTC mode 暴露一個 `tools` 對象）當作普通異步調用。

### 隔離措施，而非安全邊界

程序運行時的權限與 bash 工具相當：它可以訪問 Node API，后端也刻意不承諾與宿主的隔離。它提供的是隔離措施：獨立 isolate、空環境（沒有環境變量憑據，也不繼承 loader 標志）、可配置堆上限，以及也能終止同步熱循環的強制終止。程序派生的 OS 進程在 `terminate()` 后仍然存活，需要部署層面的清理。

### 可能出什么問題

每次程序運行都會通過 resolve 返回結果，因此運行失敗會體現在 `result.error` 中，而不是觸發 rejection：語法錯誤或不可擦除的 TypeScript（`enum`、namespace）在任何 worker 啟動前就以 `exception` 失敗；預算到期是 `timeout`；中止信號是 `abort`；堆溢出或其他 worker 終止是 `worker-exit`；不是無損 JSON 的完成值是 `invalid-output`；超出上限的序列化輸出是 `output-limit`——并保留能容納的已捕獲日志前綴。只有調用方誤用才會觸發 rejection，例如在 dispose（資源釋放）后提交運行。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋后端背后的設計；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

后端基于一項明確區分：**這是隔離措施，而非安全邊界**。模型代碼按與 bash 等價的信任等級處理（[PTC mode Agent Note](../../../.agents/notes/implemented/feature/2026-06-15-ptc.zh.md) 的 Trust posture），因此設計追求可重建性與有界資源使用，而非硬性的多租戶邊界——那需要等待容器級后端。每次運行使用一個全新的 worker，程序的世界隨 worker 一同終止：不存在可泄漏、也無需記錄的跨運行狀態，僅憑會話日志即可重建一次運行。

### 執行流程

一次運行在宿主側剝離類型（`node:module` 的 `stripTypeScriptTypes`，保持字節位置不變），包裹為異步函數的函數體使頂層 `await`／`return` 可用，然后發送給全新的 worker，由 bootstrap 物化綁定命名空間。綁定調用以無損 JSON 跨消息端口傳遞，每個調用 id 至多應答一次。日志文本主動流向宿主，因此被終止的程序仍會顯示已打印的內容。恰好一個結果結算運行——`done` 幀、預算到期、中止或 worker 終止——之后宿主終止 worker 并等待其退出。

### 把對端視為不可信

模型代碼能夠訪問 `parentPort` 并偽造通信，因此任何代碼讀取入站消息前，系統都會逐字段驗證并重建：偽造的額外字段絕不隨行，非數字的 call id 絕不會被回顯進 reply，綁定名稱只解析為自有屬性（偽造的 `constructor` 無法沿原型鏈訪問），垃圾被靜默丟棄。worker 側命名空間使用 null-prototype，因此形似 `__proto__` 的綁定名稱只是普通鍵。

### 預算

存在兩個獨立預算，因為對端不可信：`computeMs` 計量 worker 的實測忙碌時間（每 25 ms 輪詢一次 `eventLoopUtilization()`），因此熱循環無論是否有誘餌 dispatch 在途都會到期，而等待慢綁定的程序不累計；`maxWallMs` 為忙碌時間無法觀測的情況兜底，例如永遠不會 resolve 的 promise。二者最終都會調用 `worker.terminate()`。`maxWallMs` 在加載時對照 `MAX_TIMER_DELAY_MS` 做范圍校驗，因為 `setTimeout` 會把更長的延遲限制為 1 ms。

### 輸出賬本

`maxOutputBytes` 統計外層 `logs` 數組加完成值或失敗消息載荷的 JSON 序列化；固定的 `CodeRunResult` 字段名與外層封裝語法不計入這份賬本。未超過上限時返回精確值；有損完成值屬于 `invalid-output`，組合溢出屬于 `output-limit`，不會用 inspected string 代替。失敗會保留日志中能容納的已捕獲前綴。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`Config` schema、`WorkerThreadCodeRuntime`、運行編排、輸出賬本 |
| [`src/worker.ts`](src/worker.ts) | 源碼模式 worker 入口（可擦除 TypeScript，不依賴 `lib/`） |
| [`src/bootstrap.ts`](src/bootstrap.ts) | worker 側 bootstrap：命名空間物化、console shim、日志捕獲 |
| [`src/protocol.ts`](src/protocol.ts) | host 與 worker 之間的端口消息詞匯 |
| [`src/worker-json.ts`](src/worker-json.ts) | worker 側無損 JSON 編解碼 |
| [`src/output-json.ts`](src/output-json.ts) | 外層賬本的字節計量與截斷 |
| — | 不發布運行時不變式伴生入口；這個進程邊界實現不暴露同進程事件關系，worker 協議測試與構建后 worker 測試負責覆蓋。 |

### 未構建與已構建的 worker 入口

源代碼模式通過 Node 原生類型剝離加載只包含可擦除語法的 `src/worker.ts`；其傳遞運行時閉包只包含 Node 內置模塊和相對源模塊，因此全新 checkout 絕不需要兄弟工作區包尚未構建的 `lib/` 導出。構建模式會把兄弟文件 `lib/worker.cjs` 作為文件系統路徑傳入，因為 pkg 的虛擬文件系統（VFS）Worker hook 要求 CommonJS；同一路徑也可在普通 Node 下使用。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當后端約定不夠用時閱讀以下內容。它們從 seam 定義進入消費方與配置面。

- [代碼運行時 seam](../code-runtime/README.zh.md)——此后端實現的抽象約定。
- [PTC mode Agent Note](../../../.agents/notes/implemented/feature/2026-06-15-ptc.zh.md)——`dsh-tools` 如何消費 `ctx.codeRuntime` 并呈現 `run_code`。
- [代碼運行時子系統參考](../../../docs/subsystems/code-runtime.zh.md)——請求／結果詞匯、綁定與失敗分類體系。
- [生成配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-code-runtime-worker-thread)——每個受支持配置字段及其源聲明。

-----

<a id="model-experience"></a>
## 模型體驗

通過 `dsh-tools` 中的 PTC mode 間接提供，如果外層值能容納則原樣渲染，否則返回明確的 `invalid-output`／`output-limit` 失敗，且只有外層 `run_code` 結果在其普通 spill 策略下進入模型上下文，綁定通信與中間值始終只存在于執行環境中。

#### KV Cache 影響

不會直接失效；由上述消費方負責請求前綴變更。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明此后端何時不合適，或何時需要特別的運維注意。它們是當前包約束，不是任務積壓。

- **程序派生的 OS 進程在程序終止后仍會存活**——`worker.terminate()` 只結束線程，比 bash-local 的進程組終止更弱；在容器后端出現前，孤兒進程清理屬于部署職責。
- **類型剝離依賴 Node 的實驗性 `stripTypeScriptTypes` API**——如依賴的行為發生變化，amaro 或 sucrase 是已經點名的直接替代品。
- **`computeMs` 到期最多可能超過一個輪詢間隔**——系統每 25 ms 采樣一次忙碌時間（內部常量，有意不做成配置）。
- **程序獲得一個含 5 個方法的 `console` shim**（`log`／`info`／`warn`／`error`／`debug`）——有意不提供 Node 的完整 console 接口。
- **中間綁定值沒有字節上限**——程序可以用永遠不會成為外層輸出的值耗盡進程或 worker 內存。
- **默認 64 MiB 上限是拒絕邊界，不是可恢復存儲**——外層 spill 機制只能保存發生 `output-limit` 后返回的有界日志和診斷；在運行時上限之外被拒絕的字節永遠不會到達 spill 層。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
