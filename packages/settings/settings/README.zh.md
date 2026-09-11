---
description: "面向插件作者與維護者的用戶設置服務：注冊可配置 namespace、讀取解析值或接入配置界面。"
kind: "package-reference"
---

# @deepseek-ai/dsh-settings

[English](README.md) | 中文

## 概述

當用戶需要在運行時修改插件配置，而無需重啟或重新讀取 `cordis.yml` 時，請使用本包。每個 namespace 合并 schema 默認值、部署配置與用戶覆蓋；讀取方會得到深凍結的解析值快照，并可觀察已提交的變更。寫入只影響用戶覆蓋、按 namespace 串行執行，并可拒絕陳舊 revision，避免覆蓋較新的變更。持久化運行時編輯需要先配置設置存儲；否則插件仍可繼續使用組合配置。

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

插件與配置界面通過 `ctx.settings` 在運行時讀取并修改配置。常用路徑：掛載提供方、用 schema 注冊 namespace、讀取并觀察解析值，并通過 owner scope 寫入。

### 何時選擇

當插件的配置需要在運行時可變——用戶編輯文檔或配置界面修改——且無需重啟或重讀 `cordis.yml` 時，選擇設置服務。它適合多個插件各擁有一個配置 namespace、以及配置界面需要渲染 schema、標記用戶覆蓋字段并持久化編輯的場景。當配置在加載時固定則沒有必要：沒有掛載提供方時一切照舊，配置保持組合原樣。

### 掛載提供方

服務本身不存儲任何內容；請掛載一個提供方，例如隨附的文件型提供方：

```yaml
- name: '@deepseek-ai/dsh-settings-file'
  config:
    path: /absolute/path/to/settings.yaml
```

提供方上線后 `ctx.settings` 即出現。完整配置面由提供方 README 負責；生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-settings-file)列出每個受支持字段。

### 注冊 namespace

插件用 schemastery schema 注冊自己的 namespace，并可選地把組合配置作為 `base` 層傳入，讓解析值從部署已配置的內容起步：

```text
const scope = ctx.settings.register('ui-theme', ThemeSchema, {
  base: config,   // composition entry config; the user layer resolves above it
})
const theme = scope.get()              // deep-frozen resolved snapshot
scope.update({ density: 'compact' })   // merges into the user section and persists
```

TypeScript 會按小寫字母、數字與連字符文法檢查字面量 namespace 參數；運行時動態傳入的字符串接受相同校驗。`ctx.settings.installSection(owner, ns, schema, entry, hooks)` 為消費方插件封裝可選服務接線：只要設置服務存在，它就用插件的組合配置作為 `base` 注冊 namespace；服務消失時插件回退到組合配置，行為與原先完全一致。

### 讀取與觀察值

`get(ns)` 以深凍結快照返回解析值，namespace 未注冊時為 `undefined`。`watch(callback)` 在每次已提交變更后以 `(next, prev)` 調用回調：同一回調的調用按提交順序逐個執行，異常被隔離并記入日志，因此慢或拋錯的觀察者絕不會阻塞或破壞其他觀察者。

### 寫入值

`update(ns, patch)` 把普通對象 patch 深合并進用戶分節——絕不進 `base`——校驗解析候選值、經提供方持久化后提交。`replace(ns, section)` 整體替換用戶分節，是刪除/重置路徑：`replace({})` 重新繼承 `base` 與 schema 默認值。`mutate(ns, ops)` 在寫入排到隊首那一刻的分節上按序施加 `{ op: 'set' | 'unset', path }` 編輯——這是持有不完整（例如脫敏后）視圖的調用方的刪除路徑，因為按協議接口返回的內容重建分節再整體替換，會刪掉協議從未回傳的每個字段。

每次寫入都會拒絕與 JSON 不兼容的數據（`Date`、`Map`、`BigInt`、非有限數或循環引用會在任何內容持久化前以 `$` 為根的路徑報錯）、拒絕只讀提供方上的寫入，并可接受可選的 `expectedRevision`：把 descriptor 中的 `revision` 傳回，namespace 已越過該值時寫入會被 `SettingsConflictError` 拒絕，而不是覆蓋先完成寫入的一方。

### 配置界面

`describe()` 為每個已注冊 namespace 返回一條 descriptor：序列化 schema、解析值、分離的 `base` 與 `user` 層（字段出現在 `user` 中即標記為用戶覆蓋）、生效時機與 namespace 的 revision。每個協議接口都必須傳入 `redactSecrets: true`：它從每一層剝離 `role('secret')` 字段，并把它們枚舉為 `{ path, set }` slot，讓頁面可以渲染只寫輸入而不接觸任何機密。`documentPath` 與 `prepareDocument()` 在提供方擁有用戶可編輯文件時把它暴露給原生編輯器。

### 事件與失敗

`settings/updated (ns, next, prev, source)` 在每次已提交變更后觸發——進程內寫入（`source: 'update'`）或外部觀察到的編輯（`source: 'provider'`）——解析值深相等時絕不觸發。`settings/document-updated (ns, revision)` 在原始用戶分節發生變化時觸發，即使解析值沒有變——已打開的編輯器正需要它來得知字段從繼承變為覆蓋。schema 拒絕的存量分節在重載時保留該 namespace 的最后可用值并告警；注冊時同樣的失敗會直接拒絕注冊。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋服務背后的設計決策并指出實現它們的代碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

