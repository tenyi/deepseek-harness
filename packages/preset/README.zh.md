---
description: "preset 組地圖：按會話從 preset 文件組裝 agent，供瀏覽本組的用戶與維護者閱讀。"
kind: "package-group"
---

# packages/preset

[English](README.md) | 中文

## 概述

preset 組提供按會話的 agent（智能體）組裝：agent preset 是一個目錄，內含一份 `agent.cordis.yml`；從 preset 組裝的會話會使用該 preset 的工具、提示詞段落與 skill（技能），而其他會話仍各自使用自己的工具、提示詞段落與 skill。`agent-presets` 擁有名單——對已配置根目錄與 harness home 的發現、受防護的按 agent 掛載，以及僅通過復制創建 preset 的方式——`persona` 則提供可組裝的行，讓 preset 不止能改變 agent 的工具，也能改變它的身份。兩者合起來讓一個進程可以同時運行多個組裝方式不同的 agent。

## 目錄

- [包](#packages)
- [相關文檔](#related-documentation)
- [開發備注](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 職責 | ctx 鍵 |
|---|---|---|
| [`agent-presets`](agent-presets/README.zh.md) | preset 名單、對受信任根目錄與用戶根目錄的發現、按 agent 組裝、僅通過復制創建 preset | `ctx.agentPresets` |
| [`persona`](persona/README.zh.md) | preset 掛載的可組裝人設行，用于遮蔽或替換部署級人設 | — |

-----

<a id="related-documentation"></a>
## 相關文檔

- [`AgentPresets` 參考](../../docs/subsystems/core.zh.md#ctxagentpresets--agentpresets)——發現、掛載、繼承與重組。
- [Scope 子系統](../../docs/subsystems/scope.zh.md)——scope key，以及掛載接入 agent 時所用的父鏈。
- [系統提示詞子系統](../../docs/subsystems/system-prompt.zh.md)——preset 提示詞段落如何注冊與組裝。
- [按會話組裝 agent preset 的 Agent Note](../../.agents/notes/implemented/architecture/2026-08-03-per-session-agent-presets.zh.md)——設計理由與備選方案。

部署交付的 preset 位于 [`agent-presets/presets/`](agent-presets/presets)——一個 preset 一個目錄，那份目錄列表就是名單；在這里再列一遍只會多出一份需要同步的名單。

-----

<a id="dev-note"></a>
## 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
