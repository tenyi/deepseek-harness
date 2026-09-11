---
description: "dsh Web 客戶端的共享 Workspace 瀏覽器與選擇器插件：分組或扁平的會話行、添加、重命名、重排序、搜索、fork、歸檔，以及目錄流選取子 slot。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-workspace

[English](README.md) | 中文

## 概述

本包讓用戶瀏覽分組或扁平的 Session 列表、為新 Session 選擇 Workspace，并通過添加、重命名、重排序、搜索、fork、歸檔和刪除 Workspace 來管理 Workspace 與 Session。待處理交互顯示為警告點，活動定時任務顯示為鬧鐘標識，subagent 來源的 Session 則保持隱藏。規范化后仍有差異的文件夾路徑會保留為獨立 Workspace。添加 Workspace 需要組合目錄選擇器；沒有目錄選擇器時，添加操作不可用。

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

用側邊欄瀏覽 Workspace 及其 Session、重排它們并新建會話；在 Session Intent 主視覺區用選擇器為新會話選擇 Workspace。打開的 Workspace 默認顯示五條非空白 Session，并在首條提示詞落地前把當前選中的空白**新會話**作為一條臨時額外行。**展開其余**會顯示隱藏條目；關閉再打開 Workspace 會恢復該折疊投影。

### 重排序與視圖選項

視圖選項把分組方式和每個記賬各自的一份瀏覽器持久化 Session 順序放在一起：**手動排序**和**最近更新**在兩種呈現方式下都可用。進入最近更新時會執行一次完整的時間排序，后續用戶提示詞或 steering（中途引導）會將對應 Session 置頂一次；進入手動排序則保留所有當前位置并停用后續置頂。兩種模式下的拖拽都會編輯當前順序；真實 Workspace 在手動模式下的拖拽還會更新 Host Session 記賬，而 Ungrouped 和單列表的順序始終只保存在瀏覽器本地。折疊分組的拖拽邊界按渲染行確定，并把來源行放在中間隱藏行之前，因此拖拽不會隱藏來源行。無論采用哪種 Session 順序，Workspace 拖拽順序都由 Host 持久化。

### 搜索

折疊搜索是視圖和添加操作旁的一枚區頭按鈕：激活后輸入框會擴展并占據區頭。非空白查詢會以單一扁平結果列表替代任一瀏覽模式——不區分大小寫的標題和 Workspace 子串匹配項會立即顯示，經 250 ms 防抖的 Host 請求則會加入經過排序的當前對話內容匹配項及其摘要片段。每次新查詢都會中止前一個請求；內容搜索失敗時，元數據匹配項仍會顯示，同時給出警告。列表最多顯示 20 條結果。選擇結果會清空并收起搜索、打開 Session，并在當前瀏覽模式中將其行滾動到可見區域；分組瀏覽還會按需展開所屬 Workspace 和完整 Session 列表。

### 管理會話

Session 行內的 Rename 操作打開一個以該行顯示標題預填的對話框；確認未修改的標題是有意允許的——這正是把當前自動標題釘住、不再被重新生成覆蓋的手勢。Archive 不經確認對話框直接提交，歸檔集合回聲落地后，該行從所有分組視圖中消失。Fork 在源會話最后一個已完成輪次處 fork，在客戶端遞增繼承的持久化標題后再打開子會話。Workspace 行內的 Delete 操作會打開確認框，說明保留邊界；成功后該分組被移除，其 Session 則留在 Ungrouped 下。

### 待處理交互

Session 行渲染運行時的實時 `pendingInteraction` 分類：審批顯示**等待審批**，計劃審閱顯示**計劃待審**，普通問題顯示**等待回答**。每個待處理交互都使用一枚琥珀色警告點，優先級高于運行指示器。

### 活動 Schedule 標識

分組與平鋪 Session 行以及搜索結果會在 `SessionSummary.projectionValues.schedule` 為非空數組時顯示一枚輪廓鬧鐘。標識位于標題之后；普通行的更新時間仍位于標識之后，搜索結果則沒有更新時間。它不是按鈕，沒有獨立 pointer 行為或 Tab stop，點擊所在區域仍會打開整行。本地化 tooltip 與文本相同的讀屏標簽均為**有活動定時任務**。

對于 cold Session，該值有意采用盡力而為語義。身份匹配且可用的 projection-cache 行可以在不打開 Session 的情況下預熱鬧鐘；cache 缺失或陳舊可能造成短暫漏顯或殘留。標識只表示當前列表值包含尚未 dispatch 或 delete 的 Schedule 記錄，不表示 Schedule 運行時當前 live 或能夠喚醒該 Session。

-----

