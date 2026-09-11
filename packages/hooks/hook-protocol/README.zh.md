---
description: "Claude Code 與 Codex 橋接背后的共享鉤子規則——鉤子能做什么、運行時會發生什么——供 hooks 子系統的用戶與維護者閱讀。"
kind: "package-library"
---

# @deepseek-ai/dsh-hook-protocol

[English](README.md) | 中文

## 概述

`dsh-hook-protocol` 讓兩個橋接以相同方式處理你的鉤子：它定義鉤子能做什么、運行時會發生什么。你無需自行安裝或配置它——選擇 `dsh-hooks-claude-code` 或 `dsh-hooks-codex`，把它指向你現有的 `hooks.json`，這些規則就會作用于你的鉤子。通過任一橋接，鉤子都可以帶一條模型可見的消息阻塞提示詞或工具調用、向對話附加額外上下文，或請求運行停止。只有 command 鉤子會運行；`http`、`mcp_tool`、`prompt` 與 `agent` handler 會被跳過并給出警告。

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

你無需直接安裝或配置本包——掛載 `dsh-hooks-claude-code` 或 `dsh-hooks-codex` 就會把這些規則應用到你的 `hooks.json` 鉤子上。用本頁了解鉤子能做什么、運行時會發生什么；兩個橋接頁面列出各方言支持的事件。

### 何時選擇

當你持有現有的 Claude Code 或 Codex 鉤子、希望它們在 agent（智能體）運行期間繼續工作時，選擇 `dsh-hooks-claude-code` 或 `dsh-hooks-codex`。你永遠不會直接選擇本包。沒有參考工具對應物的定制行為請避開整個組：原生 Cordis 插件擁有完整的 harness API，無需中間的鉤子協議。

### 鉤子能做什么

- **帶消息阻塞操作**——退出碼為 2 的鉤子會停止提示詞或工具調用，其錯誤輸出會作為原因展示。
- **工具運行前請求確認**——Claude Code 鉤子可以請求確認而非直接阻塞；Codex 橋接不呈現此選項。
- **附加上下文**——鉤子可以返回額外文本，模型會在下一次請求中看到。
- **在選定時刻運行**——鉤子配置按名稱或 pattern 選擇觸發的事件；缺失、空或 `'*'` pattern 表示該類的每個事件。
- **失敗不停止運行**——除 2 以外的任何退出碼都是非阻塞失敗：操作繼續，失敗被記錄；完全無法啟動的鉤子按同樣方式處理。
- **請求運行停止**——鉤子可以請求運行停止（`{"continue": false}`）；該請求會被記錄，但沒有運行級效果（見已知限制）。

### 鉤子運行時你會看到什么

- 鉤子阻塞時，操作不會發生，鉤子的消息會被展示。
- 鉤子附加上下文時，模型會在下一次請求中看到該文本。
- 失敗的鉤子——命令錯誤、崩潰或除 2 以外的任何退出碼——會被記錄，不會停止 agent。
- 如果鉤子配置無法讀取或解析，橋接會記錄警告且不運行任何鉤子；agent 仍會啟動。
- 混合鉤子類型的配置仍然可用：`http`、`mcp_tool`、`prompt` 與 `agent` handler 會被跳過并給出警告，其 command 鉤子照常運行。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋本庫背后的設計決策，并指出實現它們的代碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 處理流水線

本庫是一串單一用途的步驟，每個步驟一個函數：校驗 matcher pattern、通過 `dsh-shell` 執行器運行命令、解碼結果、把每個匹配 hook 的結果合并為最嚴格的一個結果，并記錄持久的 `hook/*` 事件對。matcher 的 `mode` 參數是兩個方言唯一的差異軸——`claude-code` 把 pattern 解釋為字面量備選或正則，`codex` 始終解釋為未錨定正則。每個步驟都會降級為受控結果而不是拋異常，因此鉤子永遠不會使調用輪次崩潰：無效正則是運行時的不匹配，執行器拒絕會變成沒有退出碼的 `HookOutput`，退出碼 2 以 stderr 作為原因阻塞，其他失敗均不阻塞。合并應用 `deny > ask > allow` 優先級，保持首個 `continue: false` 停止的粘性，并按 hook 順序累積上下文。脫離運行會被跟蹤，因此 `fiber.dispose()` 能達到完全停穩；不變式伴生插件會拒絕位于尚未結束的輪次之外的 `hook/*` 記錄。這些步驟位于 [`src/matcher.ts`](src/matcher.ts)、[`src/runner.ts`](src/runner.ts)、[`src/codec.ts`](src/codec.ts)、[`src/merge.ts`](src/merge.ts)、[`src/events.ts`](src/events.ts)、[`src/detached.ts`](src/detached.ts) 與 [`src/invariant.ts`](src/invariant.ts)。

### `hook/*` 會話事件

`hook/invoked` 與 `hook/result` 事件通過 declaration merging 合并進 `SessionEventMap`，作為僅日志記錄：與 `compaction/*` 相同，它們不是 surface 事件，也不攜帶 `surfaceOp`。`hook/result` 按 `handlerId` 與其 `hook/invoked` 配對，決策規則由 `appendHookResult` 負責。載荷與逐事件 JSDoc 位于生成的[持久化日志事件目錄](../../../docs/persistence-catalog.zh.md)中。

