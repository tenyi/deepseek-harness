---
description: "dsh Web 客戶端的 skill 引用與專屬 skill 工具行：/ 觸發的 skill source 與 skill 調用卡片。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-skill

[English](README.md) | 中文

## 概述

`dsh-client-ui-skill` 讓用戶通過 `/` 建議選擇或直接鍵入 `/name` 來調用 skill（技能）。同一條字面命令可以從 Web 編輯器、TUI 和 ACP（Agent Client Protocol）一致地加載 skill；如果名稱與宿主命令相同，它仍會解析為該命令。skill 調用在對話中顯示為可展開的 `Instructions` 卡片；即使已安裝的 skill 目錄發生變化，卡片落定后的內容仍保持穩定。

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

在編輯器中輸入 `/` 并從建議中選擇 skill，或直接鍵入 `/name`；發出的消息攜帶字面文本，宿主對菜單 pick 與手動鍵入的 token 以同樣方式加載 skill。與宿主命令同名的名稱仍解析為命令——裁決在客戶端把該行認領走，它根本不會成為提示詞。

### source 提供什么

普通會話的候選來自 `skills/list` Remote；宿主提供每一個用戶可調用的 skill，`modelInvocable: false` 的條目（即 `disable-model-invocation` skill，此路徑是其唯一入口）會以當前語言把僅限用戶標記作為描述前綴帶上。結果經 `/` 菜單共享的名字排序器（ui-primitives 的 `rankByName`）排名：查詢作為不區分大小寫的有序子序列匹配 skill 名，前綴命中排最前，同分保持宿主順序（[排名決策](../../../.agents/notes/archived/feature/2026-08-04-web-slash-command-fuzzy-discovery.md)）。`skills/list` 調用失敗時會被記錄并靜默丟棄該菜單組——菜單只顯示 pending／ready 狀態。

### skill 工具行

收起的行顯示 skill 圖標、`Skill` 標題與請求加載的 skill 名稱；運行中的調用帶有 transcript（文本記錄）的掃光效果，失敗時用錯誤首行替換名稱，中斷的調用使用警告狀態。已結算的行展開為一個尺寸受限的 `Instructions` 卡片，其中原樣呈現持久化的工具輸出；可用時還會提供標準軌跡的 `Inspect` 入口。該行的名稱、生命周期與正文只派生自 ui-tool 提供的凍結調用／結果切片，絕不讀取當前目錄，因此即使已安裝的 skill 或其描述發生變化，回放仍保持穩定。

鼠標移入 `/name` 時，背景覆蓋整個引用。點擊已知 skill 會在右側欄打開提供方給出的 `SKILL.md` 路徑，同時保留文本的可編輯性。緩存未就緒時，點擊復用該 Session 的目錄請求，在完成后按點擊時的 Session 地址打開預覽。切換預設、重置連接和插件釋放會取消待處理的預覽；后續點擊重新獲取當前目錄。沒有文件路徑的 skill 仍可調用，但沒有文件預覽。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

source 不實現任何裁決鉤子，也沒有引用 codec：pick 落下字面文本，發出的提示詞中也是同一段字面文本，因此確定性在宿主側（[slash 流水線筆記](../../../.agents/notes/archived/architecture/2026-07-25-web-input-machine-and-slash-pipeline.md)）。

### 候選流程

目錄按普通會話緩存，拉取走 single-flight；scope 創建時的 `warm` 鉤子預熱該會話的緩存項，轉發的 owner 事件 `agent-preset/selected` 丟棄該會話這一項（目錄屬于 preset，而空會話可能在預熱之后才切換），`connection/reset` 清空全部緩存。由目錄尋址的可繼續 subagent 在客戶端解析為沒有 skill 候選，因為現有 skill RPC 要求會話已掛載；查看其持久化歷史不得激活它。列表 RPC 使用插件注冊時捕獲的根上下文連接；草稿 chip 視覺由 `lexicon` 掃描派生。

### 注冊

`/client` 導出接口只有插件主體（`apply`／`inject`）；source 對象是注冊 effect 的內部實現。工具行把 `skill` wire 名稱注冊進 ui-tool 的 keyed `tool.call.toolview` slot。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

以下頁面覆蓋輸入機制、工具行宿主與宿主側 skill 工具。

- [ui-input-trigger](../ui-input-trigger/README.zh.md)——該 source 注冊進的行內建議機制。
- [ui-tool](../ui-tool/README.zh.md)——承載 `tool.call.toolview` slot 的工具調用展示層。
- [tool-skill](../../skill/tool-skill/README.zh.md)——擁有 pre-step 手勢邊界的宿主側 `skill` 工具。
- [Web 輸入機器與 slash 流水線](../../../.agents/notes/archived/architecture/2026-07-25-web-input-machine-and-slash-pipeline.md)——引用與命令如何共享輸入機器。

-----

<a id="model-experience"></a>
## 模型體驗

### 用戶顯式 skill 調用

#### 模型看到的內容

用戶消息原樣到達模型，字面文本 `/name` 也包含在內。隨后宿主的 pre-step 邊界（`dsh-tool-skill`）把規范的 `<skill_content>` 塊——與 `skill` 工具返回的 `renderSkillContent` 輸出相同——作為注入的指令上下文追加在該步驟各項注入的末尾，最貼近模型的回答。加載是確定性的：模型無需被要求調用 `skill` 工具就能收到完整正文，目錄也會告訴它不要重新加載已內聯注入的 skill。

#### Token 影響

一次調用會把渲染后的 skill 正文作為注入上下文加進該輪次——成本與模型經由工具加載該 skill 相同，只是無條件支付，而非由模型自行裁量。瀏覽菜單和拉取候選不會增加任何模型 token。

#### KV Cache 影響

僅追加：注入的消息落在可復用歷史前綴之后。該包絕不改寫較早的請求 token。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制定義引用與工具行何時回退到通用行為；它們是當前包約束。

- **僅含工具結果的 history 頁使用通用行**：鍵控分派要求配對的工具調用位于運行時窗口內；分頁將工具調用留在窗口外時，工具結果沒有工具身份。這項客戶端呈現功能不會為了恢復該身份而擴展 history 協議約定。
- **文本是唯一依據**：引用是普通的草稿文本；手動鍵入的相同 token 就是同一個引用，宿主手勢邊界評判的是發出的文本，而不是菜單交互。chip 視覺由 lexicon 掃描派生；提示詞協議上沒有 occurrence 身份、位置跟蹤或結構化引用載荷。
- **預熱落定之前打開的菜單**：在那次擊鍵下不顯示 skill 候選；下一次擊鍵會重新輪詢已落定的緩存。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。slash source、locale dictionary 與 keyed toolview 都是由注冊表持有的注冊項，其釋放行為已由 HMR（熱模塊替換）安全規范證明；它們不發出 Cordis 事件或持有跨插件可變狀態。
