---
description: "面向用戶與維護者的工作區指令上下文說明，用于啟用、設置預算或排查 AGENTS.md/CLAUDE.md 的加載與刷新。"
kind: "package-reference"
---

# @deepseek-ai/dsh-agent-instructions

[English](README.md) | 中文

## 概述

`dsh-agent-instructions` 向 agent（智能體）提供來自用戶全局文件和項目級文件的工作區指引；這些文件均與 `AGENTS.md` 兼容。它為第一次請求加載適用的指令鏈。它不會持續監視外部編輯：成功的文件系統操作會發現新適用的嵌套文件，并讓后續變更或移除可見；恢復會話也會對賬基線。`dsh-base` 默認啟用此行為，profile 可以禁用。字節預算限制注入的上下文：較寬泛的文件先被省略，最具體的文件最后被截斷，空指令鏈不添加任何內容。

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

當 agent 需要依據工作區自身的指令文件工作時，掛載此插件。`dsh-base` 已包含它并給予 65,536 字節預算，因此基于 base 的 profile 僅在需要其他 `maxBytes` 時替換該配置行；沒有文件系統提供方的樹加載不到任何內容，直到提供方出現。

### agent 獲得的內容

第一次請求包含一條持久基線消息：先是用戶全局 `$DSH_HOME/AGENTS.md`，再按從寬泛到具體的順序包含項目指令鏈——從項目根目錄到會話工作目錄的每個目錄中所有現有候選文件。去除首尾空白后內容一致的同級文件只渲染一次，因此復制了 `AGENTS.md` 的 `CLAUDE.md` 不會被重復加載。當成功的 `read`、`write` 或 `edit` 調用到達更深的目錄后，下一次請求會包含新適用的指令文件；已改變的文件會替換其內容，消失或成為較早候選文件重復項的文件會產生移除通知。

### 配置

默認設置適合典型檢出：`.git` 標記項目根目錄，`AGENTS.md` 與 `CLAUDE.md` 是基礎候選，`AGENTS.local.md` 與 `CLAUDE.local.md` 是疊加的本地 overlay。只有 `maxBytes` 必填——它限制完整渲染后的基線，讓每個部署顯式選擇自己的提示詞預算。

只有確認項目根標記不存在時，項目根發現才會繼續上溯。權限或 I/O 失敗會停止發現，并拋出宿主或文件系統提供方的原始錯誤，而不會選擇祖先項目。[根標記元數據決策](../../../.agents/notes/implemented/bug-fix/2026-09-03-root-marker-metadata-failures.zh.md)說明發現為何必須失敗，而不能替換為其他根目錄。

```yaml
- name: '@deepseek-ai/dsh-agent-instructions'
  config:
    maxBytes: 65536
```

受支持的字段一覽：

