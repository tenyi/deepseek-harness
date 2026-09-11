---
description: "面向模型的 skill（技能）目錄與加載工具，供希望了解 agent（智能體）看到的內容或配置會話 skill 目錄的用戶與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-skill

[English](README.md) | 中文

## 概述

agent 可以在會話期間發現并加載 skill。在首次請求前，如果存在模型可調用 skill 且 `skill` 工具可見，agent 會收到一份持久目錄，列出可用 skill 的名稱與有長度上限的描述，并可用 `skill` 工具加載完整指令。用戶可以用 `/name` 調用某個用戶可調用的 skill，把相同的指令注入該步驟。目錄變更會追加一份完整替換，其中空目錄會停用舊名稱；可配置 `catalogDescriptionMaxLength` 來限制每條描述的長度。

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

與 skill 注冊表一起掛載該插件，即可讓 agent 擁有會話 skill 目錄和 `skill` 加載工具。它需要 `ctx.agents`、`ctx.tools` 與 `ctx.skills`。

### 何時選擇

當 agent 應在會話期間發現并加載 skill 時使用它。當 skill 加載由其他消費方處理或完全不需要時，請跳過——沒有它，提供方與注冊表仍可工作，但不會有任何東西為模型渲染目錄或工具。

### 掛載與配置

與 skill 注冊表和至少一個提供方一起加載該插件。唯一配置項限制目錄中渲染的規范化描述長度。

