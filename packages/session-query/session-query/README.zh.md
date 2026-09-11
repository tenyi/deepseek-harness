---
description: "面向消費方與后端作者的統一會話歷史查詢服務：對實時與持久化會話日志的精確讀取、關系追蹤與提供方無關過濾。"
kind: "package-reference"
---

# @deepseek-ai/dsh-session-query

[English](README.md) | 中文

## 概述

`dsh-session-query` 讓應用代碼可以列出、過濾、讀取和搜索會話歷史，檢查帶邊界的事件上下文，并追蹤會話或事件關系。讀取優先使用實時會話而非持久化副本，并返回來自同一次一致觀察的脫離存儲克隆。精確讀取、過濾與追蹤可用于任何受支持的存儲設置；帶排名的全文搜索需要 `dsh-session-query-sqlite` 等后端。當應用代碼需要以編程方式訪問呈現給模型的歷史時，請使用本包。

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

當你需要讀取或搜索會話歷史、而不直接觸碰會話服務或存儲后端時，從應用代碼使用 `ctx.sessionQuery`。該服務由具體后端插件提供——已發布組合掛載 `@deepseek-ai/dsh-session-query-sqlite`（[README](../session-query-sqlite/README.zh.md)）——因此本包從不單獨掛載。一旦組合了后端，以下全部能力都可在 `ctx.sessionQuery` 上使用。

### 你可以做什么

| 操作 | 你得到什么 |
|---|---|
| `listSessions()` | 每個邏輯會話，最新的在前，帶 `live` 與 `persisted` 可用性標志 |
| `readSession(id)` | 經過回放校驗的完整原始事件日志，且不會讓該會話變為實時 |
| `filterSessions(filters)` | 匹配 AND 連接的元數據與可用性謂詞的會話 |
| `filterEvents(id, filters)` | 匹配元數據與字面文本謂詞的語義事件文檔 |
| `readTitleSnapshots(ids)` | 每個會話的最新折疊標題，綁定到其來源 header |
| `listEvents(id)` / `readSurface(id)` | 輕量逐事件記錄，或完整的當前模型表層 |
| `readEvent(request)` | 一個完整事件加其周圍有界的原始日志窗口 |
| `traceSession(id)` | 已知祖先鏈與遞歸后代樹 |
| `traceEvent(request)` | 一個事件的位置替換與被引用源事件關系 |
| `searchSessions(request)` / `searchEvents(request)` | 全文搜索分頁結果，由掛載的后端實現 |

不帶正文的記錄只公開 `SessionHeader.isSeeded`。返回事件正文的讀取（`readSession`、`readSurface`、`readEvent`）與保留的 `SessionObservation` 值還攜帶精確 `inheritedEventCount`，因此調用方無需從日志推斷切點即可區分繼承事件與自有事件。

### 過濾器

`SessionResultFilter` 按 id、可空 cwd、創建時間范圍、可空父級或來源可用性縮小會話范圍；`SessionEventResultFilter` 按 seq/時間范圍、事件類型、表層或字面文本縮小事件范圍。過濾器數組使用 AND 連接，同一子句內的列表值使用 OR；空列表值不匹配任何內容，范圍包含端點，格式錯誤的范圍或未知的封閉聯合值以 `SESSION_QUERY_INVALID_FILTER` 失敗。

文本子句是對所提取語義文本的字面、不區分大小寫、空白靈活的掃描——而非全文查詢。需要任意子字符串召回時使用它；需要帶排名的全文結果時使用掛載后端的搜索方法。

### 配置

繼承的旋鈕通過掛載后端的配置設置：

| 字段 | 默認值 | 含義 |
|---|---|---|
| `readWindowMax` | `50` | `readEvent` 接受的 `before`/`after` 原始事件數上限 |
| `persistedReadConcurrency` | `4` | 一次批量標題讀取中的并發持久化日志讀取數 |
| `preparedSessionCacheSize` | `5` | 為跨 `observeSession` 讀取復用而保留的冷 prepared-Session 觀察數 |

