---
description: "供用戶與維護者在組合或調試可繼續子級控制功能時使用的全局 send_message、interrupt_agent 與 list_agents 工具。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-subagent-control

[English](README.md) | 中文

## 概述

`dsh-tool-subagent-control` 為可繼續子級添加全局控制工具：`send_message` 在直接父級與子級之間進行 steering（中途引導），`interrupt_agent` 停止子級當前輪次但保留其收件箱與后代，`list_agents`（來自可單獨加載的 `list-agents` 插件）按持久化 ID 與標簽列出可繼續子級。父級與可繼續子級繼承相同的 `send_message` 定義和順序，因此模型通信不會增加子級專屬工具 schema。是否加載這些工具不會決定委派工具是否啟動可繼續工作。

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

在模型需要對可繼續子級發消息、中斷或列出的任何組合中掛載本包。根插件只需要 subagent 服務；列表工具是獨立插件，部署方可以省略。

### 最小配置

先加載 subagent 服務、一個后端、委派工具與本包。加上獨立的列表插件即可公開全部三個工具：

```yaml
- name: '@deepseek-ai/dsh-subagent'
- name: '@deepseek-ai/dsh-subagent-spawn-in-process'
- name: '@deepseek-ai/dsh-tool-subagent'
  config:
    provider: spawn
    backgroundMode: continuable
- name: '@deepseek-ai/dsh-tool-subagent-control'
- name: '@deepseek-ai/dsh-tool-subagent-control/list-agents'
```

本包不接收任何配置：根插件提供 `send_message` 與 `interrupt_agent`，列表插件提供 `list_agents`。

### send_message

向 `agent_id` 指定的 Agent 發送消息：任何確切在線 Agent 都可以向自己的直接可繼續子級發送消息，駐留的可繼續子級還可以向自己的直接父級發送消息。正在工作的目標通過 Steer 在最近的步驟邊界接收消息；空閑目標會啟動一個輪次，冷狀態的直接子級會通過繼續執行生命周期恢復。調用只返回接受結果（被接受消息的穩定 `messageId`），絕不返回回復。失敗——不受支持的目標、不可用的父級、未知子級、缺少描述符而無法恢復的子級，或準入被拒——會明確說明消息未送達。

### interrupt_agent

只停止目標當前輪次：已排隊消息保持暫停，直到之后調用 `send_message`；后代繼續運行，子級仍可接受后續消息。調用在停止請求被接受后立即返回，不等待目標完全停穩；中斷已結束的 agent 會被接受并按空操作處理，而自身、同級、陳舊及非祖先調用方會收到出錯結果。

### list_agents

