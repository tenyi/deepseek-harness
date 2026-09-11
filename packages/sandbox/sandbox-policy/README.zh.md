---
description: "面向需要在各項負責強制執行的能力之間組合、配置或排查文件操作策略的用戶與維護者，提供共享的逐調用沙箱策略解析器與當前模型上下文。"
kind: "package-reference"
---

# @deepseek-ai/dsh-sandbox-policy

[English](README.md) | 中文

## 概述

使用本包可以讓每次受限的 bash、文件系統和終端調用遵循同一份文件操作策略。部署方選擇默認模式和回退工作區根目錄，每個會話則可以獨立切換模式。會話選擇可跨重啟保留，所有強制執行能力在一次調用中使用相同的模式和工作區。每次模型請求前，模型都會收到有效策略和工作區說明，但不會收到已掛載能力的清單。

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

在任何運行沙箱強制執行能力的組合中掛載此包：它擁有這些能力消費的部署默認值與逐會話覆蓋，并把當前策略貢獻給模型的運行時上下文快照。

### 何時選擇

為每個帶受限能力（bash、文件系統、終端）的組合選擇它，讓單一策略歸屬位置防止它們漂移到不同的模式或工作區根目錄。只有沒有任何沙箱策略強制執行時才跳過它——沒有消費方時，解析出的策略不起作用。

### 最小配置

用默認模式加載本包；故障安全默認值是 `read-only`，需要 agent（智能體）可寫入工作區的部署必須顯式選擇 `workspace-write`。

```yaml
- name: '@deepseek-ai/dsh-sandbox-policy'
  config:
    mode: workspace-write
    workspaceRoot: /absolute/path/to/workspace
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `mode` | `read-only` | 會話起始的部署默認模式，加載時驗證 |
| `workspaceRoot` | `process.cwd()` | 無 agent 調用或沒有 cwd 的會話在 `workspace-write` 下可寫入的回退根目錄；普通 agent 調用改用會話的不可變 cwd |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-sandbox-policy)是每個受支持字段及其 JSDoc 的窮盡式真源。

### 切換會話模式

會話的模式可以在運行時通過 UI 策略控件或顯式切換來更改；切換記錄在會話日志中，并在該會話的下一次受限調用時生效。切換通過回放跨重啟保留，每個會話保持自己的模式——兩個會話絕不會看到彼此狀態。切換后的會話繼續以不可變的工作區 cwd 作為寫入邊界。

### 失敗與恢復

無效的配置模式會在插件加載時被拒絕，因此拼寫錯誤會導致顯式報錯，而不是靜默改變策略。沒有 cwd 的會話與無 agent 調用回退到配置的工作區根目錄；帶已批準顯式模式的調用只在該次調用中使用該模式。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋策略解析、逐會話存儲與模型可見貢獻；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 解析優先級

`resolve({ session, mode })` 返回一份完整的逐調用策略：已批準的顯式模式優先于會話最后一條 `sandbox/mode` 事件，后者又優先于部署默認值。會話的不可變 `cwd` 先按文件系統語義規范化，再成為工作區根目錄，因此 `symlink/..` 與進程工作目錄解析一致；否則使用配置的回退值。

### 逐會話存儲

運行時切換是在對應會話日志中追加的一條僅寫入日志的 `sandbox/mode` 事件——切換本身就是事件，任何機制都不會在帶外修改模式狀態。`effective = explicit grant ?? fold(events) ?? deployment default`，因此覆蓋通過回放跨重啟保留，兩個會話也絕不會看到彼此狀態。工作區標識無需事件：創建時記錄的不可變 `SessionHeader.cwd` 是該會話每次調用使用的根。事件仍只進入日志；在每次請求前，歸屬方會把當前事實貢獻給完整運行時上下文快照，agent loop（智能體循環）將該快照記錄為一條帶來源的 `user/message`。

### 模型可見文本

`sandbox:policy` 貢獻說明該模式與具體能力無關的文件操作約定，以及 `workspace-write` 下規范化的會話工作區。它不枚舉已掛載能力；工具插件保留特定于操作的拒絕與升權引導，批準策略單獨貢獻給同一份快照，計劃引導仍由 `dsh-plan-mode` 的系統段落管理。可選的 `./invariant` 配套組件會拒絕值超出封閉模式詞匯的偽造持久 `sandbox/mode` 事件。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`SandboxPolicyService`、`Config` schema、策略解析與上下文貢獻 |
| [`src/session-mode.ts`](src/session-mode.ts) | `sandbox/mode` 事件、其 fold 與寫入路徑 |
| [`src/invariant.ts`](src/invariant.ts) | 不變式配套組件：拒絕超出封閉詞匯的 `sandbox/mode` 值 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

先從子系統參考文檔了解共享詞匯，再看 seam 約定與跨家族決策。

- [進程沙箱子系統](../../../docs/subsystems/sandbox.zh.md)——模式、逐調用策略與強制執行語義。
- [沙箱 seam 包](../sandbox/README.zh.md)——每個強制執行能力實現的隔離約定。
- [跨家族文件沙箱決策](../../../.agents/notes/implemented/feature/2026-07-14-cross-family-fs-sandbox.zh.md)——為何存在統一的共享策略歸屬位置。

-----

<a id="model-experience"></a>
## 模型體驗

### 當前文件沙箱策略

#### 模型看到什么

每個 agent 會話的當前運行時上下文快照中都有一項 `sandbox:policy` 貢獻。它不枚舉已掛載的能力。工具插件繼續負責操作與升權引導，批準策略單獨貢獻給同一份快照，計劃引導仍由 `dsh-plan-mode` 的系統段落管理。

##### 只讀

```markdown
Current DSH file policy: read-only. Any available operation enforced by the DSH file sandbox cannot modify files in the standing mode. Do not refuse a required modification from this policy alone: try an available tool normally and follow any denial and escalation guidance it returns.
```

##### 工作區寫入

```markdown
Current DSH file policy: workspace-write. Any available operation enforced by the DSH file sandbox may modify files under the session workspace: "<workspace root>". Some platform temporary areas may also be writable.
```

##### 完全訪問

```markdown
Current DSH file policy: danger-full-access. The DSH file sandbox does not restrict file modifications by available operations.
```

#### Token 影響

首次請求和有效策略每次變化時增加一條簡潔的持久上下文消息；未變化的請求不增加內容。`workspace-write` 只攜帶規范化的會話工作區路徑；平臺特定的臨時路徑會以摘要表述，不會加入依賴主機的字節。

#### KV Cache 影響

模式切換時，穩定的系統提示詞仍逐字節相同。變化后的完整上下文快照會追加到保留的歷史之后，從而保留此前已緩存的前綴；后續未變化的請求會復用該保留快照。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制界定了本包提供的策略范圍。它們是當前的包級約束，并非通用沙箱對比，也不是待辦事項清單。

- **每個會話只有一個主要工作區根目錄**——策略解析 `SessionHeader.cwd`；額外可寫根目錄不屬于 `SandboxExecutionPolicy`。
- **僅限文件操作模式**——`SandboxMode` 管控文件操作；網絡和進程策略不在其詞匯中，因此這里沒有限制它們的旋鈕。
- **有意概述臨時區域**——強制執行后端會授予不同的平臺臨時區域，這些區域在策略解析后才會選定，因此無法在當前上下文中如實枚舉。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
