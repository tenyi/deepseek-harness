---
description: "面向用戶與維護者的文件型設置提供方：選擇、配置或排查 YAML/JSON 設置文檔及其熱重載。"
kind: "package-reference"
---

# @deepseek-ai/dsh-settings-file

[English](README.md) | 中文

## 概述

`dsh-settings-file` 把所有 namespace 的用戶設置保存在一個 YAML 或 JSON 文檔中，默認是 harness home 下的 `settings.yaml`：用戶可以直接編輯文檔——變更實時生效——也可以經服務寫入，后者會安全合并并發編輯。YAML 寫入保留每個未觸碰節點上的注釋、錨點與排版，未加載插件所擁有的分節也絕不會被丟棄。啟動時非法文檔直接報錯；運行中失敗的熱重載保留最后可用分節并告警，而不是拖垮進程。

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

當組合需要一份用戶可編輯的設置文檔時，掛載此提供方。常用路徑是顯式的：掛載提供方、經 `ctx.settings` 注冊 namespace，然后讓用戶編輯文檔或讓配置界面經服務寫入。

### 何時選擇

把它當作默認的用戶設置存儲：一份用戶可以在任意編輯器中打開的人類可讀文檔，變更無需重啟即可生效。當文檔中的注釋與排版很重要時也選它，因為寫入會保留它們。非文件存儲（例如遠程設置后端）不隨本包提供；那需要另一個提供方。

### 最小配置

