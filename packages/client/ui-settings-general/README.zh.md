---
description: "dsh Web 客戶端的設置外殼、無特定功能歸屬文案與持久化產品引導命名空間：「通用」分區、觸發控件界面框架與引導賬本投影。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-general

[English](README.md) | 中文

## 概述

使用本包可為 dsh Web 客戶端提供 Settings 面板、連接恢復控件、由功能包貢獻的導航，以及依次進行的首次運行引導。用戶可以從側邊欄打開面板、立即重試失敗的連接，并在宿主為回環瀏覽器提供本地配置文件時訪問該文件。各功能包提供自己的設置行、分區和引導步驟；本包提供共享的界面展示，但不添加引導文案或「通用」分區的內置行。

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

用戶通過側邊欄底部的 Settings 控件進入外殼；功能插件通過本外殼所投影的 slot 賬本貢獻自己的頁面與引導步驟。在展開側邊欄和收起軌道中，該控件都會把本地化的 Settings 文案作為其可訪問名稱。Settings 右側淺黃色的**連接異常**操作表示瀏覽器離線暫停；自動恢復期間顯示**自動重連中**，其后一至三個點每 500ms 前進一次。鼠標懸浮或鍵盤聚焦任一黃色狀態時，只有文案變為**立即重連**，背景保持不變；按壓反饋留在黃色色階內，選中后立即從 retry 1 開始。恢復后該區域變為淺綠色的**連接成功**，駐留 2 秒再消失。所有可見狀態的文字都左對齊，且圖標、文字起點、高度和寬度保持固定。首次啟動與未曾中斷的健康連接保持靜默。外殼渲染模態面板、由 `settings.section` 條目構建的導航，以及每次只掛載一個的引導步驟。

### 「通用」分區

「通用」分區承載由功能包注冊進 `settings.general.item` 的行——它沒有內置行。功能插件擁有行文案與行為；外殼只提供分區及其 slot。例如「外觀」行位于 ui-theme。

### 打開配置文件

在回環瀏覽器上，只有當宿主確認可準備好一份由提供方持有的本地文檔時，外殼才渲染**打開配置文件**。該操作會在原生文本編輯器中打開該文檔（macOS 上繞過瀏覽器文件關聯）。遠程瀏覽器從不注冊該操作，也從不發起這項特權設置讀取。

### 引導步驟

引導賬本按升序投影，每次只掛載一個步驟。注冊方持有持久化完成狀態、能力就緒狀態、文案、變更操作與可見包裝，因此獨立注冊的流程無法堆疊，外殼也不會成為第二個配置事實來源。可見步驟自行持有彈窗框架與應用根節點 `inert` 生命周期。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

外殼擁有界面框架與投影；每段內容與文案都屬于某個注冊方。

### 賬本投影

導航是 `settings.section` 賬本的投影；導航 label 可以是跟隨語言的 thunk，經 `resolveSlotLabel` 解析，并在分區賬本更新或 locale revision 變化時重新渲染（`ctx.get('locale')` 可選讀取，無硬 locale 依賴）。引導賬本按升序投影；當前注冊方會收到該條目的 id、`complete()` 與 `openSection(id)` 回調，完成或跳過當前步驟后，所有權轉交給下一項。

### 連接恢復

外殼是明確的恢復功能消費方，因此直接注入 Connection，而不把生命周期控制放進 `ctx.remote`。它的私有 hooks compartment 綁定 `ctx.connection.state`，組件只接收選出的狀態與調用 `ctx.connection.reconnect()` 的注入回調。`ConnectionIndicator` 擁有內聯展示并從 `settings` locale namespace 接收全部可見與無障礙文案；2 秒恢復狀態計時器歸外殼所有。

### 文檔可用性

在 loopback 頁面上，Client 通過 `settings/describe` 加載提供方的 `hasDocument` 能力，且只有在 Host 確認可準備好一份由提供方持有的本地文檔時才渲染**打開配置文件**操作。該操作調用無路徑參數且經瀏覽器認證的 `settings/openSettingsDocument` Remote；Host 會再次解析提供方路徑、在文檔缺失時將其創建出來，并交給原生文本編輯器（macOS 上使用 `open -t`，繞過瀏覽器文件關聯；Linux 和 Windows 上使用桌面文件關聯；WSL 上經 `wslpath -w` 轉換后使用 Windows 文件關聯）。打開失敗時該操作仍可使用，并渲染本地化錯誤。臨時讀取失敗或 Host 拓撲變化后，重新打開對話框或重新連接會刷新可用性。非 loopback 頁面保留 Client 策略，不提供該原生操作及其 settings 讀取。

### 宿主端

宿主端在用戶設置 seam 中注冊 `ui-onboarding`。`ui-settings-models` 提供的歡迎步驟通過既有公開 settings 邊界讀寫其中的 `welcomeNoticeVersion`；外殼本身仍不持有產品策略。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

以下頁面覆蓋設置界面家族與組合模型。

- [ui-settings](../ui-settings/README.zh.md)——本外殼所依賴 slot 類型與 scope 服務所在的領域底座。
- [ui-sidebar](../ui-sidebar/README.zh.md)——承載 `sidebar.settings` 席位的側邊欄外殼。
- [ui-settings-models](../ui-settings-models/README.zh.md)——貢獻 DeepSeek 引導步驟的功能包。
- [settings](../../settings/README.zh.md)——持久化用戶設置 seam 及其文件提供方。
- [slot 系統標準](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.zh.md)——賬本背后的組合模型。

-----

<a id="model-experience"></a>
## 模型體驗

無。該包是瀏覽器端 UI 插件層，不注冊任何面向模型的內容。

#### KV Cache 影響

無；該包既不組裝也不發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明外殼自身提供什么、功能包必須提供什么；它們是當前包約束。

- **「通用」分區沒有內置行**：每一行僅在其所屬功能插件掛載時出現；外殼單獨無法填滿該分區。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。settings seam 校驗并發布持久 onboarding section，slot core 會拒絕沖突；本地 document action 由 store 與組件測試覆蓋。
