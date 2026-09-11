---
description: "共享進程內 subagent 運行驅動器，供維護者與后端作者理解或擴展 spawn 與 fork 的運行生命周期。"
kind: "package-library"
---

# @deepseek-ai/dsh-subagent-in-process-driver

[English](README.md) | 中文

## 概述

`dsh-subagent-in-process-driver` 是兩個進程內 subagent 后端共用的運行驅動器：它通過宿主的 agent（智能體）工廠創建一個子 agent，應用按子 agent 的定制，把一項任務驅動到完成，并以單一完全停穩的 dispose（資源釋放）路徑返回子 agent 自身的最終輸出。spawn 調用它時不傳入會話初始內容；fork 調用它時傳入父級已完成輪次的前綴。它是庫而非獨立功能：提供方后端調用 `startInProcessRun`，組合中沒有任何東西配置它。閱讀本頁可理解兩個進程內后端共享的運行生命周期。

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

你通過提供方后端而非組合到達本包：`dsh-subagent-spawn-in-process` 與 `dsh-subagent-fork-in-process` 各自調用 `startInProcessRun(request, options)` 并擁有其外圍的一切。本頁記錄兩者共享的生命周期，使你讀懂一個后端的行為后即可推斷另一個。

### 一次運行提供什么

一次調用啟動并驅動一個一次性子 agent。調用兌現意味著子 agent 已發布到 `ctx.agents`，調用方擁有返回的運行；啟動被拒絕時，未發布的創建已經完全停穩，因此不會有創建到一半的子 agent 存活。運行暴露子 agent 的 id 與在線 agent、一個 `result` promise，以及一個 `dispose()`——它會停止循環、移除 agent 與會話，并撤銷作用域內的注冊。

### 唯一輸入

`InProcessRunOptions` 的形態為 `{ seed?: SessionEvent[] }`——fork 的已配平父級事件初始內容。spawn 省略該值；fork 提供已完成輪次前綴并記錄其長度，使結果讀取器不會把作為初始內容的父級消息誤認為子 agent 輸出。

### 子 agent 獲得什么

