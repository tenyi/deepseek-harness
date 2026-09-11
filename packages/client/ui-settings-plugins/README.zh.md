---
description: "dsh Web 客戶端的「插件」設置分區：功能自有的標簽頁、可配置宿主平面插件卡片，以及 settings.plugin.item 擴展點。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-plugins

[English](README.md) | 中文

## 概述

使用**插件**設置分區可以配置當前部署公開的插件，也可以打開插件功能自己的頁面。**插件配置**標簽頁會為每個受支持的插件展示一張可展開卡片，標明用戶覆蓋過哪些值，并允許用戶將它們重置為部署默認值。卡片會在本地保留修改，直到用戶保存。如果配置在卡片加載后發生變化，保存會被拒絕，而不會覆蓋較新的值。

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

打開設置中的「插件」分區并選擇**插件配置**標簽頁，即可編輯本部署所組裝的宿主平面插件。卡片依次為 shell 執行器（`bash`）、agent loop（智能體循環）的工具調用并行度（`agent-loop`）、subagent 模型選擇（`subagent-model-selection`）以及 DeepSeek 搜索提供方（`web-search-deepseek`）。

### 這里會出現什么

標簽頁讀取 Host 服務了哪些 settings 命名空間，并為每個命名空間派發一個 slot 鍵，因此渲染出來的是兩份賬本的交集：存活 Host 插件注冊的命名空間，以及注冊在這些鍵上的卡片。被服務卻無人認領的命名空間什么都不渲染；命名空間未被本部署服務的卡片根本不會被派發。空態文案要等 Host 的第一次答復，因此一次尚未答復的讀取絕不會被讀成「本部署沒有可配置的插件」。

### 編輯與保存

卡片暫存用戶輸入，只有用戶保存時才寫入。每個控件渲染的都是暫存文本，因此屏幕上所見即保存后所存；**放棄修改**丟棄這些草稿，持有未保存修改的卡片即使收起也會在標題上標明。保存成功后，卡片會在回讀確認寫入后收起；保存失敗時，卡片保持展開、報告失敗并保留草稿供用戶修改。重置暫存的是組裝默認值而非立即寫入；字段不接受的草稿會阻塞保存，而不是被丟棄。某個值是否被接受只有 Host 說了算。

subagent 卡會同時暫存其權限開關與精確模型復選框。啟用時必須至少選擇一條適配器路由。保存會在一次 mutation 中提交 `enabled` 與 `allowedModels`，并以草稿開始時的 revision 設柵；Host revision 更新后，草稿會標記為失敗，而不會恢復已撤銷的路由。關閉時會保留已選路由供以后重新使用。可用模型按提供方分組；當前目錄中缺失的已存路由排在末尾，且仍可移除。適配器名稱與模型描述仍屬于實時目錄元數據，不會存儲；適配器變化、設置提交和重連后，卡片會刷新這些元數據。

### secret 角色字段

密鑰控件初始為空、只報告是否已配置，并經由 credentials 領域而非 settings 分節寫入；空草稿不寫入任何東西，保留已存密鑰。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本分區是一個擴展點加一條分派規則：功能插件擁有各自的卡片；標簽頁按 slot 鍵把被服務的命名空間與已注冊卡片配對。

### 標簽頁擴展點

本分區聲明根級列表 slot `settings.plugins.tab`，其標簽會成為有序標簽頁；某個標簽頁首次被選擇后會保持掛載，因此本地草稿與只讀快照在切換標簽頁時不會丟失。本包注冊自己的 `configurable` 貢獻，由它聲明嵌套的 `settings.plugin.item` slot——以卡片所編輯的 settings 命名空間為鍵。帶瀏覽器半側的插件把自己的卡片注冊在自己的命名空間上，并擁有它的全部：外觀、控件與文案。標簽頁遵循貢獻的 `order`；卡片遵循注冊順序。

### 寫入路徑

保存時，暫存字段通過客戶端 settings scope 寫入；每次單字段寫入或有序 mutation 都以草稿讀取時的命名空間 revision 設柵，因此已與文檔脫節的表單會被拒絕，而不是覆蓋并發變更。字段是否被覆蓋，取決于它是否出現在原始用戶層中，而非取決于它的值；重置會清除該字段，使其重新繼承組裝層。secret 角色的字段絕不搭乘響應；卡片會在轉發來的 `credentials/reference-updated` 事件報告它所關注的引用時重讀。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

以下頁面覆蓋設置底座、清單標簽頁與卡片背后的持久化 seam。

- [ui-settings](../ui-settings/README.zh.md)——聲明 `settings.plugins.tab` 與 settings scope 的領域底座。
- [ui-settings-plugin-inventory](../ui-settings-plugin-inventory/README.zh.md)——同一分區中的只讀「插件列表」標簽頁。
- [settings](../../settings/README.zh.md)——持久化用戶設置 seam 及其文件提供方。
- [credentials](../../credentials/README.zh.md)——secret 字段寫入所經的憑據引用 seam。
- [ui-settings-general](../ui-settings-general/README.zh.md)——承載本分區的設置外殼。

-----

<a id="model-experience"></a>
## 模型體驗

無。該包是瀏覽器端設置界面，不注冊任何面向模型的接口。

#### KV Cache 影響

無；該包既不組裝也不發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制定義哪些插件會出現、列表有多新鮮；它們是當前包約束。

- **只有宿主平面的插件會出現**：由 agent preset 掛載的插件把配置內聯在該 preset 的 `agent.cordis.yml` 中，且根本無法注冊 settings 命名空間，因此本分區不會列出它。編輯那些值仍是 preset 編輯器的職責。
- **卡片仍然需要一份瀏覽器 bundle**：瀏覽器半側必須是按客戶端模塊系統的 lazy-CJS factory 格式構建的 `dsh.client` 包，而產出它的 `clientBundle` 預設位于 `../../../packages/client/tsdown.client.ts`，并非已發布的包，因此本倉庫之外的插件得自行復刻該構建。
- **被服務的命名空間只在兩種信號上重讀**：協議通告的是 settings 文檔提交與連接重置，而非注冊行為，因此在標簽頁讀取之后才被其擁有方注冊的命名空間，要等下一次文檔提交或重連才會加入列表。
- **shell 卡片跟隨被組裝的執行器**：POSIX 與 PowerShell 兩個執行器家族共用 `bash` 命名空間，因為一個宿主只組裝其中之一，所以被服務的 schema 隨平臺不同（PowerShell 多出 `pwshPath`），盡管卡片在兩者下編輯的都是同樣兩個字段。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。這是瀏覽器端設置界面，node half 不持有事件流或可變運行時數據；分層與寫入拒絕是 Host 約定，由相應插件和 api-proxy 覆蓋。
