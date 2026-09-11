---
description: "基于 waterfall 的問答服務，用于工具、權限插件、本地 answerer 與 Agent-scoped Web 交互。"
kind: "package-reference"
---

# @deepseek-ai/dsh-user-questions

[English](README.md) | 中文

## 概述

用戶交互 Service Definition。它定義 `ctx.userQuestions`，供面向模型的工具或權限插件在需要暫停工作并詢問人類決定時使用。當消費方必須暫停操作并等待用戶回答時，請使用它。

## 目錄

- [服務：`UserQuestionService`（ctx 鍵：`userQuestions`）](#service-userquestionservice-ctx-key-userquestions)
- [職責](#role)
- [模型體驗](#model-experience)
- [已知限制與暫緩事項](#known-limitations-and-deferred-work)
- [開發備注](#dev-note)

-----

<a id="service-userquestionservice-ctx-key-userquestions"></a>
## 服務：`UserQuestionService`（ctx 鍵：`userQuestions`）

### 公開 API

- `ctx.userQuestions.ask(request): Promise<AskUserQuestionAnswer>` 派發回答者 waterfall，并等待首個被接受的回答。

### 關鍵類型

- `AskUserQuestionRequest`：`{ questions: [{ id, question, detail?, header?, options?, multiSelect?, intent? }], agent?, signal? }`；`detail` 提供輔助文本，提供方會將其隨問題一起渲染，而不會將其變成選項標簽。如提供 `agent`，它必須與注冊表中的存活運行時根 agent（智能體）是同一對象。
- `AskUserQuestionOption`：`{ label, description? }`。
- `AskUserQuestionIntent`：`{ kind: 'plan-review', approve }`；即下文的帶標簽呈現意圖。
- `AskUserQuestionAnswer`：`{ answers: [{ id, selected, custom? }] }`。
- `UserQuestionError`：`HarnessError` 的子類，包含 `EMPTY_QUESTIONS`、`BAD_INTENT`、`NO_PROVIDER`、`ASK_ABORTED`、`CALLER_NOT_LIVE` 和 `DELEGATED_CALLER` 等代碼。

對于單選題，`custom` 會覆蓋選中的選項，且 `selected` 為空。對于多選題，`custom` 可以補充 `selected` 中的標簽。UI 可以把跳過的條目保留為 `{ id, selected: [] }`，既維持現有回答形態，也保留該批次中的其他回答。

請求包含 agent 時，`ask()` 會通過當前 `AgentRegistry` 驗證該 agent 與注冊表中的存活實例是同一對象，并且只允許運行時根調用。持久譜系不構成權限依據：帶有歷史委托深度的會話恢復為新的運行時根后可以提問；歸屬于另一個 agent 的存活子級即使持久化記錄的委托深度為零也會被拒絕。Web 回答者只接收帶 Agent scope 的請求；不含 agent 的程序化請求仍會交給本地未限定 scope 的 waterfall listener，若無人接受則以 `NO_PROVIDER` 失敗。

### 呈現意圖

`intent` 聲明某個問題本身就是一種已知決策，因此認識該標簽的 UI 可以照此呈現——`plan-review` 表示 `detail` 是一份待審閱的計劃，`dsh-plan-mode` 會在 `exit_plan_mode` 的問題上設置它。意圖只改變呈現：遵循它的 UI 回答的仍是通用 UI 會發送的那些選項標簽，不認識該標簽的 UI 渲染通用選項列表，因此調用方兩種情況下讀到的回答字段相同。`approve` 指名表示批準的標簽，而不依賴選項順序。有兩項斷言無法通過類型表達，`ask()` 會以 `BAD_INTENT` 拒絕它們：`approve` 未命中該問題自身的任一選項，以及意圖落在沒有 `detail` 的問題上——而 `detail` 正是它自稱在審閱的東西。

<a id="role"></a>
## 職責

這是 Service Definition 包。`@deepseek-ai/dsh-tool-ask-user` 等 Consumer 依賴此服務；Web Client 通過 Remote Events 貢獻帶 Agent scope 的回答者。循環保持不變：工具調用等待 waterfall 結果，該結果隨后恢復正常的 agent loop（智能體循環）。

<a id="model-experience"></a>
## 模型體驗

間接地，通過 `dsh-tool-ask-user`：它會將成功回答保留為緊湊 JSON，或返回以下失敗之一：`Error: ask_user_question was aborted before the user answered`、`Error: ask_user_question requires at least one question`、`Error: human interaction requires the exact live calling agent when an agent is supplied`、`Error: human interaction is unavailable while the calling agent is owned by another live agent; include the unresolved question or decision in the child agent's final result`、`Error: no user-questions answerer accepted the request` 或 `Error: <message>`。等待人類回答不會增加 token。

#### KV Cache 影響

不會直接使 KV Cache 失效；請求前綴的任何變更均由上述消費方負責。

## 已知限制與暫緩事項

<a id="known-limitations-and-deferred-work"></a>

- **帶 Agent scope 的 Web 回答**：Remote Events 僅在請求帶有存活 Agent scope 時路由隨產品交付的 Web 回答者；agentless 調用方需要本地未限定 scope 的 waterfall listener。
- **詞匯僅包含問題表單形態**：可供選擇的選項加可選的自定義文本；更豐富的交互形態（文件選擇器、diff 預覽確認）尚無 seam 詞匯。


<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。answerer waterfall 按請求解析并把結果直接返回調用方；該 seam 不發布獨立的請求／回答審計流。
