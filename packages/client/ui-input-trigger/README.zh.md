---
description: "Web GUI 的輸入觸發流水線：光標處的 / 與 @ 檢測、分組候選菜單，以及把 pick 路由到已注冊 source；供斜杠命令與引用的用戶與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-input-trigger

[English](README.md) | 中文

## 概述

當用戶在 Web GUI 的光標處鍵入 `/` 或 `@` 時，本包會為斜杠命令、文件引用和會話引用打開分組菜單。它支持鍵盤和指針選擇，包括下鉆候選項，以及在當前選區上打開單個候選分組的 launcher。pick 會觸發命令流程或插入引用，具體結果由消費方輸入表面處理。本包只影響瀏覽器呈現；它既不組裝也不發送模型請求。

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

與 `ui-conversation` 一起掛載本插件；用戶在光標處鍵入觸發器時，菜單隨即出現在輸入浮層中。分組候選項渲染在標題行之下，或渲染在 source 附加在自己各行上的小節標題之下；pick 路由到 source，消費方表面應用其結果——斜杠命令打開其彈窗或執行，引用插入其行內 token。每一行顯示圖標、標題（候選項的 `label`，沒有 label 時顯示 `name`）、當標題不是 `name` 的另一種大小寫寫法時跟在標題后的 `name` 別名，以及右對齊的說明；查詢同時匹配 name 與 label。

### 鍵盤與鼠標

菜單打開期間 composer 表面保持焦點：行在 mousedown 時完成 pick，高亮由 `aria-activedescendant` 承載，指針落在菜單與所在 composer 卡片之外即關閉菜單。空格與回車裁決按注冊序輪詢可選的 `matchSpace`／`matchEnter` 鉤子；第一個非 undefined 的應答勝出，source 也可以拒絕它無法整體消費的提交。Tab 會作用于高亮補全項：聲明 `drill: true` 的候選項以 `action: 'drill'` 進入 `onPick`，普通候選項則以 `action: 'pick'` 完成選定；沒有高亮項時 Tab 原樣放行，原生焦點遍歷不受影響。可下鉆行尾的 chevron 向指針用戶提供同一個動詞。實現可選 `header` 鉤子的 source 還會在其分組上方發布面包屑：流水線在每次命中時用實時查詢、以及該查詢由下鉆還是由鍵入產生這一事實重新詢問它，點擊面包屑經 `onPick` 以 `action: 'drill'` 回到該 source。

來源可以實現 `openReference(session, reference)`，打開草稿引用而不提交。來源可以先接受預覽請求，再異步加載目錄。標簽按來源名稱路由；可編輯文本按來源當前的詞表路由。返回 `false`、來源缺失或控制器已釋放時，保留編輯器原有的手勢處理。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

`src/core/` 是純內核——觸發器檢測、菜單歸約與精確匹配，零 React／DOM／cordis——而 `src/client/service.ts` 把內核接到菜單快照存儲、逐 hit 候選拉取（以 generation 把關、被后繼請求通過 `AbortSignal` 取代、失敗的 source 靜默丟棄并留一條 console 記錄）與 pick 路徑上。每個會話 scope 各解析一個 `InputTriggerController`（`sessionOf`）；對話接線層在控制器上驅動 `track`／`arbitrate`／`onSpace`／`adjudicate`。source 會被預熱進它能觸達的每個會話控制器；`lexicon` 名錄在預熱后變化的 source 實現 `subscribeLexicon`，控制器每收到通知就重拉。`MenuView` 自注冊進 `conversation.input.overlay`（列表類，會話 scope），菜單關閉期間渲染 null。`listbox` 角色落在其滾動視口而非有界外殼上，因為面包屑頭部不是選項，listbox 也不得承載它；面包屑走菜單存儲之外的獨立快照存儲，凍結的歸約器因此對它一無所知。overlay 的 SlotMap 合并放在本包，因為依賴方向（ui-conversation → ui-input-trigger）不允許反向的類型導入。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當觸發流水線不夠用時閱讀以下頁面。它們從流水線延伸到注冊進其中的 source，以及擁有輸入的會話外殼。

- [ui-commands](../ui-commands/README.zh.md)——把 `/` 命令 source 注冊進本流水線并擁有命令彈窗外殼。
- [ui-reference](../ui-reference/README.zh.md)——注冊 `@` 文件與會話引用 source。
- [ui-conversation](../ui-conversation/README.zh.md)——聲明輸入浮層 slot 并擁有 composer 與輸入狀態機。
- [Web 客戶端架構](../../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.zh.md)——瀏覽器插件行如何加載并注冊 slot。

-----

<a id="model-experience"></a>
## 模型體驗

無。觸發流水線只是瀏覽器呈現——pick 產出命令聲明與引用插入，其模型可見后果由消費方宿主與輸入狀態機包負責。

#### KV Cache 影響

無；該包既不組裝也不發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制界定了當前觸發流水線。它們是當前包約束，不是通用菜單對比或任務積壓。

- **只有全局 source 層**——會話 scope 的 source 注冊（逐會話遮蔽）已有設計但未啟用；臺賬記錄著觸發條件，即真實的逐會話 source 需求。
- **overlay 的 SlotMap 合并歸屬與 slot 所有權分離**：唯一的 `conversation.input.overlay` 合并放在本包，而 ui-conversation 擁有其錨點、children 聲明與生命周期，因為依賴方向是 ui-conversation → ui-input-trigger。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。觸發流水線是瀏覽器側純內核（檢測／歸約／匹配）加一個注冊表，其資源釋放已由 HMR（熱模塊替換）安全性測試證明；它不發出 Cordis 事件，也不持有跨插件可變狀態。
