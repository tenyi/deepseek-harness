---
description: "面向部署方與維護者的 SQLite FTS5 會話歷史全文搜索后端，用于選擇、配置或排查查詢服務之上的全文搜索。"
kind: "package-reference"
---

# @deepseek-ai/dsh-session-query-sqlite

[English](README.md) | 中文

## 概述

使用本包可為會話歷史增加帶排序的 SQLite FTS5 搜索，既能跨會話搜索，也能在單個會話內搜索，并支持游標分頁。它把實時與持久化歷史索引到獨立的派生數據庫，因此搜索反映當前狀態，同時不會修改會話持久化存儲。精確讀取、過濾與追蹤仍通過同一查詢 API 提供。已發布組合中的搜索是可選能力；配置 `openAt` 可讓索引在啟動時、首次搜索時打開，或永不打開。結果匹配 token 與短語，而非任意子字符串；每個索引路徑只能由一個進程持有。

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

當組合需要對會話歷史進行排序后的全文搜索時——例如 Web 內容搜索或 `/resume` 既往工作檢索——掛載本包。常用路徑是顯式的：掛載插件、給它一個專用數據庫路徑，然后從代碼調用 `ctx.sessionQuery.searchSessions` 或 `searchEvents`。

### 何時選擇

當你想對既往會話進行帶排序與分頁的全文召回時選擇它。它與 `dsh-session-query` 和會話服務一起使用；持久化后端可選但建議掛載，這樣重啟后持久化歷史仍可搜索。不要把 `path` 指向 session-persistence 數據庫——本包擁有獨立的派生索引。

### 最小配置

