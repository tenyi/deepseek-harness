---
description: "領域數據形式（ctx.storageDomain）：面向在存儲后端之上選擇、掛載或排查經過 schema 校驗、發出變更事件的 KV 領域的宿主與維護者。"
kind: "package-reference"
---

# @deepseek-ai/dsh-storage-domain

[English](README.md) | 中文

## 概述

使用本包聲明經過 schema 校驗的鍵值領域，并通過 `ctx.storageDomain` 在已配置的存儲后端上打開它們。讀取同步返回經過校驗的內存狀態；每次寫入在完成前都已達到持久狀態，并按順序發出 `domain/changed`。產品包使用領域句柄，而不直接訪問存儲后端。這些宿主側狀態不會添加工具、提示詞或會話事件，因此模型與 agent loop（智能體循環）無法看到它們。

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

當宿主包需要持久、經過 schema 校驗的記錄——工作區記錄、會話伴隨元數據——時使用本包。由所屬包聲明一次領域；消費方打開它，即可獲得同步讀取與持久、發出變更事件的寫入，而無需觸碰任何后端。

### 何時使用

任何必須跨重啟保留、并始終符合 schema 的宿主側數據都適合它：領域數據形式在打開時校驗每條已存記錄，且每次寫入在 resolve 前都已持久。當數據屬于會話事件日志時請避免使用它——那是會話持久化 seam 的領域。

### 聲明領域

所屬包用 `defineDomain` 聲明一次領域——名稱、版本與 zod 記錄 schema——并導出它。名稱非法、版本不是非負整數、或全局 schema 接受 `null` 時，`defineDomain` 會在模塊加載時明確報錯。

```text
// Owning package, once:
const workspaceSpec = defineDomain({
  name: 'workspace',
  version: 1,
  tables: { workspaces: domainTable(workspaceRecordSchema) },
})
```

### 打開并使用領域

消費方通過 `ctx.storageDomain` 打開已聲明的領域并持有返回的句柄；讀取是同步的，寫入是持久的：

```text
const domain = await ctx.storageDomain.open(workspaceSpec)
await domain.table('workspaces').put(id, { path: '/work/demo' })
const record = domain.table('workspaces').get(id) // synchronous, from memory
domain.table('workspaces').update(id, (r) => ({ ...r, path: newPath }))
```

調用方擁有句柄的生命周期，并在功能關閉時用 `domain.close()` 釋放它（通常作為其自身的 `ctx.effect` 資源釋放函數）；插件卸載時，設施會關閉仍處于打開狀態的領域。

### 把領域路由到后端

哪個后端服務哪個領域由領域插件的配置決定——絕非樞紐。`backend` 指定默認路由；`routes` 按領域名覆蓋。路由到未注冊后端的領域會在打開時以 `backend-not-found` 明確報錯。

| 字段 | 默認值 | 含義 |
|---|---|---|
| `backend` | 必填 | 未顯式路由的每個領域的默認后端名稱 |
| `routes` | `{}` | 逐領域覆蓋：領域名稱 → 后端名稱 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-storage-domain)是所有受支持字段及其 JSDoc 的完整真源。

### 可觀察行為與失敗

每次寫入都要等后端確認已持久化后才完成，并按寫入順序各發出一次 `domain/changed` 事件。失敗攜帶穩定的 `DomainError` 代碼：`already-open`（名稱已打開或仍在關閉）、`facet-unsupported`（已路由后端不提供 `kv` 分面）、`invalid-record`（已存記錄或全局不符合其 schema，并指明表與鍵）、`missing-key`（對不存在的記錄執行 `update`）與 `closed`（關閉后的任何使用）。`version-mismatch` 等后端失敗會原樣透傳。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

領域層是單一實現，而非抽象化的 seam：消費方依賴本包、絕不直接觸碰后端，這把所有領域邏輯——schema 校驗、寫入串行化、變更事件——集中在一處，而不是在每個后端重復一遍。

### 設計理念

