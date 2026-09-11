---
description: "在 Host Team 層之后，為 Web profile 添加公開發布的實驗性 Agent Teams 面板。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-agent-team-web-profile

[English](README.md) | 中文

## 概述

`dsh-experimental-agent-team-web-profile` 是 [Agent Teams](../agent-team/README.zh.md) 公開發布的實驗性 Web 層。把它放在 `@deepseek-ai/dsh-web-app` 與 [`@deepseek-ai/dsh-experimental-agent-team-profile`](../agent-team-profile/README.zh.md) 之后，即可在瀏覽器中顯示 Team roster、任務板與 teammate 導航。移除任一實驗層都會讓穩定的 base 與 Web composition 保持不變。隨附 Web profile 默認不會啟用它。

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

按以下順序把 Host 與 Web Agent Teams 層添加到已初始化的 `web` profile：

```sh
dsh plugin --profile web add @deepseek-ai/dsh-experimental-agent-team-profile
dsh plugin --profile web add @deepseek-ai/dsh-experimental-agent-team-web-profile
```

第一條命令提供 Team domain、生成的 Remote 方法與模型工具。第二條命令激活本包聲明的 patch 及其瀏覽器 presentation。執行 `dsh plugin --profile web remove @deepseek-ai/dsh-experimental-agent-team-web-profile` 移除本包時，Web 層也會從 profile 的有序 bundle 列表中移除。

### 獲得的功能

對話標題欄會獲得 Team roster、共享任務板與 teammate 導航。[`@deepseek-ai/dsh-experimental-client-ui-agent-team`](../client-ui-agent-team/README.zh.md) 負責這些瀏覽器交互，并掛載用于訪問 Host Team service 的生成 Client Remote namespace。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本包的運行時內容是 [`cordis.patch.yml`](cordis.patch.yml)。在 `dsh-web-app` 與 Host Agent Teams 層之后應用時，它唯一的 `insert` 條目會為 `@deepseek-ai/dsh-experimental-client-ui-agent-team` 添加 `ui-agent-team` 行。插入的 Client 插件負責生成的 Remote assembly 與 Team UI；這個靜態 bundle 不持有可變狀態，也不安裝運行時不變式。

| 文件 | 職責 |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | 包含 `ui-agent-team` 行的有序 Web patch |
| [`src/index.ts`](src/index.ts) | 空模塊入口；patch 是運行時內容 |
| — | 不發布運行時不變式伴生入口；本包只攜帶靜態 profile patch，Remote assembly 與 Team UI 負責各自的激活要求。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [實驗性包](../README.zh.md)——孵化狀態與發布規則。
- [Agent Teams Host profile](../agent-team-profile/README.zh.md)——所需的 domain、Remote 與模型工具層。
- [Agent Teams 瀏覽器 UI](../client-ui-agent-team/README.zh.md)——roster、任務板與 teammate 導航行為。
- [Web bundle](../../bundle/web-app/README.zh.md)——本 patch 擴展的穩定瀏覽器層。

-----

<a id="model-experience"></a>
## 模型體驗

通過與本 Web 層同時選擇的 Host-side Agent Teams profile 間接產生影響。

#### KV Cache 影響

本 Web bundle 不添加任何模型請求內容；Host-side Team 工具負責提示詞、schema 與緩存影響。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **有序組合**——`dsh-base`、`dsh-web-app`、`dsh-experimental-agent-team-profile` 與本包必須保持這個順序。
- **Preset-scoped 舊控制項**——穩定 Web preset 仍會在 preset scope 內掛載 continuable Subagent 控制項。頂層 Host profile override 不會替換這些 scoped registration，因此在 Web 獲得 Team-aware preset 前，Team roster 與舊 child 控制項可能同時出現。[Web Agent Teams 決策](../../../.agents/notes/archived/feature/2026-08-06-agent-teams-web.md)記錄了這項暫緩的 composition 工作。
- **僅顯式啟用**——本包公開發布，但隨附 Web profile 默認不會啟用任何 Agent Teams 層。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
