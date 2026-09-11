---
description: "面向用戶與維護者的系統提示詞組裝說明，用于添加提示詞段、變量、工具 schema 來源或配置面向模型的提示詞。"
kind: "package-reference"
---

# @deepseek-ai/dsh-system-prompt

[English](README.md) | 中文

## 概述

`dsh-system-prompt` 讓 agent 在每個模型步驟收到一份有序系統提示詞與可用工具 schema。需要添加提示詞段、動態運行時事實、可復用變量或工具 schema，或者控制固定 harness 身份、部署 persona、運行時上下文和面向模型的工具順序時，請使用本包。agent 作用域的貢獻會遮蔽同名全局默認值，而不影響其他 agent。無效的完整提示詞組合與未解析變量會使組裝失敗，不會向模型發送格式錯誤的提示詞。

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

在任何運行 agent 的地方掛載 `dsh-system-prompt`：它提供 `ctx.systemPrompt`，即每個提示詞貢獻所落入的注冊表。貢獻帶作用域——通過 `agent.ctx` 注冊只影響該 agent，并遮蔽同名全局項。

<a id="configure-the-prompt"></a>
### 配置提示詞

配置擁有固定開場白、runtime 上下文、部署 persona 前綴與后綴與工具順序；其余一切來自已注冊的貢獻。