```yaml
- name: '@deepseek-ai/dsh-skill'
- name: '@deepseek-ai/dsh-skill-filesystem'
- name: '@deepseek-ai/dsh-tool-skill'
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `catalogDescriptionMaxLength` | `500` | 會話目錄中渲染的規范化描述最大長度；最小為 3 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-skill)是每個受支持字段的窮盡式真源。

### 模型得到什么

- **會話目錄。** 當存在模型可調用 skill 且 `skill` 工具可見時，agent 會在首次請求前收到一條持久的用戶角色消息，列出每個 skill 的名稱與有長度上限的描述；該消息告訴模型在著手任務前先用工具加載 skill，且絕不能僅憑摘要推斷指令。
- **加載工具。** 模型以精確的 skill 名稱調用 `skill`，并收到完整指令正文以及規范的 `<skill_content>` 塊中的資源指引；該結果作為普通工具歷史保留。
- **用戶顯式調用。** 直接用戶輸入中的 `/name` token 若指名某個用戶可調用 skill，會把該 skill 的指令注入該步驟，而無需模型自行加載。
- **實時目錄更新。** 后續成員關系、描述或可見性變化會追加完整的替換目錄；刪除全部 skill 時會追加空目錄，停用較早的名稱。

### 可觀察的成功與失敗

加載列出的 skill 會返回其完整指令；無論加載來自工具還是用戶的顯式調用，模型看到的都是同一種規范形態。無效名稱會報告 `Error: invalid skill name "<name>"`，未知名稱會報告該 skill 未知或已不可用，被禁用模型調用的 skill 會報告其不可用于模型調用。如果從未發布過目錄，并且不存在模型可調用 skill，或 `skill` 工具被隱藏或遮蔽，則會整體省略目錄；目錄發布后，無論可見性喪失——`skill` 工具被隱藏或被同名作用域工具遮蔽——還是刪除全部 skill，都會改為追加空目錄來停用舊名稱。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋目錄與調用邊界如何構建；可觀察行為已在[使用本包](#use-this-package)和下方模型體驗章節中完整說明。

### 設計理念

本包建立在兩個想法之上。第一，目錄是一種持久投影，按已發布條目的 digest 而非渲染后的正文做差異比較，因此 `<system-reminder>` 包裝永遠不會強制重新發布，消費方也不需要重新解析 `<available_skills>` 塊。第二，一條規范渲染服務兩條加載路徑——工具結果與用戶顯式注入——經由共享自 `dsh-skill` 的 `renderSkillContent`，因此無論加載由誰發起，模型看到的都是同一種 `<skill_content>` 形態。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：工具注冊、目錄與手勢 pre-step 監聽器、渲染與 digest |
| — | 不發布運行時不變式伴生入口；這個面向模型的適配器沒有獨立的生命周期流；執行關系由它調用的能力 seam 負責。 |

### 目錄生命周期

在每次符合條件的 `agent/pre-step`，插件都會快照調用會話的 skill 目錄，應用 `skill` 工具的精確可見性，過濾出模型可調用的 skill，并把條目 digest 與會話日志中最新可見的 `skill-catalog` 消息做比較。digest 變化時，它把包含完整替換目錄的持久用戶角色消息交給 `enter` 決策；空替換會顯式停用較早的名稱。提供方快照不完整時不發送任何內容，并為下一次 pre-step 保留最后一份可用視圖。可見性檢查針對本插件所注冊的精確工具定義，因此作用域內同名的遮蔽項會同時移除 schema 及其指引；該插件既可全局掛載，也可掛在單個 agent 的組合內。

### 調用邊界

`/name` 手勢監聽器只掃描已認領的用戶消息：若某個以空白為界、指名工作區目錄中用戶可調用 skill 的 token 出現，則把同一份 `<skill_content>` 渲染作為 `user` 角色的指令上下文注入，追加在該步驟所有其他注入之后。未知名稱與用戶不可調用的名稱保持為普通行文。這是 `disable-model-invocation` skill 唯一的入口，目錄與 `skill` 工具永不暴露這類 skill。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從目錄背后的注冊表詞匯逐步進入精確工具 schema 與設計依據。

- [skill 子系統參考](../../../docs/subsystems/skills.zh.md)——目錄背后的注冊表與提供方詞匯。
- [skill 包](../skill/README.zh.md)——注冊表與共享的 `renderSkillContent` 渲染。
- [生成工具目錄](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-skill)——模型接收的精確 `skill` schema。
- [用戶顯式 skill 調用 Agent Note](../../../.agents/notes/archived/feature/2026-08-08-user-explicit-skill-invocation.md)——`/name` 手勢設計。

-----

<a id="model-experience"></a>
## 模型體驗

### 會話目錄

#### 模型看到什么

如果存在模型可調用 skill，且可見的正是這個 `skill` 工具，agent 會在第一個請求之前收到下方目錄模板，其中包含每個已排序 skill 的一條隨數據而定的條目。該目錄是一條持久的用戶角色消息。后續成員關系、描述或可見性的變化會使用同一個 `<available_skills>` 信封追加完整替換；刪除所有 skill 時，會追加一個空信封，并明確指示不得使用舊名稱。模板的結尾一句是防止雙重加載的規則：用戶顯式的手勢邊界（下文的 pre-step 監聽器）會把同一份 `renderSkillContent` 輸出（共享自 `@deepseek-ai/dsh-skill`）內聯注入，目錄則告訴模型遵循該塊，而不是再經工具重新加載該 skill；替換目錄模板的兩個分支——包括清空后的目錄——都攜帶同一條防雙重加載規則。

##### Skill 目錄模板

```markdown
<system-reminder>
A skill is a reusable set of task-specific instructions. The following skills are available in this session:

<available_skills>
- `<name>`: <normalized-and-capped-description>
</available_skills>

If the user names a skill, or the task clearly matches a skill's description, call the `skill` tool with the exact skill name before taking task actions. Load all applicable skills, then follow their full instructions. This catalog contains summaries only; do not infer or follow a skill's instructions until it has been loaded.
A user may also invoke a skill directly; its <skill_content> block then appears in this conversation. Follow it, and do not call the `skill` tool again for that skill.
</system-reminder>
```

#### Token 影響

重復輸入成本隨 skill 數量和 `catalogDescriptionMaxLength` 增長；當列表為空或工具被隱藏或遮蔽時，不會發送初始目錄 token。每次實際目錄變更都會添加一條保留的完整替換消息。

#### KV Cache 影響

初始持久目錄追加在現有可重用前綴之后。動態變更作為該目錄之后的僅追加歷史，因此較早的可重用 token 保持不變，每條新追加的目錄和后續輪次都會形成新的后綴。新建或恢復的實例如果 digest 發生變化，可能會從新追加的目錄位置起影響緩存重用。

### 工具 schema

#### 模型看到什么

模型會看到生成的 [`skill` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-skill)。

#### Token 影響

工具可見時，每次請求都有固定的 schema token 開銷。

#### KV Cache 影響

工具定義和可見性不變時，前綴穩定。遮蔽、限制或插件生命周期變更可能從該 schema 起使重用失效。

### 工具結果

#### 模型看到什么

成功調用使用下方結果模板，以及提供方管理的資源指引、目錄資源指引、URL 資源指引或不透明資源指引。

##### Skill 結果模板

```markdown
<skill_content name="<escaped-name>">
<skill_resources>
<resource-guidance>
</skill_resources>

