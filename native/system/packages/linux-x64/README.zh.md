---
description: "為 Linux x64 提供預編譯 Landlock 啟動器和 POSIX flock addon。"
kind: "package-library"
---
# @deepseek-ai/node-addon-system-linux-x64

[English](README.md) | 中文

此平臺包包含靜態 musl 可執行文件 `bin/landlock-run`，以及 Node-API v8 addon `bin/glibc/system.node` 和 `bin/musl/system.node`。入口按運行 Node 進程的 libc 選擇 addon；Landlock 可執行文件在兩種 libc 系統上共用。

包中沒有 JavaScript 或安裝編譯腳本。平臺 prepack 檢查完整產物、ELF 架構、Node-API 導出和啟動器可執行權限；已安裝產物演練核對字節并執行原生行為。參見工作區[支持矩陣](../../docs/support-matrix.md)。
