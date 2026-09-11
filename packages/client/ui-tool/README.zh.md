---
description: "dsh Web 客戶端的 Client 工具展示插件：完整調用樹的組合、按工具名稱鍵控的視圖 slot，以及內置原子工具卡片。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-tool

[English](README.md) | 中文

## 概述

`dsh-client-ui-tool` 是 dsh Web 客戶端的 Client 工具展示插件：它渲染對話中的每一次工具調用。`ui-conversation` 通過 `conversation.chat.node` 的匹配 key 分發每個已排序的 `tool-call` Conversation Node；本包渲染其中的 root 及其 Code Dispatch 子調用，并把每個原子調用通過 keyed slot `tool.call.toolview` 分發。沒有注冊的工具名稱使用通用卡片。業務 UI 包只注冊 wire 工具名稱和原子視圖——它們不配對會話事件、不重建 transcript（文本記錄），也不擁有 root/subcall 拓撲，因為運行時仍對 call/result 配對、生命周期與遞歸 `subCalls` 投影擁有最終決定權。

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

工具調用在對話中顯示為卡片：一個根調用樹帶其嵌套子調用，每個原子調用由所屬視圖渲染。用戶看到運行中、成功、失敗與中斷狀態，這些狀態只來自凍結的調用/結果切片，并可通過宿主回調打開文件或檢查調用。

### 注冊業務工具視圖

擁有該視圖的業務包將其 wire 工具名稱注冊進 `tool.call.toolview`：

```text
ctx.slots.inject('tool.call.toolview', () =>
  ctx.slots.register({
    name: 'tool.call.toolview',
    key: '<wire tool name>',
  }, BusinessToolRow))
```

owner 載荷為 `ToolCallOwnerProps`：`callId`、`toolName`、凍結的 `block`、可選 `cwd` 與 `home`、會話授權的 `loadImage` loader（供結果攜帶持久圖像的視圖使用），以及普通的 `openFile`/`inspect` 回調。Code Dispatch 塊保留事件的 `parentCallId`；根會話調用沒有該字段，因此后代調用都走同一條按 key 分發路徑：已注冊視圖的調用（如 `read_image`）也會在嵌套處渲染對應卡片，未注冊的后代調用則保持通用壓平形式。路徑摘要先相對會話 cwd 縮短，再把剩余的 POSIX Host home 寫成 `~`；`filePath` 與 Host 打開仍使用作者給出的文件系統路徑。注冊項會收到常規的會話 slot 運行時共享數據，但不會收到 React 節點或運行時服務。

### 內置視圖

本包擁有 generic fallback，以及 shell/pwsh、read、read_image、write/edit、運行中的 `str_replace_editor` `create`／`str_replace`、grep/glob、web、todo、question 與 Code Dispatch 的內置展示。結構化卡片直接從第一方原始事件字段派生；Host `presentCall` 與 `presentResult` 值不會進入 Client。運行中與已完成的前臺標準 `bash`/`pwsh` 和 `terminal_send` 調用，無論位于根還是 Code Dispatch 子調用中，都在通過相同的參數、結果和錯誤檢查后使用 terminal 卡片。持久 `bash`/`pwsh` 調用僅在運行中使用 terminal 卡片。以已識別的 spill 策略提示結尾的 shell 輸出，在 shell 行中使用可展開的 generic 輸出，在 Details 中使用 generic 輸出；位置被改變或被省略的退出標記無法證明成功。已完成的持久 shell 結果保持 generic 展示，因為 reset 與部分輸出診斷不一定描述單個進程的退出狀態；根調用的持久 shell 結果可展開，后臺啟動回執則保持折疊。成功的問題行按穩定 id 配對調用中的問題與結果中的回答，展開后顯示可讀的問答行。已取消或已中斷的問題行顯示其裁決與原始問題，不虛構回答。不受支持、格式錯誤或含糊的輸入回退為壓平的工具輸入／結果文本。`ui-skill` 展示了業務包自行擁有的 `skill` 注冊項。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本包實現一條分派規則：原子工具視圖按 wire 工具名稱鍵控、由所屬業務包注冊；本包只渲染樹與回退。

### 渲染約定

`ToolCallTree` 接收一個已經包含遞歸 `subCalls` 的 root `ToolCallBlock`、會話 `cwd`，以及屬主用于打開文件和檢查調用的回調。它遞歸遍歷標準調用塊，讓 root 與任意深度的 child 經過同一條原子分發路徑，不訂閱獨立的 parent-to-children map。每個 root 和 child 包裝層都保留 `data-chat-anchor-key="call:<id>"` 與 `data-chat-call-id` DOM 約定，供分頁和 selection 使用。

### 卡片


每張卡片都直接在調用樹中查看；選中調用后不會再顯示第二個全高視圖。行 renderer 為 terminal、read、diff、search 和 web 卡片各復用同一個純 card model，image 卡片的圖庫經由工具自有 `tool.call.images` slot 渲染。這些 model 校驗原始調用參數、結果內容、失敗狀態、持久 metadata、Code Dispatch 的 `parentCallId` 與會話路徑信息。不受支持或格式錯誤的輸入使用壓平的工具結果文本。文件路徑摘要經屬主的 `openFile` 打開文件，chat 視圖把它路由到右側 Sidebar 的文本預覽；`inspect` 打開軌跡視圖。terminal、diff、read、search 與 web 卡片的上限與 fallback 規則仍由 [ui-primitives README](../ui-primitives/README.zh.md) 負責；image 卡片的 fallback 規則由本包內的 card model 自行承載。

terminal model 使用瀏覽器安全入口 `@deepseek-ai/dsh-spill-policy/notice` 的 `hasSpillNotice`，而非獨立的 UI 匹配規則。[spill-policy README](../../spill/spill-policy/README.zh.md#shared-notice-ownership) 負責提示文本的格式化與識別。該檢查保守地選擇通用輸出；匹配的文本無法證明其來源，回放也不改變已記錄的結果字節。
</details>

-----

<a id="further-exploration"></a>
## 進一步探索

以下頁面覆蓋對話宿主、視圖 slot 與卡片模型。

- [ui-conversation](../ui-conversation/README.zh.md)——把 `tool-call` 節點分派給本包的聊天界面。
- [ui-primitives](../ui-primitives/README.zh.md)——內置視圖所拼裝的輸出卡片原子組件。
- [ui-skill](../ui-skill/README.zh.md)——`skill` 工具的業務自有注冊。
- [Conversation 子系統](../../../docs/subsystems/conversation.zh.md)——業務自有功能如何注冊 Conversation node。
- [slot 系統標準](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.zh.md)——keyed slot 背后的組合模型。

-----

<a id="model-experience"></a>
## 模型體驗

無。該包是瀏覽器端工具展示層，只渲染已記錄的工具調用，不改變模型上下文。

#### KV Cache 影響

無；該包既不組裝也不發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制定義分派深度與視圖歸屬；它們是當前包約束。

- **Host 不把 `run_code` 暴露為 PTC mode 程序 binding**：生產事件只產生一層分發；遞歸的運行時/UI 約定支持嵌套。
- **第一方工具視圖集中在本包**：它們可以通過 keyed slot 獨立遷移到各自所屬的業務包。
- **工具文案復用 `ui-conversation` locale namespace**：工具標題、行 chrome 與無 Cordis 的 primitive label 使用該字典；展示轉換器模型保留 locale key 或數據，而不是已渲染文案。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。工具組合只存在于瀏覽器，不貢獻事件或跨插件可變狀態；slot 所有權由 ui-slots 校驗。
