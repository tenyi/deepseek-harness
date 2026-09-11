---
description: "boot 包組：dsh app bin 如何啟動——環境加載、profile 與 patch 層、清晰的啟動失敗信息，以及由應用持有的命令行。"
kind: "package-group"
---

# boot/：共享的 app bin 啟動粘合層

[English](README.md) | 中文

## 概述

boot 組提供每個 dsh app bin 啟動所需的全部能力：`app-boot` 把 `cordis.yml` 連同你的環境與 patch 層變成運行中的應用，并給出清晰的失敗信息；`cmdline` 讓應用持有自己的命令行 flag 與 `--help`。借助這些包，你可以運行 `dsh`，也可以編寫以同樣方式啟動的新應用或測試用 fixture（測試前置數據）。兩者都是 `apps/cli` 與測試專用 Loader fixture 導入的庫，絕不是組合加載的插件。本頁列出該包組的構成；各包 README 負責各自的包級約定。

## 目錄

- [包](#packages)
- [相關文檔](#related-documentation)
- [開發備注](#dev-note)

<a id="packages"></a>
## 包

| 包 | 職責 | ctx 鍵 |
|---|---|---|
| [`app-boot`](app-boot/README.zh.md) | 從 `cordis.yml` 啟動 dsh 應用：加載 `.env`、應用 profile 與 patch 層，并清晰報告啟動失敗 | （供各 bin 使用的庫） |
| [`cmdline`](cmdline/README.zh.md) | 讓應用持有自己的 flag、`--help` 與退出碼；啟動器自身 flag 之后的一切原樣傳入 | `cmdlineArgs`、`appExit` |

<a id="related-documentation"></a>
## 相關文檔

- [dsh 應用](../../apps/cli/README.zh.md)——在其啟動序列中使用這些 helper 的 `dsh` bin。
- [Profile 組合包](../bundle/README.zh.md)——可由 `dsh --profile` 組合掛載的可安裝 patch 層。
- [dsh-home-paths](../util/home-paths/README.zh.md)——兩個包都依賴的 harness home 解析器。
- [dsh-cmdline](cmdline/README.zh.md)——flag 家族如何由應用持有而非啟動器。

<a id="dev-note"></a>
## 開發備注

無。
