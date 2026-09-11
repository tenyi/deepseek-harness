---
description: "面向部署方與維護者的隨產品交付 JSONL 會話持久化后端說明，用于選擇、配置或排查帶可選 Zstandard 壓縮的逐會話持久日志。"
kind: "package-reference"
---

# @deepseek-ai/dsh-session-persistence-jsonl

[English](README.md) | 中文

## 概述

`dsh-session-persistence-jsonl` 把每個會話存為當前的僅追加 JSONL 日志，并保留不可變的歷史格式 generation——默認以帶校驗和的 Zstandard 幀存儲，禁用壓縮時以換行分隔的原始文本行存儲。它通過持久化句柄提供當前邏輯 `SessionEvent` 流，因此格式遷移、壓縮、歷史解碼與崩潰恢復仍是存儲內部細節。當消費方需要按會話的磁盤文件時選擇它；選擇 `compression: 'none'` 后日志可作為純文本按行讀取。根目錄是唯一必填配置；持久性、延遲實體化、[受支持的歷史格式遷移](../session-format-catalog/README.zh.md)與撕裂尾部崩潰恢復都隨后端提供。

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

當組合需要由按會話文件支撐的持久會話時掛載此后端。常用路徑是顯式的：加載會話服務、掛載后端，然后給出根目錄。

### 何時選擇

當消費方受益于每會話一份產物——導航、外部工具或可逐行讀取的原始日志——時選擇此后端。它是唯一的第一方會話持久化提供方。后端把會話保存在部署控制的根下：項目本地、共享、臨時或集中式。

### 最小配置

```yaml
- name: '@deepseek-ai/dsh-session'
- name: '@deepseek-ai/dsh-session-persistence-jsonl'
  config:
    root: /absolute/path/to/session-logs
```

`root` 必填且無默認值：`process.cwd()` 默認值會隨進程 cwd 變更而分散會話文件。現有根必須是可讀目錄；缺失根在第一次實體化時創建。

| 字段 | 默認值 | 含義 |
|---|---|---|
| `root` | 必填 | 所有會話文件的根目錄 |
| `compression` | `'zstd'` | 物理編碼：`'zstd'` 帶校驗和幀，或 `'none'` 換行分隔 UTF-8 文本 |

實時事件的寫入批處理不是配置：批處理窗口是該 seam 在每個寫句柄內部的調度策略。

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-session-persistence-jsonl)是每個受支持字段及其 JSDoc 的窮盡式真源。

### 磁盤布局

每個會話在可讀項目目錄下獲得一個會話自有目錄。每個規范 generation 都以版本與文件名一致的物理 header 開始。當前格式為每個持久事件存儲一行；凍結的 v0 與 v1 reader 也能理解其歷史 packed Assistant delta 行。當前格式在 header 中存儲 `isSeeded`，并從最后一個帶標記的 `session/end-seed` 推導 inherited cut；歷史 codec 則轉換其數字 `seedLength`。格式 catalog 會在句柄暴露當前邏輯值之前完成該轉換。當前存儲記錄使用下文所述的無損來源序列表示：

```text
<root>/
  --<normalized-cwd>--/          # readable project directory (or _no-cwd/)
    <encoded-id>/                # session-owned directory
      session.jsonl.zstd         # released v0, compressed root
      session.v1.jsonl.zstd      # released v1, compressed root
      session.v2.jsonl.zstd      # released v2, compressed root
      session.v3.jsonl.zstd      # released v3/current, compressed root
      session.jsonl              # released v0, raw root
      session.v1.jsonl           # released v1, raw root
      session.v2.jsonl           # released v2, raw root
      session.v3.jsonl           # released v3/current, raw root; later versions use vN
```

會話 id 在使用前被單射轉義為一個安全路徑段（無遍歷、無沖突）。規范化 cwd 讓項目目錄保持可讀、便于導航；規范化相同的 cwd 字符串共享項目目錄，而會話 id 仍選擇不同會話目錄。運行時操作選擇數值最高的規范 generation，格式拒絕診斷會點名該絕對路徑，讓操作者能找到構建拒絕解讀的原始日志。

### 持久性與崩潰語義

會話延遲實體化：`create(header)` 不寫入任何內容并返回持有的寫句柄，句柄的第一次 `append` 通過無覆蓋發布寫入并 `fsync` 編碼后的 header 與第一批——因此已創建但從未 append 的會話不留下任何磁盤內容，除非其所有者調用 `handle.flush()`，以無事件的單個 header 幀發布它。后續每個批次追加行或一個壓縮幀，并在 append 完成前 `fsync`；捕獲到寫入或同步失敗時把文件回滾到之前的字節長度。已提交事件絕不重寫。崩潰后，已存儲日志保留被中斷的最終輪次——已提交前綴中的每條記錄都保留下來，由執行恢復的讀方通過其寫句柄追加合成 closer。不完整的最終原始行會被丟棄。撕裂的最終 Zstandard 幀只貢獻其中完整解碼出的 JSONL 記錄；寫句柄會截掉撕裂字節，并在第一次新批次之前持久重寫這些恢復出的記錄。完整已提交幀中的校驗和、解壓或結構失敗以損壞拒絕。

