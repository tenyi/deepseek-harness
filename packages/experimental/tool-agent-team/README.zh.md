---
description: "九個讓模型創建、發消息與協調 teammate 的工具，供掛載實驗性 Team 插件的組合使用。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-tool-agent-team

[English](README.md) | 中文

## 概述

本包讓模型創建具名 teammate、向它們發送消息、查看可用狀態、等待進展、中斷卡住的工作，并通過共享任務板協調。每個團隊成員都會獲得相同的九個工具，以及在共享工作區協調的指引。當模型只應在你明確要求后運行團隊時，選擇本包。它會取代同名的舊版 subagent 控件，因此同時需要兩者的組合必須禁用舊定義。本包以實驗性名稱公開發布，但不提供穩定性保證。

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

當模型應該通過工具運行一支團隊時，在 `@deepseek-ai/dsh-experimental-agent-team` 之上掛載本包。掛載后，每個團隊成員——Lead 與每個 teammate——都會獲得相同的九個工具，外加一段說明自身角色與名字的策略段落。

### 何時選擇

當模型應該自行創建與協調 teammate、而不是由人來操作 subagent 控件時，選擇它。當同名的舊全局 subagent 工具必須繼續可用時，請不要選擇：團隊工具會為團隊成員取代它們，因此想同時使用兩者的組合必須禁用舊定義。固定策略只在明確要求團隊或 teammate 時創建成員，因此普通任務永遠不會自行觸發委派。

### 最小工作示例

