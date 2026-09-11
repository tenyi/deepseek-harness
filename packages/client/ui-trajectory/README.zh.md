---
description: "dsh Web 客戶端的 Trajectory 視圖：按輪次組織的事件記錄表加交互式時間概覽，注冊進對話視圖環。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-trajectory

[English](README.md) | 中文

## 概述

Trajectory 標簽頁讓你以按輪次組織的事件記錄表和交互式時間概覽檢查 agent（智能體）活動。它對用戶、助手、工具、嵌套子工具和壓縮（compaction）記錄分組，標示輪次與步驟邊界，并為所選記錄打開檢查器，顯示 token 用量、耗時、輸入、輸出、計時、圖片和附件摘要。較長歷史打開時定位于當前尾部，按需加載更早頁面，并且只渲染可見行。流式輸出期間，視圖會跟隨尾部，直到你向上滾動；進行中的記錄只顯示開始標記，不會虛構耗時。

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

在對話視圖環中打開 Trajectory 標簽頁，把 agent 活動作為事件記錄表與時間線查看。初始尾部完成定位前，記錄表會用明確的加載行遮住真實記錄；更早的前綴仍未加載時，首行控件會在點擊時加載一頁更早的歷史，并在該頁加載期間顯示禁用的加載狀態。

### 檢查記錄

選擇、時間線導航、折疊與搜索只覆蓋 React 可見窗口。請求編號與累計用量覆蓋完整的駐留快照。選擇記錄會打開局部檢查器，查看 token 用量、耗時、輸入、輸出、計時與持久保留的圖片。圖片 URL 使用 Conversation 擁有的逐會話緩存，因此 Chat 與 Trajectory 對每個附件共享一次已授權讀取。用戶記錄會在文本旁顯示通用文件數量；記錄沒有文本時，則顯示圖片與文件數量。獨立運行的壓縮請求會按時間順序顯示在自己的 `Between turns` 區段中，而帶編號的壓縮仍位于其所屬輪次內。

### 時間概覽

固定在記錄表上方的 Overview 區域從左到右投影記錄的真實開始時間與耗時；助手時間條區分記錄到的 TTFT 與解碼時間，懸停 500 ms 后可查看精確時刻與耗時詳情。拖選區間會把記錄表聚焦到該閉區間內任何時刻處于活動的記錄；滾輪手勢用于縮放時間域；右鍵單擊會清除所選區間，在已放大的視口上按住右鍵拖動則會平移。初始視圖與流式更新都停留在尾部；向上滾動會暫停跟隨，因此新記錄不會打斷對舊記錄的檢查。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

視圖是純投影：Trajectory 自有的定義從共享會話窗口組裝業務記錄——包括因取消而定稿并持久保留的前綴、僅有分片時采用的中斷回退記錄，以及被中斷的工具記錄——因此 Trajectory 既不讀取也不改變 Chat 會話快照。其 steering（中途引導）分類器通過持續保留的拼接狀態只保留下一步的 Inbox ID，并讓后續上下文共享當前已認領的每個批次。

完整的追加提示詞在請求頭未加載時顯示為獨立系統行；僅提供已知文本，不推斷請求選項或工具目錄。補入其請求歷史后，該獨立展示被替代而不重復提示詞。歷史中的系統提示詞變更與最近的請求狀態比較，包括沒有新請求頭的先前提示詞更新。每個請求保留其所在位置生效的提示詞與變更。包括壓縮在內的 surface 替換會恢復最后一個非空的存活系統提示詞，即使沒有新的系統事件；未加載的提示詞在對應分頁到達前仍不可用。

### 虛擬行

長記錄表最初只從掛載時尾部結束的 50 個 target Node 派生 React 數據。后續 Node 會擴展這個固定起點的窗口而不會逐出其前綴；現有加載控件會先顯露更早的駐留 Node，再請求下一個會話頁面。虛擬化只掛載可見行窗口加少量緩沖；僅含請求的分隔行并入下一個具備可測高度的虛擬項，語義行鍵與 ARIA 索引在向前補頁后保持不變。虛擬化器負責結構性追加后的底部跟隨；非虛擬記錄表會直接寫入末尾位置。僅含內容更新的流式幀會保持虛擬行的鍵與高度、復用測量結果，并且不會重復寫入末尾滾動位置。已完成的回復會在 Trajectory target State 中保留組裝后的塊、計時與用量，共享會話窗口則保留原始事件。

### 布局

Trajectory 要求會話殼把 composer 作為浮層置于全高記錄表上方；其響應式縱向滾動容器會預留 composer 的實時高度，確保仍可滾動到最后幾行。可滾動的 Summary 區域在懸停或聚焦前保持滾動條滑塊透明，同時不改變預留的滾動幾何空間。本包不提供服務，也不聲明上下文合并。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

以下頁面覆蓋對話宿主與本視圖所投影的會話數據。

- [ui-conversation](../ui-conversation/README.zh.md)——承載 `conversation.view` 環的聊天界面。
- [session-projection](../../session/session-projection/README.zh.md)——為面向客戶端的會話狀態讀取模型提供服務的投影注冊表。
- [session](../../core/session/README.zh.md)——其窗口持有原始事件的會話 seam。
- [compaction](../../compaction/compaction/README.zh.md)——其請求出現在記錄表中的壓縮 seam。

-----

<a id="model-experience"></a>
## 模型體驗

無。該包是瀏覽器端 UI 插件層，不注冊任何面向模型的內容。

#### KV Cache 影響

無；該包既不組裝也不發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制定義工作仍在進行時視圖能顯示什么；它們是當前包約束。

- **進行中時 Time 保持空白**：`partial` 與 `runningCalls` 行會顯示運行狀態，但不會虛構耗時，因此 Overview 區域只渲染開始標記，而不會杜撰實時跨度。記錄選擇與時間線選擇位于 Trajectory 內部，不提供錨點深鏈接。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。這是純消費插件，不發出 Cordis 事件，也不持有跨插件可變狀態；其 view-slot 注冊是普通 effect，slot ledger 自身的規格測試與本包的行為規格測試會直接觀察其釋放。
