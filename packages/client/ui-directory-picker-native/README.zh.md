---
description: "原生目錄選擇表面：驅動 Host 操作系統選擇器的瀏覽器半部，用于工作區目錄流程；供選擇拾取交互的用戶與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-directory-picker-native

[English](README.md) | 中文

## 概述

本包提供 Web GUI 的原生目錄拾取表面：當工作區流程請求一個目錄時，一個無渲染的瀏覽器填充會在運行 Host 的機器上打開操作系統自帶的選擇器，并回報唯一結果——拾取的路徑、取消或失敗。它填充 `ui-workspace` 聲明的兩個目錄流程 slot，用一行 `cordis.yml` 組合出原生拾取交互的客戶端一側。當瀏覽器與 Host 運行在同一臺機器上時選擇它；進程內與遠程瀏覽器部署則需要 [`-browse`](../ui-directory-picker-browse/README.zh.md) 表面。

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

與 `ui-workspace` 及 Host 后端 [`dsh-host-directory-picker-native`](../../host/directory-picker-native/README.zh.md) 一起掛載本插件；一行 `cordis.yml` 隨即組合出完整的原生拾取交互。當工作區添加或選擇器流程發起目錄請求時，用戶看到操作系統的文件夾對話框；拾取的路徑被工作區流程采納，取消則關閉對話框。

### 何時選擇

當瀏覽器與 Host 運行在同一臺機器上、操作系統對話框可以在那里打開時，選擇此表面。當瀏覽器為遠程或進程內、沒有本地選擇器時，選擇 [`-browse`](../ui-directory-picker-browse/README.zh.md) 表面。兩個表面填充相同的 slot，因此切換只是組合改動，而非代碼改動。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

兩個 slot 注冊經嵌套的 `ctx.slots.inject()` 調用作為一個事務性 effect 安裝，因為任一聲明條目都可能晚些激活或替換其聲明。填充在每個上升沿 `open` 時只武裝一次，因此重渲染永遠不會再拉起一個選擇器；結算結果掛在 ref 上，讓答復到達持有方最新的處理器。HMR（熱模塊替換）導致填充被替換時，卸載會整體丟棄結算：wire 沒有按請求中止的機制，因此 Host 側選擇器會一直存活到被答復，而它的答復無處落地。node 半部是一個空 `apply`，讓插件留在 Host 名單上。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當拾取面不夠用時閱讀以下頁面。它們從瀏覽器半部進入 Host 后端與它所填充的 slot。

- [dsh-host-directory-picker-native](../../host/directory-picker-native/README.zh.md)——本表面驅動的操作系統選擇器后端。
- [ui-workspace](../ui-workspace/README.zh.md)——聲明目錄流程 slot 并擁有拾取對話。
- [ui-directory-picker-browse](../ui-directory-picker-browse/README.zh.md)——面向遠程與進程內部署的應用內瀏覽替代方案。
- [Web 客戶端架構](../../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.zh.md)——瀏覽器插件行如何加載并注冊 slot。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為目錄選擇器屬于瀏覽器界面；本包中的任何內容都不會進入模型請求。

#### KV Cache 影響

無；本包既不組裝也不發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制界定了原生選擇器的適用時機。它們是當前包約束，不是通用選擇器對比或任務積壓。

- **無法取消已打開的選擇器**——wire 沒有按請求中止的機制，因此已顯示在 Host 上的選擇器無法從瀏覽器關閉；被丟棄的結算會被忽略。
- **僅限本地 Host 承載**——操作系統對話框在運行 Host 的機器上打開，因此進程內與遠程瀏覽器部署需要 `-browse` 組合。平臺失敗經由持有方的可重試文件夾對話框呈現。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。插件將一個無渲染 flow occupant 作為一個事務性 effect 注冊到兩個 workspace hole；HMR 安全性規范證明該 effect 的釋放行為，并且插件在各次 pick 之間不保留狀態。
