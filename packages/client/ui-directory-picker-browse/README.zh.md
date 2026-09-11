---
description: "應用內目錄瀏覽表面：填充工作區目錄流程的 Miller 分欄「選擇工作區目錄」對話框；供 Web 拾取體驗的用戶與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-directory-picker-browse

[English](README.md) | 中文

## 概述

本包提供 Web GUI 的應用內目錄瀏覽表面：一個「選擇工作區目錄」對話框，通過本地宿主列出、導航并創建文件夾，不涉及任何操作系統選擇框。它填充 `ui-workspace` 聲明的兩個目錄流程槽位，用一行 cordis.yml 組合出瀏覽拾取交互的客戶端一側。當瀏覽器為遠程或進程內、沒有本地操作系統選擇器時選擇它；本地部署可優先選擇 [`-native`](../ui-directory-picker-native/README.zh.md) 表面。

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

與 `ui-workspace` 及宿主后端 [`dsh-host-directory-picker-browse`](../../host/directory-picker-browse/README.zh.md) 一起掛載本插件；一行 cordis.yml 隨即組合出完整的瀏覽拾取交互。當工作區流程發起目錄請求時，用戶看到應用內對話框：頭部承載路徑面包屑與可編輯路徑區，未選中行時是一整欄層級，選中后該行分為層級與子項兩欄。

### 導航與創建

逐級進入文件夾、直接編輯路徑，或用前綴過濾最后一欄；宿主標記的隱藏條目默認不顯示，直到頁腳開關揭開。**新建文件夾**打開一個嵌套創建對話框，目標為選中的文件夾，并選中它創建出來的那個；**打開**采納選中的文件夾，沒有選中時回落到當前層級。確認一個目錄即為選中的路徑；關閉對話框即為取消。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

對話框是 680×500 的 Miller 分欄視圖（在較矮或較窄的視口中限制尺寸），經 `ctx.workspaces` 驅動宿主的 `listDirectory` 與 `createDirectory` 原語。兩處注冊經嵌套的 `ctx.slots.inject()` 調用作為一次事務性效果安裝，因為任一聲明條目都可能晚些激活或替換其聲明；對話框文案注冊在本包自己的 locale 命名空間下，讓兩份字典作為一個單元落地。瀏覽類失敗留在對話框自己的提示區內，因此本填充從不驅動持有方的 `onError` 分支。node 半部是一個空 `apply`，讓插件留在宿主名單上。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當拾取面不夠用時閱讀以下頁面。它們從瀏覽器半部進入宿主后端與它所填充的槽位。

- [dsh-host-directory-picker-browse](../../host/directory-picker-browse/README.zh.md)——本表面驅動的目錄列出后端。
- [ui-workspace](../ui-workspace/README.zh.md)——聲明目錄流程槽位并擁有拾取對話。
- [ui-directory-picker-native](../ui-directory-picker-native/README.zh.md)——面向本地部署的原生操作系統選擇器替代方案。
- [Web 客戶端架構](../../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.zh.md)——瀏覽器插件行如何加載并注冊槽位。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為目錄瀏覽器屬于瀏覽器界面；本包中的任何內容都不會進入模型請求。

#### KV Cache 影響

無；本包既不組裝也不發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制界定了當前瀏覽表面。它們是當前包約束，不是通用文件瀏覽器對比或任務積壓。

- **無搜索、無多選、無重命名或刪除**——對話框只負責列出與創建目錄；到達目標靠導航、編輯路徑，或用前綴過濾最后一欄。
- **隱藏條目的過濾在客戶端**——宿主始終列出隱藏條目并加標記，因此開關只改變對話框渲染什么。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。插件只注冊一個工作區目錄流程持有方，其資源釋放由 HMR（熱模塊替換）安全規范驗證；它顯示的每個目錄列表都會按需從 Host 重新讀取，而不會保存在本包中。
