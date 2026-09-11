---
description: "Cordis 動態插件瀏覽器面說明，供選擇、組合或排查面板、工具卡片與 @pluginId 輸入的用戶與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-cordis

[English](README.md) | 中文

## 概述

`dsh-client-ui-cordis` 為 web 客戶端中的動態 Cordis 包提供框架級控制面板、會話工具卡片與 `@pluginId` 補全。人可以從任意會話批準或拒絕阻塞模型的請求、運行、停止或移除定義，并查看其實時狀態。會話卡片會回放已記錄的調用與結果。本包不增加模型可見內容或會話事件；頁面刷新后，定義必須重新運行。

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

在同時掛載了瀏覽器 runner 與 host runner 的 web 客戶端中組合本包，它會加上面板、工具卡片與 `@` 補全。人便擁有執行完整生命周期所需的一切：批準或拒絕模型的 run 請求、運行、停止或移除任意定義，并在同一行上看到包的實時狀態變化。

### 面板顯示什么

一個 `sidebar.footer.action` 席位顯示角標，計數在跑數加待確認數；點開后列出每個定義及其運行控件。列表從不按會話過濾：當前會話的行置頂成組，其他會話的行仍在下方列出。行來自 host 的當前清單，并在公告改變「有哪些定義」時更新。上一次讀取覆蓋不到的待審批 run 請求仍然有行，直接用請求自帶的會話、標簽、用途與標識渲染。每一行顯示兩個獨立事實——host 在跑什么與本頁裝載了什么——因此刷新后的頁面會先給「裝回本頁」、再給全局 stop，而純 host 定義的行如實讀作運行中、只給 stop。該行還會把本頁最后一次渲染失敗就地顯示，與裝載失敗共用同一個位置：一個是「它從來沒裝上」，另一個是「它裝上了、然后拋了」。

### 工具卡片顯示什么

`cordis_define` 卡片是一份記錄：模型寫下的 name 與 purpose、它寫的源碼，以及該定義是否在跑——沒有開關、沒有審批，只有一句指向面板的指引。`cordis_run` 卡片顯示模式、插件標識、包標識與運行標識、結果，并在包注冊了業務視圖時經 `tool.view.cordis` slot 提供它。`cordis_stop` 與 `cordis_undefine` 渲染緊湊的動作行。所有卡片都渲染會話記錄下的 call 與 result，因此回放顯示同一張卡。

### @pluginId 輸入源

在輸入框里鍵入 `@` 會給出當前會話已定義的插件；選中一個會輸出 `@pluginId`，工具包把它變成一條釘住的引用上下文給模型。

### 需要規劃的邊界

定義僅存在于進程內：刷新后的頁面手上什么都沒有，直到有人再次運行某個包；面板在每次公告時重讀清單。審批按設計是框架級的，所以某個標簽頁里的人可以批準模型為另一個標簽頁正在看的會話所發起的 run；首個應答生效，其余收斂。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋這些界面背后的設計；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

這些界面建立在一個規則之上：兩者都不把運行態放進組件 state，因為 define 調用結算時卡片會在聊天流里換位置并重掛。事實活在「誰能關閉它、就歸誰」的觀察量里——瀏覽器 runner 擁有開放請求、編排結果、本頁的 live set 及其渲染失敗，而本包擁有自己讀來的清單與折疊過的公告。面板做成全局，是因為 run 請求會阻塞模型、且可能點名一個當前沒人在看的會話里的定義；審批入口若只存在于那個會話的對話流里，就會在它正阻塞模型的時候恰好不可達。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | 插件入口：slot 注冊、清單接線、`@pluginId` 輸入源 |
| [`src/client/CordisPanel.tsx`](src/client/CordisPanel.tsx) | 全局面板及其運行控件 |
| [`src/client/CordisDefineRow.tsx`](src/client/CordisDefineRow.tsx) | 只讀的 `cordis_define` 卡片 |
| [`src/client/CordisRunRow.tsx`](src/client/CordisRunRow.tsx) | `cordis_run` 卡片及其業務視圖席位 |
| [`src/client/CordisActionRow.tsx`](src/client/CordisActionRow.tsx) | `cordis_stop`／`cordis_undefine` 行 |
| [`src/client/card-model.ts`](src/client/card-model.ts) | 從凍結 call/result 切片派生的可回放視圖模型 |
| [`src/client/inventory.ts`](src/client/inventory.ts) | 單飛清單讀取及其重連處理 |
| [`src/client/status.ts`](src/client/status.ts) | 基于清單與本頁 live set 的可見狀態讀數 |
| [`src/client/slots.ts`](src/client/slots.ts) | 注入面與包自有的 `tool.view.cordis` slot 聲明 |
| [`src/client/run-card-index.ts`](src/client/run-card-index.ts) | 每會話「最新合格 `cordis_run` 卡片」索引 |

