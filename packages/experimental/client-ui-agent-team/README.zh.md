---
description: "使用并排查實驗性 Web Agent Teams roster、共享任務板與 teammate 導航面板。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-client-ui-agent-team

[English](README.md) | 中文

## 概述

本包向 Web 會話頁頭添加 Agent Teams action，讓用戶檢查當前 roster、管理共享任務板并導航到 teammate 會話。它通過生成的 `ctx.remote.agentTeams` contribution 讀取權威 Team 狀態，并讓普通 child history 導航繼續使用穩定的 addressed-subagent 路徑。通過公開發布的實驗性 Agent Teams Web profile 選擇本包。這個瀏覽器 projection 不擴展穩定 API Proxy、不存儲 Team 狀態，也不注冊面向模型的輸入。

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

在穩定 Web bundle 與 Host-side Agent Teams profile 之后，通過 [`@deepseek-ai/dsh-experimental-agent-team-web-profile`](../agent-team-web-profile/README.zh.md) 安裝本包。Web Client loader 掛載 `/client` export；root Host export 不執行行為，本包也沒有用戶配置字段。

### 檢查并導航 roster

打開 panel 會調用 `agentTeams/view`。Roster row 展示持久 name、運行時 status、model 與 diagnostics。選擇健康 teammate 時，系統刷新既有直接 child catalog，并打開普通的 `{ parentSessionId, childSessionId, mode: 'continuable' }` address。History 與后續人類提示詞繼續使用穩定 addressed-subagent 會話路徑；本包不會添加 Team 專用 address 字段。

### 管理任務板

任務板展示 task identity、owner、blocker、readiness、提示性 write scope 與重疊 warning。用戶可以通過 `agentTeams/createTask` 與 `agentTeams/updateTask` 創建、編輯、分配或取消分配、完成、重開和刪除任務。每次 update 都發送當前顯示的 revision，create 或 update rejection 都保留為顯式 business result。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

Client export 掛載來自 [`@deepseek-ai/dsh-experimental-agent-team/remote`](../agent-team/README.zh.md) 的生成的 `ctx.remote.agentTeams` contribution，然后通過 Cordis effect 注冊 locale dictionary 與一個 conversation-header slot。Dispose plugin fiber 會移除這兩項 registration。

開始 create 或 update 會讓更早的 refresh 失效。成功后會重新讀取完整 Team view，使每個 task 的派生字段保持最新。`team-task-conflict` 結果僅在重新讀取成功后顯示狀態陳舊提示；如果重新讀取失敗，則改為顯示重新讀取錯誤。由于 Team 服務把任務文本或 scope 編輯與 dependency 修改公開為獨立 action，兩者使用兩個連續的 compare-and-set mutation。

| 文件 | 職責 |
|---|---|
| [`src/client/mount.ts`](src/client/mount.ts) | 生成的 Remote、locale、導航與 slot registration |
| [`src/client/TeamAction.tsx`](src/client/TeamAction.tsx) | Roster 與任務板交互狀態 |
| [`src/client/locales.ts`](src/client/locales.ts) | 中英文 panel 文案 |
| [`src/index.ts`](src/index.ts) | 不執行行為的 Host entry |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [Agent Teams Web profile](../agent-team-web-profile/README.zh.md)——掛載本 Client plugin 的公開 opt-in bundle。
- [Agent Teams service](../agent-team/README.zh.md)——權威 roster、task 與 Remote 行為。
- [會話 UI](../../client/ui-conversation/README.zh.md)——穩定 header slot 與 addressed-subagent 導航表層。
- [實驗性包](../README.zh.md)——孵化狀態與發布規則。

-----

<a id="model-experience"></a>
## 模型體驗

無直接影響，因為該瀏覽器 projection 與任務控制界面不注冊面向模型的輸入。

#### KV Cache 影響

無直接影響；Team 工具與普通會話提交負責后續任何模型可見用途。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **Snapshot refresh**——panel 會在打開、顯式 refresh 與 mutation 后刷新；它沒有實時事件訂閱或 mailbox timeline。
- **普通 child continuation**——導航后發送的人類消息使用穩定 addressed-subagent 提示詞路徑，而不是 Team peer mailbox。
- **沒有 lifecycle 或 workspace control**——panel 不能 spawn、rename、delete 或 interrupt teammate，write scope 仍只是提示性 metadata。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。RPC 是權威來源，本包只持有一個可釋放的 slot 注冊。
