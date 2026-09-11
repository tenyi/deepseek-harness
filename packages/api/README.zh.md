---
description: "應用 Remote 層的包映射：類型化的 Client 到 Host 能力調用、結果與轉發事件，供用戶與維護者瀏覽該組。"
kind: "package-group"
---

# api/ — Remote API 層

[English](README.md) | 中文

## 概述

`api/` 組提供應用的 Remote 層：Client 環境可以調用運行在 Host 上的業務能力——管理目標、運行命令、查看插件清單、發現文件與會話引用——調用方式是類型化方法，并接收結果或轉發的 Host 事件。`remotes` 決定暴露哪些能力、以及每次調用如何到達正確會話的 agent；`gateway` 在 Client 與 Host 之間承載調用及其結果。技術棧運行在應用共享的 Connection 之上；流式會話數據刻意不在其中。

## 目錄

- [包](#packages)
- [相關文檔](#related-documentation)
- [開發備注](#dev-note)

-----

<a id="packages"></a>
## 包

下面這些包共同提供 Remote 層；完整約定以各包 README 為準。

| 包 | 職責 | ctx key |
|---|---|---|
| [`remotes/`](remotes/README.zh.md) | 決定 Client 可以消費哪些 Host 能力與事件。 | — |
| [`gateway/`](gateway/README.zh.md) | 承載類型化一元調用、多路復用流與轉發的 Host 事件。 | `ctx.typertGateway` / `ctx.remote` |
| [`session-controller/`](session-controller/README.zh.md) | 擁有會話命令、歷史記錄流、實時控制狀態與 Agent/Session 身份策略。 | `ctx.sessionController` / `ctx.remote.session` |
| [`settings-controller/`](settings-controller/README.zh.md) | 擁有 settings 域各 seam 之上的配置界面讀寫。 | `ctx.settingsController`、`ctx.credentialsController` / `ctx.remote.settings`、`ctx.remote.credentials` |
| [`workspace-controller/`](workspace-controller/README.zh.md) | 擁有 Workspace 變更與完整 Client Workspace 投影。 | `ctx.workspaceController` / `ctx.remote.workspace` |
| [`workspace-files/`](workspace-files/README.zh.md) | 擁有有界的工作區文件訪問——`stat`、分頁 `read`、`list` 與已埋點操作的 `changes` 流——以及其上的 Client `file` 資源提供方。 | `ctx.workspaceFiles` / `ctx.remote.workspaceFiles` |

Remote 調用沿 Client → Host 方向運行在應用共享的 Connection 之上。API Gateway 擁有 Remote 傳輸，各控制器包分別擁有 Session、配置界面與 Workspace 行為。流式下載等不適合 Remote 調用的響應由功能包注冊精確的 Connection Fetch 路由。

-----

<a id="related-documentation"></a>
## 相關文檔

先讀 API Gateway 參考以端到端了解 Remote 模型，再讀 Typert 子系統頁了解共享定義，并通過 Connection 了解物理載體。

- [API Gateway 參考](../../docs/api-gateway.zh.md)——Typert API Gateway 的現狀參考：編程模型、生成流水線與運行時調用。
- [Typert 子系統參考](../../docs/subsystems/typert.zh.md)——protocol、Gateway 與消費方裝配共享的公共約定。
- [Connection](../client/connection/README.zh.md)——每次 Remote 調用背后的 RPC 載體、`/api` 信任圍欄與響應封裝。

<a id="dev-note"></a>
## 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