```yaml
- name: '@deepseek-ai/dsh-system-prompt'
  config:
    includeHarnessIdentity: true
    includeRuntimeContext: true
    personaPrefix: 'You are the deployment assistant.'
    toolOrder: ['<unlisted-tools>']
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `includeHarnessIdentity` | `true` | 是否包含順序為 −1000 的第一方固定開場白 `You are an AI agent powered by DeepSeek Harness.`。僅當兼容性部署擁有完整系統提示詞時設為 false。 |
| `includeRuntimeContext` | `true` | 是否在組裝中包含有序動態 runtime 上下文 |
| `personaPrefix` | `''` | 全局 persona 前綴模板，順序為 `0`，位于第一方指導之前 |
| `personaSuffix` | `''` | 全局 `deployment:persona-suffix` 模板，順序為 `10200`，位于第一方指導之后 |
| `toolOrder` | — | 顯式面向模型工具順序，含一個 `'<unlisted-tools>'` 其余項標記 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-system-prompt)是每個受支持字段的窮盡式真源。沒有恰好一個其余項或存在重復項的 `toolOrder` 列表會在加載時失敗；已列名稱沒有對應已注冊工具會使每次 `assemble()` 被拒絕。

### 貢獻提示詞段

段攜帶靜態或按上下文解析的文本與 `order`；它們先按順序值升序拼接，順序值相同時再按名稱的代碼單元順序排列。倉庫自帶貢獻方通過 `ctx.systemPrompt.getSectionOrder(name)` 解析集中分配的位置；runtime-context 貢獻方使用 `getContextOrder(name)`。外部貢獻可以使用任意有限的順序值。`complete: true` 段會在組裝后成為精確的完整提示詞；有效的 complete 段超過一個時，組裝會失敗。

```text
ctx.systemPrompt.section({
  name: 'tool:bash',
  order: 100,
  text: 'Prefer bash for file and process operations.',
})
```

### 貢獻提示詞變量

變量在段文本中以 `{{name}}` 引用，并在每次組裝時解析；帶作用域變量會為該 agent 遮蔽同名全局變量。循環提供 `model` 與 `cwd`；任何插件都可以注冊自己擁有的事實。

```text
ctx.systemPrompt.variable('cwd', ({ agent }) => agent?.session.header.cwd)
```

### 貢獻工具 schema

工具 schema 提供方在每次組裝時求值，并貢獻模型可見的 `ToolSchema` 集合；`ToolRuntime` 會自動注冊自身，因此大多數工具在此無需手動接線。提供方返回限制后的可見集合，外加 `toolOrder` 使用的限制前名稱全集。

### 抑制運行時上下文

`suppressRuntimeContext()` 移除調用作用域的所有動態運行時上下文貢獻，但不禁用擁有底層事實的服務；多個抑制器獨立組合，當不再存在抑制器時該 effect 會恢復上下文。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋該包如何實現上述行為；可觀察約定已在[使用本包](#use-this-package)中完整說明。

### 設計理念

該包是一個注冊表加一條協作式組裝流水線。一次 `assemble()` 調用把全局層與所請求作用域的層合并，分離工具參數，先按數值再按名稱規范化段順序，運行按作用域篩選的 `system-prompt/assemble` waterfall，把有效的 complete 段恢復為唯一的提示詞段，并實施任何當前生效的運行時上下文抑制器。段與動態上下文是獨立的輸入：段成為提示詞文本，而上下文在循環下成為模型歷史中帶來源的 user 角色快照。工具 schema 按設計屬于組裝結果——「模型獲知自己能做什么」是一個連貫整體，盡管適配器把 schema 作為獨立 wire 字段傳輸。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`SystemPrompt` 服務、配置、組裝流水線、`renderPrompt` |
| [`src/invariant.ts`](src/invariant.ts) | 不變式配套 |

### 組裝與渲染

組裝分兩階段完成求值與渲染：`assemble()` 返回文本已求值但尚未插值的段、有序工具 schema，以及每個已注冊變量按當前上下文求得的值；`renderPrompt()` 插值 `{{variable}}` 引用、刪除空段并用空行連接——嚴格規則：未知引用、已注冊但無值的引用或格式錯誤的完整組都會拋出，因為格式錯誤的提示詞比明確失敗更糟。`toolOrder` 在 waterfall 分發前規范化收集到的工具（注冊順序只是插件加載產物）；修改列表的 waterfall 監聽器對其輸出的確定性負責。

### 作用域

帶作用域的段、變量與工具提供方會為單個 agent 遮蔽全局項，組裝 waterfall 按作用域篩選分發。注冊表變更通知（`system-prompt/change`）刻意不經過篩選，因為全局變更影響每個作用域。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

包級約定對大多數消費方已經足夠；需要周邊領域時再閱讀以下頁面。

- [系統提示詞子系統](../../../docs/subsystems/system-prompt.zh.md)——確切的跨包類型與生成的服務 API。
- [tools 包](../tools/README.zh.md)——其 schema 流入組裝的工具注冊表。
- [提示詞變量 Agent Note](../../../.agents/notes/implemented/architecture/2026-07-05-prompt-variables-and-tool-guidance-ownership.zh.md)——哪些提示詞事實歸誰所有。
- [第一方提示詞順序 Agent Note](../../../.agents/notes/archived/architecture/2026-08-25-sparse-first-party-prompt-section-orders.md)——稀疏具名順序分配。
- [core 分組地圖](../README.zh.md)——core 各包如何組合。

-----

<a id="model-experience"></a>
## 模型體驗

### 系統提示詞

#### 模型看到什么

第一方段落依次渲染 harness 身份、部署 persona 前綴（含模型名稱介紹）、可復用指令（包括生成的工具 SDK 和結構化輸出指導），最后是攜帶環境信息的后綴：harness 源碼（`10000`）、Web 表層（`10100`）和部署 persona 后綴（`10200`）。外部段落的順序與組裝監聽器仍決定其最終結果。`includeHarnessIdentity: false` 僅省略這個固定開場白。空段會消失；帶作用域的段與變量可以為一個 agent 遮蔽全局項。`system-prompt/assemble` waterfall 決定交付的提示詞與工具 schema，除非一個有效段聲明自身為 complete——此時該確切段會成為完整的系統提示詞，而 waterfall 得到的上下文、工具與變量保持不變。渲染后的提示詞作為派生歷史中的 system 角色消息——surface 第 0 號節點，或歷史內更新之后最新的系統節點——到達模型；循環請求與 `request/header` 均不含單獨的 `system` 字段。完整渲染結果為空時，循環通過有日志記錄的空內容替換清除所有生效的系統節點，模型歷史不再保留任何舊提示詞。有序動態上下文與段分離，只在存在時才會成為帶來源的 user 角色快照；`includeRuntimeContext: false` 或帶作用域的抑制器會移除全部這類上下文。

##### harness 身份

```markdown
You are an AI agent powered by DeepSeek Harness.
```

#### Token 影響

啟用時，身份是每次請求的固定成本。Persona 前綴、后綴與插件文本在每次請求中重復，成本隨渲染內容增長。

#### KV Cache 影響

只要身份、persona、變量、段文本與順序的渲染完全相同，前綴就保持穩定：渲染未變時系統節點保持不動，除非不支持該能力的路由或新請求序列必須歸并保留的歷史內提示詞。沒有 `systemPromptUpdate` 時，非空提示詞文本通過有日志記錄的逐節點替換歸并到首個系統節點，因此頭節點重寫會從首個變化的 token 起失去前綴復用；當已準備調用聲明 `systemPromptUpdate: 'in-history'` 時，agent loop（智能體循環）會在同一請求序列延續期間把變化后的非空提示詞追加到已緩存歷史之后，因此直到該歷史末尾的前綴仍可復用（[決策規則](../agent-loop/README.zh.md#understand-the-implementation)）。模型、persona 前綴、工具與前置指令一致時，不同源碼路徑、本地 Web URL 或 persona 后綴值不會改變可復用的第一方前綴。persona 前綴變化可能改變靠前的前綴。任何變更都可能從第一個變化的 token 起使復用失效；不保證提供方共享緩存或實際命中率。

### 工具 schema

#### 模型看到什么

對于已交付工具，模型會收到[生成工具 schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tools)中對每個 agent 可見的子集；限制與組裝攔截完成后，按配置或字典序排列。擴展可以通過同一注冊表貢獻其他定義。段與 schema 提供方是獨立的組裝輸入。限制不會移除段落注冊：工具指導插件通過 `text({ scope })` 與 `ctx.tools.get(name, scope)` 返回空文本或選擇適用片段。任意靜態段落不會被自動改寫。

#### Token 影響

schema token 在每次請求中重復。限制工具會為該 agent 移除其全部 schema 成本，但不會移除獨立提示詞段；重排序會改變緩存形狀，但不改變語義內容。

#### KV Cache 影響

只要可見 schema 集合、渲染與順序不變，前綴就保持穩定。注冊、限制或重排序可能從第一個變化的 schema token 起使復用失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明提示詞組裝何時需要特別留意。它們是當前包約束，不是待辦事項清單。

- **部署方編寫的提示詞文本只來自配置／組合**：此插件擁有全局 persona 前綴與后綴默認值；創建方插件可以注冊 agent 作用域的遮蔽項；其他段來自擁有相應事實的插件。不存在終端用戶提示詞編輯 API。
- **沒有表示字面量 `{{…}}` 花括號的轉義語法**：每個完整組都會按已注冊變量插值；只有實際提示詞需要轉義時才會實現。
- **`toolOrder` 配置錯誤在提示詞組裝（首輪）時出現，而不是啟動時**：只有形狀違規會在配置加載時拋出。


<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