當前代際掃描器在處理可恢復尾部之前，執行當前編解碼器所有者的結構準入檢查。已退役的必需 PTC 標簽與 `request/header.header.system` 即使出現在較早的畸形行之后也會導致文件被拒絕；恢復絕不將它們作為普通損壞尾部數據截斷。

### 讀取日志

`open(id, 'read'|'write')` 選擇最高規范 generation。當前格式輸入走普通快速路徑。對于歷史輸入，只讀 open 會單遍解碼并遷移源、校驗當前邏輯結果，然后在不發布后繼的情況下返回。寫 open 會在可用時復用按 revision 為鍵的 preparation，否則執行同一套 preparation，再按有界分片編碼同目錄臨時文件、在 Worker Thread 中校驗、復查源修訂，并在返回前以不覆蓋方式發布當前后繼。源保持逐字節不變。如果源在 preparation 后發生變化，該次寫 open 會失敗，已經返回給讀方的邏輯歷史不會被替換；后續寫 open 會針對新的 revision 重新執行 preparation。后端在 memo 化前凍結已解碼的 event graph，并在此時將其標記為 `shared-frozen`；句柄讀取和 slice 即使為空也保留該狀態。只有尚未實體化的 pending 空日志報告 `detached`。`stat(id)` 與 `list()` 只選擇并轉換最高 generation 的 header，不讀取事件行，也不啟動遷移；快照攜帶所選文件的 `sizeBytes` 與盡力而為的 stat 派生修訂號。選擇 `compression: 'none'` 后，日志是外部讀取方可直接消費的換行分隔文本；壓縮默認值必須經后端讀取。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節說明物理編碼與寫入路徑；可觀察約定已在[使用本包](#use-this-package)中說明。

### 設計理念

該后端擁有自己完整的存儲運行時（`src/storage.ts`）：`JsonlSessionHandle` 承載逐句柄修改鏈、帶固定批處理窗口與 single-flight 排空的已路由實時事件緩沖、單調讀取與冪等 close；一個 tracker 持有進程內單寫者認領、teardown 清掃所遍歷的打開句柄集合，以及后端自己的會話監聽器所路由進的已創建但未實體化待定會話。歷史正文讀取共享每個 Session 唯一的一次 Decode/Migrate preparation，按 revision 為鍵的有界 memo 讓緊接的觀察到恢復交接復用該解析；backend 在 memo 化前只對每個 event graph 深度凍結一次，因此后續 handle read 無需復制或再次凍結。只有寫 open 才發布準備好的后繼。本包有意只暴露默認插件導出與配置類型——具體類不是具名導出，因此消費方只耦合 `ctx.sessionPersistence`，其可觀察行為由共享 seam 測試套件（`runPersistenceContract`/`runLiveWritePathContract`）釘住。其變更令牌是盡力而為的文件修訂值：device、inode、size 與納秒時間戳標識一份日志，供 `stat`/`list`、在并發 append 撕裂讀取時重試的穩定讀取循環，以及發布前源檢查使用。

### 物理編碼

默認產物是獨立 [Zstandard 幀](../../../.agents/notes/implemented/architecture/2026-07-19-zstandard-jsonl-session-logs.zh.md) 的標準拼接：一個僅包含 header 行的帶校驗和幀，后跟每個持久 append 批次一個帶校驗和幀，使用 Node 內置 Zstandard API 的默認壓縮級別（無級別開關）。當前格式為每個事件寫一行；`sourceEventSeqs` 使用無損存儲形式：至少包含三個序列號的連續段會變成 `[start, end]` 區間對，其他列表原樣保留；讀取時會展開回精確的內存數組。歷史遷移會復用一個 Zstandard decoder，讓已解析行流經有狀態格式 Stage，并通過一個壓縮 context 以約 1 MiB 主線程分片流式寫入當前記錄，同時只保留最終當前事件、有界 decoder 狀態與必需的序號重映射表。列表只讀取并驗證 header 幀。`compression: 'none'` 保留相同的存儲形式邏輯行，但不使用幀壓縮。一個根只屬于一種編碼：啟動發現與定向查找會拒絕使用另一后綴的 generation；格式遷移保留已配置編碼，而壓縮轉換、混合根回退與雙寫仍不受支持。凍結的 v0 與 v1 codec 僅為歷史 generation 保留 packed-row decoder。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`Config` schema、后端服務類與文件存儲原語 |
| [`src/storage.ts`](src/storage.ts) | JSONL 句柄、已路由實時事件緩沖、進程內寫入者記賬、監聽器、teardown |
| [`src/format.ts`](src/format.ts) | 日志路徑派生、header 編碼與當前記錄掃描 |
| [`src/generation.ts`](src/generation.ts) | 單遍歷史還原、有界 stage 編碼、源 revision 檢查與排他后繼發布 |
| [`src/migration-verifier.ts`](src/migration-verifier.ts) | stage 與競爭 generation 校驗的 Worker 生命周期 |
| [`src/zstd.ts`](src/zstd.ts) | Zstandard 幀壓縮、解碼與幀掃描 |
| [`src/win32.ts`](src/win32.ts) | Windows write-through 發布與目錄創建 |
| — | 不發布運行時不變式伴生入口；身份在存儲層強制；持久化正確性依賴后端往返與崩潰尾部測試，本包不公開可持續觀察的進程內關系。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從共享持久化模型逐步進入同級后端與物理格式決策。

- [會話持久化子系統](../../../docs/subsystems/persistence.zh.md)——后端無關的服務語義與提供方關系。
- [會話持久化 seam](../session-persistence/README.zh.md)——本后端實現的服務約定。
- [項目會話目錄決策](../../../.agents/notes/implemented/architecture/2026-07-24-project-session-directories.zh.md)——項目與會話目錄布局背后的取舍。
- [Zstandard JSONL 會話日志](../../../.agents/notes/implemented/architecture/2026-07-19-zstandard-jsonl-session-logs.zh.md)——帶校驗和幀編碼的理由。
- [已發布 Session 格式遷移](../../../.agents/notes/implemented/architecture/2026-08-31-released-session-format-migrations.zh.md)——不可變 generation、相鄰遷移邊與發布規則。

-----

<a id="model-experience"></a>
## 模型體驗

### 恢復的對話歷史

#### 模型看到什么

JSONL 存儲不會向實時請求提供提示詞或 schema。加載會恢復已存儲的表層歷史，并保留之前的請求 header 用于重建；新 loop 組合當前 envelope。恢復會用 `TOOL_NOT_STARTED` 平衡沒有持久調用的 assistant 請求；持久調用無結果時則變為 `TOOL_OUTCOME_UNKNOWN`，它要求模型只重試只讀或冪等工作，并驗證可能的副作用或詢問用戶。嵌入式 Assistant stream 與僅日志 attempt 不會重復生成消息。

#### Token 影響

實時請求不新增 token。恢復后的 agent（智能體）會因保留的歷史、當前 envelope，以及每個中斷調用中以引用形式加入的修復結果文本而消耗 token。

#### KV Cache 影響

JSONL 存儲不修改實時請求前綴。只有重建歷史、當前 envelope 與模型路由匹配時，恢復 loop 才能重用提供方緩存；崩潰修復結果僅追加。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本后端何時不合適，或何時需要特別的運維注意。它們是當前包約束，不是任務積壓。

- **格式遷移保留已配置編碼，且只支持 catalog 中的鏈**——本 build 把受支持的歷史代遷移到當前格式；更改壓縮需要獨立根，保留的舊版本不提供自動 fallback 或 downgrade 支持。
- **平鋪文件存儲布局不加載**——加載前使用獨立根，或將預發布產物移入項目/會話目錄布局。
- **壓縮文件不能直接按行讀取**——使用后端加載；或在寫入新根前選擇 `compression: 'none'`，供外部行讀取方使用。
- **不刪除會話文件**——日志在 `root` 下累積，直到外部移除；seam 無刪除接口。
- **每會話一個活動寫入方**——寫句柄認領在所屬后端實例內排除第二個寫入方，內核鎖（`session.lock` 上的非阻塞 `flock(2)`；Windows 上為由該路徑派生的命名內核信號量，零文件系統足跡）排除其他所有實例與進程；鎖在以寫模式打開既有產物時立即獲取，新建會話則僅在首次實體化寫入之前獲取，因此未實體化的會話不留任何文件系統足跡。崩潰持有者的鎖隨其進程消亡，會話立即可再寫入，而活著但卡死的持有者會阻塞寫入方直到其進程退出（POSIX 上刪除鎖文件即放棄該排他；釋放本身從不刪除它）。咨詢式 `flock` 在部分網絡文件系統（NFSv3）上不可靠，Windows 信號量名按登錄會話隔離。
- **POSIX 實體化需要硬鏈接支持**——第一次 append 使用 `link()`，使同 id 競態失敗而不覆蓋已提交日志；Windows 使用無替換 write-through rename。
- **POSIX 寫入需要匹配的預編譯系統 addon**——[`node-addon-system`](../../../native/system/README.zh.md) 提供異步 flock，無須在用戶側編譯。addon 缺失時拒絕寫入所有權；Windows 保留其信號量實現。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
