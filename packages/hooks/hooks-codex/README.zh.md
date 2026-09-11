---
description: "在 agent 運行期間使用你現有的 Codex hooks.json 鉤子配置——阻塞提示詞與工具、附加上下文或強制繼續——供本橋接的用戶與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-hooks-codex

[English](README.md) | 中文

## 概述

`dsh-hooks-codex` 在 agent（智能體）運行期間執行現有 Codex `hooks.json` 中的 command 鉤子，讓提示詞與工具把關邏輯無需重寫即可生效。它支持 5 個 Codex hook 點：會話開始、提示詞提交、工具執行前后以及停止。鉤子可以用模型可見的原因阻塞提示詞或工具調用、添加對話上下文，或強制 agent 再執行一步。需要在 harness 中復用 Codex command 鉤子時選擇本包；超出這一受支持子集的行為應使用原生插件。

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

掛載本包并把 `configPath` 指向你的 `hooks.json`，你已有的鉤子就會在 agent 運行中的對應時刻開始觸發。在第一個鉤子生效之前無需其他設置。

### 何時選擇

當你持有 Codex `hooks.json`、且其中的 command 鉤子需要把關提示詞、工具與輪次時，使用它。沒有 Codex 對應物的行為請跳過它：原生插件擁有完整的 harness API，而本橋接只運行參考工具的 command hook 子集。

### 最小配置

