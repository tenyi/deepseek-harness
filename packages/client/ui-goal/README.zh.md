---
description: "Web GUI 的 goal 界面：顯示當前目標并支持編輯、暫停、恢復或清除的 composer 上下文條帶；供 goal 體驗的用戶與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-goal

[English](README.md) | 中文

## 概述

Web GUI 的 goal 界面同時顯示持久 goal 狀態及當前的進程本地激活狀態，供用戶編輯、暫停、恢復或清除 goal；被拒絕的變更所產生的錯誤會內聯顯示。它把持久的 `/goal` 運行顯示為 `Command input` 氣泡，讓用戶或模型發出的命令在重新加載后仍然可見。goal 創建仍不歸本包。除 `minimal` 外，隨附的 Web preset 都會向 agent（智能體）提供 `/goal`。

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

與 `ui-conversation` 及 goal 領域包一起掛載本插件；只要會話存在目標，條帶就會作為 composer 上下文堆棧的第二張卡片出現（位于 Todo 之后、Queue 之前）。已 armed 的 active goal 提供暫停動作；active-but-disarmed 或 paused 的 goal 提供恢復；編輯重寫目標文本；清除移除目標，并在投影追上之前抑制條帶。

### 指令輸入氣泡

每條持久的 `/goal` 運行都投影為一個右對齊的用戶樣式氣泡，標簽為 `Command input`（或 `指令輸入`），渲染在通用命令結果行之前；開頭的 `/goal` token 經 ui-primitives 的 `projectUserText` 以等寬代碼字體渲染為指令引用 chip，目標文本保持正文字體。它不含時間戳、復制或分支操作，重新加載時會依據運行記錄重建。

### 失敗

被拒絕的變更會把 Remote 錯誤內聯呈現到條帶上；加載中、無目標、已完成與成功清除的目標一律不渲染。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

持久 goal 經 `useProjection('goal')` 到達（由歷史尾頁播種、`session/projection` 幀更新）。注入面攜帶注冊方私有的激活鉤子源與四個變更動詞。該源僅在框架鉤子觀察它時啟動；啟動后會讀取 `ctx.remote.goals.get`、訂閱 `goal/activation-changed`，并在 running 狀態或連接重置時刷新。實時事件 epoch 會讓在途讀取失效，因此較舊的 HTTP 響應不能覆蓋較新的 activation 變化；running 刷新會保留最后一次已知 activation，直到讀取完成。條帶不持有領域存儲或跨插件緩存。每個變更在調用時從會話當前投影值讀取 CAS ref，比較并交換（RPC 的 CAS）就是陳舊性護欄。由于 React 的 pending 渲染無法攔住同一幀內的點擊，條帶會同步為變更建立 single-flight 防護。指令輸入投影是獨立的 Conversation Definition，在通用命令結果 Node 之前構建 `command-input` Chat Node；它絕不創建 `user/message` 或模型輪次。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當 goal 界面不夠用時閱讀以下頁面。它們從瀏覽器條帶進入 goal 領域與它所填充的 slot。

- [dsh-goal](../../goal/goal/README.zh.md)——本界面讀取并變更的 goal 領域、投影與 `/goal` 命令。
- [ui-conversation](../ui-conversation/README.zh.md)——聲明 `conversation.input.dock` slot 并擁有 composer。
- [客戶端包映射](../README.zh.md)——相鄰的瀏覽器 UI 包。

-----

<a id="model-experience"></a>
## 模型體驗

間接影響：條帶路由 `goals/edit`、`goals/pause`、`goals/resume` 與 `goals/clear` 變更；宿主 GoalService 擁有這些變更排隊的模型可見 goal 上下文消息。

#### KV Cache 影響

除非已排隊的 goal 上下文獲準，否則沒有影響。獲準的上下文會像其他消息一樣擴展歷史尾部；準入前被丟棄的插入項不會影響緩存。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制界定了當前 goal 界面。它們是當前包約束，不是 goal 領域對比或任務積壓。

- **Host 狀態與 preset 無關**——把活躍會話切換到 `minimal` 后，Host 擁有的 goal 仍會保留。`/goal` 與 goal 工具會消失，但該條帶仍可編輯、暫停、恢復或清除 goal。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。插件只注冊一個 GoalBar dock，其釋放已由 HMR（熱模塊替換）安全性用例證明；持久狀態來自 goal projection，進程本地 activation 來自入口私有鉤子源，且該源只在框架鉤子觀察期間訂閱。