- **分層解析，單一用戶層。** namespace 的值依次為 schema 默認值、注冊方的組合 `base`、用戶文檔分節；寫入只觸碰用戶層，因此 `replace({})` 是真正的重置。
- **提交以深相等為門檻。** 只有解析值變化時 `settings/updated` 才觸發；原始分節事件獨立存在，因為配置界面還必須得知「繼承變成了覆蓋」。
- **寫入排隊并做 revision 檢查。** 每個 namespace 的寫隊列按調用順序串行，`expectedRevision` 在隊首判斷——那里服務才能分辨持有新鮮快照的寫入方與持有陳舊快照的寫入方。
- **觀察者與監聽器異常被隔離。** watcher 調用與事件扇出隔離同步拋出與異步拒絕，一個壞掉的觀察者不會卡死提交或提供方的重載循環；`INVARIANT` 編碼的失敗在所有監聽器執行完后重新拋出。
- **注冊是 fiber 上的 effect。** 注冊 namespace 是調用方插件 fiber 上的 effect：dispose（資源釋放）該 fiber 即移除 namespace 及其觀察者。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | Service Definition：namespace 校驗、注冊、解析、寫隊列、describe/脫敏、事件、`installSection` |
| [`src/redact.ts`](src/redact.ts) | `redactSecrets` 遍歷器：剝離 `role('secret')` 字段并枚舉其 slot |
| [`src/types.ts`](src/types.ts) | 客戶端安全類型面：事件聲明、`SettingsNamespace`、`SettingsUpdateSource` |
| [`src/invariant.ts`](src/invariant.ts) | 不變式伴生插件：`settings/updated` 只對已注冊 namespace、只在解析值變化時、且攜帶權威值觸發 |

### 解析與寫入路徑

每次寫入都在調用時對輸入做快照（分離并校驗 JSON 形狀的數據），然后排上該 namespace 的串行鏈。在隊首，服務按當前狀態重讀分節、檢查 `expectedRevision`、合并/替換/編輯、經 schema 與 owner 的可選 `validate` 解析并校驗候選值、經提供方持久化，然后才提交并發出事件。registrant fiber 在寫入途中被 dispose 的寫入仍到達存儲，但不會提交、也不會通知任何人；卸載先拒絕新寫入，并排干排隊寫入與已啟動的 watcher 調用后才完成。

### 變更檢測與事件

`commit` 用 seam 的 `deepEqualJson` 謂詞比較解析值，并逐監聽器扇出 `settings/updated`。`bumpRevision` 比較原始分節并攜帶新 revision 發出 `settings/document-updated`；它與解析值檢查相互獨立。兩個扇出以相同方式隔離監聽器異常。

### 客戶端安全類型

`./types` 子路徑出口持有事件聲明及其簽名點名的 `SettingsNamespace`、`SettingsUpdateSource` 類型，包根繼續 re-export 這些類型。于是 Host 編譯面之外的消費方讀到的正是 Host 發射的那一份簽名，而不必再寫一遍。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當服務級約定不夠用時閱讀以下頁面。它們從共享子系統詞匯逐步進入隨附提供方與能力架構。

- [設置子系統參考](../../../docs/subsystems/settings.zh.md)——namespace、注冊、owner scope、descriptor、變更提交與生成的 cordis 接口面。
- [文件型設置提供方](../settings-file/README.zh.md)——隨附的 YAML/JSON 提供方：配置、熱重載、保留注釋的寫入。
- [設置包映射](../README.zh.md)——用戶設置能力的兩個包及其角色。
- [能力 seam](../../../docs/capability-seams.zh.md)——本服務遵循的 Service Definition / Service Provider / Consumer 拆分。

-----

<a id="model-experience"></a>
## 模型體驗

間接生效：由設置值提供的所有面向模型的內容均由消費方插件負責；本服務只存儲并解析用戶設置，自身不注冊任何面向模型的內容。

#### KV Cache 影響

無直接失效；把設置值納入請求前綴的消費方負責該變更。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本服務何時不合適或需要特別注意。它們是當前包約束，不是任務積壓。

- **單一用戶層**——解析只認識 schema 默認值、一個組合 `base` 與一個用戶文檔；它不記錄每個解析值由哪一層提供。
- **`redactSecrets` 并非一條可被證明的協議邊界**——遍歷器只跟隨 `object`/`dict`/`array` 容器，因此只能經由 union、intersection 或 transform 抵達的 `role('secret')` 字段會被原樣返回，且 `secrets` 列表為空；序列化 schema 還會把 secret 字段的默認值帶給每個客戶端。兩種情況都不會被拒絕；機密無法經由被遍歷的容器抵達的 schema，絕不可注冊到暴露于協議的 namespace 上。fail-closed 的 `describeForWire()`——拒絕自己無法證明安全的 schema，并對序列化封裝與錯誤文本做凈化——是暫緩的答案。
- **跨進程并發由提供方定義**——服務僅在進程內按 namespace 串行寫入；跨進程并發按提供方行為收斂（文件提供方在寫鎖下讀-改-寫，因此并發寫入者不會丟掉彼此的 namespace，同 namespace 沖突按后寫勝出解決）。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文：尚未決定的開放設計方向。它明確非權威——已發布的行為、限制與已接受的理由見上文各節與包代碼。代碼 TODO 中記錄的開放方向：把公開的 `ns` 參數更名為 `namespace`（API、提供方約定、實現、測試與消費方同步）；釋放注冊項時停用所有 watcher 并等待其調用鏈完成，確保回調不會在 registrant fiber 釋放后繼續運行；替換注冊從持久化分節重新解析，讓進行中的舊寫入不會把它留成陳舊值；改用屬性安全的對象構造，讓 `__proto__` 這類合法 JSON 鍵保持為自有數據。fail-closed 的 `describeForWire()` 凈化器是上文脫敏限制的暫緩答案。

</details>
