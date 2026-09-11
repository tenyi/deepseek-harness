---
description: "CPython 子進程代碼 runtime：為 Python 模型代碼實現 dsh-code-runtime seam，及其使用的 fd-3 wire 協議。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-code-runtime-python

[English](README.md) | 中文

## 概述

這個私有實驗包可讓源碼檢出組合在每次請求時都用全新的 CPython 3.10+ 子進程運行模型生成的 Python。程序可以使用頂層 `await` 和 `return`、調用已配置的 binding、正常寫入 stdout/stderr，并獲得明確的完成或失敗結果。資源預算和進程組拆卸會約束失控的工作，但子進程不是安全邊界：模型代碼具有與 bash 同等的信任，運行之間不保留狀態，且沒有已發布 profile 啟用此 runtime。

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

僅在顯式源碼檢出組合中選擇這個私有實驗包。將 `PythonCodeRuntime` 與 `dsh-tools` 一起注冊后，`run()` 會在全新的 CPython 3.10+ 子進程中執行每個程序；成功時以 `result.value` resolve，失敗時以 `result.error` resolve（正交的 `CodeRunFailure.kind` 分類涵蓋解析失敗、拋出異常、無效完成值、輸出溢出、預算到期、中止與執行基底終止）。僅有 seam 誤用會 reject——binding 命名空間不合法，或在 dispose 后調用。配置在加載期拒絕：非 Unix 平臺；不是可執行普通文件的顯式 `pythonBin`，或無法在 `PATH` 上解析的裸名；非 CPython、低于 3.10 或探測失敗的解釋器；非正或非整數預算；低于截斷標記下限（64）的 `maxLogBytes`；會被 `setTimeout` 截斷的定時器值；超過有效 fd-3 幀上限的預算（宿主堆無法安全解析接近上限的幀時，該上限會降低）；或最壞峰值會突破 `RLIMIT_AS` 的 `addressSpaceMb`／輸出預算組合。

### 你得到什么

包的默認導出是 `PythonCodeRuntime` 插件。其公開面還重新導出宿主側協議詞匯：`validateChildFrame`（重建每條入站幀）、無損 JSON codec 與計量器（`encodeJsonPlain`、`checkDoneValue`、`hasUnsafeIntegerToken`、`hasNonLosslessNumber`）、`logTruncationMarker`（共享截斷標記文本），以及 `resolvePythonBin`（對照當前 `PATH` 的解釋器查找）、`readProcessStart`（供測試用的進程啟動統計）、`detachResidual`（已結算運行的資源清理測試 seam）與 `hostFrameParseCeiling`（給定堆上限可容納的堆推導幀解析上限）。每個上限都是帶默認值并經校驗的 `Config` 字段：`cpuSeconds`（60）、`maxWallMs`（600000）、`addressSpaceMb`（512，Darwin 上不生效）、`maxLogBytes`（65536）、`maxValueBytes`（32768）、`graceMs`（3000）與 `pythonBin`（`python3`，在加載期解析、檢查可執行性，在五秒強制終止期限內探測版本并固定）。每個子進程只接收 `TMPDIR`；環境中的憑證、`PATH`、`HOME` 與其他宿主狀態均不可見。

### wire

幀在子進程 fd 3 上以 JSON-lines 傳輸——每行一個對象——因此 stdout/stderr 留給程序自己的輸出。子進程 → 宿主：`boot-ack`、`call`、`log`、`done`。宿主 → 子進程：`boot`（首幀，攜帶全部上限與命名空間聲明）、`run`（`boot-ack` 之后，只攜帶程序體）與每個 `call` 一個 `reply`。偽造幀可在 `done` 上同時攜帶 `value` 與 `error`，因此消費方必須先檢查 `error`，在它存在時忽略 `value`。`log` 幀的 `open` 標志標記由顯式 flush 提交的未結束行：宿主把下一個 log 幀追加到同一條目，因此 `print('a', end='', flush=True); print('b')` 讀回為一條 `'ab'` 條目而不是假換行（拆分計費算術見 fd-3 協議 Agent Note 的 wire-contract 一節）。合并的唯一例外是截斷：當后續超預算幀觸發賬本時，已計費的前綴作為獨立條目先提交，截斷 marker 跟在后面（marker 保持末位，無重復計費）。

### 可能出錯的地方

宿主側校驗在不拋異常的情況下丟棄垃圾，因此畸形或偽造幀永遠不會讓宿主進程崩潰：`validateChildFrame` 對任何不能干凈重建的內容返回 `undefined`，非數字的 call id 永遠不會被回顯進 reply，偽造的額外字段永遠不會被帶走。非無損 JSON 或超過配置字節預算的完成值會被顯式拒絕（`non-lossless`／`over-budget`），而不是被靜默取整或截斷。原始長度超過有效幀解析上限（64 MiB，或當宿主的配置堆無法安全解析接近上限的幀時更低——見 `hostFrameParseCeiling`）的 fd-3 幀會讓本次運行以 `worker-exit` 結算（接收路徑在 `toString`/`JSON.parse` 之前限制原始幀，緊湊寬幀不能解碼出遠超其線上字節的宿主內存）。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現內部——點擊展開</summary>

