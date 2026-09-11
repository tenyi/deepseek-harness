---
description: "動態 Cordis 包的瀏覽器半說明，供選擇、組合或排查頁面如何應答運行請求并裝載瀏覽器半代碼的用戶與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-cordis-client-runner

[English](README.md) | 中文

## 概述

`dsh-cordis-client-runner` 讓頁面運行動態 Cordis 包的瀏覽器半：它應答 host 的運行請求、把瀏覽器半源碼裝載進頁面成為活插件，并在 host 撤回該次運行時把它移除。人可以批準或拒絕一次運行——也可以直接啟動一次——而本包回報的結果變成模型讀到的 `cordis_run` 工具結果。激活時什么都不裝載，刷新后也不恢復；一頁只在有人應答運行請求或在此主動要求時，才運行動態包。

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

在組合里同時掛載了 host runner 的 web 客戶端中掛載本插件——host 半跑在進程里，瀏覽器半跑在頁面里。當某個帶瀏覽器半的動態包被運行時，打開的頁面會收到一次運行請求；本包在本頁執行裝載，UI 包（`ui-cordis`）則渲染人用來應答它的面板與卡片。純 host 包不需要瀏覽器半，也就不需要頁面：host 自己運行它們。

### 頁面會做什么

瀏覽器半用純 JavaScript 編寫——無 JSX、無 TypeScript、不能 import 模塊——并作為一個 async 函數運行。它拿到一組固定的名字——`React`、`console`、`styles` 與 `host`——而 `fetch`、`setTimeout` 這類瀏覽器全局不可用。返回的插件只能使用生命周期動詞，以及它自己在 `inject` 里聲明的服務。從已裝載半調用 `host.call(method, args)` 會到達它自己的 host 半。React 渲染已裝載半時發生的崩潰會上報 host，點名槽位、崩潰是否已把條目摘掉，以及寫給作者的 message。

### 運行界面提供什么

運行界面可以應答一次待審批的 host 請求——批準它（可選地同時覆蓋同一插件的未來版本）或拒絕它——也可以按用戶自己的手勢啟動一個定義，該手勢本身就是授權。每個定義最多有一個在途活動，因此基于該狀態構建的控件能在 remount 后存活。界面就本頁顯示的內容都是頁面本地的：每包最后一次渲染崩潰、本頁自己的嘗試為何失敗，以及某個包是否已在本頁裝載——絕不是 host 眼中「在跑」的視圖。

### 生命周期邊界

裝載是冪等的：要求裝載這一頁已在運行的 revision 不會改變任何東西，更新的 revision 頂替已裝載的那個，同一 revision 在 retract 之后再裝則重新裝載。同一定義的操作串行執行。刷新按設計從干凈狀態開始——host 仍持有定義，本頁在再次被要求之前不運行它。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋瀏覽器半背后的設計；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

瀏覽器半建立在一個原則之上：動態包必須與靜態包共享同一套激活門控、fiber effect 清理與狀態投影。求值后的插件被塞進模塊表，并經 `loader.create` 掛載；卸載 = 移除 entry + 失效 factory + 撤下樣式。guard 是一份白名單——生命周期動詞加已聲明服務——與 host 側沙箱門面對稱，因此包作者在兩側面對同一個約定。一個觀察者供兩個出口：只有這里監視槽位注冊表的 entry-error seam，凡屬于本 runner 落座過的包的崩潰，一路上行給 host（給模型），一路發布到本包自己的 `renderFailures`（給面板）。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | 插件入口：runner、編排器、inspect 注冊表、轉發事件訂閱 |
| [`src/client/runtime.ts`](src/client/runtime.ts) | 裝載引擎：按運行標識收斂、guard 掛載、撤回 |
| [`src/client/orchestrator.ts`](src/client/orchestrator.ts) | 運行編排：先 host 半、再取源碼、再瀏覽器半、一次結算 |
| [`src/client/evaluator.ts`](src/client/evaluator.ts) | 閉包求值：符號面及其教學陷阱 |
| [`src/client/guard.ts`](src/client/guard.ts) | 已裝載瀏覽器半收到的白名單 `ctx` façade |
| [`src/client/inspect-registry.ts`](src/client/inspect-registry.ts) | Client Inspect Provider 與待答查詢路由器 |
| [`src/client/providers.ts`](src/client/providers.ts) | 第一方 client Inspect Provider（slots、theme、events） |
| [`src/client/timer.ts`](src/client/timer.ts) | 動態包注入的 client 定時器服務 |

### 一次 run 如何執行

一條 `cordis/request-run` 事件問這一頁要不要運行某個定義。作答的一方——審批后的頁面，或按下運行的用戶——驅動編排：先 host 半（host 半失敗會在瀏覽器動作之前短路），再取源碼，再瀏覽器半，最后一次結算帶上發生的一切。瀏覽器半源碼作為 async 函數體求值，符號面就是參數；返回的插件經 guard 包裝后通過 loader 掛載；結算報告已裝載的 revision，或失敗階段加閉包、guard 或 fiber 的消息。`host.call` 經 Remote namespace 路由；省略的入參以 `null` 過線，而生成 codec 拒收的載荷會變成一條點名「哪次調用 + 約定是什么」的教學錯誤。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從瀏覽器半逐步進入發問的 host、其運行被應答的工具，以及渲染它的界面。