### 面板如何保持最新

公告（`cordis/dynamic-package`、`cordis/dynamic-retract`、`cordis/request-run`、`cordis/request-run-resolved`）觸發清單重讀，而不是就地打補丁——因為公告不攜帶標簽，而定義可能在兩次公告之間出現或消失。讀取是單飛的，因此多條公告同時結算不會放大調用次數；連接重置既丟棄在途讀取、又為新讀取騰出位置，所以重連絕不會發布舊 host 的行。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從這些界面逐步進入它們所操作的面，以及其調用被渲染成卡片的工具。

- [Client runner](../cordis-client-runner/README.zh.md)——面板讀取并調用的瀏覽器面。
- [Host runner](../cordis-host-runner/README.zh.md)——面板背后的清單與生命周期動詞。
- [工具包](../tool-cordis/README.zh.md)——調用被這些卡片渲染的模型側工具。
- [extensions 子系統](../../../docs/subsystems/extensions.zh.md)——生成的 `ctx.dynamicCordisRunner` API 與轉發的 `cordis/*` 事件。
- [slots 子系統](../../../docs/subsystems/slots.zh.md)——slot 注冊的瀏覽器 UI 如何歸其包所有。

-----

<a id="model-experience"></a>
## 模型體驗

間接影響，經由這些界面驅動的 run 與 stop 動詞——run 走瀏覽器側 runner 的編排，stop 與 remove 走 host 的動詞，與模型的 `cordis_run` / `cordis_stop` 工具是同一批 host 動詞。因此正在運行的定義隨后貢獻的任何內容，都是 runner 的效果，而本包不產生任何模型可見輸入：它只渲染已落日志的 call 與 result 切片和一次 host 清單讀取，不加提示詞內容、不寫會話事件，并刻意不為「有人批準、拒絕、運行或停止」留下會話日志痕跡。

#### KV Cache 影響

無：沒有任何提示詞輸入源自這里，應答一次 run 請求既不延長也不改寫歷史尾部。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明這些界面何時需要特別小心。它們是當前包約束，不是任務積壓。

- **已展開的面板看不到「不廣播任何東西」的注冊表變化**——`cordis_define`，以及對一個并未在運行的定義執行 undefine，都會改變注冊表卻不發出下發公告；因此跨過這類變化時，已展開的面板會保留舊行，直到收起再展開。run 請求是例外：它阻塞模型，所以它既自己渲染出行，也觸發一次讀取。
- **只有請求、沒有清單的行可應答但不可操作**——它只提供批準與拒絕，因為 run／stop 控件需要那次讀取尚未送達的注冊表行。
- **行可能消失一次讀取的時長**——活動的 orchestrating 臂帶會話但刻意不帶標簽，因此一個已批準、但注冊表讀取尚未落地的請求，在讀取落地前沒有行；實踐中讀取在請求到達時即已觸發。
- **渲染失敗是本頁自己的讀數，而且它來得太晚、趕不上 run 的回執**——面板顯示的是 runner 在本頁看到的最后一次崩潰，所以一個在本標簽頁渲染正常的包，即使正在另一個標簽頁里崩潰，這里也什么都不顯示；模型只能靠主動去問（`cordis_inspect_self`）才知道，而不是從它已經發出的那次調用里得知。
- **某一頁的裝載失敗對其他頁不可見**——host 以首個裝載回報結算一次 dispatch，因此在另一頁確認之后瀏覽器半才失敗的頁面，在其他頁上仍會讀作運行中。
- **任何頁面都可以應答任何請求**——審批按設計是框架級的，所以某個標簽頁里的人可以批準模型為另一個標簽頁正在看的會話所發起的 run；收窄「誰有權應答」延后。
- **call head 掉出事件窗的卡片會丟掉標簽**——define 卡片的 name 與 purpose 取自調用參數，因此會話長到把它們截斷時，卡片只能以自己的 call id 自稱；面板不受影響，因為 host 清單攜帶標簽。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。插件只注冊一個 keyed toolview，其資源釋放已由 HMR 安全性測試證明。本包擁有的唯一可變關系，即 per-definition run-state 觀察量，只存在于瀏覽器進程中，Host 不變式服務無法觸及；Node 端不發出任何 Cordis 事件，也不持有任何跨插件狀態。
