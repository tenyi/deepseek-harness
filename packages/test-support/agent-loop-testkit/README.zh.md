---
description: "為 agent-loop 測試提供先決依賴掛載、生產 AgentLoop 驅動與職責明確的 Inbox 樁。"
kind: "package-library"
---

# @deepseek-ai/dsh-agent-loop-testkit

[English](README.md) | 中文

## 概述

使用 `dsh-agent-loop-testkit` 可以為 AgentLoop 測試準備標準先決條件和生產 loop 驅動，避免重復設置。harness 可以創建真實 Agent，并公開 Inbox 輸入認領能力，以測試持久事件、恢復、通知和認領行為。只需編輯隊列的消費方測試應選擇進程內 Inbox 樁；待處理輸入絕不應被訪問時，應選擇快速失敗的 Inbox。測試仍然負責適配器、可選插件、加載順序和上下文釋放，本包不會添加模型可見行為。

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

本包為 AgentLoop 測試提供可用的服務拓撲，并要求測試明確選擇生產 Inbox 行為或結構化樁。

### 驅動生產 Agent

當測試覆蓋持久 Inbox 事件、投影恢復或校驗、實時 Inbox 通知，或 loop 驅動的認領策略時，使用 `mountAgentLoopTestHarness()`。應在掛載先決依賴后、創建 Agent 前掛載所有對加載順序敏感的消費方。上下文擁有 loop 以及該 harness 返回的每個 Agent。

```ts
import { Context } from '@deepseek-ai/cordis'
import { SessionId, type UserMessage } from '@deepseek-ai/dsh-session'
import {
  mountAgentLoopTestDependencies,
  mountAgentLoopTestHarness,
} from '@deepseek-ai/dsh-agent-loop-testkit'

const ctx = new Context()

await mountAgentLoopTestDependencies(ctx)
// Register the test adapter and any load-order-sensitive plugins here.
const harness = await mountAgentLoopTestHarness(ctx)
const agent = await harness.create(SessionId('test-agent'))
declare const message: UserMessage

agent.inbox.append('next-turn', message)
const admitted = harness.claim(agent, 'next-turn', 1)
```

依賴輔助函數通過 `options` 轉發系統提示詞與工具注冊表配置，除這些服務自有的默認值外不提供測試默認值。插件加載失敗會使輔助函數調用被拒絕；順序中較早激活的服務仍歸上下文所有，并在上下文釋放時一并解除。

### 構造結構化 Agent 樁

當測試對象需要可變的待處理列表，但不測試持久性、投影校驗、實時 Inbox 通知或驅動的認領策略時，使用 `createInboxStub()`。該樁通過兩個進程內數組實現公開隊列操作，且絕不會寫入 Session。當測試對象不應訪問待處理輸入時，使用 `unsupportedInbox()`；每次變更都會在首個意外依賴處拋錯。

```ts
import { createInboxStub } from '@deepseek-ai/dsh-agent-loop-testkit'

const agent = {
  // ...
  inbox: createInboxStub(),
}
```

### 何時使用

當測試對象是生產 loop 或持久 Inbox 行為時，使用依賴與 loop 輔助函數。只需要編輯隊列的消費方領域測試使用結構化樁。當測試探測服務注入失敗或部分拓撲時，請直接掛載依賴，因為輔助函數隱藏的正是這類測試必須控制的接線。

### 可能出什么問題

harness 不會掛載任何 LLM（大語言模型）適配器。若測試發送的任務會啟動模型請求，請先注冊被測路由的適配器。每個測試結束后都應 dispose（資源釋放）所屬上下文，使 Agent 完全停穩，并解除其作用域注冊。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋測試輔助工具的設計；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計

`mountAgentLoopTestDependencies` 按固定依賴順序——LLM、會話、會話投影注冊表、系統提示詞注冊表、工具注冊表、agent 注冊表——掛載六個服務插件，并在 `AgentLoop` 之前停下，使調用方控制 loop 加載順序。`mountAgentLoopTestHarness` 掛載公開的生產插件，通過其服務創建 Agent，并公開生產驅動的認領操作，而不導出 loop 的具體 Inbox 類或投影定義。[`src/inbox.ts`](src/inbox.ts) 僅包含進程內可變樁和快速失敗且不支持操作的占位值；它不持有投影或持久事件實現。掛載與驅動實現位于 [`src/index.ts`](src/index.ts)。本包不發布 invariant companion，因為它只持有測試輔助工具，不存在可能相互偏離的獨立生產觀測。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級行為不夠用時閱讀以下頁面。它們從 loop 逐步進入輔助函數掛載的服務以及使用它的測試。

- [Agent loop 包](../../core/agent-loop/README.zh.md)——本輔助函數為生產行為掛載的具體 loop。
- [會話包](../../core/session/README.zh.md)——生產 Inbox 行為使用的持久事件日志。
- [LLM 包](../../llm/llm/README.zh.md)——本輔助函數準備的 LLM 運行時與適配器接口。
- [測試策略](../../../docs/testing.zh.md)——這些測試對應的覆蓋層級。
- [test-support 組索引](../README.zh.md)——兄弟 harness 與支持包。

-----

<a id="model-experience"></a>
## 模型體驗

無。這些測試專用輔助工具既不組裝也不修改模型請求。

#### KV Cache 影響

無；本包自身不發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

這些限制說明輔助工具不共享什么。它們是當前包約束，不是任務積壓。

- **只共享必需的先決主干**——適配器、可選插件、場景特定的加載順序與上下文清理仍由調用方負責。
- **生產 harness 沒有適配器默認值**——啟動 loop 的測試必須注冊其實際使用的路由。
- **可變 Inbox 樁僅存在于進程內**——只要持久事件、投影恢復或校驗、實時通知或認領策略屬于測試對象，就應使用 harness 創建的 Agent。
- **不支持操作的 Inbox 不接受變更**——只要待處理輸入屬于測試對象，就應使用可變樁或 harness 創建的 Agent。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
