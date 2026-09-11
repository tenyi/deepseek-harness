---
description: "面向用戶與維護者的計劃模式說明：用于選擇、配置或排查帶部署引導、/plan 命令與經用戶評審退出的逐 agent（智能體）規劃功能。"
kind: "package-reference"
---

# @deepseek-ai/dsh-plan-mode

[English](README.md) | 中文

## 概述

計劃模式要求 agent 先探索和設計再執行，然后把完成的計劃呈交你批準。用 `/plan` 進入，并可附帶一條消息或按順序排列的圖片與文件附件；用 `/plan off` 離開，批準評審以繼續執行，或反饋意見以要求繼續規劃。部署方定義的引導控制規劃行為，但每個工具仍然可用，因此請用沙箱模式與審批提示施加強制限制。激活狀態會在會話恢復和 fork 后保留。當你希望 agent 行動前先提交一份經評審的計劃時，選擇計劃模式。

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

計劃模式激活時，agent 會按你的指令行事，并先呈交計劃供評審，而不是立即執行。常用路徑：配置引導文本，用 `/plan` 進入計劃模式，agent 調用 `exit_plan_mode` 時評審完成的計劃。

### 何時選擇

當希望 agent 先探索和設計再執行、并且想先批準計劃時，選擇計劃模式。它不限制 agent：每個工具仍可調用，因此需要強制限制時請使用沙箱模式與審批提示。當 agent 應立即按你的請求行事、無需規劃階段時，跳過它。

### 最小配置

唯一必需的配置是 agent 規劃期間遵循的引導文本；添加任何其他配置都會在加載時失敗。

