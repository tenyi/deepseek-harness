---
description: "本地文件系統 skill 提供方，供編寫本地 skill 或配置項目、自定義與用戶 skill 根目錄如何被發現與監視的用戶與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-skill-filesystem

[English](README.md) | 中文

## 概述

agent（智能體）可以使用來自倉庫、自定義目錄或用戶 agent 配置的本地 skill（技能）：把 skill 編寫為任一被掃描根目錄下的目錄 bundle（內含 `SKILL.md`）或平鋪 `<name>.md` 文件，它就會出現在會話目錄中。該提供方發現項目、自定義與用戶根目錄，解析每個 skill 的 YAML frontmatter，并監視這些目錄，因此新增、改名或刪除的 skill 無需重啟即可到達 agent。當 skill 存放在磁盤上時選擇它——注冊表（`dsh-skill`）接受任意提供方，其他提供方可以從別處提供 skill。

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

掛載插件即可讓本地 skill 對 agent 可用。它掃描下方的項目、自定義與用戶 skill 根目錄，把每個 skill 的 frontmatter 解析為目錄條目，并按需加載正文；它還會監視這些根目錄，使新增、改名或刪除的 skill 無需重啟即可進入下一次目錄。

### 何時選擇

當 skill 存放在磁盤上——倉庫、自定義目錄或用戶的 agent 配置中——時，使用此提供方。當 skill 來自遠程注冊表或嵌入式插件數據時，請避免使用：注冊表接受任意提供方，本包只是其中一種實現。

### skill 格式

skill 可以是被掃描根目錄頂層的目錄 bundle `<name>/SKILL.md`，也可以是平鋪文件 `<name>.md`；刻意不支持發現嵌套的 `**/SKILL.md`。文件以 YAML frontmatter 開頭：必填 `name` 與 `description`，另有可選 `whenToUse`、`metadata`、`disable-model-invocation` 與 `user-invocable`。

`disable-model-invocation: true` 會把 skill 從面向模型的目錄和 loader 中排除；`user-invocable: false` 會把它從面向用戶的命令中排除，省略的字段默認允許對應接口調用。這兩個鍵接受 YAML 布爾值，以及不區分大小寫的 `true`/`false`、`yes`/`no`、`on`/`off` 和 `1`/`0` 形式；被拒絕的拼寫或非布爾值會讓整個 skill 隨警告一起被丟棄，而不會靜默允許某個接口。

目錄條目和已加載 skill 提供解析后的指令文件路徑，使符號鏈接目錄和扁平文件都能作為普通文件預覽。重新加載的定位信息和資源根保留發現時的路徑，包括符號鏈接。

目錄與正文具有獨立的生命周期：發現階段把 frontmatter 解析進目錄條目，每次加載都會重新讀取當前文件，因此編輯 skill 正文無需版本化或緩存失效。

### 根目錄與優先級

默認根按該提供方的 rank 順序掃描：

| Rank | 來源 | 路徑 |
|---|---|---|
| 100 | `project-dsh` | `<projectRoot>/.dsh/skills` |
| 200 | `project-agents` | `<projectRoot>/.agents/skills` |
| 300 | `custom` | `Config.customSkillDirs` |
| 400 | `user-dsh` | `<dshHome>/skills` |
| 500 | `user-agents` | `<agentsHome>/skills` |

項目根目錄是包含 `.git` 的最近祖先目錄；如果不存在，則使用當前 cwd。用戶 DSH 根目錄會跳過其 `.system` 子目錄。`includeDefaultRoots: false` 會省略項目根、用戶根以及 `$DSH_BUNDLED_SKILL_DIR` 默認值，使隔離提供方只看到自身配置的根；`bundledSkillDir` 會按 rank 600 添加一個隨包提供的根目錄。

### 掛載與配置

與 skill 注冊表一起加載該插件；它需要 `ctx.skills`。

