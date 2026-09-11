---
description: "交互式 UI 的面向用戶斜杠命令注冊表：插件擁有的命令直接針對 agent（智能體）執行，不產生模型消息；供組合或擴展命令面的用戶與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-commands

[English](README.md) | 中文

## 概述

`dsh-commands` 讓用戶能在交互式 Harness UI 中運行 `/command [input]` 操作，且不會把命令或結果變成模型消息。命令可以展示輸入提示、接受附件，并只針對一個 agent 生效，同時為其他 agent 保留同名的全局命令。每次通過準入的執行都會記錄到接收 agent 的會話日志中，UI 則在模型歷史之外渲染結算結果。它適合為 `dsh` CLI（命令行界面）或 Web 客戶端提供直接面向用戶的控制；無 UI 的演示與 ACP（Agent Client Protocol）自動化不提供此命令面。

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

當交互式 UI 希望用戶用斜杠命令而非模型提示詞驅動 agent 側行為時，組合此服務。無 UI 的演示主干和 ACP 自動化不提供命令適配器，也不需要它。

### 注冊命令

插件通過 `ctx.commands.register()` 注冊命令，提供小寫名稱、發現界面中的說明、可選的 `input` 提示和處理器。可選的品牌類型字段 `definitionId` 為適配器提供帶插件命名空間的穩定定義標識，它獨立于顯示文案和每次執行的 `commandId`。有效描述符只攜帶被選中定義的標識，作用域覆蓋不會繼承被遮蔽注冊項的標識。

```text
ctx.commands.register({
  name: 'plan',
  description: 'Enter plan mode',
  input: { hint: '<message>' },
  handler: ({ agent, rawInput }) => {
    // Runs directly against the agent; no model message is created.
    return { kind: 'success', text: 'plan mode selected' }
  },
})
```

處理器返回 `success` 或 `error`，并可附帶由適配器渲染的 UI 文本。`recordInput` 默認為 true；若載荷由命令自己的權威領域事件持有，命令會將 `recordInput` 設為 false，避免會話日志重復記錄該輸入。同一作用域內重復注冊同名命令會拋出異常。

### 命令語法

命令行的第 0 字節必須是斜杠，隨后是小寫名稱（可含字母、數字、`_` 或 `-`），再之后是輸入末尾或空白。名稱之后的每個字節——包括分隔空白——都是該命令的 `rawInput`，命令自己擁有其專屬語法。不符合命令語法、或名稱未知的行會被適配器拒絕，而不是變成模型提示詞。

### 限定到 agent 的命令

普通注冊全局生效。掛載在 agent 自身上下文之下的命令生產插件會聲明 `commands` 注入，并注冊精確限定到該 agent 的命令；該定義只對這個 agent 遮蔽同名的全局定義。

### 附件

命令可以聲明 `input.attachments` 以接受 composer 圖片與通用文件。執行器負責強制執行聲明：把附件發給未聲明的命令、附件存儲缺失、會話范圍內的文件上傳憑證未知或圖片批量超出限制，都會在處理器運行前以錯誤結果結算。圖片以 base64 輸入通過命令 wire，通用文件則引用后臺上傳完成后得到的憑證，因此命令提交不會再次讀取文件字節。通過準入的 `ImageBlock` 與 `FileBlock` 按用戶選擇順序組成凍結的 `invocation.attachments` 數組，其模型可見用途由處理器負責。

### 從適配器分派

交互式適配器調用 `execute(agent, line, attachments, signal)`，傳入確切的接收 agent、完整命令行與本次提交的有序附件。它返回已結算的 `CommandExecution`——規范化結果加生命周期配對 `commandId`——語法無效或名稱未知時返回 `undefined`。`list(agent)` 與 `find(agent, name)` 在應用 agent 作用域遮蔽后用于命令發現。

### 取消

調用方的中止信號會讓注冊表停止等待處理器；無視信號的處理器可能在調用方停止等待后繼續產生自身的外部副作用。被取消或拋異常的處理器在日志中以 `command/done` 錯誤結算。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

