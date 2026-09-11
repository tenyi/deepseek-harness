---
description: "dsh Web 客戶端的持久化工作流運行 Conversation Node：把頂層工作流運行重建為帶嵌套成員折疊的獨立聊天節點。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-workflow-run

[English](README.md) | 中文

## 概述

使用 `dsh-client-ui-workflow-run` 可以把每個持久化的頂層工作流運行作為獨立 Chat 節點查看。展開運行可查看階段，展開階段可查看成員；運行中、失敗、已取消與已中斷的層級默認展開，已完成層級保持折疊。只有當運行中的成員屬于當前會話且可在本地訪問時，才能打開其子會話。節點只顯示身份與狀態；腳本、輸出、錯誤、日志、用量、拓撲與控制操作不屬于本界面。

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

經 `dsh-tool-workflow` 發起的頂層工作流運行會在對話中顯示為獨立節點：展開運行查看其階段，展開階段查看其成員。階段組只來自開始過的成員；成員結算只改變狀態，不刪除或重排成員。

### 導航節點

運行使用 32 像素行，帶常駐 chevron、行內狀態點與狀態文字；階段使用 disclosure 行，在主區顯示標題與成員數、在固定尾部顯示聚合狀態；成員使用 16 像素狀態點槽、會截斷文本的名稱區與固定狀態列。打開成員的子會話需要成員仍在運行、子 id 位于普通會話列表、列表行為 `origin: 'subagent'`、`parentId` 等于當前會話，且列表行仍標記運行——遠程、僅地址化、父級不符或終態的行都不可交互。

### 狀態與完成

完成狀態會立即更新，但只要焦點仍位于展開內容內，自動折疊就會等待焦點離開。若所屬輪次或步驟已關閉但終點事件缺失，界面把相應運行或成員顯示為已中斷，而不改寫工具結果。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

節點是持久化會話事件的確定性回放：`tool-workflow/run-start` 以 `runId` 創建唯一上下文，成員開始、成員結束與運行結束事件按日志順序更新該上下文。只有 update 的歷史尾頁會保持 pending，直到更早頁面補入唯一 start；此后 prepend、完整回放與實時 append 得到相同狀態。

### 展開選擇

普通運行更新保留當前選擇，首次進入異常狀態時僅自動展開一次，正常完成時僅自動折疊一次；已完成階段在同一 phase key 下有新的成員開始運行時，該階段與外層運行會再次自動展開。若一次全新的正常周期在同一次渲染中完整到達，而運行仍處于活動狀態，該階段最終保持折疊，但外層運行會自動展開一次，以展示更新后的摘要。階段選擇由 `WorkflowRunPanel` 持有，因此關閉并重新打開外層運行不會重置這些選擇；renderer remount 會根據持久化事實重建每層的初始選擇。

### 裝配

本包把 Definition、locale 字典與 `workflow-run` renderer 都注冊為 Cordis effect；移除客戶端 entry 會撤銷三者。shipped Web bundle 在 `ui-conversation` 與 `ui-tool` 之后裝配該插件。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

以下頁面覆蓋工具 seam、對話宿主與工具展示層。

- [tool-workflow](../../workflow/tool-workflow/README.zh.md)——擁有四類 `tool-workflow/*` 會話事件的工具。
- [ui-conversation](../ui-conversation/README.zh.md)——承載 `conversation.chat.node` slot 的聊天界面。
- [ui-tool](../ui-tool/README.zh.md)——本節點相鄰的工具調用展示層。
- [Conversation 子系統](../../../docs/subsystems/conversation.zh.md)——業務自有功能如何注冊 Conversation node。

-----

<a id="model-experience"></a>
## 模型體驗

無。該包是瀏覽器端 UI 插件層，只渲染持久化工作流記錄，不改變模型上下文。

#### KV Cache 影響

無；該包既不組裝也不發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制定義哪些運行會產生記錄、節點暴露什么；它們是當前包約束。

- **只有經 `dsh-tool-workflow` 發起的頂層調用會生成這些記錄**：嵌套 PTC mode 調用和直接 `WorkflowEngine` 消費方不會生成。
- **導航刻意只面向實時運行**：終態成員繼續保留供復盤，但本節點永不為其提供冷會話入口。
- **節點只顯示運行、階段、成員身份與狀態**：腳本、輸出、錯誤、日志、用量、靜態拓撲與控制操作都不屬于本界面。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。瀏覽器插件只貢獻由 effect 持有的 Conversation Definition、keyed renderer 與 dictionary；測試證明資源釋放時會撤銷這三項貢獻；Host tool 包負責持久事件不變式。
