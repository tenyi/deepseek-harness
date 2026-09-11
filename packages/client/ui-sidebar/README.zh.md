---
description: "dsh Web 客戶端的側邊欄外殼插件：品牌行、New Session 操作、折疊控件、可感知滾動的區域席位與底部固定的 Settings 席位。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sidebar

[English](README.md) | 中文

## 概述

dsh Web 客戶端的側邊欄讓用戶識別當前構建、啟動新會話、將導航折疊為 56px 軌道、瀏覽 Workspace 與 Session，以及打開 Settings。它會將 Settings 入口固定在底部，并在隱藏空閑滾動條時避免瀏覽器行發生位移。New Session 優先使用顯式選擇的 Workspace，其次使用當前 Session 所屬的 Workspace，再其次使用最近活躍的 Workspace；如果都不存在，則打開空白的 New Session 頁面。部署可以替換品牌標記或名稱，同時保留導航控件和軌道幾何。

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

側邊欄是導航外殼：用戶看到品牌、啟動新會話、折疊軌道并到達 Settings。功能插件填充它的席位——ui-workspace 填充 `sidebar.workspaces`，ui-settings 在 `sidebar.settings` 注冊觸發行與設置面板。

### 品牌與 New Session

展開的品牌行把 `sidebar.brand.mark` 與 `sidebar.brand.name` 渲染為兩個獨立的 single slot；收起軌道則渲染同一個 mark slot。沒有占位者時，外殼使用魚形標記和本地化的本地構建標簽。完整構建會在標簽下方顯示代碼徽標；該徽標使用 `DSH_CLIENT_VERSION`、可選的 7 位 `DSH_CLIENT_COMMIT_HASH` 與 `DSH_CLIENT_GIT_DIRTY=true` 組裝成 `version[-commit][-dirty]`；缺少版本元數據時不顯示徽標。New Session 優先使用作用域操作明確指定的 Workspace，否則使用當前 Session 所屬 Workspace，再否則使用最近活躍 Workspace；一個 Workspace 都沒有時則清空選擇，進入空白 New Session 頁面。

### 全局面板入口

插件在 root 作用域的 `sidebar.panellist` list 中注冊圖標組件，提供 `id`、可選 `order`，以及字符串或 locale-aware 的 `label`。同一個 id 尋址布局中 root 作用域 `main` keyed slot 的組件；選擇不存在的主面板條目會拋錯，并保留當前選中態。標簽提供普通可見文字、無障礙名稱和折疊提示。每一行通過 `usePanelInfo` 讀取自己的選中態；DOM 焦點移到搜索框或目錄選擇器時，顯示的面板及其列表項選中態不變。沒有注冊項時，列表及其間距均不渲染。產品隨附的組合不注冊示例面板。

### 折疊行為

實時收起時，展開內容在當前寬度淡出，上方控件共用同一段透明度漸變，并向左平移進入 56px 軌道，由布局的欄滑動結束整段動畫。頁面初始即為收起狀態時會靜態渲染軌道；減少動態效果模式會禁用兩段過渡。固定在底部的 `sidebar.settings` 控件共用相同的透明度漸變時序，但不發生橫向位移。

### 滾動條

欄內的滾動條是一種指針可供性：只要指針不在欄內，外殼就把滾動條間接層重新綁定為 `transparent`；指針離開后滑塊再保留 2 秒，因此沒人指向的列表不會帶著滾動條。避免行位移的空間預留屬于滾動區域本身（ui-workspace），所以顯示滑塊不會引起重排。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

外殼是純組合：`SidebarRootComponentProps` 組合布局 owner share、全局 `useSessions` 與 `useWorkspaces` 鉤子、已聲明的品牌、`sidebar.workspaces` 與 `sidebar.settings` 子 slot，以及注入的導航回調。面板入口及其可選標題使用相同的組合方式。面板元數據由列表注冊和 locale 變化派生；選中態屬于布局存儲。

### slot 紀律

聲明感知的 `slots.inject()` 讓替換包無論先于還是后于側邊欄激活都能生效。頁腳承載 `sidebar.settings` 席位：側邊欄只渲染固定在底部的布局 slot，并共享其欄狀態（`wide`）。`/client` 導出接口只包含插件主體（`apply`/`inject`）及約定類型；SidebarRoot、行組件與樹派生仍由 slot 注冊封裝在包內。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

以下頁面覆蓋填充外殼席位的各個界面與組合模型。

- [ui-workspace](../ui-workspace/README.zh.md)——渲染到 `sidebar.workspaces` 的 Workspace 與 Session 瀏覽器。
- [ui-settings](../ui-settings/README.zh.md)——在 `sidebar.settings` 注冊觸發行與設置面板的設置領域底座。
- [ui-layout](../ui-layout/README.zh.md)——折疊所使用軌道與欄狀態的布局 owner。
- [ui-theme](../ui-theme/README.zh.md)——外殼所重新綁定的滾動條 token 間接層。
- [slot 系統標準](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.zh.md)——席位背后的組合模型。

-----

<a id="model-experience"></a>
## 模型體驗

無。該包是瀏覽器端 UI 插件層，不注冊任何面向模型的內容。

#### KV Cache 影響

無；該包既不組裝也不發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制定義外殼擁有什么、其占位方擁有什么；它們是當前包約束。

- **Session 狀態點渲染由 ui-workspace 持有**：本外殼沒有可用的 done/error 通知數據源。
- **Workspace 瀏覽行為由組合持有**：分組、排序、搜索與行狀態都屬于 ui-workspace，不屬于此外殼。
- **「New task completed」未讀標記是本地查看狀態**：完成時間 > 上次查看時間這一事實永遠不會到達宿主。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。面板元數據是 Slot 注冊表與 locale 的只讀呈現投影，沒有獨立寫入 API。注冊表負責條目身份與資源釋放；本包的裝配測試在注冊和 locale 通知完成后斷言該投影。外殼沒有需要與這些來源協調的獨立導航狀態。