- **spec 對象是唯一真源。** `defineDomain` 固定 spec 的字面類型，并在所屬包的模塊加載時、任何介質被觸碰之前校驗其字段。記錄 schema 使用 zod，因此 `z.infer` 可避免重復定義消費方類型；插件 `Config` 仍由 schemastery 負責。
- **內存具有最終決定權；介質是持久投影。** 讀取同步取自經過校驗的內存狀態。每次寫入都在每個領域一條的寫入鏈上排隊：先到達后端持久狀態，再變更內存，然后發出 `domain/changed`——被拒絕的后端寫入不會觸碰內存，因此讀取永遠不會與介質分叉。
- **每個領域一條寫入鏈。** `put`、`delete`、`update` 與 `global.set` 都在其上排隊；`update` 的變換在鏈上自己的槽位運行，因此并發更新絕不會交錯。記錄是普通不可變數據——返回值就是已存對象本身，絕不能原地修改。
- **寫入在提交點之后發出。** `domain/changed` 是通知，不是事務參與者：監聽器拋出異常時，系統會隔離該異常并記錄警告，而不會讓已經持久的寫入被拒絕。

### 打開順序

`DomainFacility.open(spec)` 按嚴格順序執行，任一步驟失敗都會讓整個調用失敗：拒絕已打開或仍在關閉的名稱（`already-open`）；解析路由（`backend-not-found`）；要求 `kv` 分面（`facet-unsupported`）；打開單元（后端 `version-mismatch`／`malformed-medium` 透傳）；加載并根據 spec 的 schema 校驗每條已存記錄與全局（`invalid-record`）；構造領域。調用方持有句柄；設施會在卸載時關閉任何仍打開的領域，已關閉領域的名稱只在資源銷毀完成后才能重新打開。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`DomainFacility`、路由、`Config`、數據形式掛載 |
| [`src/spec.ts`](src/spec.ts) | 領域聲明：`defineDomain`、`domainTable`、描述符投影 |
| [`src/domain.ts`](src/domain.ts) | 已打開領域的運行時：寫入鏈、表與全局句柄、關閉 |
| [`src/events.ts`](src/events.ts) | `domain/changed` 事件詞匯 |
| [`src/error.ts`](src/error.ts) | `DomainError` 代碼 |
| [`src/invariant.ts`](src/invariant.ts) | 不變式伴生插件：每條 `domain/changed` 與內存狀態一致 |

### 不變式

`storage-domain-invariant` 伴生插件注冊這條所屬關系：每條 `domain/changed` 事件在發出時都必須與所屬領域的權威內存狀態一致——出現分叉意味著某條寫入路徑跳過了寫入鏈或發出了陳舊值。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當領域層視角不夠用時閱讀以下頁面：子系統參考是權威約定，Agent Note 記錄了設計與延期工作。

- [存儲子系統](../../../docs/subsystems/storage.zh.md)——領域約定、后端約定、變更事件與生成的 API。
- [存儲包映射](../README.zh.md)——家族的各包及其在倉庫中的位置。
- [領域 KV 存儲 Agent Note](../../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.zh.md)——領域為何存在、workspace 消費方，以及跨進程變更推送等延期工作。
- [Workspace 子系統](../../../docs/subsystems/workspace.zh.md)——領域數據形式的第一個消費方。

-----

<a id="model-experience"></a>
## 模型體驗

### 持久領域狀態

#### 模型看到什么

無。本包不注冊工具、不注入提示詞，也不追加會話事件；它在 `ctx.storageDomain` 后面存儲非會話數據，只發出進程內 `domain/changed` 事件。只有消費方通過自身有文檔說明的接口渲染該事件時，它才會到達模型。

#### Token 影響

為零：本包的文本不會進入任何模型請求。

#### KV Cache 影響

相互獨立：領域讀寫絕不觸碰請求前綴，因此這里沒有任何內容能使提供方緩存復用失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明領域層何時不合適，或何時需要特別的運維注意。它們是當前包約束，不是任務積壓。

- **變更只在單進程內可見**——`domain/changed` 是進程內事件；在跨進程修訂模式落地前，第二個主機進程或重新連接的 GUI 無法觀察變更（[Agent Note](../../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.zh.md)）。
- **沒有跨表事務、二級索引或多段鍵**——每次寫入只觸碰一條記錄；這些擴展列在 Agent Note 的范圍外清單中。
- **沒有數據遷移**——領域的已存版本與 spec 不同時，打開操作會被拒絕（`version-mismatch`）；修改 schema 需要手工遷移已存數據。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
