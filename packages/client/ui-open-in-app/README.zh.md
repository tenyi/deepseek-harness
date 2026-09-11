---
description: "Web 會話頭部 \"Open In...\" 分體按鈕：在記住的應用中打開會話 workspace 目錄，并列出主機探測到已安裝的全部應用。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-open-in-app

[English](README.md) | 中文

## 概述

本包提供 open-in-app 功能的瀏覽器表面：會話頭部的一個分體按鈕，主按鈕在記住的應用中打開當前會話的 workspace 目錄（會話摘要的 `cwd`），下拉箭頭列出主機探測到已安裝的全部 catalog 應用。可用性、圖標與啟動均來自 [`dsh-host-open-in-app`](../../host/open-in-app/README.zh.md) 的主機路由；兩個包應一起掛載。沒有 workspace 目錄的會話、或沒裝任何可命名應用的主機，完全不渲染按鈕。

## 目錄

- [使用本包](#use-this-package)
- [理解實現](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與延后工作](#known-limitations-and-deferred-work)
- [開發備注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

把本插件與 [`dsh-host-open-in-app`](../../host/open-in-app/README.zh.md) 并排掛進 Web 組合；這對包用兩行 cordis.yml 組成完整功能，本行不接受任何配置。只要主機探測到至少一個已安裝的 catalog 應用且會話有已知的 workspace 目錄，會話頭部就會出現 "Open In..." 分體按鈕。

### 預期行為

主按鈕顯示記住的應用圖標——凡主機能提取的都是應用真實圖標（macOS bundle 圖標、Windows 可執行文件圖標、Linux 主題圖標），提取不到時是通用占位圖形——并帶設計系統 tooltip（「在本地打開」）；點擊立即啟動。下拉箭頭打開已安裝應用的緊湊菜單，記住的條目以整行填充標記。可用性每頁讀取一次；上次選擇的應用持久化在瀏覽器中（`dsh.open-in-app.choice`），不再安裝的選擇回退到第一個可用條目。快速完成的啟動不改變按鈕外觀——變暗的等待態只在飛行超過 250 毫秒后出現——失敗的啟動顯示錯誤 tooltip 與紅色描邊兩秒。所有文案在雙語 `open-in-app` locale 命名空間中；詞典無法命名的應用 id 不會被提供。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現內幕——點擊展開</summary>

插件通過標準 slot/inject 機制把分體按鈕注冊到 `conversation.session.header.utilities`，并以一個 effect 注冊 `open-in-app` 詞典。一個頁面生命周期的 controller（[`src/client/controller.ts`](src/client/controller.ts)）擁有每頁一次的可用性讀取、持久化選擇的 snapshot store 與啟動 POST；組件經 inject 的 `hooks` 隔間接收兩個 store，因此所有會話頭部共享同一份事實。路由路徑與 wire 載荷類型從主機包的瀏覽器安全子路徑 `@deepseek-ai/dsh-host-open-in-app/shared` 內聯。飛行中的啟動由 ref 守衛——啟動期間的重復點擊與菜單選擇被整體忽略（否則會持久化一個該手勢從未打開的選擇）——busy/error 視覺由圍繞 `launch` promise 的定時器驅動。節點半邊是一個空 `apply`，讓插件出現在主機側的插件名冊上。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [dsh-host-open-in-app](../../host/open-in-app/README.zh.md)——提供可用性、圖標與啟動的主機路由，及其背后的目錄。
- [dsh-session-log-export](../../session-query/session-log-export/README.zh.md)——會話頭部的姊妹動作。
- [Web client 架構](../../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.zh.md)——瀏覽器插件行如何加載并注冊 slot。

-----

<a id="model-experience"></a>
## 模型體驗

無。分體按鈕是瀏覽器 chrome；這里沒有任何東西進入模型請求。

#### KV Cache 影響

無；本包從不組裝或發送提供方請求。

## 已知限制與延后工作

<a id="known-limitations-and-deferred-work"></a>

- **詞典把守菜單。** 主機目錄的新條目若在兩份詞典中沒有對應的 `app.<id>` 條目，將保持不可見而不是顯示裸 id；擴展目錄意味著同時擴展 [`dsh-host-open-in-app`](../../host/open-in-app/README.zh.md) 與本包的 locale。
- **可用性每頁只讀一次。** 頁面打開期間安裝的應用要重新加載頁面后才出現（主機側還需主機重啟）。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者工作語境——點擊展開</summary>

功能層面的各項決定，包括拆分為主機包與本表面包，記錄在[轉正 Agent Note](../../../.agents/notes/implemented/feature/2026-08-25-promote-open-anywhere-plugin.zh.md)。

</details>

**運行時不變式：** 不發布伴生入口。插件注冊一個詞典 effect 和一個 header slot 條目，HMR 安全性 spec 證明二者都會在資源釋放時撤銷；可用性與選擇存儲在控制器的快照存儲中，不存在可能與之分歧的第二份副本。