```yaml
- name: '@deepseek-ai/dsh-plan-mode'
  config:
    section: |
      You are in plan mode. Explore and design before presenting the complete
      plan through exit_plan_mode.
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `section` | 必填 | 計劃模式激活時作為 `plan:policy` 提示詞段落渲染的引導 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-plan-mode)完整列出了所有受支持的字段及其 JSDoc。

<a id="model-and-human-interactions"></a>
### 進入與離開計劃模式

輸入 `/plan` 進入計劃模式，或輸入 `/plan <message>` 連同一條指令一起進入——該消息會成為你在計劃引導下的下一條請求。輸入 `/plan off` 直接離開計劃模式；它還會取消尚未生效的計劃模式進入。

你可以在 `/plan` 消息中附帶圖片與通用文件，它們按選擇順序隨指令一起提交。帶附件的 `/plan off` 會在模式變更前被拒絕，因此草稿和附件卡仍可繼續使用。`/plan` 命令在支持斜杠命令的界面中可用，例如 Web 客戶端。

### 經評審的退出

agent 完成計劃后，會以 markdown 形式、從標題開頭書寫計劃并調用 `exit_plan_mode`。你評審該計劃的原文，選擇 `Approve` 離開計劃模式，或選擇 `Keep planning` 帶反饋把 agent 送回去。

選擇 `Keep planning`（可附自由文本反饋）會讓 agent 回去修訂計劃；關閉評審改為發言，則告知 agent 等待你的下一條消息。若沒有可用的交互評審，`exit_plan_mode` 無法運行，你仍可用 `/plan off` 離開計劃模式。

### 觀察計劃狀態

界面可以顯示計劃模式是否激活，以及你請求的模式變更是否仍在等待生效。該狀態在每個標簽頁中一致，并能在重啟后保留。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋本包背后的設計決策并指出實現它們的代碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

計劃模式是產品包，而不是能力 seam：沒有可替換的后端，因此狀態、引導、命令與退出工具都集中在一處。持久化方案采用單一僅記日志、整值替換的事件，絕不使用實時鏡像，因此恢復、fork 與壓縮（compaction）都通過折疊日志復原它。引導是軟性層——本包注冊一個提示詞段落和一個工具，通過文本而非過濾能力來約束。

### 持久狀態與步驟邊界追加

本包持久化一條僅記日志、整值替換的事件 `plan/mode`，最后一條已記錄值即為狀態。沒有輪次開啟時，模式變更會立即追加；輪次開啟期間，它保持待生效，直到下一個被接受的輪內 pre-step——agent 運行時唯一的追加點——且追加失敗不能阻塞輪次。`set`/`get` 服務方法及其確切返回狀態見 [`src/index.ts`](src/index.ts)，并讀取已注冊的 `plan` 投影；注冊表或 key 缺失時，第一次依賴它們的訪問會顯式失敗。

### `/plan` 命令

命令子插件只在組合了命令服務時激活。它把不帶參數的 `/plan` 映射為激活，把恰好為 `off` 的參數映射為未激活且不發送模型輸入，把其他非空參數映射為激活并把去除首尾空白的文本通過 `agent.steer()` 作為下一步驟的普通已記錄用戶消息提交。已準入的圖片塊與文件塊按選擇順序進入這條消息；帶附件的 `/plan off` 會在模式變更前失敗。命令以外的入口可以直接驅動 `ctx.planMode`；確切的分支處理見 [`src/index.ts`](src/index.ts)。

### 退出工具

`exit_plan_mode` 在計劃模式未激活時仍保持注冊，因此進入或離開只改變提示詞段落，絕不改變請求的工具目錄。經批準的評審會記錄一個靜默的待生效退出，由下一個被接受的輪內 pre-step 追加，當前這批工具調用剩余部分仍保留計劃引導。缺少用戶交互通道，或評審等待期間服務重載，調用都會以拒絕方式失敗，`/plan off` 仍是手動退路。

### 會話投影單元

組合了 `ctx.sessionProjections` 時，本包通過可選注入注冊 `plan` 單元。該單元把已記錄的 `/plan` 命令運行轉為候選目標，在 `plan/mode` 上提交已記錄狀態，并為 `view` 推導 `{ active, pending }`，其中 `pending` 僅在未結算或已成功的選擇與已記錄狀態不同時為 true——這是僅憑日志即可恢復的純回放量。key 由 [`src/types.ts`](src/types.ts) 的聲明合并加入 `SessionProjectionMap`；框架負責驅動該單元，卸載插件 fiber 會注銷該 key。plan-mode 讀取要求該單元與 `turnBoundary` 單元存在；注冊表或任一 key 缺失時都會顯式失敗。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`Config` schema、`ctx.planMode` 服務、`plan:policy` 段落、`/plan` 命令、`exit_plan_mode` 工具 |
| [`src/types.ts`](src/types.ts) | `plan` 投影 key 聲明與 `PlanProjection` 協議值 |
| [`src/client.ts`](src/client.ts) | types 出口的客戶端命名空間再導出 |
| [`src/invariant.ts`](src/invariant.ts) | 不變式伴生插件：校驗 `plan/mode` 載荷結構 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從子系統語義逐步進入生成的目錄與設計決策。

- [計劃模式子系統參考](../../../docs/subsystems/plan.zh.md)——計劃模式的行為、配置與退出工具的約定。
- [plan/ 包映射](../README.zh.md)——本組及其唯一的包。
- [`exit_plan_mode` 工具目錄條目](../../../docs/tool-catalog.zh.md#deepseek-aidsh-plan-mode)——模型收到的確切 schema。
- [生成的配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-plan-mode)——每個受支持配置字段及其含義。
- [plan 專用協作狀態](../../../.agents/notes/implemented/simplification/2026-07-22-plan-specific-collaboration-state.zh.md)——計劃模式背后的設計決策。

-----

<a id="model-experience"></a>
## 模型體驗

### Plan 策略系統提示詞

#### 模型看到什么

計劃模式激活時，模型會在 first-party 提示詞順序 500 處看到部署方提供的原樣 `section` 文本；未激活模式不貢獻任何文本。

##### 配置示例

```markdown
You are in plan mode. Explore and design before presenting the complete plan through exit_plan_mode.
```

#### Token 影響

未激活模式不增加 token；激活模式把已配置的段落加入每個請求。

#### KV Cache 影響

該段落在計劃模式內保持穩定，但進入或離開會從 first-party 順序 500 起改變系統提示詞。

### 人類命令

#### 模型看到什么

`/plan`、`/plan off` 及其終端結果留在模型歷史之外。除恰好為 `off` 以外的非空后綴會在選擇計劃模式后，通過 `agent.steer()` 成為一條用戶消息：已準入的圖片塊與文件塊按選擇順序排列，之后是去除首尾空白的文本塊。不帶參數的 `/plan` 若帶有已準入附件，會通過 `agent.steer()` 提交一條只含這些塊的用戶消息。計劃模式已激活時選擇 `/plan off`，只會在最后記錄的請求頭描述了計劃模式的情況下追加標準的已記錄用戶切換通知；取消待生效條目不貢獻通知，因為沒有請求觀測到它。

#### Token 影響

可選消息的歷史 token 成本與單獨提交該內容相同。不帶附件的 `/plan` 與 `/plan off` 不增加 token；帶附件的 `/plan` 產生常規圖片與文件句柄成本。一次帶有通知的激活狀態退出會追加一條簡短且會保留的切換通知。

#### KV Cache 影響

用戶塊是僅追加的對話增長。進入或離開計劃模式會改變更早的策略段落；用于說明退出的通知會追加在可復用請求前綴之后。

### 退出工具 schema 與評審交互

#### 模型看到什么

[`exit_plan_mode` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-plan-mode) 在兩種狀態下均可用；在計劃模式之外執行會失敗，而計劃模式內經批準的評審返回規范的 `{ approved: true }` 值，并渲染既有的確認文本。拒絕仍是攜帶評審反饋的失敗調用，放棄評審則是一次指明用戶接手的失敗調用。

#### Token 影響

穩定 schema 的成本取決于 ToolRuntime 模式，每次傳入的 plan 參數與評審結果都會保留在對話歷史中。

#### KV Cache 影響

模式轉換不改變工具目錄；plan 參數與評審結果按常規方式擴展對話。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制描述計劃模式在哪些情況下不符合你的預期，或需要額外的注意。它們是當前包約束，不是路線圖。

- **引導而非強制**——計劃模式只通過文本約束；需要強制限制的部署要分別配置沙箱模式與審批策略。
- **待生效選擇只存在于進程內**——某輪最后一個被接受的 pre-step 之后作出的選擇，若進程在另一個被接受的輪內 pre-step 之前退出就會丟失；UI 必須重新應用它。
- **沒有創建時 plan 選項**——fork 的 agent 繼承已記錄的計劃狀態，新 spawn 的 agent 則從未激活開始。
- **存活的子級無法打開評審**——由另一個存活 agent 所有的子級調用 `exit_plan_mode` 會失敗，并被要求把尚未解決的決策包含進最終結果；僅有持久化 fork 譜系并不能阻止恢復為運行時根的會話打開該評審。
- **只有一個專用評審渲染器**——只有 Web UI 具備 `plan-review` 呈現；其他交互提供方通過其通用選項流程呈現同一請求。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文：開放的設計問題與尚未決定的探索方向。它明確不具權威性——已交付的行為、限制與既定理由以上文、包代碼和相關 Agent Note 為準。

#### 未來：第二種協作模式

設計說明拒絕了通用命名模式注冊表，因為產品只交付了 `plan`；未來的協作狀態只應在出現兩個具體用例后建立共享 seam，任何抽取都必須保持 `plan/mode` 的僅記日志折疊、邊界追加與經評審的退出不變。

</details>
