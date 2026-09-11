---
description: "面向側欄的官方 DeepSeek Harness 品牌填充，僅在官方構建中生效；供選擇或替換品牌呈現的用戶與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-brand-official

[English](README.md) | 中文

## 概述

本包讓以 `official` profile 構建的客戶端在側欄顯示 DeepSeek Harness 標志與名稱。其他構建 profile 保留外殼的魚形標志與本地構建標簽，會話首屏則始終使用動畫魚。品牌為 DeepSeek Harness 的部署應選擇本包；使用其他品牌的部署應提供替代品牌包。本包不保留運行時狀態，也不影響模型請求。

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

在采用 DeepSeek 自有品牌的部署中，將本插件掛載到瀏覽器插件名單，然后以 `official` profile 構建客戶端，讓填充得以注冊。

### 選擇 profile

`DSH_CLIENT_BUILD_PROFILE` 決定渲染哪個品牌。`official` 構建在側欄顯示官方標志與名稱；任何其他取值都讓外殼回退——魚形標志與本地構建標簽——保持原樣。會話首屏無論 profile 如何都顯示來自 `dsh-client-ui-conversation` 的動畫首屏魚，因為這個回退本身就是官方標志。兩種情況下插件都會照常加載并通過校驗；只有注冊受 profile 門控。

### 替換品牌

自有身份的部署不組合本包，而是組合另一個占據側欄 slot——以及本包留給回退的首屏 slot——的包。占據 slot 是唯一的組合路徑；這里不存在任何品牌配置面。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

兩個填充作為一組聲明感知的注冊安裝：嵌套的 `ctx.slots.inject()` 調用等待側欄聲明，因此無論本行在聲明者之前還是之后激活，這組注冊都能工作；聲明消失時兩個填充一并撤回，HMR 期間也不會留下殘缺的品牌混合。瀏覽器半部是 [`src/client/index.ts`](src/client/index.ts)；node 半部是一個空 Loader 座位。瀏覽器標題是構建環境的事（`DSH_CLIENT_TITLE`），不在 slot 系統之內。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當品牌面不夠用時閱讀以下頁面。它們從本包占據的 slot 進入渲染這些 slot 的外殼。

- [ui-sidebar](../ui-sidebar/README.zh.md)——聲明 `sidebar.brand.mark` 與 `sidebar.brand.name` 并渲染其回退。
- [ui-conversation](../ui-conversation/README.zh.md)——在首屏聲明 `conversation.hero.brand.mark`。
- [Web 客戶端架構](../../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.zh.md)——瀏覽器插件行如何加載并注冊 slot。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為本包只貢獻瀏覽器呈現；這里沒有任何內容進入模型請求。

#### KV Cache 影響

無；本包既不組裝也不發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制界定了品牌呈現的供給方式。它們是當前包約束，不是品牌設計對比或任務積壓。

- **只有一組填充**——替代呈現屬于占據相同 slot 的另一個 Cordis 包。
- **瀏覽器標題獨立**——`DSH_CLIENT_TITLE` 在構建時選擇標題文本，而非通過 UI slot。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。本包不保留可變狀態，三個 slot occupant 通過同一個事務性 effect 安裝和釋放。