```yaml
- name: '@deepseek-ai/dsh-settings-file'
  config:
    path: /absolute/path/to/settings.yaml
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `path` | `<harness home>/settings.yaml` | 設置文檔路徑；擴展名決定格式（`.yaml`、`.yml` 或 `.json`） |
| `dshHome` | `$DSH_HOME` 或 `~/.dsh` | `path` 省略時使用的 harness home |
| `watch` | `true` | 監聽文檔并熱發布外部編輯 |
| `debounceMs` | `100` | watcher 寫入穩定窗口（毫秒） |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-settings-file)是每個受支持字段及其 JSDoc 的窮盡式真源。

### 編輯文檔

文檔是 namespace 到用戶分節的 YAML 或 JSON 映射。用戶可以直接編輯：任何變更都會自動生效，刪除文件則讓所有 namespace 回到默認值與 `base`。存在但非法的文檔在啟動時使插件加載失敗——提供方絕不會靜默忽略或覆蓋它。運行中不可讀或不可解析的編輯只告警并保留最后可用分節，因此手改出錯不會拖垮進程。

### 經服務寫入

經 `ctx.settings` 的寫入絕不會丟失并發變更：仍在途中的外部編輯、watcher 漏掉的變更或另一個進程的寫入，都會在寫入落地前并入文檔。YAML 編輯是葉子級 diff：只設置變化的值、只刪除被移除的鍵，因此每個未觸碰節點以及每個被改鍵值對的鍵上的注釋、錨點與排版都得以保留；被改的數組或其他非 map 值整體替換。JSON 文檔重新序列化，無注釋。若磁盤上的文檔已變為非法，寫入會明確報錯，而不是覆蓋用戶的手工編輯。

鎖有 2 秒的獲取期限，帶指數退避；超時的競爭者不會移除現有鎖，因為鎖齡無法區分崩潰的所有者與被暫停但仍存活的寫入方——遺留鎖恢復須由操作者執行。文檔以 `0600` 權限創建在僅屬主可訪問的 `0700` 目錄下，并通過一個絕不跟隨預埋符號鏈接的隨機后綴臨時文件原子替換。

### 失敗與恢復

- 不支持的擴展名在加載時報錯——格式由擴展名決定（`.yaml`、`.yml`、`.json`）。
- 文檔缺失即空存儲；刪除文件即回到該狀態。
- 運行中磁盤文檔非法不會阻塞任何操作，但保留最后可用分節；寫入拒絕覆蓋它。
- `prepareDocument()` 在原生編輯器打開前，把缺失的文檔物化為空的僅屬主可訪問文件。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋提供方背后的設計決策并指出實現它們的代碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

- **一步顯式默認化。** `resolveSpec(config)` 在一步內解析文件名、格式、watch 標志與防抖窗口，因此繞過 Schemastery 規范化的程序化構造也得到同樣的默認值。
- **啟動明確報錯，重載保留最后可用值。** 存在但非法的文檔使插件加載失敗；運行中不可讀或不可解析的編輯只告警并保留最后可用分節。
- **每次寫入都是讀-改-寫。** persist 先從磁盤對賬并把任何差異發布進 seam，再基于這份新鮮文本渲染，因此寫入絕不會復活陳舊文檔或丟掉未觀察到的同級分節。
- **寫入持有跨進程寫鎖。** 讀-渲染-rename 流程在以 `wx` 創建的同級 `<file>.lock` 保護下運行，帶指數退避與 2 秒的獲取期限；讀取方從不取鎖，因為 rename 提交是原子的。
- **YAML 編輯是葉子級 diff。** 只設置變化的值、只刪除被移除的鍵，保留未觸碰節點上的注釋、錨點與排版。
- **重載與寫入共享一條操作鏈。** watcher 刷新與來自各 namespace 隊列的 persist 按隊列順序逐個執行；每次渲染都基于上一次操作提交后的文本。
- **按內容抑制自寫。** 提供方緩存最后可用文本；watcher 事件內容與緩存相同（含自己的寫入）即為 no-op。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 提供方：spec 解析、加載/解析、寫鎖下的讀-改-寫、watcher 生命周期、YAML/JSON 渲染 |
| — | 不發布運行時不變式伴生入口；文件往返、watcher 時序與原子寫入行為由包測試證明，進程內提交關系歸 `@deepseek-ai/dsh-settings` 所有。 |

### 文檔生命周期

基類服務 init 在服務可注入前加載并發布文檔；隨后提供方啟動 watcher，并在 ready 時對賬一次，補上「初始讀取與 watcher 生效之間寫入的變更永不觸發事件」的啟動缺口。每個 watcher 事件與每次 persist 都排上同一條獨占操作鏈。`reconcileFromDisk` 把磁盤文本與緩存比較，發布任何差異（缺失即空文檔），只在解析失敗時拋出，讓每個調用方自行選擇策略——重載告警并保留最后可用文檔，寫入明確報錯。卸載先把提供方標記為已關閉，關閉 watcher，再等待所有已排隊或進行中的操作完成，之后不再有任何發布。

### 渲染路徑

YAML 渲染把緩存文本解析成可變的保留注釋樹，再對一個 namespace 施加葉子級編輯；JSON 渲染替換一個 namespace 鍵后以兩個空格縮進重新序列化。在 Chokidar 打開目標之前，提供方對層級最深的現有祖先路徑執行 realpath 解析，再拼回缺失的后綴，從而避免 Windows 在 libuv 內部混用 8.3 別名與長格式事件路徑。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當提供方級約定不夠用時閱讀以下頁面。它們從 seam 約定逐步進入原子寫入原語與窮盡式配置面。

- [用戶設置服務](../settings/README.zh.md)——namespace 注冊、分層解析、寫入與本提供方所供的事件。
- [設置子系統參考](../../../docs/subsystems/settings.zh.md)——namespace、解析順序、descriptor 與變更提交。
- [設置包映射](../README.zh.md)——用戶設置能力的兩個包。
- [原子寫入](../../util/atomic-write/README.zh.md)——每次寫入都使用的寫鎖與原子替換。
- [主目錄路徑](../../util/home-paths/README.zh.md)——`$DSH_HOME` 解析與規范化監聽路徑。
- [生成配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-settings-file)——每個受支持配置字段及其源聲明。

-----

<a id="model-experience"></a>
## 模型體驗

間接生效：存儲值會影響的任何面向模型的行為均由 `ctx.settings` 的消費方負責；文件提供方只存儲并發布 namespace 分節，自身不注冊任何面向模型的內容。

#### KV Cache 影響

無直接失效；請求前綴的任何變更均由消費方插件負責。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本提供方何時不合適或需要特別的運維注意。它們是當前包約束，不是任務積壓。

- **同 namespace 沖突仍是后寫勝出**——寫鎖加讀-改-寫讓并發寫入者不會丟掉彼此的 namespace，但兩個寫入者編輯同一個 namespace 時仍以較后的寫入為準；沒有按值合并，也沒有修訂檢查。
- **漏掉的 watcher 事件在下一個信號前保持不可見**——讀取從不重新 stat 文件，因此 watcher 漏報的變更只會在下一個事件、下一次寫入或重啟時被并入。
- **注釋保留僅限 YAML 且僅限 map 形狀**——JSON 文檔重新序列化，無注釋，且被改數組內部的注釋（或行內附著在被改標量值上的注釋）隨其所描述的值一同被換掉。
- **無值間接引用**——分節存字面值；面向密鑰的 `${env:VAR}` 式引用是暫緩實現的 seam 層功能。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文：尚未決定的暫緩方向。它明確非權威——已發布的行為、限制與已接受的理由見上文各節與包代碼。暫緩方向：`${env:VAR}` 式值間接引用是 seam 層功能——落地時應歸屬設置服務約定，而非本提供方。遺留鎖恢復按設計仍是操作者動作，因為鎖齡無法區分崩潰的所有者與被暫停但仍存活的寫入方。

</details>
