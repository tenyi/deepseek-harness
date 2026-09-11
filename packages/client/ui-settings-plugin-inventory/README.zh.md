---
description: "dsh Web 客戶端設置中按作用域分組的只讀插件清單標簽頁：Agent 預設組合在前，全局平面收在折疊分組里，搜索跨兩組。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-plugin-inventory

[English](README.md) | 中文

## 概述

**插件列表**標簽頁讓 Web 用戶查看插件，而不改變其配置。它優先展示 agent（智能體）預設，并讓全局清單保持收起，僅在需要時展開。卡片保留包名作為主標題，以穩定的條目 id 標識實例，并展示啟停狀態、出處、運行狀態、禁用條件與發現失敗；由預設提供的全局條目會列出對應預設。搜索覆蓋兩個分組，并指出其他預設中的匹配。標簽頁處理加載、空結果、無匹配、失敗與重試狀態，且不暴露傳輸細節；沒有預設 roster 時仍會展示全局清單。

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

打開設置中的「插件」分區并選擇**插件列表**標簽頁，即可查看宿主的插件清單。插件激活期間不會讀取 Remote——首次選擇該標簽頁時才掛載組件，并通過 `api-remotes` 懶調用 `ctx.remote.pluginInventory.list()`。

### 閱讀卡片

每張收起的卡片使用模塊短名稱作為主標題，在下方顯示穩定的條目 id，并以小標簽表示啟停狀態；已啟用的條目還會顯示彩色根 fiber 狀態圓點。組合生成的次標題省略開頭的 `include:` 標記；懸停、搜索、無障礙名稱與展開詳情仍保留完整 id。長條目 id 會在行內截斷，懸停時仍可查看完整值。展開卡片后會顯示聲明的條目 id、完整模塊標識與狀態事實：預設行說明它來自哪個預設、組合存活時的運行狀態，以及它攜帶的禁用條件；被預設提供的全局行說明它由 Agent 預設按會話提供、列出啟用它的預設，并提供跳轉到預設組的入口。預設名經共享的 `presetDisplayText` 純函數（`dsh-agent-presets/display`）疊在 [`ui-agent-preset`](../ui-agent-preset/README.zh.md) 的字典上解析：內置預設走當前語言，用戶自建預設保留自己的元數據，因此英文界面不會回顯預設文件里的中文名。搜索按模塊名稱與條目 id 過濾兩組。

### 預設切換器

切換器與通用設置各行使用同一種「選擇膠囊 + 菜單」控件。它列出 roster 的每個預設——默認項帶后綴、壞預設帶標記——并且只改變列表顯示什么：它不寫任何設置，選中壞預設時在行的位置展示 discovery 報告的原因。選擇默認預設或會話預設的入口仍在原處：Agent 預設分區與新會話頁。

### 重試失敗的讀取

讀取失敗會在標簽頁內渲染通用失敗狀態；重試會重新執行懶 `list()` 調用，且不會暴露傳輸細節。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

該標簽頁是宿主擁有快照的只讀投影；插件激活期間不執行任何 Remote 讀取，首次選擇時才取快照。

### 注冊

瀏覽器插件注冊一個 id 為 `all` 的本地化 `settings.plugins.tab` 貢獻；「插件」分區擁有導航入口與標簽欄。注冊使用 `ctx.slots.inject()`，因此能跟隨標簽 slot 的延遲聲明、重新聲明、本地化變化與 teardown，而無需 import 分區擁有方。

### 渲染

行 key 按作用域限定（`global:`、`preset:<id>:<index>`），因此同一模塊出現在兩個作用域時保持各自的展開狀態；聲明的條目 id 出現在展開詳情中，并在去掉開頭的組合 `include:` 標記后作為收起次標題，沒有 id 的行不顯示次級標簽。預設提供標記在客戶端推導：一個全局條目在全局被停用、且至少一個預設行對同一模塊標識實際啟用時才攜帶它，因此被所有預設關掉（或僅條件聲明）的模塊保持單純的已停用，而不是夸大提供關系。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

以下頁面覆蓋設置分區、Remote 調用與宿主側投影。

- [ui-settings-plugins](../ui-settings-plugins/README.zh.md)——本標簽頁注冊進的「插件」分區。
- [ui-settings](../ui-settings/README.zh.md)——聲明 `settings.plugins.tab` 的領域底座。
- [api-remotes](../../api/remotes/README.zh.md)——`pluginInventory.list()` 背后的 Remote BFF 表面。
- [plugin-inventory](../../host/plugin-inventory/README.zh.md)——本標簽頁所渲染的宿主側只讀 Loader 投影。

-----

<a id="model-experience"></a>
## 模型體驗

無。該包是瀏覽器端清單投影，不注冊任何面向模型的內容。

#### KV Cache 影響

無；該包既不組裝也不發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制定義清單視圖的新鮮度與觸達范圍；它們是當前包約束。

- **每次 Settings 掛載或重試只讀取一份快照**：標簽頁不訂閱 Loader 變化，也不會在重連后自動重新讀取；切換標簽頁會保留當前快照，重新打開 Settings 則會取得新快照。
- **兩個平面都只讀**：標簽頁展示全局與預設的啟停狀態但都不修改；寫回自定義預設組合文件的啟停控件是刻意留作后續的工作。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。本包只持有一個只讀 Settings contribution。
