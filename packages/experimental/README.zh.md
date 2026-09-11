---
description: "實驗組地圖：默認私有的預穩定原型，以及顯式公開發布的 Agent Teams 包。"
kind: "package-group"
---

# packages/experimental

[English](README.md) | 中文

## 概述

實驗組包含約定可能變更且不提供支持承諾的原型能力。包默認私有；五個 Agent Teams 包是顯式公開發布的例外，并保留現有 `@deepseek-ai/dsh-experimental-*` 名稱。本組還包含私有的跨 realm Inspector、CPython 子進程后端與瀏覽器 worker 預覽包。組外已發布產品不得依賴實驗性包。

## 目錄

- [包](#packages)
- [相關文檔](#related-documentation)
- [開發備注](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 職責 | ctx 鍵 |
|---|---|---|
| [`agent-team-profile`](agent-team-profile/README.zh.md) | Agent Teams 的公開 opt-in profile 層 | — |
| [`agent-team`](agent-team/README.zh.md) | 具名 teammate，成員之間持久消息與共享任務板 | `ctx.agentTeams` |
| [`agent-team-web-profile`](agent-team-web-profile/README.zh.md) | Agent Teams 的公開 opt-in Web 層 | — |
| [`client-ui-agent-team`](client-ui-agent-team/README.zh.md) | Web Team roster、任務板與 teammate 導航 | — |
| [`code-runtime-python`](code-runtime-python/README.zh.md) | 代碼執行 seam 的 CPython 子進程后端 | `ctx.codeRuntime` |
| [`inspector`](inspector/README.zh.md) | 用于 Host 調試、Client Runtime 檢查、網絡采集與 Cordis 樹的跨 realm CDP hub | `ctx.inspector` |
| [`tool-agent-team`](tool-agent-team/README.zh.md) | 讓模型創建、發消息與協調 teammate 的九個工具 | 按作用域注冊工具到 `ctx.tools` |
| [`webworker-packer`](webworker-packer/README.zh.md) | 構建瀏覽器 worker 預覽所消費的 gzip 壓縮虛擬文件系統（VFS）鏡像 | 庫與 CLI（命令行界面），不使用 ctx key |
| [`webworker-runtime`](webworker-runtime/README.zh.md) | 在專用瀏覽器 worker 中運行 harness 插件樹 | 庫與 worker 入口，不使用 ctx key |

-----

<a id="related-documentation"></a>
## 相關文檔

- [實驗包決策](../../.agents/notes/implemented/architecture/2026-08-18-experimental-agent-teams-packages.zh.md)——默認私有、Agent Teams 公開例外與依賴隔離。
- [Agent Teams 子系統](../../docs/subsystems/agent-team.zh.md)——持久 Team 類型與 `ctx.agentTeams` 服務 API。
- [實驗子樹規則](AGENTS.md)——實驗狀態放寬了什么、不放寬什么。

-----

<a id="dev-note"></a>
## 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