本節解釋后端背后的設計；可觀察行為在[使用本包](#use-this-package)中完整覆蓋。

### 設計概念

單向信任：宿主把每條入站幀都視為敵意（模型代碼可以在 fd 3 上偽造任何內容）并逐字段重建后才讀取；Python 側信任宿主回復。bootstrap（`py/bootstrap.py`）把程序作為 async 函數體執行，因此頂層 `await` 與 `return` 都可用；binding 調用經 fd 3 以 JSON-lines 往返，回復在 pump 中限速，以免大量大回復釘住宿主的 fd-3 可寫緩沖。

### wire 契約

幀為 `boot`／`run`（宿主 → 子進程）與 `boot-ack`／`call`／`log`／`done` （子進程 → 宿主），以及每個 `call` 對應一個 `reply`（宿主 → 子進程）。`log` 幀的 `truncated` 標志標記的就是子進程賬本自己的截斷標記幀，因此宿主在與子進程相同的點停止捕獲，而不是從自己的預算推斷。`log` 幀的 `open` 標志標記由顯式 flush 提交的未結束行：宿主把下一個 log 幀合并進同一條目，因此 `print('a', end='', flush=True); print('b')` 讀回為一條 `'ab'` 條目而不是假換行（拆分計費算術在 fd-3 協議 Agent Note 的 wire-contract 段）。合并的唯一例外是截斷：當后續超預算幀觸發賬本時，已計費的前綴作為獨立條目先提交，截斷 marker 跟在后面（marker 保持末位，無重復計費）。`done.error.kind` 為 `exception`、`invalid-output`、`output-limit` 之一；墻鐘／CPU 預算、中止與基底死亡在宿主側觀察，不以幀形式攜帶。

### 無損 JSON 跨越

完成值與 binding 實參以精確 JSON 跨越：值無遞歸序列化，因此低于字節預算的深層載荷存活，而不會死在 `JSON.stringify` 的棧上限；超出安全范圍的整型 double 以精確數字跨越，而不是被靜默取整的 token；`src/protocol.ts` 中的計量器在任何其他代碼讀取載荷之前強制字節預算與數字無損性。

### 鏡像對齊

`tests/protocol-mirror.e2e.ts` 啟動真實 `python3`，對照 `src/protocol.ts` 斷言 `PROTOCOL_FD`／截斷標記文本以及 `py/protocol.py` 中每個 `TypedDict` 的必填／可選 wire 字段集，因此字段改名、刪除或一側把另一側必填的字段變成可選都會使測試失敗。字段*類型*不跨語言邊界比較；該殘留由評審加后端的真實子進程套件（`tests/runtime.spec.ts`）負責。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`PythonCodeRuntime`——spawn、幀 pump、預算、隔離、拆卸；重新導出協議詞匯 |
| [`src/protocol.ts`](src/protocol.ts) | 宿主側：幀 codec、不可信幀校驗器、無損 JSON 計量器、共享標記文本 |
| [`py/bootstrap.py`](py/bootstrap.py) | 子進程側：fd-3 通道、程序執行、binding 分發、賬本與結算 |
| [`py/protocol.py`](py/protocol.py) | Python 側：`PROTOCOL_FD`、`TypedDict` 幀鏡像、`log_truncation_marker` |
| [`tests/runtime.spec.ts`](tests/runtime.spec.ts) | 真實子進程套件：預算、隔離、敵意幀、名稱重綁 |
| [`tests/protocol-mirror.e2e.ts`](tests/protocol-mirror.e2e.ts) | 對照真實 `python3` 的跨語言鏡像測試 |
| — | 不發布運行時不變式配套項：幀順序、預算計量與拆卸發生在 CPython 子進程或 fd 3 上，因此本包沒有可供 Cordis listener 比較的同進程事件序列或獨立維護的可變關系；協議鏡像與真實子進程測試覆蓋這些進程邊界行為。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當 runtime 契約不夠時閱讀這些。它們從 seam 定義走向設計記錄與配套后端。

- [Code runtime seam](../../code-runtime/code-runtime/README.zh.md) — 本后端實現的抽象契約。
- [fd-3 協議 Agent Note](../../../.agents/notes/implemented/architecture/2026-07-31-code-runtime-python-fd3-protocol.zh.md) — 設計理由與 wire 契約。
- [結算修復 Agent Note](../../../.agents/notes/archived/bug-fix/2026-07-31-code-runtime-python-settlement-fixes.md) — 結算、計量與隔離修復及其回歸用例。
- [Worker 線程后端](../../code-runtime/code-runtime-worker-thread/README.zh.md) — 已發布的 TypeScript 兄弟。
- [Code runtime 子系統參考](../../../docs/subsystems/code-runtime.zh.md) — 請求／結果詞匯、binding 與失敗分類。

-----

<a id="model-experience"></a>
## 模型體驗

間接地，通過 `dsh-tools` 中的 PTC mode；當顯式的源碼 checkout 組合掛載本提供方時，它會把程序的完成值或失敗渲染成保留的 `run_code` 結果，且已發布 profile 均不掛載這個私有包。

#### KV Cache 效應

無直接失效；指定的消費方擁有任何請求前綴變化。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制定義本包覆蓋與不覆蓋的內容；它們是當前包約束，不是任務積壓。

- **跨語言 guard 覆蓋執行的表面與幀字段形狀，而非字段類型**——mirror e2e 比較必填／可選字段集，而非 `cpuSeconds` 在兩側是否都是 `int`；類型級漂移由評審加后端的真實子進程套件捕獲。
- **以 `setsid()` 逃出子進程組后代不被組拆卸回收**——`kill(-pid)` 夠不到它；運行仍按 done 幀決定的值結算，若該孤兒持有管道，close 截止兜底會強制結算，但孤兒本身在自行退出前一直存活到 fiber 之外。
- **結算后到達的 `log` 幀被丟棄**——運行一旦結算，宿主側捕獲即關閉；遲到的 fd-3 `log` 幀（來自比 done 幀存活更久的線程）會被丟棄，而不是追加到 `logs`。
- **binding 回復值沒有 seam 級字節或深度上限**——`maxValueBytes` 只計量 done 幀的完成值；寬 binding 回復在宿主側重建（`snapshotJsonValue` 遍歷）并整幀編碼，兩側都只受進程內存約束（與沒有子進程側預算的 binding 實參一樣）。
- **已發布 profile 均不掛載本提供方**——keyless `ptc-python-turn` 快照通過真實 Loader 替換 headless PTC 運行時；已發布 profile 繼續使用 Worker 線程后端。
- **跨通道日志交錯由后端決定**——Python stdout、stderr 與 fd-3 日志幀彼此獨立傳輸；每個通道保留自身順序，但它們在 `result.logs` 中的總順序可能不同。
- **需要 CPython 3.10 或更高版本**——配置的可執行文件會在加載期完成解析與版本探測；不受支持的解釋器會在 `ctx.codeRuntime` 注冊前失敗。
- **截斷標記文本與臨時目錄前綴保留改名前的短名**——標記 `[dsh-code-runtime-python] log capture truncated at <N> bytes` 與 `dsh-code-runtime-python-` 臨時目錄前綴被測試逐字節錨定，且獨立于 npm 包名；promotion（去掉 `experimental-` 前綴）不會重命名它們。
- **`run()` 是一次性的**——`logs` 只有在 `CodeRunResult` resolve 后才能獲得；沒有為運行中程序產生的輸出提供流式日志或進度接口。

- **運行之間不保留狀態**——每次請求都在全新子進程中執行；持久 REPL 風格內核在某個后端帶來自己的日志方案之前保持延期。
- **原始長度超過有效幀解析上限的 fd-3 幀會讓本次運行以 worker-exit 結算**——上限為 64 MiB，或當宿主的配置堆無法安全解析接近上限的幀時更低（`hostFrameParseCeiling`）；`maxLogBytes`/`maxValueBytes` 在加載期被限制到同一上限，因此誠實子進程的幀總能放得下；模型構造的超過該上限的 binding 實參（一個在 seam 層沒有預算的值）會觸發同一上限——這是該 OOM 防護的已接受殘余。
- **停止讀取回復的子進程會在回復積壓超過 1024 幀時以 worker-exit 結算運行**——宿主每次寫一條回復，管道滿時等待 `drain`；只持續發送調用而不消費回復的子進程會讓保留的積壓（及其釘住的 binding 結果）一直增長到墻鐘，因此積壓上限讓運行提前失敗。binding 結果在 seam 層沒有字節上限，所以這是計數上限而非字節上限。
- **向永不結算的 binding 洪泛調用的子進程會在 1024 個調用在途時以 worker-exit 結算運行**——binding 調用在分發前計數、異步體結算時釋放，否則 promise 永不 resolve 的 binding 會讓每個調用幀累積一個異步閉包直到墻鐘。與回復積壓一樣，這是計數上限而非字節上限。
- **組合日志與值的峰值不被加載門建模**——持續寫入的模型 daemon 線程與完成值計量、分幀相加的峰值沒有任何門會放行或拒絕；運行以 `worker-exit` 告終，隔離成立，只有失敗分類降級。
- **1 秒雙限 `ulimit -t 1` CPU 超限被報告為 `worker-exit` 而非 timeout**——當宿主在一個與軟限相等的硬 CPU 限下啟動且該限為 1 時，`_clamped` 無法下調軟限，內核在同一 tick SIGKILL 忙循環，SIGXCPU 永遠不會送達；隔離成立，只有分類降級。
- **中間 binding 值沒有字節上限**——實現仍受無損 JSON 序列化成本與進程內存約束，提供方或執行器可能應用自己的獲取上限。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
