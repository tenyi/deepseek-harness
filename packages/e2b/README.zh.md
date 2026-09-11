---
description: "E2B 遠程運行時組映射：把文件與命令工作放進一個遠程 Linux 沙箱，供 E2B 家族的用戶與維護者瀏覽。"
kind: "package-group"
---

# packages/e2b

[English](README.md) | 中文

## 概述

E2B 家族讓 agent（智能體）在一個遠程 Linux 沙箱中讀取和編輯文件、運行 shell 命令并使用終端，而不是在主機上執行這些工作。文件系統工作與命令和終端執行保持分離，但兩者使用同一個沙箱。現有的 shell、終端與語言服務器功能無需 E2B 專用工具即可繼續工作。harness 進程、模型調用與會話狀態仍在本地；沙箱是臨時性的實驗環境，且默認不包含在已發布的組合中。

## 目錄

- [包](#packages)
- [相關文檔](#related-documentation)
- [開發備注](#dev-note)

-----

<a id="packages"></a>
## 包

| 包（package） | 職責 | ctx 鍵 |
|---|---|---|
| [`e2b`](e2b/README.zh.md) | 承載文件操作與命令執行的共享遠程 Linux 沙箱 | `ctx.e2b` |
| [`fs-e2b`](fs-e2b/README.zh.md) | 遠程沙箱內的文件讀取、寫入、編輯與列表 | `ctx.fs` |
| [`subprocess-e2b`](subprocess-e2b/README.zh.md) | 遠程沙箱內的 shell 命令與交互式終端 | `ctx.subprocess` |

-----

<a id="related-documentation"></a>
## 相關文檔

- [可移植執行世界決策](../../.agents/notes/implemented/architecture/2026-07-28-portable-execution-world-consumers.zh.md)——執行世界為何可以在不移動 harness 的情況下遷移，以及哪些內容留在本地。
- [子進程子系統](../../docs/subsystems/subprocess.zh.md)——子進程 seam 約定與生成的 Cordis 接口，包括 `ctx.e2b`。
- [文件系統子系統](../../docs/subsystems/filesystem.zh.md)——文件系統 seam 約定與生成的 Cordis 接口。

-----

<a id="dev-note"></a>
## 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