`ctx.uiWorkspace.openSession(id)` 會選中會話，并讓主區域返回會話界面；這兩項構成一次 UI 導航操作，即使目標會話已經是當前會話也同樣執行。`openWorkspace(id, beforeOpen?)` 和 `forkSession(id)` 僅在請求未被后續導航替代時打開結果；新會話使用 `openWorkspace`。可選的同步準備回調僅對仍有效的工作區請求執行，因此過期請求不會搬移 composer 草稿。后續導航或所有者釋放會阻止晚到的 UI 提交，但不取消底層會話創建。選中失敗時保留當前全局面板。會話行讀取 `usePanelInfo`，在全局面板活躍時不顯示會話選中樣式；僅把焦點移到搜索框或目錄選擇器不會離開該面板。

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本包是一條組合：兩個目標 slot 都由其他插件聲明，因此 `apply` 使用 `slots.inject()` 在各自的聲明生命周期內完成注冊，并在目標 slot 的聲明恢復后重新注冊。

### 目錄流子 slot

每個注冊各自聲明一個**目錄流子 slot**（`single` kind：`conversation.hero.workspace.directoryFlow`／`sidebar.workspaces.directoryFlow`），由組合的選擇器包 client half 填入其選取交互——`-native` 后端的無渲染 OS 選擇器驅動，`-browse` 組合下則是應用內瀏覽對話框。平鋪顯示的**添加工作區…** 操作僅在當前界面的 slot 被占用時渲染；slot 為空意味著該組合沒有目錄選擇能力。本包持有觸發與接納：占用方通過 slot 的屬主交互約定（`open`/`busy`/`onPicked`/`onCancel`/`onError`）每次打開上報一個所選路徑，owner 通過對象層接納它，并等待 Workspace 列表投影刷新后才選中已提交的 Workspace。

### 視圖狀態

Workspace 列表基線就緒后，瀏覽器持久化的展開狀態與 Session 順序記錄只保留當前 Workspace id、Ungrouped 與單列表記賬。真實 Workspace 從 `WorkspaceView.sessionIds` 初始化，Ungrouped 與跨 Workspace 單列表從最近更新時間順序初始化。共享側邊欄投影會隱藏持久化 Session 摘要中帶有 `origin: 'subagent'` 的行；每個可見普通行都會在經不間斷的 subagent 譜系可達的任一后代運行時繼承藍色活動指示器。同一項純派生邏輯還會為分組、平鋪與搜索節點讀取列表 projection value 中的 Schedule key；本包只使用純類型依賴 `@deepseek-ai/dsh-schedule/client`，不會導入 Schedule 運行時或 `ui-schedule`。

### 懸浮卡片

Workspace 與 Session 懸浮卡片會復制對應行被截斷的值：激活 Workspace 卡片會寫入其完整目錄路徑，激活非空白 Session 卡片則會寫入其完整顯示標題。臨時的空白「新會話」卡片保持只讀，因為其本地化標簽是占位文案，并非會話內容。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

以下頁面覆蓋側邊欄宿主、主視覺區界面與選取后端。

- [ui-sidebar](../ui-sidebar/README.zh.md)——承載 `sidebar.workspaces` 子 slot 的側邊欄外殼。
- [ui-conversation](../ui-conversation/README.zh.md)——承載 Session Intent 主視覺區選擇器子 slot 的聊天界面。
- [directory-picker-native](../../host/directory-picker-native/README.zh.md)——填充目錄流子 slot 的 OS 選擇器后端。
- [Workspace Controller](../../api/workspace-controller/README.zh.md)——負責 Workspace 與排序的 Host 變更和框架無關 Client 投影。

-----

<a id="model-experience"></a>
## 模型體驗

無。該包是瀏覽器端 UI 插件層，不注冊任何面向模型的內容。

#### KV Cache 影響

無；該包既不組裝也不發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制定義搜索深度、歸檔界面與選取載體；它們是當前包約束。

- **沒有模糊內容搜索或事件深鏈接**：內容后端采用字面 token/短語匹配，選擇結果會打開 Session，而不是匹配的事件。
- **沒有 Session 刪除與取消歸檔控件**：會話可以歸檔，但已歸檔會話沒有查看或取消歸檔入口；刪除 Workspace 注冊記錄不會刪除 Session。
- **待處理的用戶交互不會聚合到折疊的分組上**：折疊分組內正在等待的行不會點亮分組頭指示，只有展開該分組后才可見。
- **原生文件夾選擇依賴本地 Host 載體**：在 `-native` 組合下，進程內部署或遠程瀏覽器部署無法打開本地操作系統對話框；可遠程的選取是 `-browse` 組合的應用內流程。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。這是一個純消費方插件，只向兩個由宿主聲明的 slot 注冊展示組件，并注冊自身的 locale dictionaries；inject face 由無狀態 RPC 包裝層和一次 create-and-open 調用組成；本插件不發出 Cordis 事件，也不持有跨插件可變狀態。