### 失敗與恢復

失敗帶有穩定的 `SessionQueryError.code` 類型。你會遇到的包括：id 不存在時 `SESSION_QUERY_SESSION_NOT_FOUND`；同一會話的實時與持久化觀察在不可變 header 上不一致時 `SESSION_QUERY_SOURCE_CONFLICT`；已掛載持久化不可讀時 `SESSION_QUERY_PERSISTENCE_FAILED`；持久化記錄未通過 Session 校驗時 `SESSION_QUERY_CORRUPT_SESSION`；加載的日志破壞表層約定時 `SESSION_QUERY_INVALID_SURFACE`。針對已知實時會話的讀取從不查詢持久化，因此后端故障不會讓當前內存歷史變得不可讀。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋服務背后的設計決策，并指出實現它們的代碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

本服務建立在一個分離與三項承諾之上：

- **實時優先的邏輯語料庫。** 每次讀取都解析一個一致的觀察：實時 `ctx.sessions` 優先，可選的 `ctx.sessionPersistence` 補充其余部分，沖突的不可變 header 寧可失敗也不合并。
- **脫離存儲的結果。** 所有返回的 header、事件與記錄都是克隆；不暴露實時狀態，也不保留訂閱。
- **精確讀取具體，搜索抽象。** 讀取、過濾與追蹤在此只實現一次；兩個全文方法是由后端擁有的唯一抽象表面。
- **一次規范的表層折疊。** `listEvents`、`readSurface` 與 `traceEvent` 使用同一個 `dsh-session` 折疊校驗整個日志，因此搜索與追蹤和模型歷史推導一致。

決策歷史記錄在[統一服務決策](../../../.agents/notes/archived/architecture/2026-07-23-unified-session-query-service.md)、[追蹤筆記](../../../.agents/notes/archived/feature/2026-07-13-session-query-tracing.md)與 [SQLite 提供方筆記](../../../.agents/notes/archived/feature/2026-07-10-sqlite-session-query-provider.md)中。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 服務定義：抽象 `SessionQueryEngine`、具體讀取、配置校驗 |
| [`src/corpus.ts`](src/corpus.ts) | 實時優先的語料庫解析、可選持久化綁定、批量投影 |
| [`src/observation.ts`](src/observation.ts) | 實時優先的定點觀察，帶按修訂鍵控的有界 prepared-Session 緩存 |
| [`src/cold-read.ts`](src/cold-read.ts) | 基于句柄的冷日志讀取，附內存中的中斷輪次閉合事件 |
| [`src/types.ts`](src/types.ts) | 公共記錄、過濾器、請求與分頁類型 |
| [`src/config.ts`](src/config.ts) | 繼承配置與封閉的 `SessionQueryError` 分類體系 |
| [`src/filters.ts`](src/filters.ts) | 提供方無關謂詞與字面文本掃描 |
| [`src/extraction.ts`](src/extraction.ts) | 按事件類型的第一方語義文本提取 |
| [`src/documents.ts`](src/documents.ts) | 表層感知的語義文檔投影 |
| [`src/tracing.ts`](src/tracing.ts) | 一次性會話血緣與事件關系追蹤 |
| [`src/sources.ts`](src/sources.ts) | 不可變 header 兼容性檢查 |
| — | 不發布運行時不變式伴生入口；查詢結果是每次調用產生的不可變投影，其血緣與事件關系會在構建時完成校驗；服務不保留可觀察的結果狀態。 |

### 語料庫解析

`SessionCorpus` 通過 fiber 綁定可選的 `ctx.sessionPersistence`，并實時優先解析每次讀取：已知實時目標直接快照，不查詢持久化；否則先列出會話，再通過短生命周期的讀取句柄完整讀出日志，并在克隆前重新檢查是否出現實時掛載。寫入者在輪次中途崩潰的冷日志用 `interruptedTurnClosers` 在內存中補齊——讀取從不修改持久化。列表與加載觀察之間會斷言 header 兼容性。批量標題讀取執行一次元數據列表與有界并發讀取，把逐會話失敗隔離，而取消會拒絕整個批次。

