---
description: "對話 UI 的附件呈現：混合草稿附件欄、文檔拖放目標、歷史圖片畫廊與原圖燈箱；供 Web 附件體驗的用戶與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-attachment

[English](README.md) | 中文

## 概述

本包渲染對話 UI 中與附件相關的一切：composer 下的一條有序草稿附件欄、全視口拖放提示層、Chat、Trajectory 與工具結果中的長期保留的圖片，以及查看原圖的燈箱。附件數據、上傳狀態、圖片加載與回調來自聲明這些 slot 的持有方。需要 DeepSeek Chat 風格的附件體驗時選擇它。

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

與 [`ui-conversation`](../ui-conversation/README.zh.md) 一起掛載本插件，工具結果需要圖片圖庫時也要掛載 [`ui-tool`](../ui-tool/README.zh.md)。插件等待這些 slot 的聲明，并把組件注冊進去。用戶會看到混合草稿附件欄、帶上傳控件的 DeepSeek Web 文件卡、帶限制說明的拖放遮罩、按數量定尺寸的消息圖片、工具卡片圖庫，以及支持 Escape、遮罩和關閉按鈕的燈箱。

### 草稿附件

圖片與通用文件按選擇順序進入同一條不換行的橫向附件欄。所有條目均為 64px 高：圖片是 64px 方形縮略圖，通用文件是 240px 寬的 DeepSeek Web 卡片，帶 16px 圓角、藍色漸變文檔圖標、文件名，以及大寫擴展名與字節大小。溢出隱藏時由邊緣箭頭翻頁，滾動條保持隱藏，新增條目會滾動到欄尾展示。文件上傳時圖標位置顯示 spinner，傳輸層報告字節時顯示進度，首次報告前使用不定態進度條；失敗時顯示重試。移除按鈕在懸停或鍵盤聚焦時出現，在觸摸設備上保持可見。單擊圖片會打開原圖。

### 消息圖片與燈箱

Chat 中的一條用戶消息把文件與圖片放在同一個靠右、可換行的排列中，并保持來源順序。消息僅有一張圖片且沒有其他附件時，圖片按長邊 240px 渲染（寬高比鉗制在 [0.25, 4]，從不放大）；消息有多個附件時，每張圖片顯示為固定 64px 方塊，與 240×64px 文件卡同排。加載完成的圖片單擊打開文檔級燈箱；加載失敗則顯示重試控件。燈箱按 Escape、按下遮罩或點關閉按鈕關閉，并把焦點還給打開者。

### 拖放遮罩

文件拖到頁面上方時，全視口遮罩顯示拖放提示，包括插畫和標題；接受拖放時還會顯示一行限制說明。遮罩只呈現狀態——是否接受由持有方的文檔級監聽器決定。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

插件通過 `ctx.slots.inject` 等待 `conversation.input.attachments`、`conversation.message.images`、`conversation.trajectory.images` 與 `tool.call.images`。隨后它注冊 composer rail、文檔拖放目標、供 Chat、Trajectory 與工具結果共用的歷史圖片 gallery，以及原圖燈箱。呈現組件僅依賴 props：slot 持有方提供附件數據、圖片加載、回調與語言包翻譯器；包入口不導出任何組件。

| 文件 | 職責 |
|---|---|
| [`src/client/ComposerAttachments.tsx`](src/client/ComposerAttachments.tsx) | 有序圖片／文件欄＋拖放遮罩的組裝 |
| [`src/AttachmentRail.tsx`](src/AttachmentRail.tsx) | 附件橫向溢出、滾輪轉換、邊緣箭頭 |
| [`src/client/MessageImages.tsx`](src/client/MessageImages.tsx) | 每消息畫廊＋燈箱的組裝 |
| [`src/MessageImage.tsx`](src/MessageImage.tsx) | 單圖尺寸、加載／重試、點擊打開；本地提交回顯預覽直接顯示其 object URL |
| [`src/ImageLightbox.tsx`](src/ImageLightbox.tsx) | 鋪在共享遮罩上的文檔級模態預覽 |
| [`src/DropOverlay.tsx`](src/DropOverlay.tsx) | 不接收指針事件的拖放提示 portal |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

如果附件界面本身還不夠，請閱讀以下頁面。這些頁面從本包填充的 slot 講到負責輸入流程的會話外殼。

- [ui-conversation](../ui-conversation/README.zh.md)——聲明附件 slot，并負責 composer 與圖片接收。
- [Web 客戶端架構](../../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.zh.md)——瀏覽器插件行如何加載并注冊 slot。
- [客戶端包映射](../README.zh.md)——相鄰的瀏覽器 UI 包。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為該插件只渲染由對話 UI 提供的附件狀態，不貢獻模型可見輸入。

#### KV Cache 影響

無；該包既不組裝也不發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制界定了當前附件功能范圍。它們是包約束，不是通用圖片查看器對比或任務積壓。

- **燈箱無縮放與下載**——預覽僅以適配視口的尺寸渲染原圖。
- **燈箱不鎖定焦點**——它設置 `aria-modal` 并在關閉時歸還焦點，但 Tab 仍可移動到背后的頁面。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。本包只貢獻由 effect 持有的 slot entry；slot 注冊表負責其生命周期并校驗聲明。