<skill_instructions>
<provider-owned-instruction-body>
</skill_instructions>
</skill_content>
```

##### 提供方管理的資源指引

```markdown
Resources for this skill are managed by provider "<provider>".
Load referenced resources only as needed.
```

##### 目錄資源指引

```markdown
Base directory for this skill: <path>
Resolve relative paths mentioned by this skill against the base directory before using them. Load referenced resources only as needed.
```

##### URL 資源指引

```markdown
Base URL for this skill: <url>
Resolve relative URLs mentioned by this skill against the base URL before using them. Load referenced resources only as needed.
```

##### 不透明資源指引

```markdown
Resources for this skill: <description>
Load referenced resources only as needed.
```

#### Token 影響

已加載指令是取決于數據的工具結果 token，并在后續步驟中重新發送，直到壓縮；不會制作重復的 `agent.inject()` 副本。

#### KV Cache 影響

僅追加；新可見內容位于可重用請求前綴之后，不會使現有 KV Cache 條目失效。

### 工具錯誤

#### 模型看到什么

無效或陳舊選擇會精確返回 `Error: invalid skill name "<name>"`、`Error: skill "<name>" is unknown or no longer available` 或 `Error: skill "<name>" is not available for model invocation`。提供方拋出的查找文本取決于數據，并套用同一個 `Error: <message>` 包裝層。

#### Token 影響

只有失敗調用會添加這些已保留 token。

#### KV Cache 影響

僅追加；新可見內容位于可重用請求前綴之后，不會使現有 KV Cache 條目失效。

### 用戶顯式調用注入

#### 模型看到什么

已認領用戶消息中任意位置、以空白為界、指名工作區目錄中某個用戶可調用 skill 的 `/name` token，會把該 skill 的完整 `<skill_content>` 渲染（與上文結果模板完全相同的形態）作為 `user` 角色的指令上下文注入，追加在該步驟所有其他注入之后——背景在前，模型要著手處理的材料在最后。只掃描直接的用戶輸入，檢查在已加載定義上進行，未知名稱和用戶不可調用的名稱保持為普通行文。這是 `disable-model-invocation` skill 唯一的入口，目錄和 `skill` 工具永不暴露這類 skill；目錄的結尾一句會告訴模型遵循注入塊，而不是重新加載它。

#### Token 影響

每次手勢會把一份渲染后的 skill 正文作為注入上下文加進該輪次——尺寸與同一 skill 的工具結果相同，該成本會隨用戶請求必然產生，而非由模型自行決定。同一步驟內對同一 skill 的重復手勢只注入一次。

#### KV Cache 影響

僅追加；注入落在該步驟的消息批次中、可重用請求前綴之后，不會使現有 KV Cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明目錄或加載器何時不合適。它們是當前包約束，不是任務積壓。

- **目錄省略 `whenToUse`、來源和提供方元數據**——路由只基于名稱和有長度上限的描述；`whenToUse` 仍是提供方元數據，加載后的包裝層也不渲染它。
- **已加載指令正文沒有大小上限**——提供方可返回足以占用大量下一步上下文的 skill；只有目錄描述會被截斷。
- **資源是指引，而非附件**——工具報告基礎目錄/URL/不透明提示，但既不列舉也不為模型獲取引用文件。
- **加載是一次性文本**——遠程提供方緩慢或 skill 正文很大時，不提供部分內容、流式輸出或緩存內容句柄。
- **目錄替換采用全量列表**——一個名稱或描述發生變化，就會追加所有可見摘要；這樣能顯式停用陳舊名稱，但 token 成本與目錄大小成正比。
- **正文不做版本化**——僅修改正文不會改變目錄 digest，也不會通知模型；后續工具調用會讀取提供方的當前內容，而先前工具結果仍是歷史事實。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