```yaml
- name: '@deepseek-ai/dsh-session'
- name: '@deepseek-ai/dsh-session-query-sqlite'
  config:
    path: /absolute/path/to/session-search.db
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `path` | 必填 | 專用派生索引 SQLite 路徑，或 `:memory:`；POSIX 上缺失的路徑會以僅所有者可訪問的方式創建 |
| `openAt` | `startup` | `startup` 在激活時打開；`first-search` 把 SQLite 模塊推遲到首次搜索；`never` 關閉全文搜索，繼承的讀取保持可用 |
| `journalMode` | `wal` | `wal`、`delete`、`truncate` 或 `persist` |
| `defaultLimit` | `20` | 請求省略 `limit` 時的分頁大小 |
| `maxLimit` | `100` | 接受的最大請求分頁大小 |
| `snippetChars` | `240` | 按 Unicode 碼點計算的最大 snippet 長度 |
| `readWindowMax` | `50` | 繼承的 `readEvent()` 的 `before`/`after` 原始事件數上限 |
| `persistedReadConcurrency` | `4` | 繼承批量讀取的并發持久化日志讀取數 |
| `preparedSessionCacheSize` | `5` | 繼承的 `observeSession` 讀取器為復用保留的冷 prepared-Session 觀察數 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-session-query-sqlite)是每個受支持字段及其 JSDoc 的窮盡式真源。

### 搜索行為

`searchSessions` 搜索整個語料庫，并按每個會話匹配最強的事件分組結果；`searchEvents` 搜索一個邏輯會話。查詢是字面短語：首尾空白會被移除、內部空白會被規范化，引號、`OR`、`NEAR` 和 `*` 等 FTS5 語法被視為數據，絕不作為可執行查詢語法。元數據過濾器（會話 id、cwd、創建時間、父級、可用性、事件 seq/時間/類型/表層）在排序前縮小結果。默認搜索全部 `current`、`shadowed` 與 `log-only` 事件；傳入表層過濾器可縮小范圍。

排序是確定性的：實際 FTS5 高亮匹配 span 更多的在前，然后文檔更短的在前，事件時間、會話 id 與 seq 打破平局。結果攜帶按 `snippetChars` 個 Unicode 碼點截斷的純文本摘錄，沒有提供方專用數值分數。分頁通過不透明 `SessionSearchCursor` 延續，游標綁定到規范化后的確切請求；相關語料庫變化時游標變為陳舊（`SESSION_QUERY_STALE_CURSOR`），會話內游標可在不相關會話變化后延續，跨會話游標則不能。

`unicode61` tokenizer 匹配 token 與短語，而非任意子字符串：`AI` 不匹配 token `BRAID`。需要執行字面、空白靈活的字符串子串掃描時，使用帶 `text` 子句的 `ctx.sessionQuery.filterEvents()`。

### 何時推遲或關閉搜索

使用 `openAt: first-search` 時，服務在不導入 `node:sqlite`、不打開索引的情況下激活，把 SQLite 的實驗性警告推遲到首次實際搜索；無效數據庫讓首次搜索失敗，而不是服務激活失敗。使用 `openAt: never` 時，全文搜索對該部署關閉：`searchSessions` 與 `searchEvents` 在任何請求規范化之前就以 `SESSION_QUERY_SEARCH_DISABLED` 失敗，而繼承的全部精確讀取、過濾與追蹤保持可用。請求超過編譯謂詞預算（跨會話 14 個組合謂詞、會話內 13 個）或 SQLite 可移植的 32,766 綁定上限時，會在準備語句前以 `SESSION_QUERY_INVALID_FILTER` 失敗。

### 失敗與恢復

帶類型的 `SessionQueryError` 失敗攜帶穩定代碼：搜索配置為關閉時 `SESSION_QUERY_SEARCH_DISABLED`；索引無法打開或對賬時 `SESSION_QUERY_INDEX_FAILED`；搜索目標不存在時 `SESSION_QUERY_SESSION_NOT_FOUND`；語料庫在分頁之間變化時 `SESSION_QUERY_STALE_CURSOR`——請重試完整的搜索調用；游標不屬于該請求時 `SESSION_QUERY_INVALID_CURSOR`。取消在同步 SQLite 調用之間被尊重；已在 JavaScript 線程上執行的語句無法被中斷。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋后端背后的設計決策，并指出實現它們的代碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

本后端建立在一個分離與三項承諾之上：

- **派生索引，絕不動源存儲。** FTS 行存放在專用可丟棄數據庫中；這里的代碼從不打開 session-persistence 數據庫。
- **實時優先的觀察。** 一個串行化狀態機比較持久化快照修訂，只通過短生命周期讀取句柄讀取新增或已更改日志，并在一個事務中對賬，因此搜索反映最新的穩定狀態。
- **世代綁定的游標。** 每次語料庫變化都會遞增世代；游標攜帶其創建時的世代，寧可陳舊失敗也不返回偏移后的頁面。
- **字面短語即數據。** 調用方查詢文本被引成一個 FTS5 短語，查詢語法保持惰性；保留高亮標記在索引前從文檔中剝離。

設計歷史記錄在 [SQLite FTS5 會話搜索筆記](../../../.agents/notes/archived/feature/2026-07-10-sqlite-session-query-provider.md)與[統一服務決策](../../../.agents/notes/archived/architecture/2026-07-23-unified-session-query-service.md)中。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 服務：配置、openAt 生命周期、串行化對賬、查詢執行、游標 |
| [`src/query.ts`](src/query.ts) | 請求規范化、參數化謂詞、摘錄、謂詞與綁定預算 |
| [`src/schema.ts`](src/schema.ts) | 數據庫 schema、application id 歸屬、原地重置、僅所有者文件創建 |
| — | 不發布運行時不變式伴生入口；系統會在每次串行化查詢邊界校驗對賬、游標世代與派生索引歸屬。 |

### 索引生命周期

持久化 FTS 行存放在專用派生數據庫中并跨重啟保留；實時會話使用連接本地 TEMP 表，遮蔽同一會話的持久化基庫，并在實時所有者脫離后再次顯示基庫。兩類表都在數字 `seed_length` 中保留精確繼承切點；重建的 header 只公開 `isSeeded`，而切點參與實時指紋與持久來源修訂。每次搜索執行一次串行化觀察：列出持久化快照、把逐會話修訂與已索引行比較、只通過讀取句柄讀取新增或已更改日志（在內存中補齊被中斷的末尾輪次，從不寫回）、提取語義文檔，并在運行查詢前于一個事務中提交對賬。重復查詢與不變的重新打開不讀取任何內容；切換存儲或觀察到新增、已更改、已刪除或經外部修復的來源時，會在下次穩定觀察時對賬。來源或事務失敗不提交任何內容，下一次搜索重試。

### Schema 歸屬

數據庫攜帶 application id 與 schema 版本 8。打開時拒絕其他應用程序擁有的文件或規范數據庫，拒絕未知用戶表；只有已識別的不兼容派生 schema 才會原地重置——因此不相關或 session-persistence 數據庫絕不會被觸碰。在 POSIX 文件系統上，缺失的目錄與數據庫文件以僅所有者可訪問的方式創建（進程 umask 前為 `0700` 與 `0600`）。每個派生索引路徑在一個進程中只能由一個服務擁有；世代與 TEMP 遮蔽狀態由連接持有。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從共享查詢服務逐步進入類型級約定與設計證據。

- [會話查詢子系統參考](../../../docs/subsystems/session-query.zh.md)——本后端實現的完整類型級約定。
- [dsh-session-query](../session-query/README.zh.md)——服務定義：本后端繼承的精確讀取、過濾與追蹤。
- [dsh-tool-session-query](../tool-session-query/README.zh.md)——調用這些搜索方法的面向模型消費方。
- [SQLite FTS5 會話搜索](../../../.agents/notes/archived/feature/2026-07-10-sqlite-session-query-provider.md)——搜索語義、對賬與 tokenizer 決策。
- [JSONL 會話持久化](../../session/session-persistence-jsonl/README.zh.md)——本可丟棄索引觀察的權威 Session store；其 root 必須與本包的數據庫路徑分開。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為該搜索后端只向調用方返回命中，且不注冊任何面向模型的內容。

#### KV Cache 影響

無；本包既不組裝也不發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本包何時不合適，或何時需要特別的運維注意。它們是當前包約束，不是通用 SQLite 對比或任務積壓。

- **無調用方授權**——這是上下文范圍內的可信服務；模型工具或 UI 必須強制執行自己的訪問策略。
- **同步查詢執行**——`DatabaseSync` 在 MATCH 執行期間會阻塞 JavaScript 線程，且無法中斷已運行的語句。
- **Token 召回，而非任意子字符串**——`unicode61` tokenizer 不會匹配更大 token 中的子字符串；對字面掃描使用 `filterEvents()`。
- **單一所有者的派生索引**——每個索引路徑必須僅歸一個進程中的一個服務所有；不支持外部寫入者與多進程共享。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文：開放設計問題與尚未決定的探索方向。它明確不具權威性——已交付的行為、限制與既定理由以上文、包代碼和相關 Agent Note 為準。

#### 未來：其他 tokenizer 與搜索提供方

`unicode61` tokenizer 的選擇犧牲子字符串召回，以換取較小的索引體積與雙字符 token 支持；trigram 備選方案經實測后被否決。切換 tokenizer 或增加另一個搜索后端會改變索引召回，并需要各自的對賬與世代方案。

</details>
