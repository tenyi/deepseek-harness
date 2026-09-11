---
description: "Web 反饋界面：已定稿助手消息動作行中的 Like/Dislike 對、兩種評分與 `/feedback` 共用的反饋彈窗，以及確認和失敗 toast；供反饋體驗的用戶與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-message-feedback

[English](README.md) | 中文

## 概述

本包是 Web GUI 的反饋界面：已定稿助手消息動作條中的 Like/Dislike 對、輸入框浮層中的反饋彈窗及其確認與失敗 toast，以及讓不帶文本的 `/feedback` 打開彈窗的裝飾。點贊和點踩都會打開彈窗，先收集分類與可選描述，再記錄所選評分。每個 Session 一個 surface 支撐所有條目，因此一次列表讀取即可填充整段對話，一個彈窗同時服務 Session 與其消息。評分、分類與備注是僅寫日志的 Session 事件，絕不進入模型上下文。

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

與 `ui-conversation`、`ui-commands` 一起掛載本插件；Like/Dislike 對隨即出現在每個輪次收尾助手消息的動作行中，位于復制與分支之間，輸入框菜單里的「反饋」行則打開彈窗。已記錄的評分顯示實心圖標，不需要懸停也一直可見。點贊和點踩都會打開彈窗：七個分類標簽和一個詳情框都可不填；提交后才會記錄帶所填內容的對應評分并彈出感謝 toast，對話日志隨每個反饋事件一起投遞。再次點擊已記錄的評分會直接撤回，不打開彈窗。不帶文本的 `/feedback`，無論是從菜單選中還是直接輸入后發送，都會為 Session 打開同一個彈窗；`/feedback <text>` 仍走宿主命令路徑并顯示確認行。

### 失敗

評分或列表加載失敗在行內展示；提交失敗通過警告 toast 展示，彈窗保持打開以便修正草稿。只有已定稿的消息能到達消息條目——被中斷凍結的部分輸出不帶 `messageId`，因此沒有反饋控件。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本包貢獻 `conversation.chat.assistant-actions` 的 `feedback` 條目（order 10），由 ui-conversation 聲明并渲染在已定稿助手消息的 IconActions 行內；同時貢獻 `conversation.input.overlay` 的 `feedback-dialog` 條目（order 2），它通過 body portal 渲染 Modal 與 Toast 基元，并讓 toast 以其所在的輸入框卡片為中心。`/feedback` 裝飾是經 `ctx.commandUi.decorate` 注冊的 `action`，因此菜單選中或不帶參數的回車會消費觸發 token 并打開彈窗，而帶參數的命令行仍到達宿主命令。

每個 Session 有一個 `MessageFeedbackController` 支撐所有消息控件，以及一個 `FeedbackDialogController` 擁有彈窗草稿、提交與 toast 序號。消息控制器只讀取一次 `messageFeedback.list`，且延遲到首次 hover 或 focus 才發起，而非掛載時觸發；變更串行執行，每次都攜帶最后觀察到的版本，`version-conflict` 響應帶回權威條目，據此對賬視圖而不重新拉取。任一評分操作執行前，該行都會檢查已提交條目：評分相同則調用 `retract`，它會在串行隊列內重新檢查評分并在并發變更后變為無操作；其他狀態則攜帶所選評分打開彈窗。彈窗控制器按目標提交：消息目標通過消息控制器 put 一條帶彈窗備注與分類的對應評分，Session 目標通過 `ctx.remote.sessionFeedback` 記錄。成功會關閉草稿并彈出確認 toast；被替換的舊草稿遲到的成功只彈確認 toast、不關閉新草稿；失敗會保留彈窗并彈出停留時間更長的警告 toast。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當反饋界面不夠用時閱讀以下頁面。它們從瀏覽器條帶進入 Session 日志后端與會話外殼。

- [dsh-message-feedback](../../feedback/message-feedback/README.zh.md)——擁有按條目比較并交換與持久化的 Session 日志后端。
- [dsh-command-feedback](../../feedback/command-feedback/README.zh.md)——`/feedback` 命令、`sessionFeedback` Remote 與分類表。
- [ui-commands](../ui-commands/README.zh.md)——`/feedback` 行所經過的命令裝飾約定。
- [ui-conversation](../ui-conversation/README.zh.md)——聲明助手動作條與輸入框浮層。
- [客戶端包映射](../README.zh.md)——相鄰的瀏覽器 UI 包。

-----

<a id="model-experience"></a>
## 模型體驗

無。評分、分類與備注是僅寫日志的事件，不是模型輸入。可選的 Session 日志投遞使用請求元數據，而非模型上下文。

#### KV Cache 影響

無；反饋變更不改變模型可見的歷史。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制界定了當前反饋界面。它們是當前包約束，不是通用評分對比或任務積壓。

- **備注大小是宿主策略**——部署方配置 `maxNoteBytes`（Web bundle 中為 8192），超長備注由宿主以 `note-too-large` 拒絕。彈窗不預先校驗該上限，因此針對消息的超長描述在提交時才失敗，而不是在輸入過程中；Session 級備注沒有上限。
- **無跨標簽頁推送**——另一個標簽頁的評分要等到重連或下一次沖突響應才可見，不會立即出現；控制器不消費反饋日志事件。
- **僅限對話視圖**——trajectory 與 waterfall 視圖不渲染反饋控件，盡管它們的助手節點也帶有相同的 `messageId`。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。插件持有兩個 slot 注冊、一個命令裝飾，以及一個按 Session 劃分的控制器對 map；它們都由插件 fiber 的同一個 effect disposer 釋放。生命周期規格測試證明，所屬 fiber 釋放時會撤銷所有注冊并丟棄所有控制器，因此不存在需要在運行時檢查的第二權威來源。
