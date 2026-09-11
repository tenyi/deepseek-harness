---
description: "進程沙箱包組：隔離 seam、各平臺后端、共享策略解析器與 Windows 寫入限制檔。"
kind: "package-group"
---

# packages/sandbox

[English](README.md) | 中文

## 概述

`sandbox/` 組將子進程執行限制在文件效果策略之下：命令以 `read-only` 運行、只能寫入會話工作區（`workspace-write`）或不受限制地運行（`danger-full-access`）。四個包交付該能力：隔離服務（`sandbox/`）、面向 Linux、macOS 與 Windows 的各平臺后端（`sandbox-local/`）、共享策略解析器（`sandbox-policy/`）與 Windows 寫入限制后端（`sandbox-windows-acl/`）。被策略拒絕的受限調用可以通過用戶批準的一次性升權重試。隔離僅適用于與宿主共享文件系統和內核的子進程；容器、microVM 與遠程執行器會替換整個能力，而不是在此注冊。

## 目錄

- [包](#packages)
- [相關文檔](#related-documentation)
- [開發備注](#dev-note)

-----

<a id="packages"></a>
## 包

四個包承擔隔離角色；完整約定和逐調用策略語義以子系統參考文檔為準。

| 包 | 職責 | ctx key |
|---|---|---|
| [`sandbox/`](sandbox/README.zh.md) | 隔離服務約定：模式、強制執行、逐調用策略與升權詞匯 | `ctx.sandbox` |
| [`sandbox-local/`](sandbox-local/README.zh.md) | 各平臺隔離后端：Linux 先使用 bwrap，再使用 Landlock；macOS 使用 Seatbelt；Windows 使用受限令牌 | 注冊到 `ctx.sandbox` |
| [`sandbox-policy/`](sandbox-policy/README.zh.md) | 共享策略歸屬：供所有實施隔離的家族使用的部署默認值與逐會話模式覆蓋 | `ctx.sandboxPolicy` |
| [`sandbox-windows-acl/`](sandbox-windows-acl/README.zh.md) | Windows 寫入限制：受限子進程只能寫入工作區與私有臨時目錄 | —（由 `sandbox-local` 掛載為 win32 后端） |

-----

<a id="related-documentation"></a>
## 相關文檔

先從子系統參考文檔了解共享詞匯，再看隔離決策及其跨家族擴展。

- [進程沙箱子系統](../../docs/subsystems/sandbox.zh.md)——模式、逐調用策略、包裝 argv 方言與故障關閉錯誤。
- [子進程沙箱決策](../../.agents/notes/implemented/feature/2026-07-06-sandbox.zh.md)——能力邊界、升權編排與延期階段。
- [跨家族文件沙箱決策](../../.agents/notes/implemented/feature/2026-07-14-cross-family-fs-sandbox.zh.md)——統一的共享策略歸屬與沙箱化文件系統提供方。
- [Windows ACL 受限令牌沙箱決策](../../.agents/notes/implemented/feature/2026-08-08-windows-acl-restricted-token-sandbox.zh.md)——為何選擇原始 ACL 受限令牌而非 mxc 與 AppContainer。

<a id="dev-note"></a>
## 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