- [Host runner](../cordis-host-runner/README.zh.md)——本包應答的注冊表與運行往返。
- [工具包](../tool-cordis/README.zh.md)——運行請求到達本頁的模型側工具。
- [UI 包](../ui-cordis/README.zh.md)——操作這個面的面板與卡片。
- [extensions 子系統](../../../docs/subsystems/extensions.zh.md)——生成的 `ctx.dynamicCordisRunner` API 與 `cordis/*` 事件。
- [客戶端外殼與動態包 Agent Note](../../../.agents/notes/implemented/architecture/2026-08-15-client-shells-and-dynamic-packages.zh.md)——瀏覽器半的包歸屬與構建面。

-----

<a id="model-experience"></a>
## 模型體驗

### 由模型發起那次 run 的最終回答

#### 模型看到的內容

本包自己不貢獻任何工具、提示詞或上下文；它撰寫并到達模型的第一樣內容，是為一次 `cordis/request-run` 往返發回的回答——host 把它變成那個被阻塞的 `cordis_run` 的結果。成功時帶上已裝載的 revision，以及（當瀏覽器半掛在這一頁沒有的服務上時）那些服務的名字。失敗時帶一個 reason：用戶拒絕的 `rejected`、`host-half-failed` 或 `client-half-failed`；后者還帶上本包自己的文本——出錯階段（`evaluate`、`module-import` 或 `activate`）加上閉包、guard 或 fiber 的消息。guard 的教學錯誤（未聲明的服務、被遮蔽的瀏覽器全局、返回值里沒有 `apply`）正是經這個字段到達模型的。而裝載之后、React 渲染時才發生的崩潰，走下面那條獨立的事后通道。

#### Token 影響

有條件且有界：每次 run 請求最多一個回答，花在 host 本來就會發出的那個 `cordis_run` 結果里。文本隨數據而定（某個定義自己的錯誤消息），本包跨請求不留存任何東西——一頁后續的裝載失敗是頁面本地診斷，在模型側沒有任何承載物。

#### KV Cache 影響

只追加。回答只作為「本來就在途的那次請求」的工具結果到達模型、延長歷史尾部；本包撰寫的內容不會重寫或重排更早的請求 token，因此原本可復用的前綴仍然可復用。同一定義的多次運行各自產出各自的結果，而不是替換更早那一個。

### run 落定之后的渲染期失敗

#### 模型看到的內容

一個裝載得干干凈凈的瀏覽器半，仍可能在 React 渲染時崩潰，而那次崩潰發生在 run 已經被回答之后——否則模型只會被告知「ok」，永遠學不到。凡是本頁落座過的包，其 entry 邊界的每一次崩潰都會發回 host（`reportRenderFailure`）：點名槽位、說明這次崩潰是否已把 entry 從格位上摘掉（`abdicated`：包的 UI 是沒了、而不只是壞了），以及一條寫給作者的 message。host 每包只留最后一條，用它 steer 所屬會話，并經由 `cordis_inspect_self` 暴露；這條通道上的任何東西都不會進入 run 的最終回答。

#### Token 影響

有條件，且其上界由 host 的留存策略決定、不由這一頁決定：每次崩潰一條報告，而 host 每包只留最新一條——所以一個反復崩潰的 entry 對模型的代價是一條消息，而不是一張越來越長的清單。報告本身不會自帶任何工具結果：模型只在被 steer 或主動去問的時候才為它付費。

#### KV Cache 影響

自身沒有。報告經 RPC 送出并被存起來，而不是追加進對話；模型通過一條 steer 消息或自己發起的查看讀到它們，那次查看與任何工具結果一樣只延長尾部。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明瀏覽器半何時需要特別小心。它們是當前包約束，不是任務積壓。

- **被拒絕的回答不會重試**——`resolveRequestRun` 的 ack 不讀，所以當 host 拒絕一個陳舊的成功答復（`accepted: false`——這一頁裝載期間定義的 revision 被頂掉了），這一頁會保留已裝的東西、也不再重新編排。那次請求仍可作答（別的頁面作答或調用方取消都能收尾），而頂掉 revision 的那次 stop 會 retract 掉陳舊裝載。
- **host namespace 存在之前插件一直掛起**——它聲明 `remote.dynamicCordisRunner`，因此絕不會裝載一個永遠夠不到自己 host 半的瀏覽器半。
- **槽位準入沒有載體**——下發行聲明的是服務，不是目標槽位，因此按部署的槽位允許／拒絕清單無處可馱。
- **guard 白名單是手抄的孿生**——瀏覽器 guard 復刻 host 側沙箱門面；抽取共享規格留待后續。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。所屬關系（一個 live Plugin 的 loader entry 僅在一個 Plugin Run ID 存活期間存在）是只能通過 Client 半服務訪問的瀏覽器側狀態，Node 平面的伴生入口無法觀察。該關系改由本包自己的裝載與拆除測試直接斷言。
