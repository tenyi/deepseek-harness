---
description: "共享核心、瀏覽器 GUI、一次性任務、ACP（Agent Client Protocol）與 SDK 應用表層的現成 dsh profile 組合包。"
kind: "package-group"
---

# bundle/：profile 插件組合包

[English](README.md) | 中文

## 概述

本組列出 `dsh --profile` 使用的可安裝 patch 層。每個包都聲明 `dsh.bundle.patch`；啟動器會疊放這些 patch 文檔來組裝具名 profile。`web`、`headless`、`acp` 與 `sdk` profile 以 `dsh-base` 為基礎，`sdk-minimal` 則由一個組合包提供完整配置樹。領域包也可以在本目錄之外聲明附加層。

## 目錄

- [包](#packages)
- [相關文檔](#related-documentation)
- [開發備注](#dev-note)

<a id="packages"></a>
## 包

| 包 | 職責 | ctx key |
|---|---|---|
| [`base`](base/README.zh.md) | 基于 base 的 profile 共享核心 | —（僅 patch） |
| [`acp-app`](acp-app/README.zh.md) | 基于 base、僅用于自動化的 ACP stdio 應用 | 掛載 ACP bridge |
| [`web-app`](web-app/README.zh.md) | 基于 base 的瀏覽器應用層 | 掛載多條 Web 配置行 |
| [`headless`](headless/README.zh.md) | 基于 base 的一次性命令行任務應用 | `headless-runner` |
| [`sdk-app`](sdk-app/README.zh.md) | 基于 base 的 SDK JSON-RPC stdio 應用 | 掛載 SDK 服務器 |
| [`sdk-minimal`](sdk-minimal/README.zh.md) | 不使用 base 或 Web 的獨立極簡 SDK 應用 | —（完整 patch 樹） |

內置組合包從 dsh 安裝目錄解析；樹外（out-of-tree）組合包通過 `dsh plugin --profile <name> add <package>` 安裝進 profile。

<a id="related-documentation"></a>
## 相關文檔

- [dsh 應用](../../apps/cli/README.zh.md)——啟動 profile 的 `dsh` 命令。
- [app-boot](../boot/app-boot/README.zh.md)——profile 如何解析、分層與定制。
- [Profile 插件組合包設計筆記](../../.agents/notes/implemented/architecture/2026-08-05-profile-plugin-bundles.zh.md)——profile 與組合包的組合設計。
- [生成組合圖](../../apps/cli/composition.md)——每個隨發行版交付的 profile 使用的確切組合。

<a id="dev-note"></a>
## 開發備注

無。
