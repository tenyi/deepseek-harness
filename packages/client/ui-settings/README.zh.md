---
description: "設置領域底座插件：設置命名空間 scope 服務、schema 服務，以及 dsh Web 客戶端的規范設置 slot 類型約定。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings

[English](README.md) | 中文

## 概述

本包使 Web 客戶端功能能夠公開由宿主設置文檔支持的可編輯偏好設置，而無需自行實現傳輸或 schema 處理。每項功能都可按命名空間讀寫、原子更新多個字段、校驗 schema，并避免靜默覆蓋并發更改。它還為設置界面框架、頁面、標題欄操作、插件標簽頁和引導流程提供標準擴展點，但自身不渲染任何界面。任何持有偏好設置的功能都可在不依賴呈現包的情況下使用它；設置外殼由單獨的包提供。

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

功能插件用本包存儲與編輯自己的偏好設置，而無需重新實現傳輸層或 schema 處理。每個組合掛載一次即可；它注入 `remote` 服務及其 `settings` 命名空間，并持有瀏覽器中唯一的 `settings.describe` 讀取方。

### 綁定命名空間

功能調用 `ctx.settingsScope.bind(spec)` 并傳入按命名空間的 spec，得到一個由共享文檔鏡像派生的 scope。scope 快照攜帶解析后的分區、組合 `base`、原始 `user`、revision、可寫性以及 host/內存模式；字段只要出現在 `user` 中即視為覆蓋，即使其值與 `base` 相等，`unset` 會清除該覆蓋。寫入經 scope 進行：`set` 與 `unset` 提交一個操作，`mutate` 則原子提交多個有序操作。每次寫入都以命名空間 revision 作為 `expectedRevision` 圍欄，因此來自另一界面的并發寫入會被拒絕，而不是被靜默覆蓋。暫存編輯器可以把開始草擬時讀取的 revision 作為固定圍欄傳入；否則 scope 使用最新排隊或鏡像 revision。

### 填充設置 slot

設置界面會注冊進本包聲明的 slot 類型。外殼（`sidebar.settings` 占位方、導航、界面框架）位于 ui-settings-general；功能頁面注冊 `settings.section` 貢獻；「插件」分區承載 `settings.plugins.tab` 頁面；首次使用引導步驟注冊 `settings.onboarding`。跨命名空間的表面（schema 內省、已服務命名空間目錄、`hasDocument`）通過 `ctx.settingsScope.describe()` 讀同一面鏡像。

### 可觀察的成功與失敗

綁定后的 scope 會立即反映當前文檔 revision；提交成功的寫入把應答折回鏡像、不再重讀。被拒絕或失敗的最新寫入觸發一次鏡像恢復讀取；被取代的寫入把恢復留給后繼者。若 spec 未提供 `decode`，則分區不是普通對象或未通過 schema 重建時一律不發布任何值，于是行渲染自己的缺失狀態，而不是一份半解碼的值。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本包實現一條歸屬規則：瀏覽器保留設置文檔的一面共享鏡像，每個派生表面都讀這同一真源，因此任一時刻看到的都是同一份文檔 revision。

### Describe 鏡像

插件注入 `remote` 及其 `settings` 命名空間，從固定的 `remote.$host` 事實一次性解析 Host 持久化模式，并持有瀏覽器中唯一的 `settings.describe` 讀取方：一面共享鏡像，在每次轉發的 `settings/document-updated` 事件與 `connection/reset` 時刷新（首次連接也包含在內，關閉「提交落在急切讀取與 SSE 訂閱之間」的窗口）。跨命名空間表面通過 `ctx.settingsScope.describe()` 讀它，這是一個讀取/折疊面（`getSnapshot`/`subscribe`/`ensure`，另有把寫應答折入的 `acceptView`）。

### Scope 派生

`ctx.settingsScope.bind(spec)` 在調用方的 context 上返回一個由鏡像派生的按命名空間 scope：scope 的 disposer 歸調用方 fiber 所有，綁定不新增任何線路讀取，某一行的激活絕不會阻塞在設置傳輸層上。寫入仍歸各 scope：`set` 與 `unset` 是 `mutate` 的單操作形式，后者會復制操作列表，并把多個有序字段操作排在同一個作為 `expectedRevision` 的命名空間 revision 之后。提交成功的 mutation 把應答折回鏡像，被拒絕或失敗的最新 mutation 觸發一次恢復讀取，被取代的 mutation 把恢復留給后繼者。冷啟動讀取次數由 `../../../apps/web/tests/startup-rpc-budget.e2e.ts` 釘住；客戶端代碼中新增直連 `settings.describe` 調用即是對它的回歸。

### Schema 服務

`ctx.settingsSchema` 為設置插件執行同步 schema 重建、校驗與不可變路徑編輯。若 spec 未提供 `decode`，則分區不是普通對象、未通過其重建后的 schema 校驗、或攜帶本客戶端無法重建的 schema 信封時，一律不發布任何值。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

以下頁面覆蓋設置界面家族及其背后的持久化 seam。

- [ui-settings-general](../ui-settings-general/README.zh.md)——設置外殼：觸發控件、導航、「通用」分區、引導投影。
- [ui-settings-plugins](../ui-settings-plugins/README.zh.md)——「插件」分區及其可配置宿主平面卡片。
- [ui-settings-models](../ui-settings-models/README.zh.md)——建立在本底座之上的 Models 頁面與 DeepSeek 引導。
- [settings](../../settings/README.zh.md)——持久化用戶設置 seam 及其文件提供方。
- [ui-sidebar](../ui-sidebar/README.zh.md)——底部席位承載設置觸發控件的側邊欄外殼。

-----

<a id="model-experience"></a>
## 模型體驗

無。該包是瀏覽器端 UI 插件層，不注冊任何面向模型的內容。

#### KV Cache 影響

無；該包既不組裝也不發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明設置傳輸層夠不到的地方；它們是當前包約束。

- **非 loopback 頁面沒有持久化設置**：本 Client 在那里禁用 Host 持久化，因此 scope 以 `unavailable` 起步且從不跨線路；盡管 Connection 認證覆蓋 API，它支撐的每一行仍在那里無效。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。本包只把 `settings.section` ledger 投影為導航，不發出 Cordis 事件，也不持有跨插件可變關系；slot core 會在加載時拒絕沖突。
