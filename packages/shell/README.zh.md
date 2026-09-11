---
description: "面向部署方與維護者的 bash 能力家族說明，用于選擇并組合 shell 執行器、沙箱化與面向模型的 bash 與 pwsh 工具。"
kind: "package-group"
---

# shell/ — bash 能力家族

[English](README.md) | 中文

## 概述

shell 組為 agent（智能體）提供命令執行能力：運行前臺命令并讀取其有界輸出，或啟動后臺進程并輪詢它——在 POSIX 上用 Bash，在 Windows 上用 PowerShell。每個組合恰好掛載一個執行器實現；沙箱執行器會通過沙箱能力限制每條命令，面向模型的 `bash` 與 `pwsh` 工具則位于所掛載執行器之上。POSIX 選擇 Bash 執行器，Windows 選擇 PowerShell 執行器；命令需要文件級隔離時選擇沙箱變體。

## 目錄

- [包](#packages)
- [相關文檔](#related-documentation)
- [開發備注](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 職責 | ctx key |
|---|---|---|
| [`shell`](shell/README.zh.md) | 定義執行器約定：前臺運行、后臺句柄與請求解析 | `ctx.shell` |
| [`bash-local`](bash-local/README.zh.md) | 在 POSIX 上以全新 `bash -c` 進程運行 Bash 命令 | 注冊 `ctx.shell` |
| [`bash-sandbox`](bash-sandbox/README.zh.md) | 通過沙箱能力限制 Bash 命令運行，并把拒絕報告為事實 | 注冊 `ctx.shell` |
| [`pwsh-local`](pwsh-local/README.zh.md) | 在 Windows 上以全新 `pwsh -Command` 進程運行 PowerShell 命令 | 注冊 `ctx.shell` |
| [`pwsh-sandbox`](pwsh-sandbox/README.zh.md) | 通過沙箱能力限制 PowerShell 命令運行 | 注冊 `ctx.shell` |
| [`shell-env`](shell-env/README.zh.md) | 提供每條 shell 命令都會收到的受管 `DSH_*` 環境 | `ctx.shellEnv` |
| [`tool-bash`](tool-bash/README.zh.md) | 以 `bash` 工具向模型公開 Bash 執行與后臺任務 | 注冊到 `ctx.tools` |
| [`tool-bash-persistent`](tool-bash-persistent/README.zh.md) | 在單個限定所有者范圍的持久 Bash 會話中運行模型的 shell 調用 | 注冊到 `ctx.tools` |
| [`tool-pwsh`](tool-pwsh/README.zh.md) | 以 `pwsh` 工具向模型公開 PowerShell 執行 | 注冊到 `ctx.tools` |
| [`tool-pwsh-persistent`](tool-pwsh-persistent/README.zh.md) | 在單個限定所有者范圍的持久 PowerShell 會話中運行模型的 shell 調用 | 注冊到 `ctx.tools` |

profile 層恰好選擇一個執行器實現（win32 層會把 POSIX 行換成 pwsh 行；同時掛載兩個會因服務重復注冊而在加載期失敗）以及所需的面向模型工具。沙箱化組合還會選擇一個 `ctx.sandbox` 提供方與 `ctx.sandboxPolicy`；[base 組合包](../bundle/base/cordis.patch.yml)負責隨產品交付的接線配置。

-----

<a id="related-documentation"></a>
## 相關文檔

- [Bash 執行器子系統](../../docs/subsystems/shell.zh.md) —— 共享的請求/spec 詞匯、結果、后臺進程與完整的服務約定。
- [沙箱子系統](../../docs/subsystems/sandbox.zh.md) —— 沙箱執行器所消費的隔離能力。

<a id="dev-note"></a>
## 開發備注

無。