可觀察行為已在[使用本包](#use-this-package)中說明；本節解釋注冊表的構建方式與其約定的歸屬。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | `CommandRuntime` 服務：注冊、作用域、分派、生命周期事件 |
| [`src/types.ts`](src/types.ts) | 命令定義、描述符、執行與結果類型 |
| [`src/brand.ts`](src/brand.ts) | 穩定命令定義標識和每次執行的生命周期 id |
| [`src/invariant.ts`](src/invariant.ts) | 不變式伴生插件：按會話日志配對 `command/run` 與 `command/done` |

### 生命周期事件

`execute()` 會生成一個 `commandId`，在處理器運行前追加 `command/run`，并在結算時追加攜帶結果類型與原樣文本的 `command/done`；確切載荷字段見 [`src/index.ts`](src/index.ts)。成功結果可以通過 `sourceEventSeq` 指向更早的一條非命令權威領域事件；處理器拋出或被中止時以 `kind: 'error'` 結算。兩個事件都作為僅用于日志的事件直接獨立追加：沒有輪次包裹它們，持久化機制會在常規檢查點和銷毀期間排空這些事件。未通過準入的輸入（語法無效或名稱未知）不記錄任何事件。

### 作用域

注冊表通過 `ScopedLayers` 維護全局層與按 agent 的作用域層，并按 agent 合并視圖。子級注入形態——掛載在 `agent.ctx` 之下的命令生產插件聲明自身的 `commands` 注入——保留了 agent 作用域，同時不會讓核心 agent loop（智能體循環）依賴 UI 服務。同一層內的名稱重復會在注冊時失敗；注冊或移除命令時，系統會通知每個 `commands/change` 觀察者，使運行中的適配器能夠刷新發現結果。觀察者失敗會寫入日志，既不能否決注冊表變更，也不能阻止后續觀察者運行。

### 附件準入

附件強制執行發生在執行器中：圖片經 `admitEncodedImages` 提交，文件通過唯一的會話感知憑證提供方解析，執行器在調用處理器前恢復原始混合順序。驗證拒絕不會開始寫入附件。圖片存儲失敗可能留下等待清理且無法引用的內容尋址對象，但不會發布模型可見消息。取消會在處理器運行前生效。命令返回錯誤時，分發方 composer 的草稿與附件卡保持原位。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從共享命令詞匯逐步進入設計證據與相鄰表面。

- [命令子系統參考](../../../docs/subsystems/commands.zh.md)——注冊表語義、輸入元數據與 `ctx.commands` 的 Cordis 接口面。
- [命令注冊 Agent Note](../../../.agents/notes/implemented/feature/2026-07-19-plugin-command-registration.zh.md)——此服務背后的邊界與分發約定。
- [交互組映射](../README.zh.md)——相鄰的審批、權限與問答包。
- [Plan mode 包](../../plan/plan-mode/README.zh.md)——一個驅動模型可見工作的已交付命令生產方。

-----

<a id="model-experience"></a>
## 模型體驗

### 直接面向用戶的命令

#### 模型看到的內容

注冊表自身不會提交任何內容。已知斜杠命令在 UI 命令平面執行，其 `CommandResult` 文本不會作為用戶消息提交。已交付的適配器會拒絕未知斜杠命令輸入，而不是將其變成模型提示詞。命令生產方可以顯式使用接收命令的 `Agent`；例如，[`dsh-plan-mode`](../../plan/plan-mode/README.zh.md#model-and-human-interactions)在選擇 plan mode 后，會提交 `/plan [message]` 中的可選消息與有序附件。執行器只負責把附件準入為持久化對象，是否以及如何成為模型可見消息由聲明接受的生產方決定。

#### Token 影響

命令發現、執行和 UI 輸出不會增加模型 token。命令生產方顯式安排的 agent 工作與相應 agent 輸入具有相同的 token 影響。

#### KV Cache 影響

注冊表元數據、命令輸入和直接輸出絕不會進入模型請求，也不會影響其緩存。發生變更的領域負責之后產生的所有緩存影響。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明注冊表不提供什么。它們是當前包約束，不是 UI 積壓事項。

- **僅支持非結構化文本輸入**：表單、補全 schema 和類型化參數仍由各命令自行解析。
- **副作用采用協作式取消**：中止后，分發會停止等待；處理器必須遵循信號，才能停止已經進入外部系統的工作。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
