---
description: "Web @file 與 @session 引用 source：候選項、排序，以及原子行內引用（統一的文件/會話選取）。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-reference

[English](README.md) | 中文

## 概述

Web 用戶需要從同一個 `@` 補全菜單提及文件、文件夾或會話時，可以使用 `dsh-client-ui-reference`。菜單先列出文件，再列出會話；其中一組無法加載時，另一組仍然可用。選擇文件、文件夾或會話會插入帶穩定剪貼板形式的原子引用；文件夾行還允許用戶在不關閉補全的情況下繼續下鉆。文件行省略多余的根目錄位置，會話行僅在工作區與當前工作區不同時顯示該工作區。會話 mention 會在捕獲模型上下文前接受校驗，而瀏覽候選項不會影響模型。

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

只要組合掛載了本包且存在宿主 `ctx.fileReferences` 提供方，該 source 即處于活動狀態。輸入 `@` 后跟一個未加引號的 token，會先看到文件、再看到會話；打開 `@"…` 則只搜索文件。候選列表是補全菜單，不是搜索結果頁：選一次、繼續輸入即可。

### 選擇后會插入什么

選擇文件會關閉補全，并顯示為帶文件圖標與業務色文件名的原子行內引用。目錄行攜帶兩個動詞：選定 pick（點擊行主體或 Enter）把文件夾本身解析為同類原子引用——文件夾圖標、帶尾斜杠的標簽、以規范 `@dir/` mention 為序列化形式；鉆取動作（Tab 或行尾 chevron）則保持帶文件夾圖標的可編輯路徑純文本，并讓菜單在尾部斜杠處保持活躍，用戶可以繼續進入下一層。包含空白的路徑使用 `@"path with spaces"`，用戶顯式打開的引號會繼續保留。

選擇會話會插入一個原子的行內引用，其隱藏 `ref` 與剪貼板表示均為宿主返回的規范 `@[label](dsh-session:…)` mention；可見形式為聊天氣泡圖標加會話標題。發送會經 `session.prompt` 攜帶該 mention，session-reference 服務會在 `agent/pre-step` 校驗它并捕獲模型上下文。

### 失敗行為

某個候選領域不可用或失敗時，該領域不產生任何行，另一領域仍正常列出。會話引用準備失敗發生在提示詞接受后，并會終止該 agent 輪次。

點擊輸入框中的文件引用，可在右側欄預覽文件當前的內容。帶引號路徑中的空格會保留，路徑按輸入框所屬 Session 解析。文件夾和 Session 引用保留原有的編輯行為。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

該 source 把候選編碼保留在注冊 effect 內部：`/client` 導出接口只包含插件主體（`apply`/`inject`）。

### 候選流程

對于未加引號的 token，瀏覽器會同時啟動 `fileReferences/list` 與 `sessionReferenceResolver/candidates` Remote 調用，再以確定性順序把文件排在會話之前，并使用注冊在 locale 字典中的文件夾、文件與會話標簽。各行分別渲染在不可選擇的文件與會話分組標題下，不顯示重復的原始 `reference` source 標題。會話行用宿主會話列表的 `updatedAt` 經該列表相同的相對時間分檔標注時間，因此同一個會話在兩處讀到的時長一致；列表中沒有的會話回落到候選自帶的創建時間。下鉆后的查詢會發布一條從工作區根目錄到當前所列目錄的面包屑；每一節攜帶的下鉆載荷與文件夾行相同，因此「回到某一步」與「進入某一層」是同一個結果。

### 序列化

文件選擇把共享 `@path` 語法所定義的自然文本保留為隱藏的序列化與剪貼板形式。會話選擇使用規范的 `@[label](dsh-session:…)` mention；序列化永遠不會根據可見標題重建身份。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

以下頁面覆蓋建議機制、引用 seam 與輸入流水線。

- [ui-input-trigger](../ui-input-trigger/README.zh.md)——該 source 注冊進的行內建議機制。
- [file-reference](../../context/file-reference/README.zh.md)——`@file` seam 及其提供方約定。
- [session-reference](../../context/session-reference/README.zh.md)——`@session` seam 與準備后快照的語義。
- [Web 輸入機器與 slash 流水線](../../../.agents/notes/archived/architecture/2026-07-25-web-input-machine-and-slash-pipeline.md)——引用與命令如何共享輸入機器。

-----

<a id="model-experience"></a>
## 模型體驗

間接影響模型體驗：通過宿主擁有的提供方實現，本包的引用選擇把文件指引與會話快照準備委托給它們。

#### KV Cache 影響

瀏覽候選項不會影響模型。選擇文件或會話只會改變新用戶消息的后綴，以及緊隨該消息、由宿主準備的會話引用上下文；目標會話更早的歷史保持不變。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明引用 source 何時幫不上忙；它們是當前包約束。

- **候選失敗有意保持靜默**：Remote 發現調用不可用或失敗時，該領域不產生候選行。會話引用準備失敗發生在提示詞接受后，并會終止該 agent 輪次。
- **瀏覽器側不掃描文件**：Web 補全需要掛載宿主 `ctx.fileReferences` 提供方；瀏覽器無法回退到自身文件系統。
- **會話搜索仍僅使用元數據**：發現流程通過 `ctx.sessionReferenceResolver` 篩選 session id、cwd 與以日志為依據的最新標題；不搜索消息主體或完整 transcript。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。插件只注冊一個 slash source，HMR 測試覆蓋釋放；它不發出 Cordis 事件，也不持有跨插件可變狀態。
