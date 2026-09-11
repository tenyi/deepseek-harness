---
description: "面向部署方與維護者的持久會話投影緩存說明，用于選擇、配置或排查持久檢查點、零 I/O 列表讀取與加速的冷投影折疊。"
kind: "package-reference"
---

# @deepseek-ai/dsh-session-projection-cache

[English](README.md) | 中文

## 概述

本包保存持久的逐會話投影檢查點，讓歷史列表、統計信息與 goal 快照無需加載每個會話日志即可讀取緩存值。冷投影折疊可從已檢查點化的前綴之后繼續，從而減少重啟后的工作量。會話日志始終是權威：崩潰可能使檢查點陳舊，但不會使其領先于已提交事件；不兼容記錄會被忽略或備份。當重啟的會話需要頻繁讀取投影時選擇本包；當投影只服務活會話，或額外存儲寫入與無限增長的檢查點保留成本超過節省的工作量時跳過本包。

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

當客戶端應在不加載日志的情況下列出冷會話投影值時，把本包與投影注冊表及存儲棧一起掛載。沒有它時，消費方必須先取得日志，才能重建冷投影值。

### 何時選擇

當部署會重啟會話，并需要為歷史列表、統計信息或 goal 快照提供持久投影值時，選擇本包。當投影只服務活會話，或額外存儲寫入的成本高于所節省的投影工作時，跳過本包。

### 最小配置

兩個節流字段均必填——寫入節奏是部署選擇，沒有普適正確值：

緩存通過存儲棧打開自己的域，因此 base 先掛 `storage`、`storage-json`（根 `dshHomePath('storages')`）與 `storage-domain`（`backend: json`）：

