---
description: "JSON 存儲后端：面向在配置根目錄下選擇、配置或排查整單元文件與逐記錄文件的宿主與維護者。"
kind: "package-reference"
---

# @deepseek-ai/dsh-storage-json

[English](README.md) | 中文

## 概述

`dsh-storage-json` 在配置的根目錄下把領域數據存為可讀 JSON，并注冊為后端 `json`。默認的 `single` 布局為每個單元保存一份完整的 `<unit>.json` 文件；`per-record` 布局為每條記錄保存一份帶版本戳的文檔。兩種布局都以原子方式發布每個變更文件，領域層負責安排調用順序。當運維方需要可檢查文件且所選布局適合寫入量時選擇它；對于更大或高并發的數據則選擇 SQLite。本后端只面向宿主側，不貢獻提示詞、工具或 schema。

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

當組合需要可讀、可編輯的 JSON 存儲時使用本包。把相關領域路由到 `json` 后端；每個領域規范選擇 `single` 或 `per-record` 布局。

### 何時選擇

小型單元需要一份完整、美化打印的文件時，選擇默認的 `single` 布局。定點寫入只應替換一份記錄文檔時，選擇 `per-record`。當數據量大、寫入頻繁或多條記錄需要事務更新時，選擇 SQLite 后端。

### 配置

唯一的插件字段是 `root`，用于保存單元文件與目錄。它是必填項，因為本后端不回退到 `process.cwd()`。后端按需以 `0o700` 模式創建根目錄。領域規范選擇其布局；本插件不提供布局覆蓋項。

```yaml
- name: '@deepseek-ai/dsh-storage'
- name: '@deepseek-ai/dsh-storage-json'
  config:
    root: /var/lib/dsh/data
- name: '@deepseek-ai/dsh-storage-domain'
  config:
    backend: json
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `root` | 必填 | 保存 `<unit>.json` 文件與 `<unit>/` 目錄樹的目錄；按需以 `0o700` 創建 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-storage-json)是每個受支持字段及其 JSDoc 的窮盡式真源。

### 可觀察行為

缺失的 `single` 文件或 `per-record` 目錄會作為空單元打開，并在第一次寫入時物化。在 `single` 中，畸形內容以 `malformed-medium` 拒絕，不同的已存版本以 `version-mismatch` 拒絕。在 `per-record` 中，每份畸形或不可讀的文檔，以及版本不在描述符的當前版本和兼容版本內的文檔，都讀作記錄不存在，因此單個壞文檔不會使單元被拒絕。記錄鍵必須匹配 `[a-zA-Z0-9_-]+`；不安全的鍵在任何文件操作前被拒絕。每次已完成的寫入都已持久化，關閉后的操作以 `closed` 拒絕。

只有當源單元名稱匹配，且源版本為當前版本或已聲明的兼容版本時，空的 `per-record` 目錄樹才可以從有效的 `<root>/<unit>.json` 整單元文檔初始化其已聲明表。后端保持該源文件不變，并為遷移的記錄寫入當前版本戳。接受集合之外的源版本會使新目錄樹保持為空。已聲明表中只要存在任意文檔路徑，或存在已聲明的 `global.json`，就會對整個單元禁止該初始化，即使該文檔不可讀或版本陳舊。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

兩種布局共享原子發布機制，但以不同方式確定狀態所有權。`single` 擁有一份內存單元投影；`per-record` 把目錄樹視為權威狀態。

### 設計理念

- **`single` 以內存為權威狀態。** 每次寫入都會更改內存單元、序列化其完整狀態，并以原子方式替換 `<unit>.json`。發布失敗會恢復先前的內存值。
- **`per-record` 以目錄為權威狀態。** 每次 put 或 delete 都會更改一個 `<unit>/<table>/<key>.json` 文檔，`loadAll()` 則重新讀取目錄樹。每份文檔都帶有單元版本戳與一條記錄值。
- **每次調用都持久發布。** 寫入過程使用臨時文件、fsync、原子 `rename()` 替換，并在 POSIX 上 fsync 父目錄。領域層寫入鏈負責安排跨調用的順序。

### 文件格式

`single` 文檔攜帶單元標識、全局單例與所有表：

```json
{
  "unit": { "name": "workspace", "version": 1 },
  "global": null,
  "tables": { "workspaces": { "<key>": { "path": "/work/demo" } } }
}
```

`per-record` 表文檔位于 `<root>/<unit>/<table>/<key>.json`，形式為 `{ "version": 1, "record": <value> }`；可選的全局值使用 `<root>/<unit>/global.json`。格式版本來自領域規范。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：后端注冊、`root` 配置、單元打開／關閉表 |
| [`src/single-unit.ts`](src/single-unit.ts) | 一個 `single` 單元：權威內存、寫入原語與發布回滾 |
| [`src/per-record-unit.ts`](src/per-record-unit.ts) | 一個 `per-record` 單元：目錄樹讀取、路徑安全記錄與單文檔寫入 |
| [`src/format.ts`](src/format.ts) | 帶版本校驗的整單元與記錄序列化 |
| [`src/atomic.ts`](src/atomic.ts) | 原子文件替換：臨時文件寫入、fsync、rename、目錄 fsync |
| — | 不發布運行時不變式伴生入口；此處要求保證寫入持久性及發布后重新解析的等價性，這兩點需要通過介質往返測試（共享后端符合性測試套件）驗證；本后端不公開任何可持續觀察的進程內關系。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當本后端視角不夠用時閱讀以下頁面：子系統參考是權威約定，兄弟后端展示了另一種介質。

- [存儲子系統](../../../docs/subsystems/storage.zh.md)——后端約定、領域語義與生成的 API。
- [存儲包映射](../README.zh.md)——家族的各包及其在倉庫中的位置。
- [SQLite 存儲后端](../storage-sqlite/README.zh.md)——面向高頻數據的定點更新介質。
- [領域 KV 存儲 Agent Note](../../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.zh.md)——后端家族背后的設計及其延期工作。

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

- **`single` 會重寫整個單元**——每次寫入都重新發布完整單元文件；當此成本過高時，使用 `per-record` 或把領域路由到 SQLite。
- **沒有跨進程寫鎖**——兩個進程寫入同一單元時可能交錯執行替換；對同一文件的寫入以最后完成者為準。
- **Windows rename 沒有顯式 write-through**——持久性依賴 libuv 的 `rename()`（`MoveFileExW` 并啟用替換）；`log` 分面落地時，計劃把會話日志后端更嚴格的 Win32 write-through 發布輔助函數下移到此處。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

Agent Note 把整單元重寫的規模前提標記為風險：如果在被路由到 SQLite 之前，第二個消費方以千條記錄規模落到本后端，重寫成本會比預期更早顯現。緩解辦法是配置——把 `routes` 指向 SQLite 后端——而不是修改本包。

</details>
