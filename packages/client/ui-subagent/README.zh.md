---
description: "dsh Web 客戶端的 subagent 對話目錄、續接路由 UI 與 '@' 引用 source。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-subagent

[English](README.md) | 中文

## 概述

使用本包可瀏覽父會話下的每個 subagent 對話、打開任意后代，并查看其是否正在運行以及 token 用量和活躍輪次耗時。已完成的 one-shot 對話會作為只讀執行記錄打開。可繼續對話在運行期間按提交順序接收后續提示詞，并獨立提供 Stop。普通會話側邊欄會省略 subagent 對話，因此父會話頁頭目錄是它們的導航入口。獨立的 `@` source 會把運行中 child 的 label 插入用戶消息，但不會把它解析成繼續執行地址。

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

會話頁頭保留當前會話 title 作為譜系面包屑，并在會話存在 subagent 后代時，于頁頭操作行之前追加 `/` 數量觸發器；觸發器打開后代目錄，統計僅含 subagent 的完整譜系、在普通 fork 處停止，并在任一計入統計的后代處于 `running` 時顯示活動仍在進行。選擇任意深度，即可用該子會話的確切 `{parentSessionId, childSessionId, mode}` 地址打開其對話。

### 瀏覽目錄

行顯示 mode、`running`/`inactive` 活動狀態與由日志支撐的可選 title；尾隨列在上行顯示提供方的持久化 token 用量總計，在下行顯示活躍輪次耗時。鍵盤導航：ArrowRight/ArrowLeft 展開和折疊分支；ArrowUp/ArrowDown、Home、End 與 Escape 用于導航或關閉樹。沒有 label 的 one-shot 行回退到其會話 id；損壞、不受支持或不可用的行仍保持可讀但禁用。

### 續接對話

確切 parent 存活時，可繼續 child 保留普通輸入 chrome：child 運行期間輸入和 Send 保持可用，因為每條后續消息都會進入 child 的 FIFO inbox，而獨立的 Stop 經由 `subagents/interruptByParent` 路由。確切 parent 不可用且 child 未在運行的可繼續 child 會選用說明恢復路徑的只讀編輯器；此類 child 仍在運行期間，selector 會讓位給普通編輯器——輸入區與 Send 被禁用，但獨立的 Stop 保持可用。

### `@` 引用 source

`@` source 仍然刻意保持獨立且惰性：候選是從 `ctx.sessions.list` 零 RPC 得到的運行中 child；pick 會插入字面文本 `@label `，codec 投影為 `@label`。它不參與命令裁決，也不會把 label 解析成繼續執行地址。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

目錄與編輯器行為由 [Web subagent 對話筆記](../../../.agents/notes/implemented/feature/2026-07-27-web-subagent-conversations.zh.md) 與[當前輪次中斷筆記](../../../.agents/notes/implemented/feature/2026-08-06-continuable-subagent-interrupt.zh.md) 規定。

### 目錄派生

頁頭譜系 renderer 通過標準 `useSessions` 鉤子讀取 `subagentsByParent` 與會話摘要。緊湊樹仍以直接目錄為權威依據：每個健康行的 `hasChildren` 提示在交互前決定是否顯示展開控件；每層目錄僅在其中至少一個健康行是分支時才預留展開列；展開分支時會立即為每個已知直接后代預留一行禁用的加載行，隨后再用該 child 的權威目錄懶加載結果替換。每個可見分支都會上報給運行時，使成員幀只在樹正被消費的位置觸發去抖動刷新。

### 耗時與 token

token 用量總計為四個互不重疊的 `tokenUsage` 桶之和。耗時會累加已完成的 `subagentTiming` 輪次，僅在運行中 child 存在未結束輪次時每秒遞增一次，并在 child 變為 inactive 后凍結；被中斷的未結束輪次以其同一切面的 `active.through` 為上界，絕不使用更新的會話元數據。

### 編輯器選舉

one-shot child 始終選用只讀編輯器。可繼續 child 僅在其確切 parent 不可用且 child 未在運行時選用只讀編輯器；否則普通編輯器的會話會經 `subagents/prompt` 路由提示詞。本包絕不接收宿主上下文，也不調用面向模型的工具。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

以下頁面覆蓋對話界面、宿主 seam 與設計筆記。

- [ui-conversation](../ui-conversation/README.zh.md)——承載頁頭操作與編輯器鏈的聊天界面。
- [ui-input-trigger](../ui-input-trigger/README.zh.md)——承載 `@` source 的建議機制。
- [subagent](../../subagent/subagent/README.zh.md)——可繼續 child 背后的宿主能力 seam。
- [Web subagent 對話](../../../.agents/notes/implemented/feature/2026-07-27-web-subagent-conversations.zh.md)——目錄與編輯器規范。
- [當前輪次中斷](../../../.agents/notes/implemented/feature/2026-08-06-continuable-subagent-interrupt.zh.md)——獨立 Stop 的語義。

-----

<a id="model-experience"></a>
## 模型體驗

### 用戶提示詞中的 subagent label 文本

#### 模型看到的內容

只有 `@` 引用 source 會影響模型輸入：pick 的候選以字面文本 `@label` 進入普通用戶消息，沒有專用內容塊或宿主側解析。瀏覽目錄、導航 child 與查看持久化 transcript（文本記錄）都不會添加提示詞 section；已接收的繼續交互內容會經宿主 subagent 適配器成為普通 FIFO 用戶消息。

#### Token 影響

有條件且僅追加：字面 `@label` 或用戶后續消息只會向對應的新用戶消息增加 token。目錄與 transcript 操作增加零模型 token。

#### KV Cache 影響

僅追加。本包絕不改寫更早的請求 token。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制定義目錄能顯示什么、`@` 引用意味著什么；它們是當前包約束。

- **目錄沒有持久化結果**：活動狀態與計時無法區分完成、失敗或取消，且 UI 不公開 Activation 身份；停止能力僅限編輯器上針對運行中可繼續 child 的當前輪次 Stop。
- **`@` 引用仍是顯示標題文本**：重復或改名后的 label 會有歧義，因此它們刻意不獲得繼續執行語義。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。插件只注冊一個 slash source，其資源釋放已由 HMR（熱模塊替換）安全規范驗證；它不發出 Cordis 事件，也不持有跨插件可變狀態。