調用與結果記錄必須位于尚未結束的輪次內：`UserPromptSubmit`、`PreToolUse`、`PostToolUse` 與 `Stop` 按構造滿足該關系，而 `SessionStart` 在輪次 1 之前運行、沒有 `hook/*` 記錄——改為投遞其注入的上下文。不變式伴生插件注冊到 `ctx.invariants`，拒絕在尚未結束的輪次之外追加的 `hook/*` 事件、沒有匹配 invoked 的結果、未知方言或非有限時長。

### 設計理念

- **把唯一差異軸收攏進 `mode`。** 兩個方言只在 matcher pattern 的解讀方式上不同，因此 matcher 把 mode 作為參數，而不是復制引擎。
- **執行器擁有進程控制。** 命令通過 `dsh-shell` 執行器運行，而非自建 spawn：執行器已經提供了協議所需的已清理但可覆蓋的環境、進程組取消與超時。
- **絕不向循環拋異常。** 每種失敗模式——格式錯誤的 JSON、無效正則、執行器拒絕——都會降級為受控的結果或不匹配，因此鉤子永遠不能使調用輪次崩潰。
- **僅日志、輪次內的事件。** `hook/*` 記錄是「運行了什么、決定了什么」的持久證據；它們不是 surface 事件，不變式伴生插件會拒絕尚未結束的輪次之外的記錄。

[hook-protocol-lib Agent Note](../../../.agents/notes/archived/feature/2026-06-30-hook-protocol-lib.md) 記錄了共享與逐方言的劃分以及備選方案。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 每個原語與事件輔助函數的公開導出 |
| [`src/matcher.ts`](src/matcher.ts) | 匹配全部哨兵、字面量或正則模式、校驗與運行時匹配 |
| [`src/runner.ts`](src/runner.ts) | 通過 `ctx.shell` 的 `runHook` 執行與 `DEFAULT_HOOK_TIMEOUT_MS` |
| [`src/codec.ts`](src/codec.ts) | 退出碼與結構化 stdout 解碼為 `HookOutput` |
| [`src/merge.ts`](src/merge.ts) | 最嚴格合并與 `MergedHookOutcome` 類型 |
| [`src/events.ts`](src/events.ts) | `hook/*` 事件聲明、追加輔助函數、stderr 摘要 |
| [`src/detached.ts`](src/detached.ts) | 脫離運行的完全停穩跟蹤 |
| [`src/types.ts`](src/types.ts) | `HookOutput`、`MatcherGroup`、`CommandHook` 與 `hook/*` 載荷類型 |
| [`src/invariant.ts`](src/invariant.ts) | 不變式伴生插件：配對、輪次包裹、方言與時長檢查 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從共享規則進入應用這些規則的橋接，以及它們所面向的擴展點。

- [hooks 組地圖](../README.zh.md)——同級組頁面及其包表。
- [hook-protocol-lib Agent Note](../../../.agents/notes/archived/feature/2026-06-30-hook-protocol-lib.md)——協議核心為何共享、各橋接負責什么。
- [鉤子橋接 Agent Note](../../../.agents/notes/archived/feature/2026-06-30-hook-bridges.md)——兩個橋接如何使用這些原語。
- [攔截擴展點 Agent Note](../../../.agents/notes/implemented/feature/2026-06-30-interception-extension-points.zh.md)——橋接所映射的類型化 Decision 接口面。
- [生成的持久化日志事件目錄](../../../docs/persistence-catalog.zh.md)——`hook/*` 事件載荷與逐事件 JSDoc。

-----

<a id="model-experience"></a>
## 模型體驗

通過 `dsh-hooks-claude-code` 與 `dsh-hooks-codex` 間接影響；它們是將解碼后的 hook 輸出渲染為模型上下文的唯一消費方。

#### KV Cache 影響

不會直接失效；請求前綴變更由上述消費方負責。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制描述鉤子目前還無法通過共享引擎做到的事情。它們是當前包約束，而非任務積壓。

- **`HookOutput.updatedInput` 會被解析但不會應用**——輸入改寫是已延期的一致性設計問題（見 [pre-tool-input-rewrite Agent Note](../../../.agents/notes/proposed/feature/2026-06-30-pre-tool-input-rewrite.zh.md)）；當 hook 設置它時，橋接會記錄并警告。
- **折疊出的停止沒有運行級效果**——`mergeHookOutputs` 把 `continue: false` 折疊為粘性 `stop`，但攔截點沒有硬停止原語，因此橋接只記錄該停止并保留 hook 的逐點效果。
- **只有 command 形態會運行**——協議只執行 `{ type: 'command', command, timeout? }`；橋接會解析并跳過其方言定義的其他形態（`http`、`mcp_tool`、`prompt`、`agent`）。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文：開放問題與尚未決定的探索方向。它明確不具權威性——已交付的行為、限制與既定理由以上文、包代碼和相關 Agent Note 為準。

#### 未來：運行級停止

請求停止整個運行的 hook（`continue: false`）會被折疊進 `MergedHookOutcome.stop`，但不會在任何地方生效：攔截點缺少硬停止原語，輪次中途的請求改為在 `hook/result` 中記錄該停止。運行級停止機制可以讓橋接真正應用它；目前尚無設計。

</details>