子 agent 獲得父級的工作目錄／會話譜系，除非 `request.agentOptions` 覆蓋，否則繼承父級的提供方、模型、推理強度與輸出 token 上限。它獲得全新的扁平注冊作用域：父級工具限制與權限不會被導入。一次運行會把父級顯式的沙箱覆蓋項與 `'never'` 審批釘定帶入子 agent，并在子 agent 的初始輪次內追加一份每次運行的描述符。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋驅動器的生命周期約定與結構化輸出運行時；可觀察行為已在[使用本包](#use-this-package)中說明。

### 啟動約定

驅動器按以下順序運行：

1. 校驗父級深度與可選的絕對 `maxDepth`，然后把子級深度推導為父級深度加一，并持久化到子級會話 header。
2. 通過宿主 agent 工廠創建子 agent，并把調用方必需的信號傳入創建事務。
3. 在該事務未發布的設置窗口內，安裝請求的 persona、工具限制與結構化輸出運行時。
4. 發布子 agent，保留返回的句柄，并驅動一項任務。
5. 從完整的自有運行中讀取子 agent 自身的輸出——最后一條非空 assistant 消息，若無則取其累積的 assistant 文本——以及最終持久化的輪次原因，并排除任何 fork 初始內容。

### 取消與所有權

必需的請求信號同時覆蓋啟動階段與實時運行。發布前，創建事務會觀察它、回滾并拒絕；驅動器在發布后再檢查一次以消除交接競態，然后安裝最小化的實時運行監聽器。兌現后，調用方擁有該運行：提供方插件卸載不會撤銷它；`dispose()` 會移除中止監聽器、記錄取消，并委托給句柄經記憶化的完全停穩事務——后者停止循環、移除 agent 與會話，并撤銷作用域內的注冊。取消流程會接管所有尚未完成的進行中結果，并將其報告為 `aborted`；已經完成的輪次仍保持完成狀態。

### 結構化輸出

`attachStructuredRuntime(childCtx, schema)` 會在子 agent 作用域中安裝完整約定：`structured_output` 工具按請求的 schema 校驗并暫存模型值；位于末尾、順序為 9900 的 first-party 系統提示詞段告訴子 agent 該工具調用就是終態答案；`tools/result` 觀察器只在該次執行的權威最終工具結果成功后提交暫存值，包括 PTC mode 子分派外層的 `run_code` 結果；單調工具防護會在捕獲后阻止后續調用。正常結束卻始終未提交必需值的輪次會報告 `error`；驅動器不會重新提示。所有注冊都附著于子 agent fiber，并隨其一同消失。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 運行驅動器：創建、單輪驅動、結果讀取、dispose |
| [`src/structured.ts`](src/structured.ts) | 結構化輸出運行時：捕獲工具、提示詞段、防護、提交 |
| — | 不發布運行時不變式伴生入口；本包沒有獨立事件序列或可變數據關系，相關約定在所屬 seam 強制執行。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面；它們從共享 subagent 模型進入構建于本驅動器之上的后端，以及委派策略決策。

- [Subagent 子系統](../../../docs/subsystems/subagent.zh.md)——啟動請求、結果、提供方約定與進程內深度和初始內容。
- [dsh-subagent-spawn-in-process](../subagent-spawn-in-process/README.zh.md)——構建于本驅動器之上的全新子 agent 后端。
- [dsh-subagent-fork-in-process](../subagent-fork-in-process/README.zh.md)——構建于本驅動器之上的帶初始內容的子 agent 后端。
- [委派策略決策](../../../.agents/notes/implemented/feature/2026-07-25-subagent-policy-inheritance.zh.md)——父級沙箱與審批策略如何到達子 agent。

-----

<a id="model-experience"></a>
## 模型體驗

### 子 agent 請求

#### 模型看到什么

共享驅動器把任務逐字作為子 agent 的用戶消息發送；若有請求，還會在未發布子 agent 的全新作用域中遮蔽 persona，并限制全局工具 schema、查找、執行與 PTC mode SDK 綁定。父級限制不會被繼承。工具指導插件可以使用組裝 scope 省略不可用工具的指導；驅動器不會改寫任意靜態段落。spawn 不提供歷史；fork 提供其已配平的初始內容。

#### Token 影響

子 agent 輸入與父級隔離，并隨子 agent 自身的步驟增長。persona 會改變重復提示詞文本；過濾會改變 schema 或生成 SDK 的成本，使用 scope 的指導內容也會隨可見能力變化。

#### KV Cache 影響

與父級請求緩存相互獨立。子 agent 后續歷史僅追加，而 persona、工具過濾、生成 SDK、提供方或模型變化會建立不同的子 agent 前綴。

### 結構化輸出系統提示詞、schema 與結果

#### 模型看到什么

結構化運行會添加下方的結構化輸出指令，并添加子 agent 作用域的 `structured_output` 定義，其參數使用請求的 schema，精確描述為 `Report your final structured result. Call this exactly once, when your answer is complete; the arguments must match this tool's parameter schema exactly.` 該僅運行時存在的定義不在已生成并隨產品發布的[工具包索引](../../../docs/tool-catalog.zh.md#tool-package-map)中。其規范確認值是 `{ recorded: true }`，渲染為 `Structured output recorded.`；后續調用會變為 ``Error: structured output already recorded: the run is complete, so `<tool>` is not executed``。

##### 結構化輸出指令

```markdown
When you have your final answer, you MUST report it by calling the `structured_output` tool with arguments matching its parameter schema exactly. Do not finish with a plain text answer: only the tool call counts as your result.
```

#### Token 影響

固定指令與能力產生的 token 僅由該子 agent 承擔。結果文本進入子 agent 歷史，而只有捕獲的值會成為父級結果。

#### KV Cache 影響

只要結構化輸出指令與 schema 不變，子 agent 內部的前綴就保持穩定。更改 schema 或能力可能從該早期片段開始使子 agent 緩存失效；結果會分別追加到子 agent 與父級歷史中。

### 父級啟動錯誤（間接）

#### 模型看到什么

通過 `dsh-tool-subagent`，無效深度狀態會精確變為 `Error: agent subagentDepth must be a non-negative safe integer`、`Error: subagent child depth exceeds the safe-integer range` 或 `Error: subagent depth <attempted> exceeds maxDepth <max>`。發布前取消的中止原因會通過注冊表的 `Error: <message>` 包裝傳遞。

#### Token 影響

啟動成功時為零 token；只有失敗的父級工具調用會保留這段文本。

#### KV Cache 影響

僅追加；新增可見內容位于可復用請求前綴之后，不會使現有 KV Cache 條目失效。

### 父級結果（間接）

#### 模型看到什么

驅動器只提取子 agent 自身最后的 assistant 輸出或捕獲的結構化值；作為初始內容的父級消息與子 agent 中間工作不會成為結果。

#### Token 影響

父級通過消費方接收一個依賴數據的結果；其他所有子 agent token 都留在子 agent 會話中。

#### KV Cache 影響

僅追加；新增可見內容位于可復用請求前綴之后，不會使現有 KV Cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明進程內一次性運行不能做什么；它們是當前包約束。

- **運行不公開 `sendMessage`/`resume`**——進程內一次性運行不具備這些可選運行時能力。
- **結構化捕獲只接受 `defineTool` schema 子集**——不支持的 JSON Schema 構造會在子 agent 創建前失敗；需要更廣 schema 詞匯的提供方必須采用不同的運行時。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