```yaml
- name: '@deepseek-ai/dsh-hooks-codex'
  config:
    configPath: ./.codex/hooks.json
    model: deepseek-v4
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `configPath` | 必填 | Codex `hooks.json` 的路徑 |
| `model` | `''` | 寫入每個 payload 的模型名稱（Codex 在每個事件中都包含 `model`） |
| `defaultTimeoutMs` | `600,000` | hook 未設置時的每 hook 超時（即 Codex 默認值） |
| `stderrSummaryMaxChars` | `500` | 持久化 `hook/result` stderr 摘要的字符上限 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-hooks-codex)是每個受支持字段的窮盡式真源。

### 你的鉤子能做什么

| 你的鉤子 | 運行時機 | 能做什么 |
|---|---|---|
| `SessionStart` | 會話開始時 | 附加該會話中模型可見的上下文 |
| `UserPromptSubmit` | agent 收到提示詞時 | 阻塞提示詞，或附加上下文 |
| `PreToolUse` | 工具運行前 | 阻塞工具 |
| `PostToolUse` | 工具運行后 | 帶反饋阻塞結果，或附加上下文 |
| `Stop` | 運行即將停止時 | 帶原因強制再執行一步 |

### 鉤子如何運行與失敗

- 鉤子在你的項目目錄（agent 的會話工作區）中運行，因此鉤子里的 `pwd` 與相對路徑指向你的項目，而非服務器啟動目錄。
- 一份配置應用于整個進程：啟動時只讀取一次，相對 `configPath` 從啟動進程的目錄解析。
- 只運行同步 command 鉤子；`async: true` 或非 command 鉤子會被跳過并給出警告。
- 同一事件上的鉤子按配置順序逐個運行。
- 如果配置無法讀取或解析，橋接會記錄警告且不運行任何鉤子——agent 仍會啟動。
- 運行失敗的鉤子（命令錯誤或崩潰）會被記錄，agent 繼續運行。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋橋接背后的設計決策，并指出實現它們的代碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### Hook 點映射

每個受支持事件都面向一個 harness 擴展點：`SessionStart` 向新會話發射上下文（`agent/session-start`），`UserPromptSubmit` 與 `PreToolUse` 是能拒絕傳入動作的 waterfall（瀑布式事件）（`agent/pre-step`、`tools/pre-execute`），`PostToolUse` 是能帶反饋阻塞或向下游決策添加上下文的 waterfall（`tools/post-execute`），`Stop` 是串行監聽器，其阻塞結果通過 `steer()` 強制再執行一步（`agent/turn-stopping`）。僅提供上下文的 hook 總是先通過 `next()` 委托，再把帶來源的消息折疊進下游決策，因此后續監聽器仍可拒絕或改寫；阻塞決策映射為 `deny`（`PreToolUse` 沒有 `allow` 或 `ask`）。逐事件接線位于 [`src/index.ts`](src/index.ts)。

### 載荷與環境

payload 采用 Codex 形狀：snake_case，輪次事件帶 `turn_id`，每個事件都帶 `model` 與 `permission_mode: "default"`，stdin 寫入時不帶尾隨換行符。工具調用的 payload 攜帶真實 `tool_name` 與 `tool_input: { command }` 形狀（存在 `command` 參數時使用該值，否則使用 `''`），因此非 shell 工具參數不會被如實公開。基礎 payload 攜帶 `session_id` 與 `transcript_path`；后者保留 Codex `string | null` 形狀但始終為 `null`——持久化 seam 不暴露產物路徑，且默認 zstd 壓縮的會話日志無法被 hook 腳本讀取。Codex 不進行命令替換，也不注入插件環境。

### Matcher subject 與串行執行

matcher subject 是工具名稱（`PreToolUse`／`PostToolUse`）或會話源（`SessionStart`）；`UserPromptSubmit` 與 `Stop` 忽略 matcher。Codex matcher 始終是未錨定正則。匹配 hook 按配置順序串行運行，這使每個 hook 的 `hook/invoked`／`hook/result` 對在日志中相鄰，且最嚴格折疊與順序無關（`deny > ask > allow`）。

### 脫離運行與釋放

`SessionStart` 是唯一的 emit 點，它脫離運行——沒有擴展點等待它。每條運行鏈都會被跟蹤，對橋接執行 dispose（資源釋放）時會中止仍在運行的 hook 進程，并在 dispose 完成前排空 continuation（`createDetachedRuns`，位于 `dsh-hook-protocol`）。

### 設計理念

- **兼容適配器，而非強力工具。** 橋接的存在意義是運行現有 Codex 配置中顯式受支持的子集；定制行為應放在同一批擴展點上的原生插件中。
- **添加上下文不是否決。** 僅提供上下文的 hook 會先通過 `next()` 委托，再把其消息折疊進下游 enter 決策，因此后續 `agent/pre-step` 或 `tools/post-execute` 監聽器仍可拒絕或改寫。
- **每個失敗點都受控。** 配置讀取／解析失敗與無效 matcher 不注冊任何內容；拋異常的脫離注入會被捕獲并記錄，而不是破壞會話啟動或循環。
- **dispose 必須達到完全停穩。** 脫離運行會被跟蹤并在釋放時排空，因此不會有 hook 進程或遲到回調超出 fiber 存活。
- **保持方言形狀，而非最大化。** payload 保持 snake_case 并帶 `turn_id`／`model`，stdin 不帶尾隨換行符，橋接也不實現工具前審批或改寫路徑——即使 harness 本可以做得更多，也保留協議的形狀。

[hook-bridges Agent Note](../../../.agents/notes/archived/feature/2026-06-30-hook-bridges.md) 記錄了橋接設計與延期缺口；[hook-protocol-lib Agent Note](../../../.agents/notes/archived/feature/2026-06-30-hook-protocol-lib.md) 記錄了共享與逐方言的劃分。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：配置校驗、監聽器注冊、逐事件 payload、決策映射 |
| [`src/config.ts`](src/config.ts) | Codex 配置解析：五個受支持事件、matcher 校驗、跳過原因 |
| — | 不發布運行時不變式伴生入口；本橋接發布 hook-protocol 會話事件，既有 companion 負責校驗每個結果所引用的調用事件。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從共享協議進入橋接設計，以及橋接所面向的擴展點。

- [hooks 組地圖](../README.zh.md)——同級組頁面及其包表。
- [hook 協議庫](../hook-protocol/README.zh.md)——本橋接應用的共享鉤子規則。
- [鉤子橋接 Agent Note](../../../.agents/notes/archived/feature/2026-06-30-hook-bridges.md)——橋接設計、決策映射與延期缺口。
- [攔截擴展點 Agent Note](../../../.agents/notes/implemented/feature/2026-06-30-interception-extension-points.zh.md)——橋接所映射的類型化 Decision 接口面。
- [生成的配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-hooks-codex)——每個受支持配置字段及其源聲明。

-----

<a id="model-experience"></a>
## 模型體驗

### Hook 提供的上下文

#### 模型看到什么

`SessionStart`、已接受提示詞與工具后 hook 可以添加帶源歸因的上下文消息；阻塞 `Stop` hook 將原因添加為下一步 steering（中途引導）。

#### Token 影響

hook 不返回上下文時沒有成本。Hook 文本取決于數據，會被記錄，并在后續會話請求中重發，直到壓縮（compaction）。

#### KV Cache 影響

僅追加；新可見內容位于可復用請求前綴之后，不會使現有 KV Cache 條目失效。

### 已阻塞提示詞或工具結果

#### 模型看到什么

提供方提供的原因逐字傳遞。缺失原因時，已拒絕工具變為 `Error: blocked by PreToolUse hook`，已阻塞工具后反饋精確為 `blocked by PostToolUse hook`，阻塞 stop 則精確添加 steering `continue: blocked by Stop hook`；已阻塞提示詞不會產生任何模型可見消息，而是以 `blocked` 結束該輪次。Codex `systemMessage` 不會呈現。

#### Token 影響

阻塞提示詞不會產生該提示詞對應的模型請求 token；拒絕或反饋會添加保留的回退或提供方文本；強制 continuation 需要另一個完整請求。

#### KV Cache 影響

已阻塞提示詞不發送請求，不會導致失效。拒絕、反饋與強制 continuation 上下文會追加在可復用前綴之后，不改寫前綴。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制描述你的 Codex 鉤子目前還無法通過本橋接做到的事情，以及行為與參考工具的差異。它們是當前包約束，而非任務積壓。

- **不支持的 hook 事件（Codex 當前 10 項中的 5 項）**——`PermissionRequest`、`PreCompact`、`PostCompact`、`SubagentStart` 與 `SubagentStop`。這些事件的配置會在解析期間靜默丟棄。比較基線是 Codex [官方 hook 參考](https://learn.chatgpt.com/docs/hooks)。
- **`SessionStart` 只支持部分功能**——支持純 stdout 與 JSON `additionalContext`，但 hook 脫離運行，因此上下文可能錯過第一個請求。
- **`UserPromptSubmit` 只支持部分功能**——支持阻塞加純 stdout 或 JSON 上下文，但不會強制執行通用 `systemMessage` 與 `{"continue": false}` 控制。
- **`PreToolUse` 只支持部分功能**——支持阻塞，但會忽略 `additionalContext`、`permissionDecision: "allow"` 與 `updatedInput`。每個工具都表示為 `tool_input: { command }`，因此非 shell 工具參數不會被如實公開給 hook。
- **`PostToolUse` 只支持部分功能**——支持阻塞反饋與 JSON `additionalContext`，但不會強制執行 `{"continue": false}`，非 shell 工具參數會縮減為 `{ command }`，結構化工具輸出會在 `tool_response` 中展平為文本。
- **`Stop` 只支持部分功能**——阻塞會強制另一個模型輪次，但 `stop_hook_active` 始終為 `false`，`last_assistant_message` 始終為 `null`，且不會強制執行 `{"continue": false}`。因此，無條件阻塞 hook 會在每個步驟中強制 continuation，除非它自我限制。
- **通用 payload 與輸出字段只支持部分功能**——每個已映射事件都報告靜態配置的 `model` 與 `permission_mode: "default"`，而非當前 Codex 運行時值，且 `transcript_path` 永不填充：它始終為 `null`，因為持久化 seam 不暴露產物路徑，且默認 zstd 壓縮的會話日志無法被 hook 腳本讀取。`systemMessage` 會被記錄 + 警告但不呈現，`{"continue": false}` 會被記錄但不會應用 Codex 的事件特定停止行為。
- **配置加載與執行只支持部分功能**——一個進程級 `configPath` 會在加載時解析；尚未實現 Codex 的活動用戶層、項目層、會話層、系統／托管層與插件層、信任控制以及內聯 `config.toml` hook 形態。只運行同步 `command` handler，`statusMessage` 與 `commandWindows` 等當前元數據會被忽略，匹配 handler 串行運行，而非使用 Codex 的并發啟動語義。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文：開放問題與尚未決定的探索方向。它明確不具權威性——已交付的行為、限制與既定理由以上文、包代碼和相關 Agent Note 為準。

上面的延期缺口就是工作隊列：按會話的 hook 配置發現、會話啟動投遞門、stop 循環防護，以及 `continue: false` 的運行級停止。目前均無設計；官方 Codex 參考是實現其中任何一項的基線。

</details>