```ts
export interface Config {
  dshHome?: string
  projectRootMarkers?: string[]
  maxBytes: number
  maxSourceBytes?: number
  instructionFileCandidates?: string[]
  localInstructionFileCandidates?: string[]
}
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `maxBytes` | 必填 | 完整渲染基線消息的上限，單位為字節 |
| `maxSourceBytes` | `1048576` | 渲染前單個源指令文件的上限 |
| `projectRootMarkers` | `['.git']` | 標記項目根目錄的目錄名 |
| `instructionFileCandidates` | `['AGENTS.md', 'CLAUDE.md']` | 每個項目目錄中加載的基礎文件名 |
| `localInstructionFileCandidates` | `['AGENTS.local.md', 'CLAUDE.local.md']` | 在基礎文件之后加載的本地 overlay 文件名 |
| `dshHome` | `$DSH_HOME` 或 `~/.dsh` | 存放用戶全局 `AGENTS.md` 的目錄 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-agent-instructions)是每個受支持字段及其 JSDoc 的窮盡式真源。

### 觀察預算

渲染會優先保留最具體的文件：先丟棄完整的較寬泛文件，再截斷最具體的文件，并發出可見的 `Workspace instruction budget ...` 通知，指名被省略與被截斷的路徑。渲染后的字節數絕不超過 `maxBytes`。超出預算的寬泛文件會被忽略；刷新期間它被視為暫時不可用，而非被移除。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋插件背后的設計決策；可觀察行為見[使用本包](#use-this-package)。

### 設計理念

該插件建立在一個原則上：工作區指令是持久的對話內容，按 agent 與會話分別歸屬。基線消息與刷新消息都是普通的帶來源 `user/message` 事件，因此與其他歷史一樣可回放、可壓縮（compaction）、可恢復，模型可見狀態總能從會話日志重建。插件擁有完整的 `<system-reminder>` 框架，每條注入消息都原樣到達模型。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：pre-step 監聽器、`tools/result` touch 跟蹤、inbox 組合 |
| [`src/config.ts`](src/config.ts) | `Config` schema、預算解析、基線標識 |
| [`src/files.ts`](src/files.ts) | 候選發現、項目根搜索、有界流式讀取 |
| [`src/render.ts`](src/render.ts) | 指令渲染、預算截斷、變更記錄 |
| [`src/state.ts`](src/state.ts) | 持久消息來源、版本／digest 緩存、對賬 |
| [`src/digest.ts`](src/digest.ts) | SHA-1 內容標識與每目錄重復鍵 |
| — | 不發布運行時不變式伴生入口；回放會容忍未知或格式錯誤的 workspace source，私有 pending/cache 狀態轉換由針對性流水線測試覆蓋。 |

### 主要流程

在會話第一次符合條件的 `agent/pre-step`，插件組合基線并把它折入進入步驟的批次、緊隨已領取的消息之后。成功的第一方 `read`、`write`、`edit` 調用貢獻的 touch 會沿父級執行 token 逐層上浮；當外層步驟進入持久歷史后，一次投影會把可見會話狀態與 inbox 對賬，并排入新增、替換或移除。路徑與 digest 都未變的內容絕不重復注入。發現跟隨結構化文件系統活動，而非 shell 導航，因為每次本地 shell 調用都啟動新進程，解析任意 shell 語法不是可靠的文件系統 seam。

### 不變式

每條注入消息都攜帶帶類型的來源及其變更列表；完整基線還攜帶從規范化發現、優先級、項目根與預算配置派生的標識，匹配的持久消息會確認已排隊的基線。模型可見文本不含隱藏狀態標記，指令內容或模型可見元數據中的字面 `</system-reminder>` 文本都會被轉義，因此倉庫控制的文本無法關閉插件控制的框架。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

包級約定不夠用時閱讀以下頁面。它們從指令文件格式逐步進入設計決策與窮盡式配置。

- [文檔標準](../../../docs/AGENTS.md)——`AGENTS.md` 指令文件包含什么、如何維護。
- [工作區上下文決策記錄](../../../.agents/notes/archived/feature/2026-06-24-workspace-context.md)——按 agent／會話隔離與生命周期理由。
- [上下文組地圖](../README.zh.md)——相鄰的請求上下文包。
- [生成的配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-agent-instructions)——每個受支持配置字段及其源聲明。

-----

<a id="model-experience"></a> <a id="prompt-shape"></a>
## 模型體驗

### 基線上下文

#### 模型看到的內容

第一次請求的派生歷史中包含一條持久 user 角色消息，其中按從寬泛到具體的順序包含有界用戶全局指令與項目指令鏈。可見基線兼容時，恢復會復用該消息。

##### 基線指令模板

```markdown
<system-reminder>
The following workspace instructions may be relevant to your work. Use them as guidance when applicable. More specific instructions take precedence over broader ones. They do not override system, developer, or direct user instructions.

Instructions from: ~/.dsh/AGENTS.md

<user-global-instructions>

Instructions from: AGENTS.md