對現有組合的最小增量是 [agent-team README](../agent-team/README.zh.md#smallest-working-setup) 中的兩包片段：持久會話存儲、團隊領域包與本包。插件本身只有兩個可選設置：

```yaml
- id: tool-agent-team
  name: '@deepseek-ai/dsh-experimental-tool-agent-team'
  config:
    freshProvider: spawn
    forkProvider: fork
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `freshProvider` | `spawn` | 啟動 fresh teammate 的提供方 |
| `forkProvider` | `fork` | 啟動 fork teammate 的提供方 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-experimental-tool-agent-team)是每個受支持字段及其 JSDoc 的窮盡式真源。

試試這樣要求 Lead 模型：「創建一個名為 reviewer 的 teammate 檢查 diff，再把變更摘要發給 reviewer」。模型會調用創建工具，然后調用消息工具。

### 模型能做什么

九個工具分為四類能力：

- **創建 teammate**——`spawn_teammate` 接收名字、描述與初始任務；只有 Lead 可以調用它。
- **發送消息**——`send_message` 在最近的步驟邊界對運行中的成員進行 steering（中途引導）、啟動空閑成員，并冷恢復非活動 teammate。
- **查看與等待**——`list_agents` 顯示帶實時狀態的 roster；`wait_agent` 等待下一次團隊變化；`interrupt_agent` 停止 teammate 的當前輪次（僅限 Lead）。
- **管理任務板**——`team_task_create`、`team_task_list`、`team_task_get` 與 `team_task_update` 添加、瀏覽、讀取與更新共享任務。

任何成員都可以給任何其他成員發消息并使用任務板；只有 Lead 可以創建與中斷 teammate。任務更新保留領域的 owner 與 revision 校驗，因此過期的編輯會被拒絕，而不是覆蓋更新的成果。

### 成功與失敗的表現

發送消息在安全存儲后即成功：結果為 `accepted`（已立即送達）或 `queued`（等待中），排隊的消息絕不能重發。當沒有其他成員 running 或 provisioning 時，`wait_agent` 會立即返回 `noProgress`，提示調用方先喚醒 teammate；否則它會等待下一次變化，調用方隨后重新讀取狀態。基于過期 revision 的任務編輯會被拒絕，而不是覆蓋更新的成果。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋適配器背后的設計決策并指出實現它們的代碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

適配器建立在三項承諾之上：

- **按作用域，而非全局。** 每個注冊都位于成員 Agent（智能體）自己的 `ctx` 上；非 Team subagent 或宿主不會安裝任何內容。
- **聲明式結果，緊湊 JSON。** 每個工具都聲明完整結果 schema，并把該值渲染為緊湊 JSON，因此編譯器會對照向模型承諾的結果檢查 `execute`，任何結果都不會在縮進上消耗 token。
- **領域掌握裁決權。** 工具委托給 `ctx.agentTeams`，后者強制執行 Lead 權限與 revision 校驗；適配器不添加更弱的路徑。

[Agent Teams Agent Note](../../../.agents/notes/implemented/feature/2026-08-05-agent-teams.zh.md)負責模型側與 scoping 決策。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：配置、固定策略文本與九個 scoped 工具注冊 |
| — | 不發布運行時不變式伴生入口；Team 服務擁有持久化與授權關系。 |

### 策略與工具

member scope 上的一個 `team:policy` 段落教每個成員自己的角色與協作規則；固定文本與九個工具注冊都聲明在 [`src/index.ts`](src/index.ts)。九個工具 schema 只出現在 Team member scope 中，因此非 Team subagent 保持默認目錄。與舊全局 continuable-subagent 控件同名的 scoped 注冊只會為團隊成員覆蓋這些全局控件。

### 按作用域注冊與拆除

`maybeInstall` 對每個 live Agent 運行，并訂閱 `agent/created`；它跳過沒有 Team 成員關系的 Agent。Agent 的 dispose（資源釋放）會運行已安裝的 disposer，插件 HMR（熱模塊替換）會在重新安裝前對每個已安裝的 scope 執行 dispose。每個 disposer 按逆序撤銷注冊，因此失敗的安裝不會留下殘缺 scope。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從領域服務逐步進入精確 schema 與設計背后的決策。

- [agent-team 包](../agent-team/README.zh.md)——這些工具背后的 `ctx.agentTeams` 領域服務。
- [Agent Teams 子系統](../../../docs/subsystems/agent-team.zh.md)——持久 Team 類型與服務 API。
- [生成的工具目錄](../../../docs/tool-catalog.zh.md#deepseek-aidsh-experimental-tool-agent-team)——模型接收的每個工具 schema。
- [Agent Teams Agent Note](../../../.agents/notes/implemented/feature/2026-08-05-agent-teams.zh.md)——模型側、scoping 與隔離決策。

-----

<a id="model-experience"></a>
## 模型體驗

### Team 策略與工具

#### 模型看到什么

一段穩定策略會說明確切 Team role／name／id、顯式 delegation 要求、共享 cwd 行為、文件陳舊版本恢復、Bash／formatter／codegen 風險、task／write-scope 協調、Steer 投遞、mailbox 不重試規則，以及 Lead 必須在回答前等待。`spawn_teammate` 到 `team_task_update` 的九個 Team schema 只出現在 Team member scope。

#### Token 影響

每次 Team member 請求都有固定策略與 schema 成本。工具調用會增加緊湊 JSON roster、task、wait 或 receipt 結果。Peer 內容由 Team 領域保留在 target 歷史中。

#### KV Cache 影響

Team 插件 generation、配置、member role／name 與 schema 不變時，前綴保持穩定。每個成員的身份行不同。工具結果與 peer 消息追加在可復用請求前綴之后。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明策略與工具無法為一支團隊保證什么。它們是當前包約束，不是與其他協作方式的對比。

- **提示詞策略只負責協調，不負責 confinement**——它無法阻止 Bash 或外部進程寫入重疊文件。
- **不會自主創建 Team**——除非用戶明確要求，普通任務不會觸發 delegation。
- **沒有 Web 控制功能**——瀏覽器 roster 與任務板呈現不屬于該運行時包。
- **實驗原型，無穩定性承諾**——本包公開發布，但孵化期間 schema 仍可自由變更。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