列出調用方 agent 下方的可繼續子級：`children`（默認）只顯示直接子級，`descendants` 按穩定前序遍歷整棵樹，并為每個條目標注其持久化直接父級會話 ID 與深度。狀態來自在線 Agent 注冊表——`running`、`idle` 或 `ready`。一次性子級因無法接受 `send_message` 而被有意排除，無法讀取的候選項以診斷信息呈現。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋工具把什么委托給 subagent 服務；可觀察行為已在[使用本包](#use-this-package)中說明。

### 設計理念

`ctx.subagents.sendMessage()`、`interrupt()` 與列表投影之上的輕量適配器；工具不執行任何生命周期路由。駐留、冷恢復與授權歸服務所有，工具把確切在線的調用 Agent（`exec.agent`）同時作為 sender 與權限憑據傳入。

### 投遞與信號所有權

工具轉發其執行信號，該信號只在 inbox 接受之前掌管準入。目標一旦接受消息，該消息便無法再通過本工具取消。每條消息都以 `Agent <sender-id> sent a message:` 作為前綴，并記錄 `{ kind: 'agent-message', form: 'relay', senderSessionId: sender.id }`；該來源信息由服務推導，且絕不被視為權限。

### 列表投影

`list_agents` 從調用 agent 推導根 id，不使用 cursor 讀取服務目錄，通過在線 Agent 注冊表細化每個候選的狀態，并省略無法接受 `send_message` 的一次性子級。diagnostic 在 descendants scope 中保留其位置，且絕不暴露描述符內容。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | `send_message` 與 `interrupt_agent` 注冊 |
| [`src/list-agents.ts`](src/list-agents.ts) | `list_agents` 注冊：作用域、狀態細化、投影 |
| — | 不發布運行時不變式伴生入口；這個面向模型的適配器沒有獨立的生命周期流；投遞與激活關系由其調用的 subagent 服務負責。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面；它們從工具 schema 進入其背后的繼續執行服務。

- [Subagent 子系統](../../../docs/subsystems/subagent.zh.md)——可繼續子級、Activation、inbox、中斷與后續消息權限。
- [dsh-tool-subagent](../tool-subagent/README.zh.md)——啟動可繼續子級的委派工具。
- [生成工具目錄](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-subagent-control)——三個工具的 schema。

-----

<a id="model-experience"></a>
## 模型體驗

### 工具 schema

#### 模型看到什么

已生成的 [schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-subagent-control)：`send_message` 接受 `agent_id` 與 `message`；`interrupt_agent` 接受 `agent_id`；`list_agents` 接受可選的 `scope` 枚舉。

#### Token 影響

每個父級請求支付固定的 schema 成本。

#### KV Cache 影響

前綴保持穩定；schema 不會在運行時改變。

### 中斷結果

#### 模型看到什么

接受時返回 `interrupt requested for agent <agent_id>`。未授權的調用方——self、sibling、陳舊或非 ancestor——會成為指明拒絕原因的出錯結果；目標不存在或已結算仍渲染接受行。

#### Token 影響

每次調用產生一條簡短確認消息；被中斷輪次的中止只在子級自己的 transcript（文本記錄）中可見。

#### KV Cache 影響

僅追加；每個結果都位于可復用請求前綴之后。

### 投遞結果

#### 模型看到什么

接受時返回 `message delivered to agent <agent_id>`；規范輸出攜帶被接受的 `messageId`。失敗——非相鄰目標、不可用的父級、未知子級、缺少描述符而無法恢復的子級，或準入被拒——會成為出錯的結果，其消息說明該消息未送達。

#### Token 影響

每次調用產生一條簡短確認消息；目標的響應絕不會通過本次調用返回。子級使用同一個工具，并傳入其初始任務中的父級 ID，將選定內容追加到父級歷史中。

#### KV Cache 影響

僅追加；新增可見內容位于可復用請求前綴之后，不會使現有 KV Cache 條目失效。

### 列表結果

#### 模型看到什么

按穩定目錄順序，每個可繼續子級占一行：`<id> [<status>] — <label>`（`running` 表示驅動器活躍，`idle` 表示駐留但處于輪次之間，`ready` 表示僅存于存儲，可恢復而非終態），另為無法讀取的候選項渲染 `<id> [diagnostic: <reason>]`。`descendants` 作用域會在每行標簽的破折號之前按前序插入 ` parent=<id> depth=<n>`。一次性子級會被有意排除；`(no subagents)` 表示投影后沒有留下可繼續子級或診斷信息。

#### Token 影響

隨所列可繼續子級數量線性增長——`descendants` 作用域下為整棵樹；沒有游標或上限，因此長期存活且有許多持久化子級的父級每次調用都會承擔完整列表成本。

#### KV Cache 影響

僅追加；每個結果都位于可復用請求前綴之后。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明控制工具無法觀察或引導什么；它們是當前包約束。

- **已投遞消息沒有獨立結果**——接受時只返回其 inbox `messageId`；目標后續工作會落入該目標的持久化會話，絕不會通過本工具收集。回復是另一條顯式指定地址的 `send_message`，而非本次調用的結果。
- **只有受支持的相鄰 Agent 可以通信**——每個發送方都可以向直接可繼續子級發送消息；只有具備駐留可繼續 Activation 的發送方可以向自己的直接父級發送消息，且該父級必須仍在線；同級與更深的后代不能作為消息目標，只有向直接子級投遞才支持冷激活。
- **列表是快照，而非投遞承諾**——它可能與發布、dispose（資源釋放）或后續消息發生競態，另一個進程也可能激活當前進程報告為 `ready` 的子級；跨進程準確性需要共享租約。`interrupt_agent` 自己執行權威的在線 lineage 檢查，因此過期的發現結果不會授予權限。
- **沒有分頁或刪除**——系統返回完整且穩定排序的集合；只要子級會話仍在持久化存儲中，它就會繼續出現在列表中，服務級上限或刪除操作留待后續產品決策。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
