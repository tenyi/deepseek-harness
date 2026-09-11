---
description: "subprocess 組地圖：共享的子進程服務及其本地宿主提供方，供瀏覽本組的用戶與維護者閱讀。"
kind: "package-group"
---

# subprocess/：子進程能力家族

[English](README.md) | 中文

## 概述

harness 運行的每個子進程與終端會話——bash 命令、語言服務器、持久 shell 與進程外 subagent 后端——都經由一個共享服務（`ctx.subprocess`）啟動、觀察與終止，并由一個本地提供方在宿主機器上執行。它不是獨立的產品功能：消費方能力 seam 決定每個進程的含義，命令語義、時限與面向模型的呈現仍歸它們所有。本組提供可執行文件查找、帶 spill 恢復的有界輸出捕獲、由提供方管理且明確披露較弱 fallback 的進程范圍，以及每個子進程起步時所用的清理后環境。

## 目錄

- [包](#packages)
- [相關文檔](#related-documentation)
- [開發備注](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 職責 | ctx 鍵 |
|---|---|---|
| [`subprocess`](subprocess/README.zh.md) | 定義子進程服務：可執行文件查找、受管進程 spawn 與真實終端會話 | `ctx.subprocess` |
| [`subprocess-local`](subprocess-local/README.zh.md) | 在支持的平臺上以原生受管范圍運行宿主進程與終端，其他平臺使用明確披露的較弱 fallback | 注冊到 `ctx.subprocess` |
| [`win32-process`](win32-process/README.zh.md) | 負責維護 sandbox 與普通進程創建、stdio、Job 分配、輪詢、等待與句柄清理所用的共享 Win32 綁定 | 庫，不使用 ctx key |

即使消費方重載，進程生命周期仍由服務負責管理；消費方負責定義進程的含義（一條 bash 命令、一個語言服務器），以及決定塑造該進程的每一項默認值。

-----

<a id="related-documentation"></a>
## 相關文檔

- [子進程子系統](../../docs/subsystems/subprocess.zh.md)——spawn spec、輸出讀取器、結果與受管的 `DSH_*` 環境。
- [subprocess seam Agent Note](../../.agents/notes/archived/architecture/2026-07-26-subprocess-seam.md)——bash 執行器的進程部分為何成為獨立的 seam。

-----

<a id="dev-note"></a>
## 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
