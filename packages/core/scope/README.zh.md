---
description: "面向插件作者與維護者的作用域注冊庫，用于構建按 agent（智能體）或按分組隔離貢獻的注冊表或事件接口。"
kind: "package-library"
---

# @deepseek-ai/dsh-scope

[English](README.md) | 中文

## 概述

`dsh-scope` 讓插件作者能夠為每個 agent 或分組提供隔離的貢獻集合與統一生命周期。子作用域繼承祖先貢獻，且較近的定義優先；祖先作用域可以觀察后代活動，這兩種關系均不反向成立。釋放作用域會移除它擁有的一切。按 agent 或分組隔離必須脫離 agent loop（智能體循環）與 preset 工作時，請使用這個零依賴庫。

## 目錄

- [使用本包](#use-this-package)
- [理解實現](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

插件作者使用 `dsh-scope` 為單個 agent（或單個分組）提供獨立的注冊世界。core 分組中的注冊表都構建在它之上——通過 `agent.ctx` 注冊的工具只對該 agent 可見——同樣的原語也服務于任何自定義注冊表或帶作用域的事件。

### 創建作用域

`createScope(ctx, key)` 在 `ctx` 的 fiber 下創建作用域：其 `ctx` 攜帶作用域標簽，通過它進行的每項注冊既具備作用域可見性，也服從作用域生命周期。`dispose()` 撤銷通過該作用域進行的每項注冊；`rawDispose` 是確切 Cordis disposer，用于把 teardown 嵌套進有序組合 effect。

```text
const scope = createScope(ctx, agent)
scope.ctx.on('agent/status', ({ agent, status }) => track(agent, status))
// later:
await scope.dispose()   // unwinds every registration made through scope.ctx
```

### 路由帶作用域的事件

`scopeTarget(base, key)` 構造帶作用域事件分發所用的不透明載體。無標簽監聽器保持全局；標簽為 `key` 的監聽器接收該鍵及其后代的事件。載體只攜帶路由狀態——真實主體由事件參數攜帶。

### 構建帶作用域的注冊表層

注冊表作者使用 `ScopedLayers`、`NamedEntries` 與 `AnonymousEntries` 持有一個立即構造的全局層加惰性創建的精確作用域層：讀取從不創建層，`merge()` 沿作用域鏈物化按插入序的具名遮蔽，`effect()` 從同一上下文推導可見性與所有權。只有當整個聚合為空時才回收作用域層。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋該包如何實現上述行為；可觀察約定已在[使用本包](#use-this-package)中完整說明。

### 設計理念

注冊上下文同時決定可見性與所有權：通過帶作用域上下文進行的注冊在該作用域內可見、并隨其 dispose（資源釋放），從而防止貢獻在一個作用域中可見、卻隨另一個作用域拆除。該原語用于路由受信任的同進程插件；它不是沙箱或權限邊界。交出帶作用域的上下文，也會交出創建該上下文的插件的服務解析范圍（解析沿創建者 fiber 的依賴鏈行進），因此作用域應由具備這些帶作用域注冊所需依賴的插件來創建。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | `createScope`、`scopeOf`、`scopeTarget`、`bindScopeParent`/`scopeParentOf`/`scopeChainOf`、載體標記 |
| [`src/store.ts`](src/store.ts) | `ScopedLayers`、`NamedEntries`、`AnonymousEntries`、`ScopeLayer` |
| [`src/invariant.ts`](src/invariant.ts) | 基于生成的作用域事件映射的不變式配套 |
| [`src/scoped-events.generated.ts`](src/scoped-events.generated.ts) | 已聲明帶作用域事件的生成解析器映射 |

### 父鏈

一個關系支撐兩個方向：注冊視圖沿鏈**向下**繼承（子作用域看得見祖先的各層），事件放行沿鏈**向上**擴展（標簽為祖先的監聽器收到分發到后代鍵的事件）。綁定僅此一次——已有父級的鍵直接拋錯，只有返回的綁定句柄才能重新綁定——且每次鏈接都拒絕閉環。`scopeChainOf` 返回 `[key, parent, …]`，最近者在前。

### 事件篩選

`scopeTarget` 把基對象的現有 `Context.filter` 與作用域謂詞組合起來：無標簽監聽器放行；有標簽監聽器僅當標簽為分發鍵或其祖先時放行；`key === undefined` 只放行無標簽監聽器。帶 `{ global: true }` 的監聽器繞過篩選。`Scoped<T>` brand 要求帶作用域事件以載體作為 `this` 類型，因此用裸主體分發會產生編譯錯誤。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

包級約定對大多數消費方已經足夠；需要周邊領域與設計原理時再閱讀以下頁面。

- [作用域注冊子系統](../../../docs/subsystems/scope.zh.md)——身份、載體與層類型。
- [agent 作用域上下文 Agent Note](../../../.agents/notes/implemented/architecture/2026-07-08-agent-scope-contexts.zh.md)——安全非目標與上下文設計。
- [agent 作用域運行時設計 Agent Note](../../../.agents/notes/implemented/architecture/2026-07-12-agent-scope-runtime-design.zh.md)——循環如何構建按 agent 的作用域。
- [core 分組地圖](../README.zh.md)——core 各包如何組合。

-----

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

這些限制說明該原語何時需要特別留意。它們是當前包約束，不是任務積壓。

- **只有感知作用域的 API 才會隔離狀態**：注冊表必須按 `scopeOf()` 歸檔，事件必須通過 `scopeTarget()` 分發；僅僅通過帶作用域的上下文調用任意 Cordis 服務，并不會改變該服務仍為上下文全局這一事實。
- **一個上下文只攜帶一個最近的作用域鍵**：層級關系存在于鍵級父關系中而非上下文標簽里；嵌套作用域上下文仍遮蔽為單一標簽，多成員策略集仍不受支持。
- **服務可達性來自作用域創建者**：交出 `Scope.ctx` 也會交出創建插件注入的服務范圍，因此，若作用域創建者提供的服務范圍較寬，持有者之后也無法將其收窄。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
