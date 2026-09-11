---
description: "為 macOS arm64 POSIX 鎖提供預編譯 system.node。"
kind: "package-library"
---
# @deepseek-ai/node-addon-system-darwin-arm64

[English](README.md) | 中文

此平臺包提供 `bin/system.node`，供 `@deepseek-ai/node-addon-system/flock` 使用的穩定 Node-API v8 addon。它不包含 Landlock 可執行文件、JavaScript 加載器或安裝構建腳本。Native 工作流在 macOS arm64 上構建它，并負責驗證安裝后的產物。