```yaml
- name: '@deepseek-ai/dsh-skill'
- name: '@deepseek-ai/dsh-skill-filesystem'
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `providerName` | `filesystem` | 注冊到 `ctx.skills` 的唯一提供方名稱 |
| `includeDefaultRoots` | `true` | 在 `customSkillDirs` 周圍包含項目根與用戶根 |
| `dshHome` | `$DSH_HOME` 或 `~/.dsh` | Harness 配置根目錄；掃描其 `skills` 子目錄 |
| `agentsHome` | `$DSH_AGENTS_HOME` 或 `~/.agents` | 為兼容 skill 掃描的共享 agent 配置根目錄 |
| `customSkillDirs` | `[]` | 其他本地 skill 根目錄，位于項目根之后、用戶根之前 |
| `watch` | `true` | 監視本地根，并在目錄可能變化時使提供方失效 |
| `bundledSkillDir` | — | 配置后按 rank 600 掃描的隨包提供的 skill 根目錄 |

其余 `watch*` 字段用于調節 Chokidar 行為——輪詢、穩定窗口、間隔、項目上限與符號鏈接跟隨。生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-skill-filesystem)完整列出了所有字段，是這些字段的真源。

### 變更檢測

現有根目錄會被監視，因此新增、改名或刪除 skill（或編輯其 frontmatter）會在下一個模型步驟觸發目錄刷新；`references`、`scripts`、`assets` 等 bundle 資源下的編輯不會觸發。當第一方 `write` 與 `edit` 工具的目標可能影響受監視的 skill 時，它們會直接使提供方失效，因此模型無需等待宿主 watcher 即可觀察到自身的文件系統變更。外部 IDE、Git 與 shell 變更由宿主 watcher 捕獲；尚不存在的根目錄會被探測，直至其出現。

### 可觀察的成功與失敗

任一被掃描根目錄下的有效 skill 都會按名稱排序出現在會話目錄中，加載它即可返回當前文件正文。缺少有效 frontmatter、名稱無效或調用值無效的文件會隨警告被跳過，因此模型目錄不會收到逐 skill 診斷，也無法區分缺失的 skill 與無效的 skill。意外的發現或讀取失敗會讓目錄觀測保持不完整，而不會用看似發生刪除的結果替換最后一份可用視圖。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋發現與監視如何組織；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

該提供方采用兩項職責分離。第一，目錄與正文分離：發現階段把 frontmatter 解析為摘要，而每次加載都重新讀取文件，因此正文編輯無需 hash、修訂號或緩存失效。第二，發現與監視分離：`list()` 在存在文件系統服務時通過 `ctx.fs` 掃描根目錄并解析項目根（否則回退到可中止的 Node I/O），而獨立的監視管理器負責 Chokidar 句柄、缺失根探測與失效。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口、提供方、根解析、frontmatter 解析、監視管理器 |
| — | 不發布運行時不變式伴生入口；本包沒有獨立事件序列或可變數據關系，相關約定在所屬 seam 強制執行。 |

### 發現流程

發現過程先為查找 cwd 解析根列表，讓監視管理器附加到每個根，再掃描每個根的直接條目：目錄 bundle 解析為 `<name>/SKILL.md`，平鋪文件解析為 `<name>.md`。每個文件都會解析 frontmatter——`name` 必須為 kebab-case，`description` 必填，調用鍵按嚴格布爾語法解析——候選項攜帶根目錄的來源標簽與 rank，供注冊表與其他提供方合并。已確認缺失的路徑屬于有效空狀態；格式錯誤或非文本條目會隨警告跳過。

### 監視與失效

現有根目錄由 Chokidar 以深度 1 監視；不存在的根會從最近的現有祖先開始，借助 `fs.watchFile` 每次沿一個缺失路徑段跟蹤。相關事件——直屬 bundle 添加/移除、平鋪 `.md` 添加/移除、直接 `SKILL.md` 添加/移除/變更——會在每個微任務批次合并為一次提供方失效，資源子樹下的變更則被忽略。監視管理器受 `watchMaxProjects` 限制，會記錄啟動失敗并重試，并在釋放時關閉所有句柄。第一方 `write`/`edit` 變更通過 `fs/observed` 事件同步失效。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從注冊表約定逐步進入渲染已發現 skill 的消費方，以及配置默認值使用的 home 路徑解析。

- [skill 子系統參考](../../../docs/subsystems/skills.zh.md)——注冊表約定與本地發現優先級表。
- [skill 包](../skill/README.zh.md)——該提供方注冊到的注冊表。
- [tool-skill 包](../tool-skill/README.zh.md)——已發現 skill 如何到達會話目錄與模型。
- [home-paths 包](../../util/home-paths/README.zh.md)——`dshHome` 與 `agentsHome` 如何解析。

-----

<a id="model-experience"></a>
## 模型體驗

通過 `dsh-tool-skill` 間接影響模型；它把該提供方的可調用名稱和有長度上限的描述渲染到初始目錄或替換目錄中，并把所選的當前指令正文與資源基底指引渲染到已保留工具歷史中；路徑、提供方 rank 與已禁用 skill 仍被隱藏。

#### KV Cache 影響

watcher 觸發的失效可促使上述消費方在現有請求歷史中追加替換目錄。僅涉及正文的編輯不會改變目錄 digest。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明該提供方何時不合適，或何時需要特別的運維注意。它們是當前包約束，不是任務積壓。

- **發現深度為一層**——只識別 `<root>/<name>/SKILL.md` 與 `<root>/<name>.md`；忽略嵌套 skill 樹與包 manifest（元數據清單）。
- **項目范圍為最近 `.git` 祖先**——沒有該標記的工作區回退到提供的 cwd，不支持其他項目根標記或 monorepo 子項目選擇。
- **格式錯誤的條目隨警告消失**——模型目錄不會收到逐 skill 診斷，無法區分缺失的 skill 與無效的 skill；意外的 I/O 失敗則會保留最后一份可用目錄。
- **缺失根觀察每次輪詢一個路徑段**——啟動時不存在的根會使用 `fs.watchFile` 按 `watchPollIntervalMs` 輪詢，直至 Chokidar 可以附加；這以有界檢測延遲換取跨 IDE、Git 與 shell 工作流的可靠創建檢測。
- **無正文修訂協議**——已加載正文是普通的已保留工具歷史；后續文件編輯會影響后續調用，但既不會改寫舊結果，也不會通知正文已變化。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文，明確不具權威性——已交付的行為與限制以上文和代碼為準。`src/index.ts` 中的一條 TODO 提議把 Chokidar 與缺失根觀察提取為 Cordis 文件監視服務，把 skill 過濾與失效保留在此處；上文記錄的缺失根輪詢取舍是該開放設計的一部分。

</details>
