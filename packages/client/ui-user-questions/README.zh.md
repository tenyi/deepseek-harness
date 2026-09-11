---
description: "dsh Web 客戶端的 ask_user_question 功能：接管編輯器的提問 UI 與 plan-review 審批卡片。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-user-questions

[English](README.md) | 中文

## 概述

當 agent（智能體）在 Web 客戶端中提問時，本包會用交互式提問界面接管聊天編輯器。用戶可以在問題之間導航、選擇一個或多個選項、輸入自定義答案、跳過問題，并提交一批結構化答案。選擇單選項后會立即前進，而草稿會在當前頁面的生命周期內跨會話導航保留。若唯一的問題聲明了受支持的呈現意圖，則可使用專用界面，包括帶 `Chat about it`、`Refuse` 和 `Approve` 操作的 plan-review 卡片。

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

當 agent 提問時，編輯器變成提問界面：回答每個問題、用翻頁器導航，或跳過它。選擇單選選項后會立即前進；Enter 繼續流程，并在所有問題均已回答或跳過后提交，而 Shift+Enter 改為換行（IME 組合輸入期間按 Enter 只會確認輸入候選，不會前進）。

### 作答

用戶打開或編輯自定義答案時，多選題草稿會保留已選中的標簽，因此提交項可以同時攜帶 `selected` 與 `custom`；單選題的自定義答案仍保持互斥。問題詳情復用助手輸出的 `MarkdownText` 原語，包括其 GFM 渲染與不受信任內容策略。限高卡片保持標題、導航與提交動作固定，超長的詳情與選項共享內部滾動區。「跳過此問題」會保留其他草稿，并為該項發出既有的空 `{ selected: [] }` 結果；關閉則以 `ASK_CANCELLED` 拒絕整個等待。

### plan-review 卡片

`plan-review` 意圖——由 `dsh-plan-mode` 在 `exit_plan_mode` 審閱上設置——渲染等待審批卡片的布局：一條 `Plan review` 條帶、計劃作為可滾動的 markdown 主體，以及一行 `Chat about it` / `Refuse` / `Approve` 的決定操作。Approve 與 Refuse 用提問方自己的選項標簽回答；`Chat about it` 以 `ASK_CANCELLED` 拒絕該等待，讓編輯器歸位，用戶可以直接說出他想說的話。

### 失敗與恢復

通用提問流程把當前題號、已選標簽、自定義文本和顯式跳過狀態保存在非持久化 slot 存儲中；該存儲歸屬對應會話，并以待處理請求的本地渲染標識為鍵。從會話 A 切換到 B 會重新掛載嚴格的會話級編輯器條目，但返回 A 時會復用 A 的存儲并恢復未完成草稿。不同的請求標識讀取空草稿，并在首次編輯時替換舊值；成功回答或取消會清除相符的值。請求是否仍在等待由主機保持權威。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本包是一條歸屬規則：渲染提問是宿主的 UI 能力，擁有該工具則是 agent 的能力，因此 `tool-ask-user` 行屬于需要它的各個 preset（以及沒有 preset 的 TUI 組裝）。

### 意圖界面選擇

卡片只在能夠發出該請求允許的每一個答案時才接管：只有一個問題、聲明了意圖、計劃以 `detail` 存在、提供了被指名的批準標簽，且是二元單選（除批準外最多一個選項，且非多選）。其他任何情形都留在能夠表達它的通用流程上。意圖改變的只是布局，從不改變可達的答案。

### 文案與 locale

編輯器外框文案（翻頁器、按鈕、占位符、校驗提示）是雙語的：插件在 `dsh-client-locale` 的 `question` 命名空間下注冊 zh/en 詞典，并通過 inject face 把綁定的翻譯函數和 locale 快照源交給該條目，因此切換語言會重新渲染已掛載的編輯器。問題與選項文本來自模型并原樣渲染；載體失敗消息也不經翻譯直接顯示。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

以下頁面覆蓋編輯器宿主、工具 seam 與 plan-mode 消費方。

- [ui-conversation](../ui-conversation/README.zh.md)——擁有 `conversation.composer` 鏈的聊天界面。
- [tool-ask-user](../../interaction/tool-ask-user/README.zh.md)——面向模型的工具；本 UI 會渲染其 schema 與答案。
- [ui-plan](../ui-plan/README.zh.md)——設置 `plan-review` 意圖的 plan-mode 界面。
- [user-questions](../../interaction/user-questions/README.zh.md)——Host 側提問 seam 及其應答方 waterfall（瀑布式事件）。

-----

<a id="model-experience"></a>
## 模型體驗

間接影響模型體驗：本包在 Web 客戶端呈現 `dsh-tool-ask-user` 所擁有的模型可見 schema 與答案渲染。

#### KV Cache 影響

不會直接失效；模型可見的工具調用與結果由 `dsh-tool-ask-user` 擁有。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制定義草稿持久性與編輯器歸屬；它們是當前包約束。

- **未提交草稿的生命周期限于當前頁面與會話**：只要該會話作用域仍留在頁面內，會話導航就會保留草稿；完整刷新頁面、會話被裁剪，或待處理請求以新的本地標識重新交付時，則從空草稿開始。存儲從不把草稿寫入主機、`localStorage` 或磁盤。
- **每次只有一個請求擁有編輯器**：后續待處理請求仍留在會話快照中，并在較早請求落定后顯示。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。工具與 slot 注冊都是由各自注冊表持有和觀察的 effect；Host 待處理表通過公開的 wire protocol 測試。
