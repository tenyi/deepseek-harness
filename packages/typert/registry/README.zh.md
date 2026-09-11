---
description: "運行時 Typert 注冊表：保存生成的包反射、實時 Zod schema 與 Remote 調用描述符，并按需為消費方解析。"
kind: "package-reference"
---

# @deepseek-ai/dsh-typert-registry

[English](README.md) | 中文

## 概述

`dsh-typert-registry` 讓生成的 Typert 產物在運行時可按需查詢：每個包的反射——服務、事件與對象——其實時 Zod schema 與 Remote 調用描述符都保存在穩定鍵下，消費方可以按需查詢或解析。注冊是原子且按 fiber 作用域的：貢獻要么整體落地要么完全不落地，并在注冊組件卸載時自動撤銷。同一服務還托管 Remote 調用所經由的 lookup 與作用域 Context 提供方注冊表。它不執行 TypeScript 分析，也不生成 schema；這些由生成器與 loader 負責。

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

在存儲或消費生成 Typert 產物的任何 Host 或 Client 組合中掛載本注冊表；它提供 `ctx.typert`。沒有配置。

### 最小設置

加載注冊表插件；Client face 由 Client 運行時自身的元數據以同樣方式安裝，兩個 face 運行同一實現：

```yaml
- name: '@deepseek-ai/dsh-typert-registry'
```

### 查詢 schema 與反射

消費方用 `get(key)`、`resolve(key)` 或 `list(filter?)` 讀取 schema，用 `getPackage(name, face?)` 或 `listPackages(filter?)` 讀取包反射。`resolve()` 能區分格式錯誤的鍵、未注冊的包，以及已注冊但未以該名稱提供 schema 的包，各自給出不同的錯誤。`toJSONSchema(key)` 把實時 Zod schema 投影為 JSON Schema，且不緩存結果。

### 注冊貢獻

生成產物在 Loader 組合中通過 [loader](../loader/README.zh.md) 注冊；其他所有者直接調用 `ctx.typert.register(contribution)`，并獲得撤銷它的同一資源釋放函數。重復的包與 face 組合鍵、schema 鍵、調用 id 或端點會在提交任何內容之前拒絕整個批次。

### Lookup 與 Context 提供方

Remote 調用通過 `ctx.typert.lookups` 與 `ctx.typert.contexts` 解析 Host 對象與作用域 Context。`registerHost()` 安裝 Host wire 聲明及其 wire 到 Context 的 resolver，`configureHost()` 只替換該 resolver。`registerClient()` 為同一個 merge-declared kind 安裝雙向 Client adapter。Host 到 Client 的事件源顯式攜帶領域 identity，而不從 Context 反向投影。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋注冊表如何存儲與擁有貢獻；消費方 API 已在[使用本包](#use-this-package)中說明。

### 設計理念

注冊表建立在一個原則之上：貢獻是一次原子、由 fiber 擁有的提交。`register()` 先校驗包與 face 組合鍵、schema 與調用描述符，再在單個 Cordis effect 下提交全部內容，該 effect 的資源釋放函數精確撤銷這一貢獻。重復標識在擁有該操作的所有權邊界失敗，此時任何狀態都未改變。

### 子注冊表

- `ctx.typert.local`——當前環境的調用定義，含供源碼模式回退使用的 `hasSeen()` 歷史。
- `ctx.typert.remotes`——在調用方 fiber 中掛載的、由消費方選中的貢獻。
- `ctx.typert.lookups`——lookup 提供方，以及按鍵配置的組合方解析器覆蓋。
- `ctx.typert.contexts`——按作用域鍵配置的 Host Context 提供方與 Client Context 綁定器。

每個子注冊表都會向已訂閱的監聽器發布 `TypertRegistryChange` 事件；拋異常的監聽器會被記錄日志，且不會阻止后續監聽器。

### 標識與校驗

鍵是穩定的：反射用 `<package>#<face>`，schema 用 `<package>#<name>`，端點用 `<namespace>/<method>`。校驗會拒絕含 `#` 的名稱、超出 RPC 端點段文法的 wire 名稱、重復鍵，以及在其注冊表生命周期內改變 wire 聲明的 lookup 定義；嚴格編解碼器必須攜帶可解析的 schema。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/service.ts`](src/service.ts) | `TypertRegistry` 服務、存儲、校驗、effect 接線 |
| [`src/types.ts`](src/types.ts) | 貢獻、記錄與過濾器類型 |
| [`src/client/index.ts`](src/client/index.ts) | 安裝同一注冊表的 Client face |
| — | 不發布運行時不變式伴生入口；schema 與 package-reflection record 在 register/dispose 內一起變更，沒有獨立 event 或第二數據源可供交叉核對；重復 identity 在所屬操作處失敗。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面；它們從注冊表逐步進入供給它與消費它的內容。

- [Typert loader](../loader/README.zh.md)——生成宿主產物的自動注冊。
- [Typert 生成器](../generator/README.zh.md)——產生注冊表所存貢獻的包。
- [Typert 協議](../protocol/README.zh.md)——注冊表所服務的描述符、編解碼器與提供方約定。
- [Typert 子系統參考](../../../docs/subsystems/typert.zh.md)——字面的 `ctx.typert` 約定。
- [API Gateway 參考](../../../docs/api-gateway.zh.md)——調用描述符與提供方的主要消費方。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為該運行時類型注冊表的消費方（cordis_inspect、wire faces、門禁）擁有注冊表內容的任何模型可見投影。

#### KV Cache 影響

無直接影響；把反射或 schema 放入請求的消費方負責由此產生的前綴變化。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明注冊表存儲與拒絕什么；它們是當前包約束，不是任務積壓。

- **不合并圖**——注冊表按 face 存儲生成的反射，但不合并宿主側與客戶端側的圖，也不解析 TypeScript 引用；這些是分析器與生成器的事。
- **schema 鍵不含 face**——宿主側與客戶端側在不同上下文中運行，因此在同一上下文中注冊來自兩個 face 的同名 schema 會被作為重復項拒絕。
- **JSON Schema 投影不緩存**——`toJSONSchema()` 每次調用都返回全新文檔；需要重復投影的消費方自行負責緩存。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
