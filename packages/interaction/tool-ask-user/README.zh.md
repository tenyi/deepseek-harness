---
description: "基于 user-questions seam 的模型側 ask_user_question 工具；供組合或排查交互式 agent（智能體）表面的用戶與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-ask-user

[English](README.md) | 中文

## 概述

`ask_user_question` 讓模型暫停工作，向用戶請求確認、選擇或缺失的信息。它接受一個或多個問題，并以緊湊 JSON 返回回答。調用會等待回答被接受或當前輪次被取消；如果沒有回答處理器接受請求，模型會收到錯誤。歸屬于運行時其他 agent 的子級不能調用此工具，必須在最終結果中報告尚未解決的問題。本包不渲染界面或收集輸入，因此調用方必須提供兼容的用戶交互表面。

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

凡模型應當能夠暫停等待人類決定的場景，都可組合此插件：它提供 `ask_user_question` 工具，并且需要帶有接受作用域請求的 answerer 的 `ctx.userQuestions` seam。沒有 answerer 接受時，工具調用會以錯誤失敗，而不是降級。

### 何時調用該工具

當模型需要確認、選擇結果或缺失的信息才能繼續時，調用 `ask_user_question`。發送一個或多個問題，每個問題攜帶穩定的 `id`（回答中會原樣包含）；推薦選項放在首位，并在標簽末尾追加 `(Recommended)`。

```json
{
  "questions": [
    {
      "id": "cleanup",
      "question": "Proceed with the destructive cleanup?",
      "header": "Confirm",
      "options": [
        { "label": "Yes, delete them (Recommended)", "description": "Removes the three stale files." },
        { "label": "No, keep them", "description": "Aborts the cleanup." }
      ]
    }
  ]
}
```

### 模型得到什么

工具為每個問題返回一個回答對象：`selected` 保存選中的選項標簽，`custom` 攜帶自由填寫的回答——對多選題補充 `selected`，對單選題覆蓋它。Native 渲染器保留緊湊的 JSON 文本形式。

```json
{ "answers": [{ "id": "cleanup", "selected": ["Yes, delete them (Recommended)"] }] }
```

### 調用何時失敗

工具調用會阻塞到用戶作答，并且只能通過當前輪次的信號取消。沒有 answerer 接受、調用被中止、或調用方不是確切的存活運行時根，都會以模型在工具結果中看到的錯誤結算——最值得注意的是，歸屬于另一個 agent 的存活子級會被拒絕（`DELEGATED_CALLER`），必須在最終結果中包含尚未解決的問題或決定。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

可觀察行為已在[使用本包](#use-this-package)中說明；本節解釋工具定義及其與 seam 的關系。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 工具注冊：`ask_user_question` schema、執行路徑、結果渲染 |
| — | 不發布運行時不變式伴生入口；此模型側適配器沒有獨立的生命周期流；執行關系由其調用的能力 seam 負責。 |

### 消費方角色

該插件以 `['tools', 'userQuestions']` 注入，在 `ctx.tools` 上注冊一個 `defineTool` 條目。`execute` 把模型參數映射為 `AskUserQuestionRequest`，轉發確切的調用 agent 與當前輪次的信號，并把接受的回答映射回規范的 `answers` 數組。身份檢查、意圖校驗、waterfall（瀑布式事件）分派與錯誤分類由 seam 擁有；本包只做轉換。

### 結果渲染

`render` 輸出把結構化值經 `JSON.stringify` 投影為單個文本塊，因此模型側結果是緊湊 JSON，而非更豐富的內容塊詞匯。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從工具表面逐步進入 seam 約定及其 answerer waterfall。

- [用戶交互子系統參考](../../../docs/subsystems/user-questions.zh.md)——此工具背后的服務約定、問題詞匯與 answerer waterfall。
- [工具目錄](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-ask-user)——生成的 `ask_user_question` schema。
- [user-questions 包](../user-questions/README.zh.md)——本工具消費的 seam。
- [交互組映射](../README.zh.md)——相鄰的審批與命令表面。

-----

<a id="model-experience"></a>
## 模型體驗

### 工具 schema

#### 模型看到的內容

模型會看到生成的 [`ask_user_question` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-ask-user)，其中包含問題 id、提示語、標題、選項與多選標志。

#### Token 影響

工具可見時，每個請求都會產生固定的 schema token 開銷。

#### KV Cache 影響

只要定義和可見性保持不變，前綴即可穩定復用。插件生命周期變化或作用域限制可能會使從此 schema 起的緩存復用失效。

### 工具調用歷史與結果

#### 模型看到的內容

模型提出的完整問題保留在 assistant 工具調用參數中。用戶回答后，下一步會看到精確采用 `{"answers":[{"id":"<id>","selected":["<label>"],"custom":"<text>"}]}` 形式的緊湊 JSON；不使用 `custom` 時會省略該字段，`selected` 可以包含零個、一個或多個標簽。調用等待期間的 UI 交互不屬于模型上下文。

#### Token 影響

參數和回答 JSON 是依數據而定的保留 token；等待用戶時不會產生 token 開銷。

#### KV Cache 影響

僅追加；新出現的可見內容位于可復用請求前綴之后，不會使現有 KV Cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明該工具何時不合適。它們是當前包約束，不是 UI 積壓事項。

- **待處理問題會阻塞工具調用，直至用戶作答**：該工具未聲明 `timeout-policy` 預算；取消僅沿用當前輪次的 `exec.signal`。
- **運行時中歸屬于其他 agent 的 subagent 不能向用戶提問**：`ask_user_question` 會以 `DELEGATED_CALLER` 拒絕歸屬于另一個 agent 的存活子級；該子級必須在最終結果中包含尚未解決的問題或決定。持久譜系不能決定這一邊界，因此帶有譜系的會話恢復為運行時根后可以正常提問。
- **Native 回答渲染為 JSON 文本**：規范值仍為結構化數據，但模型側結果使用緊湊 JSON，而非更豐富的內容塊詞匯。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