```yaml
- id: session-projection-cache
  name: '@deepseek-ai/dsh-session-projection-cache'
  config:
    writeEveryEvents: 200
    writeIntervalMs: 5000
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `writeEveryEvents` | 必填 | 在各必寫點之間強制一次持久檢查點寫入的每會話已提交事件數 |
| `writeIntervalMs` | 必填 | 各必寫點之間臟檢查點最長可保持未寫入的時間 |

本插件注入 `storageDomain`、`sessionProjections` 與 `sessions`。生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-session-projection-cache)是每個受支持字段及其 JSDoc 的窮盡式真源。

### 檢查點如何寫入

三個必寫點總是寫入：會話創建保存由種子派生的切面，`turn/end` 保存列表讀取所需的輪次終值，會話釋放保存活會話的最終切面。其間，配置的條數與間隔節流隨事件累積寫入。每次寫入通過領域寫入鏈以原子方式替換該會話的完整記錄；失敗會記錄警告并讓緩存保持陳舊，后續寫入會自行修復。

### 讀取緩存值

`cachedSnapshot(meta, inheritedEventCount)` 以零 I/O 從存儲域的內存表同步提供客戶端值。它只接受身份匹配的記錄以及版本和 schema 均匹配的 key，再按所服務行的最低水位返回 `{ asOfSeq, values }` 切面。`cachedPredecessorTitle(meta, inheritedEventCount)` 是更窄的列表專用例外：生命周期匹配且已通過結構準入的 predecessor record 只能公開與當前版本兼容的 `title` row。該 title 是 durable prefix 中可能過時的事實，而不是 fold seed；它攜帶 sentinel `asOfSeq: -1`，因為改變事件數量的 Session 遷移會使 predecessor row 的數字序號失效。其他 predecessor row 仍不可用。未 seeded 的列表知道切點為零；僅 header 的 seeded 列表不知道數字切點，因此兩條快速路徑都要跳過，直到權威正文讀取提供它。`coldSnapshot(meta, inheritedEventCount, events)` 接受精確切點與完整有序日志，在折疊時跳過已檢查點化的前綴，并在自身不讀取持久化層的情況下刷新記錄。

### 緩存保證什么

日志領先，緩存跟隨：活會話檢查點先把會話的緩沖事件持久化，然后才保存緩存記錄。因此崩潰可能讓緩存落后于日志，但絕不會讓緩存領先。讀取和寫入共享存儲域內一致的內存狀態；逐單元寫入鏈只在持久化成功后修改內存。每個帶版本戳的記錄必須匹配當前運行單元的 schema 與完整生命周期身份（`formatVersion`、`createdAt`、`cwd`、`isSeeded` 和 `inheritedEventCount`），因此從另一會話格式代或 fork 切點折疊出的行不能播種調用方。JSON 后端把每條記錄存于僅所有者可訪問的 `<root>/session_projcache/sessions/<id>.json` 目錄樹中。

升級絕不拖垮啟動，也不會暴露未經證明的折疊結果。版本戳落在 spec `compatibleVersions` 集合內的記錄仍可被結構化讀取并等待當前檢查點重寫，但缺失或更舊的 `formatVersion` 絕不匹配當前 Session，因此不能作為 hydrate seed。生命周期匹配的 predecessor title 只能通過上述列表 hint 讀取，因為 title 文本在相鄰 Session format edge 之間保持不變，并且該 row 仍須通過當前 projection `stateVersion` 與 schema。格式匹配后，缺失的 lineage 字段解碼為 unseeded lineage——對非 fork 會話精確無誤，seeded 調用方則通不過身份比對、回落冷折疊。仍然通不過 schema 校驗的存量記錄會按域的 `invalidRecords: 'backup-and-skip'` 策略移出為 `<id>.json.bak.<時間戳>`、連同原因寫入日志，并由下一次檢查點重建。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節說明緩存的持久性與存儲所有權；可觀察行為已在[使用本包](#use-this-package)中說明。

### 設計理念

緩存是投影注冊表檢查點接口上的折疊捷徑，存于 `per-record` 領域數據表中。它帶來六項后果：讀取絕不繞過領域寫入鏈；每次后臺寫入都 fail-soft；`ver` 不匹配時丟棄而不遷移記錄；記錄必須通過當前運行單元的 `stateSchema`；寫入通過無損 JSON 邊界替換一份完整會話記錄；日志領先，緩存跟隨。

### 讀寫所有權

緩存在 `session_projcache` 領域中為每個會話保存一份帶版本戳的文檔。它不依賴會話持久化后端，不調用 `locate`，也不檢查逐會話目錄。畸形或陳舊的記錄讀作不存在；需要冷值的消費方負責提供日志以重新折疊。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`SessionProjectionCache` 服務、后臺寫入監聽器、緩存讀取 |
| [`src/spec.ts`](src/spec.ts) | `session_projcache` 域 spec 與記錄身份類型 |
| — | 不發布運行時不變式伴生入口；完整正確性關系只能通過對持久化日志重新執行折疊來檢查；持久化邊界通過 schema 校驗，讀路徑的版本與水位防護由包規范證明，相關局部約束在寫入與讀取路徑強制執行。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從緩存逐步進入它檢查點化的注冊表與保存其記錄的存儲域。

- [會話投影子系統](../../../docs/subsystems/session-projection.zh.md)——本緩存檢查點化的投影單元約定與驅動語義。
- [會話投影注冊表](../session-projection/README.zh.md)——本緩存持久化其檢查點的 `ctx.sessionProjections` 服務。
- [存儲子系統](../../../docs/subsystems/storage.zh.md)——保存緩存記錄的領域路由與后端行為。
- [會話包映射](../README.zh.md)——相鄰的持久化、標題與遙測包。
- [會話投影 RFC](../../../.agents/notes/proposed/architecture/2026-07-27-session-projection-and-command-log.zh.md)——持久投影緩存的設計理由。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為持久緩存只加速主機側的投影狀態讀取，不注冊任何模型可見內容。

#### KV Cache 影響

無；緩存從不組裝或發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明緩存何時需要運維注意。它們是當前包約束，不是任務積壓。

- **無淘汰或保留接口**——記錄按會話持續累積；清理已存儲檢查點屬于帶外維護，與會話持久化采用相同策略。
- **間隔節流采用按會話的粗粒度控制**——一次無臟數據的寫入完成后，計時器在首個臟事件到達時啟動；持續但低于條數閾值的事件流每間隔寫入一次，而非滑動窗口。
- **緩存側不做冷重折疊**——緩存只服務并刷新自己的記錄，從不讀取會話日志，因為它不依賴持久化層；需要保證冷快照的消費方自行從日志重新折疊。
- **每次 schema 或域版本變更都必須論證升級路徑**——改動存儲記錄 schema 或域版本時，同一 PR 必須在 `tests/fixtures/` 下歸檔此前已發布磁盤格式的 fixture（測試前置數據），并在 `tests/fixtures.spec.ts` 中用測試論證所選的處置方式：讀兼容恢復（`compatibleVersions`）、當前版本重寫，或 backup-and-skip 搶救。即便選擇直接丟棄舊記錄的 bump，也要證明丟棄既不會導致啟動失敗，也不會污染緩存樹。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
