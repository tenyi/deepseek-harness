---
description: "SQLite 存儲后端：面向在單個數據庫文件中選擇、配置或排查按行存儲文檔的 KV 存儲的宿主與維護者。"
kind: "package-reference"
---

# @deepseek-ai/dsh-storage-sqlite

[English](README.md) | 中文

## 概述

`dsh-storage-sqlite` 是一個存儲后端：把每個已路由單元托管在同一個 SQLite 數據庫文件中，每條記錄按行存儲一份 JSON 文檔，注冊為后端 `sqlite`。單條記錄更新恰好觸碰一行，這正是它適合高頻定點寫入的原因。當領域數據變動頻繁、或部署偏好單一可查詢數據庫時選擇它；當數據需要以純文本文件形式可讀時選擇 JSON 后端。本后端只面向宿主側：它不貢獻提示詞、工具或 schema，因此模型與 agent loop（智能體循環）永遠不會看到它。

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

當組合把頻繁更新的領域數據保存在一個數據庫中時使用本包：把相關領域路由到此后端，每個單元即作為表物化在配置的數據庫文件中。

### 何時選擇

當寫入頻繁且為定點更新時選擇它——每個鍵恰好映射到一行，因此更新一條記錄只觸碰一行，而不是重寫整個文件。當人類需要以純文本文件查看或編輯已存數據時選擇 JSON 后端。同步的 `node:sqlite` 驅動會在每條單語句調用期間阻塞 JavaScript 線程，這在領域數據規模下可以接受，但高寫入率時值得納入考量。

### 配置

兩個字段：數據庫路徑與 journal mode。`:memory:` 打開一個進程內數據庫，其內容隨進程消失。

```yaml
- name: '@deepseek-ai/dsh-storage'
- name: '@deepseek-ai/dsh-storage-sqlite'
  config:
    path: /var/lib/dsh/data.db
- name: '@deepseek-ai/dsh-storage-domain'
  config:
    backend: sqlite
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `path` | 必填 | SQLite 數據庫文件路徑，或 `:memory:` |
| `journalMode` | `wal` | Journal mode：`wal`、`delete`、`truncate` 或 `persist` |

`wal` 適合本地磁盤；回滾日志模式（`delete`／`truncate`／`persist`）適合 WAL 共享內存文件不可用的文件系統，例如網絡掛載。生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-storage-sqlite)是每個受支持字段及其 JSDoc 的窮盡式真源。

### 可觀察行為

缺失的目錄與數據庫文件會以僅所有者可訪問的權限創建（`0o700`／`0o600`）；已有數據庫保持其既有模式。已存格式版本與描述符不同的單元拒絕 `version-mismatch`，蓋有非當前物理布局版本的數據庫會直接拒絕——不做遷移，預發布立場。失敗攜帶穩定的 `StorageError` 代碼，寫入操作完成后即已持久化。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本后端是在單個 `node:sqlite` 連接之上的文檔按行布局，設計目標是讓每次按鍵更新都是一條預處理語句。

### 設計理念

- **每行一份文檔。** 每個單元表都變成一張物理 STRICT 表 `u_<unit>_<table> (key TEXT PRIMARY KEY, value TEXT)`，其 `value` 列保存記錄的 JSON 文本；全局單例存放在共享的 `unit_globals` 表中。一個鍵的更新恰好觸碰一行——這就是把高頻變更領域路由到這里的原因。
- **單語句原子性。** 每個寫入原語都是一條預處理語句，因此 SQLite 的逐語句原子性無需顯式事務即可滿足 KV 約定；寫入順序仍由調用方負責（領域層的寫入鏈）。
- **名稱在 DDL 之前校驗。** 單元名與表名在進入 DDL 之前必須匹配 `UNIT_NAME_RE`，因此任何外部輸入都不會被插值進 SQL 標識符。
- **版本明確報錯。** 物理布局版本存放在 `PRAGMA user_version`（全新數據庫最后蓋戳）；單元格式版本存放在 `units` 表中。任何其他已標記值都會被拒絕——不做遷移。

### 打開順序

打開數據庫時會以 `0o700` 創建父目錄、以 `0o600` 獨占創建缺失文件、應用 `PRAGMA foreign_keys = ON` 與 journal mode、檢查 `user_version`、創建 `units` 與 `unit_globals` 元數據表，并在最后給全新數據庫蓋戳，讓失敗留下未蓋戳的介質。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：后端注冊、`path`／`journalMode` 配置、單元表 |
| [`src/schema.ts`](src/schema.ts) | 打開順序、物理布局版本、元數據表、記錄表命名 |
| [`src/unit.ts`](src/unit.ts) | 一個已打開單元：預處理語句、JSON 值解析、關閉 |
| — | 不發布運行時不變式伴生入口；schema 版本與單元版本的一致性在打開時檢查，不一致時會在單元創建前拒絕打開；持久性需要由共享 KV 符合性測試套件中的后端往返測試驗證；本包不暴露可持續觀察的進程內關系。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當本后端視角不夠用時閱讀以下頁面：子系統參考是權威約定，兄弟后端展示了另一種介質。

- [存儲子系統](../../../docs/subsystems/storage.zh.md)——后端約定、領域語義與生成的 API。
- [存儲包映射](../README.zh.md)——家族的各包及其在倉庫中的位置。
- [JSON 存儲后端](../storage-json/README.zh.md)——面向小而可檢查數據的人類可讀介質。
- [領域 KV 存儲 Agent Note](../../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.zh.md)——后端家族背后的設計與被推遲的會話后端遷移。

-----

<a id="model-experience"></a>
## 模型體驗

### 已存領域記錄

#### 模型看到什么

無。本后端不貢獻提示詞、工具或 schema；它在 `ctx.storage` 后面持久化非會話領域數據，只供宿主側消費方使用。

#### Token 影響

實時請求 token 為零。

#### KV Cache 影響

無：本后端從不觸碰實時請求前綴。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本后端何時不合適，或何時需要特別的運維注意。它們是當前包約束，不是任務積壓。

- **同步驅動阻塞事件循環**——每次寫入都是一次同步 `DatabaseSync` 調用；阻塞只持續一條語句，在領域數據規模下可以接受。
- **沒有忙等待或重試策略**——持有寫鎖的競爭連接會立即拒絕操作，而不是等待；領域層的寫入鏈在單進程內串行化寫入，跨進程協調不在范圍內。
- **只打開當前的物理布局版本**——任何其他已標記的 `user_version` 都會被拒絕而不是遷移（預發布立場）。
- **打開順序與查詢提供方重復**——`openDatabase` 與 `session-query-sqlite` 都強制執行 SQLite 文件所有權約束，但兩個包各自擁有不同的應用標識與 schema；沒有共享介質輔助模塊將二者耦合。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
