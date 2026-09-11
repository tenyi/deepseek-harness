---
description: "疊加在 dsh-base 上公開發布的實驗性 Agent Teams profile 層，提供 Team-scoped 協作工具并保留一次性 delegation。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-agent-team-profile

[English](README.md) | 中文

## 概述

`dsh-experimental-agent-team-profile` 是在 `@deepseek-ai/dsh-base` 之上啟用 [Agent Teams](../agent-team/README.zh.md) 的公開實驗性 profile 層。它的 patch 會插入 Team domain 與 Team-scoped 工具、禁用名稱重疊的全局 continuable-child control，并保留普通的一次性 fresh 與 fork delegation 工具。必須將本包顯式添加到已初始化的 profile；隨附 profile 默認都不會啟用它。

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

### 安裝到 profile

將本包添加到已初始化的 profile，然后運行一個要求 Lead 委派工作的任務：

```sh
dsh plugin --profile headless add @deepseek-ai/dsh-experimental-agent-team-profile
dsh --profile headless "Use Agent Teams to split this task between two teammates, wait, and summarize."
```

profile 必須已經包含 `@deepseek-ai/dsh-base`，本層會使用其中的 Subagent 服務與提供方配置行。執行 `dsh plugin --profile <name> remove @deepseek-ai/dsh-experimental-agent-team-profile` 移除本包時，bundle 也會從 profile 的有序層列表中移除。

### 獲得的功能

本層會添加 Agent Teams domain，以及 Team-scoped 創建、roster、消息、interrupt、等待與任務板工具。它會禁用工具名與 Team control 重疊的全局 continuable-child control 行，同時保留 `subagent` 與 `subagent_fork` 作為一次性 delegation 工具。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本包的運行時內容是 [`cordis.patch.yml`](cordis.patch.yml)。在 `dsh-base` 之后應用時，patch 會禁用 `tool-subagent-control` 與 `tool-subagent-list-agents`，把 fresh 與 fork Subagent 行設置為 `one-shot`，并以顯式 provider 和限制插入 Team 服務與工具行。

| 文件 | 職責 |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | 疊加在 `dsh-base` 之上的有序 patch |
| [`src/index.ts`](src/index.ts) | 空模塊入口；patch 是運行時內容 |
| — | 不發布運行時不變式伴生入口；本包是靜態 bundle，不持有可獨立觀察的運行時關系。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [實驗性包](../README.zh.md)——孵化狀態與發布規則。
- [Agent Teams service](../agent-team/README.zh.md)——持久 roster、消息與任務板行為。
- [Agent Teams 工具](../tool-agent-team/README.zh.md)——Team-scoped 模型工具表層。
- [Base bundle](../../bundle/base/README.zh.md)——本 patch 擴展的 profile 層。

-----

<a id="model-experience"></a>
## 模型體驗

### Team 策略與工具

#### 模型會看到什么

Team 策略與 schema 由 [`@deepseek-ai/dsh-experimental-tool-agent-team`](../tool-agent-team/README.zh.md) 所有。本 bundle 只改變 composition：Team-scoped `list_agents`、`send_message` 與 `interrupt_agent` 會替代已禁用的全局 continuable-child control。`subagent` 與 `subagent_fork` 仍作為一次性 delegation 工具可用，其子 agent 不會獲得 continuable-child `report` 工具。

#### Token 影響

本 bundle 會加入 `@deepseek-ai/dsh-experimental-tool-agent-team` 描述的 Team 策略與工具 schema；它自身不增加提示詞文本。

#### KV Cache 影響

只要 bundle patch、Team identity 與配置的工具 schema 不變，本 bundle 的 composition 就保持前綴穩定。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **僅顯式啟用**——本包公開發布，但隨附 CLI、Web、SDK、ACP 與 Python profile 都不會啟用它。
- **共享 checkout**——所有 teammate 都觀察同一個工作目錄；本 bundle 不提供 worktree 隔離或文件系統鎖。
- **需要 base profile**——本 patch 依賴 `dsh-base` 提供的配置行 id 與 Subagent 提供方；它不是獨立 profile。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
