---
description: "dsh Web 客戶端的 slot 注冊表純核心：SlotMap 聲明合并、單一 register 組合 API、四 share props 類型、store 席位與渲染器安裝約定。"
kind: "package-library"
---

# @deepseek-ai/dsh-client-ui-slots

[English](README.md) | 中文

## 概述

`dsh-client-ui-slots` 讓 Web 客戶端插件定義并組合帶類型檢查的 UI 區域。調用方可以通過一個在編譯期檢查的 API 添加組件、聲明嵌套區域、附加作用域狀態并提供業務 props。它支持單項、有序列表、鍵控和自行選擇的 chain 組合，并會在插件加載期間報告沖突組合。需要與框架無關的 slot 組合時選擇本包；客戶端需要 React 渲染時與 `ui-renderer` 配合使用。

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

編寫客戶端插件時都通過本包組合 UI：把組件注冊進父級已聲明的 slot，或聲明組件將要渲染的子 slot。四種 kind 覆蓋組合形態——`single`（單個占位者）、`list`（有序條目）、`keyed`（按鍵分派）與 `chain`（條目自行提名）。

### 四個 props share

每個已注冊組件都會收到由四個 share 組合而成的 props：運行時 share（父級 renderSlot 調用點的 `owner`，加上會話標準工具包與全局席位）、child render share（靜態縮窄到已聲明 children key 的 `renderSlot`）、store share（已聲明句柄的 selector 鉤子與移除 draft 的 actions），以及業務 share（從 `inject` factory 返回值推斷）。組件引用 `ComposedProps`；它們絕不在本地重新定義任何 share 的類型。

### Store 席位

register 調用可以用 `store: defineStore(...)` 聲明 store 席位：`init` 推斷狀態 schema，`actions` 是完整的 draft-transform 寫入集合。組件經 selector 鉤子讀取、經烘焙回調寫入；`defineStore` 的引擎實現位于運行時包，并滿足這里導出的 `DefineStore` 約定。

### 聲明紀律

聲明即認領：注冊條目成為唯一被允許渲染該鍵的條目；注冊未聲明 slot、聲明已聲明過的子項、在兩個 scope 下掛載同一個共享句柄、或注冊缺少 `select` 的 chain，都會在加載時拋出。條目的 disposer 會遞歸移除其聲明的子 slot——賬本行、貢獻與 store 掛載都隨同一生命周期結束而移除。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

設計就是一張表：聲明 = 渲染授權 = 運行時規范。`SlotMap` 在這里聲明為空，由消費方通過 `declare module` 增補合并，標準工具包接口（`SessionStandardProps`、`GlobalStandardProps`）也是如此，由運行時包以真實成員合并。

### 注冊與路由

`SlotCore` 在構造時預置 `'root'` slot，并強制執行加載時驗證。`ChainSelect` selector 按升序 `priority` 運行（相同值按注冊順序）；第一個非 null 返回值選中其條目，并成為組件的 `matched` prop；全部返回 null 時使用 owner 的 `renderSlotChain` fallback（`ChainRenderOpts`）。每個 key 都攜帶一個 declaration epoch，它只在聲明與移除時遞增；`ui-renderer` 將其用于 `ctx.slots.inject`，且與普通條目版本相互獨立。

### 渲染器約定

`renderer.ts` 攜帶安裝約定（`SlotRenderer`、`SlotRendererHost`）以及 `StaleAuthorizationError`/`SlotOwnershipError`；ui-renderer 負責實現，并在其插件生命周期中完成安裝。引擎產物與渲染器宿主約定攜帶裸快照 source（`getSnapshot`/`subscribe`），絕不攜帶 React 鉤子——鉤子綁定屬于渲染機制。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

以下頁面覆蓋引擎、渲染器與組合模型。

- [ui-renderer](../ui-renderer/README.zh.md)——實現本包安裝約定的 React slot 渲染器。
- [slot 系統標準](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.zh.md)——權威組合模型。
- [Web 客戶端架構](../../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.zh.md)——本注冊表接入的加載鏈與對象層。

-----

<a id="model-experience"></a>
## 模型體驗

無。該包是瀏覽器端 UI 接線層，不注冊任何面向模型的內容。

#### KV Cache 影響

無；該包既不組裝也不發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制定義注冊表的規模擴展特性與已接受的類型噪聲；它們是當前包約束。

- **`isLive` 會線性掃描所有記錄**：在 UI 插件的注冊規模（數十項）下沒有問題；如果賬本變得頻繁訪問，再使用條目→記錄反向引用改進。
- **`__renders` 幻象錨點在 `PropsRenderSlots` 上可見**：這是與類型鏈設計的 `__accepts` 相同且已接受的噪聲；泛型方法簽名在 key 聯合之間比較寬松，因此必須依靠逆變標記強制執行「組件 key 集合 ⊆ children 聲明」。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。這是零依賴的純注冊表核心，本身不發出 Cordis 事件；`ui-renderer` SlotRegistry 負責事件橋及其不變式。本包的行為規范直接斷言 define/register/dispose 的執行順序。