### 觀察緩存

`observeSession` 不經過列表預檢直接構建定點觀察。實時觀察以當前日志長度固定 cut，并在首次讀取時才物化 `events`，因此只需要 header、cursor 或 projection 的消費者永遠不會復制日志；日志只會追加，所以延后的首次讀取得到的仍然正好是該前綴。冷路徑先對存儲會話執行 `stat`，再查詢自有的有界緩存，緩存鍵為持久化實例加 `stat` 修訂：修訂未變則復用已恢復的未發布 Session，不再重讀日志；修訂變化或持久化實例被替換則經句柄 seam 重新加載并替換條目。緩存保留 `preparedSessionCacheSize` 個條目并按最久未用淘汰，被活躍觀察租約釘住的條目從不被淘汰；讀取中途轉為實時的會話會重試實時路徑。

### 讀取與追蹤

`readSession` 通過 `Session.create` 回放日志，復用恢復的校驗。`readSurface`、`listEvents` 與 `traceEvent` 共用一次 `foldSurface` 遍歷，把事件分類為 `current`、`shadowed` 或 `log-only`，并校驗從零開始且連續的 seq、表層標記的適用性以及替換或引用完整性；任何違規都以 `SESSION_QUERY_INVALID_SURFACE` 失敗。追蹤是一次性的：會話血緣只讀取一次語料庫并確定性遍歷父級與后代樹；事件追蹤沿位置替換者跟進到最終節點，同時保持被引用源事件鏈接不傳遞。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從共享查詢詞匯逐步進入具體后端與決策證據。

- [會話查詢子系統參考](../../../docs/subsystems/session-query.zh.md)——完整類型級約定：記錄、過濾器、搜索頁、血緣、有界讀取與錯誤。
- [dsh-session-query-sqlite](../session-query-sqlite/README.zh.md)——已發布的全文后端及其索引生命周期。
- [dsh-tool-session-query](../tool-session-query/README.zh.md)——構建在本服務之上的面向模型消費方。
- [會話查詢關系追蹤](../../../.agents/notes/archived/feature/2026-07-13-session-query-tracing.md)——追蹤語義與校驗邊界。
- [SQLite FTS5 會話搜索](../../../.agents/notes/archived/feature/2026-07-10-sqlite-session-query-provider.md)——搜索表面如何實現與對賬。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為該可信查詢服務只向調用方返回克隆記錄，且不注冊任何面向模型的內容。

#### KV Cache 影響

無；本包既不組裝也不發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本包何時不合適，或何時需要特別的運維注意。它們是當前包約束，不是任務積壓。

- **無調用方授權**——這是上下文范圍內的可信基礎設施；模型工具或 UI 必須限制調用方可檢查的會話。
- **無提供方協調器或回退**——服務在搜索上是抽象的，組合必須掛載具體后端；沒有搜索提供方注冊表或回退實現。
- **精確讀取回放整個日志**——`readSession`、`readSurface`、`filterEvents` 與事件追蹤會加載并校驗完整邏輯日志，因此非常大的歷史每次調用都要付出完整檢查；`listSessions` 保持輕量。
- **字面文本掃描，而非全文搜索**——`text` 過濾器用正則表達式掃描提取出的文檔且不提供排名；帶排名的搜索需要掛載后端。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文：開放設計問題與尚未決定的探索方向。它明確不具權威性——已交付的行為、限制與既定理由以上文、包代碼和相關 Agent Note 為準。

#### 未來：提取器與搜索提供方注冊表

對被引用源事件的遞歸遍歷、提取器與搜索提供方注冊表以及更多面向模型表面均被推遲；[tool-session-query README](../tool-session-query/README.zh.md)說明了當前的消費方表面。

</details>
