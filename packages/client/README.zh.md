---
description: "web GUI 瀏覽器側的包映射：外殼啟動、瀏覽器與宿主通信、共享客戶端服務、本地化、開發重載與 UI 功能插件。"
kind: "package-group"
---

# client/ — Web GUI 瀏覽器側

[English](README.md) | 中文

## 概述

`client/` 組提供 dsh web GUI 的瀏覽器體驗，包括對話、導航、設置、批準、文件訪問及其他交互功能。添加瀏覽器中可見的行為時，請選擇本系列中的包；服務端頁面交付與宿主集成則使用 [`host/`](../host/README.zh.md)。本系列同時涵蓋共享瀏覽器基礎與專門的 UI 功能，各子包 README 擁有其配置與行為說明。編寫規則見 [AGENTS.md](AGENTS.md)，下方相關文檔解釋跨包組合方式。

## 目錄

- [包](#packages)
- [相關文檔](#related-documentation)
- [開發備注](#dev-note)

-----

<a id="packages"></a>
## 包

內核包負責啟動與服務于頁面，UI 功能包負責呈現頁面。各包的 README 擁有自己的約定與配置。

| 包 | 職責 | ctx 鍵 |
|---|---|---|
| [`web/`](web/README.zh.md) | 啟動瀏覽器外殼 | — |
| [`modules/`](modules/README.zh.md) | 加載瀏覽器側客戶端模塊 | `ctx.clientModules` / `ctx.modules` |
| [`connection/`](connection/README.zh.md) | 維護瀏覽器與宿主之間的 RPC 通信與事件投遞 | `ctx.connection` |
| [`file-upload/`](file-upload/README.zh.md) | 在頁面線程之外發送原始 Blob 與字節流請求體 | `ctx.fileUpload` |
| [`store/`](store/README.zh.md) | 提供不依賴 React 的 observable 與快照存儲原語 | — |
| [`hmr/`](hmr/README.zh.md) | 在開發期間刷新客戶端插件 | — |
| [`locale/`](locale/README.zh.md) | 提供本地化偏好與消息詞典 | `ctx.locale` |
| [`test-runtime/`](../test-support/client-runtime/README.zh.md) | 為客戶端功能包提供共享的倉庫測試支持 | — |
| [`ui-renderer/`](ui-renderer/README.zh.md) | 將 slot 數據綁定到 React，并掛載組裝完成的應用 | `ctx.uiRenderer` |
| [`ui-slots/`](ui-slots/README.zh.md) | 定義 UI 功能注冊與組合擴展 slot 的方式 | — |
| [`ui-session/`](ui-session/README.zh.md) | 把會話控制器狀態適配為標準 Slot source 與鉤子 | — |
| [`ui-theme/`](ui-theme/README.zh.md) | 應用所選顏色主題 | — |
| [`ui-primitives/`](ui-primitives/README.zh.md) | 提供共享 React 控件、圖標與內容渲染器 | — |
| [`ui-attachment/`](ui-attachment/README.zh.md) | 注冊輸入框與消息圖片的附件呈現 | — |
| [`ui-layout/`](ui-layout/README.zh.md) | 排列應用的主要區域 | — |
| [`ui-sidebar/`](ui-sidebar/README.zh.md) | 展示工作區與會話導航 | — |
| [`resources/`](resources/README.zh.md) | 統一資源模型：`useResource` 會話標準鉤子背后的協議提供方 | `ctx.resources` |
| [`ui-sidebar-files/`](ui-sidebar-files/README.zh.md) | 右側 Sidebar 的工作區文件樹 tab 類型 | — |
| [`ui-brand-official/`](ui-brand-official/README.zh.md) | 用官方名稱與標記填充通用瀏覽器品牌 slot | — |
| [`ui-workspace/`](ui-workspace/README.zh.md) | 提供工作區選擇與創建界面 | — |
| [`ui-conversation/`](ui-conversation/README.zh.md) | 展示當前對話及其輸入界面 | — |
| [`ui-chat/`](ui-chat/README.zh.md) | 投影并渲染 Chat 對話 target | — |
| [`ui-approval/`](ui-approval/README.zh.md) | 展示批準請求并返回用戶決策 | — |
| [`ui-tool/`](ui-tool/README.zh.md) | 編排工具調用樹與按工具鍵控的視圖 | — |
| [`ui-workflow-run/`](ui-workflow-run/README.zh.md) | 把持久工作流運行回放為嵌套對話折疊項 | — |
| [`ui-goal/`](ui-goal/README.zh.md) | 展示與管理當前目標 | — |
| [`ui-trajectory/`](ui-trajectory/README.zh.md) | 提供 agent（智能體）活動的其他視圖 | — |
| [`ui-commands/`](ui-commands/README.zh.md) | 提供會話感知的命令發現與分發 | — |
| [`ui-input-trigger/`](ui-input-trigger/README.zh.md) | 協調內聯命令與引用建議 | — |
| [`ui-skill/`](ui-skill/README.zh.md) | 向內聯建議添加 skill（技能）引用 | — |
| [`ui-reference/`](ui-reference/README.zh.md) | 統一的 Web `@file` / `@session` 引用 source | — |
| [`ui-subagent/`](ui-subagent/README.zh.md) | 提供 subagent 導航、子級 transcript（文本記錄）狀態與內聯引用 | — |
| [`ui-schedule/`](ui-schedule/README.zh.md) | 在只讀標題欄目錄中列出當前會話中生效的提醒 | — |
| [`ui-jobs/`](ui-jobs/README.zh.md) | 在會話標題欄列出當前會話的后臺任務 | — |
| [`ui-model-selection/`](ui-model-selection/README.zh.md) | 在對話界面中提供模型選擇 | — |
| [`ui-permission-presets/`](ui-permission-presets/README.zh.md) | 配置默認權限并切換當前會話的訪問模式 | — |
| [`ui-plan/`](ui-plan/README.zh.md) | 展示生效中的 plan mode 狀態及其退出控件 | — |
| [`ui-settings-plugins/`](ui-settings-plugins/README.zh.md) | 負責「插件」設置分區、其標簽頁擴展點與可配置的宿主平面插件卡片 | — |
| [`ui-user-questions/`](ui-user-questions/README.zh.md) | 展示 agent 請求的交互式問題 | — |
| [`ui-agent-preset/`](ui-agent-preset/README.zh.md) | 選擇會話的 agent 預設并編寫預設組合 | — |
| [`ui-settings/`](ui-settings/README.zh.md) | 承載設置界面及其擴展區域 | — |
| [`ui-settings-general/`](ui-settings-general/README.zh.md) | 提供常規設置分區 | — |
| [`ui-settings-models/`](ui-settings-models/README.zh.md) | 提供模型提供方配置與 DeepSeek 引導 | — |
| [`ui-settings-plugin-inventory/`](ui-settings-plugin-inventory/README.zh.md) | 向「插件」設置貢獻只讀的 Host Loader 清單標簽頁 | — |
| [`ui-deliverables/`](ui-deliverables/README.zh.md) | 生成已產出文件的輪次尾部與可點擊的最終響應文件引用 | — |
| [`ui-message-feedback/`](ui-message-feedback/README.zh.md) | 反饋界面：助手消息操作條中的逐消息贊踩，以及點贊、點踩與 `/feedback` 背后的反饋彈窗 | — |
| [`ui-directory-picker-browse/`](ui-directory-picker-browse/README.zh.md) | 面向工作區目錄流程的應用內目錄瀏覽界面 | — |
| [`ui-directory-picker-native/`](ui-directory-picker-native/README.zh.md) | 驅動宿主 OS 選擇器的原生目錄選擇界面 | — |
| [`ui-open-in-app/`](ui-open-in-app/README.zh.md) | 在已安裝應用中打開工作區目錄的會話標題欄拆分按鈕 | — |

-----

<a id="related-documentation"></a>
## 相關文檔

先從子系統參考與兩份擁有跨包組合決策的 Agent Note 讀起，再看服務于本頁的宿主半側。

- [客戶端模塊子系統](../../docs/subsystems/client-modules.zh.md)——web 插件表：`dsh.client` 聲明、啟動圖協議與 bundle 路由。
- [slot 系統標準](../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.zh.md)——權威 slot 模型：注冊、props 份額與存儲。
- [web 客戶端架構 Agent Note](../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.zh.md)——加載鏈、對象層與客戶端服務。
- [宿主組地圖](../host/README.zh.md)——服務于本瀏覽器半側的宿主半側。

<a id="dev-note"></a>
## 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