<project-instructions>
</system-reminder>
```

#### Token 影響

渲染后基線只追加一次，并保留在派生歷史中直到壓縮。`maxBytes` 限制完整消息，較寬泛文件在最具體文件截斷之前被省略，空指令鏈不產生 token。

#### KV Cache 影響

僅追加，位于現有可復用前綴之后。可見基線標識兼容時，恢復會保持復用；不兼容的標識會追加一條完整替代基線，因此發現、優先級、項目根或預算變更只會從該歷史位置起影響復用。

### 新發現的 scope 上下文

#### 模型看到的內容

成功的第一方文件系統調用到達更深目錄后，下一次請求會包含一條保留的帶來源 `user/message`，其中包含新適用的指令文件。

##### 附加指令模板

```markdown
<system-reminder>
Additional instructions from: packages/app/AGENTS.md

These instructions apply to work under `packages/app`. Use them as guidance when relevant; more specific instructions take precedence. They do not override system, developer, or direct user instructions.

<nested-instructions>
</system-reminder>
```

#### Token 影響

每個已發現 scope 都會添加有界歷史 token，直到壓縮。可見會話狀態與版本／digest 比較會抑制未更改內容，PTC mode 將同一消息延遲至外層 `run_code` 結果及其所屬持久步驟之后。

#### KV Cache 影響

僅追加；新可見內容位于可復用請求前綴之后，不會使現有 KV Cache 條目失效。

### 已改變或移除的指令上下文

#### 模型看到的內容

已改變的文件會產生 `Updated instructions from: <path>` 加替換內容。消失或成為同一目錄中較早候選文件重復項的候選文件會產生下方移除通知。

##### 移除通知

```markdown
<system-reminder>
Instructions removed: packages/app/AGENTS.md

The previously loaded instructions from this file no longer apply.
</system-reminder>
```

#### Token 影響

每項已確認變更或移除都是一條受 `maxBytes` 限制的保留歷史消息。提供方失敗不添加消息，預算省略的更新仍可在后續文件系統 touch 中處理。

#### KV Cache 影響

僅追加；新可見內容位于可復用請求前綴之后，不會使現有 KV Cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明指令加載何時不合適或需要運維注意。它們是當前包約束，不是任務積壓。

- **發現跟隨結構化 fs 工具，而非 shell 導航**：更改目錄的 `bash` 命令不會觸發嵌套指令發現，因為 shell 語法與每次調用的 shell 狀態不是可靠的文件系統 seam。
- **刷新由 touch 驅動**：沒有 watcher；外部編輯會在下一次成功的第一方 `read`、`write` 或 `edit` 時、恢復對賬可見基線時，或進入步驟的 pre-step 恢復被遮蔽基線時可見。
- **候選語義有意保持簡單**：不解釋小寫名稱、`.claude/rules/` 與 `@path` import；項目 scope 默認加載 `AGENTS.local.md`／`CLAUDE.local.md` overlay，但用戶全局 `$DSH_HOME` scope 沒有本地 overlay，其他自定義名稱需要顯式候選配置。
- **每目錄去重基于內容**：同級候選只有在去除首尾空白后字節完全一致時才折疊。`CLAUDE.md` 若 symlink 到同級 `AGENTS.md`，會解析為相同內容并像任何重復項一樣折疊；從 `AGENTS.md` 漂移的獨立副本則會與它一起完整加載。
- **Symlink 指令文件會跨越信任邊界跟隨**：最終組件是 symlink 的候選文件會被解析并加載其目標，因此克隆倉庫可以將樹外文件內容呈現為較低優先級的工作區指引（它絕不覆蓋 system、developer 或用戶直接下達的指令）。加載不受信任倉庫時，請用文件系統策略門禁或 OS 沙箱限制 `ctx.fs`。
- **指令內容受限但不會被摘要**：超出預算的寬泛文件會被省略，最具體文件可能被截斷；該插件絕不請求模型壓縮指令文本。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
