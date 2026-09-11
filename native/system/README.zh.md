---
description: "為 Linux 進程隔離與 POSIX 會話寫鎖提供預編譯系統原語。"
kind: "package-library"
---
# @deepseek-ai/node-addon-system

[English](README.md) | 中文

## Summary

使用 Linux `landlock-run` 可執行文件限制子進程，或通過 `./flock` 入口獲取 POSIX 寫鎖。平臺包包含預編譯二進制；消費方安裝時不會構建原生代碼。Landlock 策略與會話生命周期仍由調用方負責。

## Table of Contents

- [使用](#use)
- [支持范圍](#support)
- [開發](#development)

## Use

`@deepseek-ai/node-addon-system/landlock-run` 為 Landlock 導出 `launcherPath`、`probe` 和 `grantArgs`。其可執行文件名、參數和失敗語義由 [CLI 約定](docs/cli-contract.md) 定義。

[flock 行為約定](docs/flock-contract.md) 將描述符、進程和咨詢式鎖語義對應到獨立原生測試。

`@deepseek-ai/node-addon-system/flock` 導出 `tryLockExclusive(fd): Promise<void>`。在調用完成前保持描述符打開。獲取操作使用非阻塞獨占 flock；發生競爭時，返回的 Promise 會以 `EAGAIN` 或 `EWOULDBLOCK` 拒絕，關閉該打開文件描述的最后一個描述符即釋放鎖。參見[入口 README](packages/entry/README.zh.md)。

導入任一入口都不會加載 addon。Landlock 可執行文件缺失時探測為不可用；flock 綁定缺失時拒絕獲取。兩條路徑都不會進行編譯，也不會靜默允許不受支持的行為。

## Support

Linux x64/arm64 包包含靜態 Landlock 可執行文件，以及分別用于 glibc/musl 的 `system.node` 文件。macOS x64/arm64 包僅包含 `system.node`。Landlock 還需要支持強制執行的 Linux 內核；Windows 使用 Harness 既有鎖實現。[支持矩陣](docs/support-matrix.md) 指定構建者與驗證負責人。

## Development

在本目錄運行 `pnpm build:ts` 構建入口、`pnpm build:native` 構建當前宿主聲明的原生產物、`pnpm build:test-oracle` 構建獨立的 flock 系統調用 fixture（測試前置數據）。隨后用 `pnpm test` 驗證入口、鎖、打包及可用的內核行為。Linux 完整構建需要 musl-gcc；macOS 使用 cc。根目錄 `pnpm run build:native-system` 只構建源碼測試所需的當前宿主 addon。

[架構](docs/architecture.md)、[打包](docs/packaging.md)和[發布流程](docs/release.md)分別負責實現與發布細節。

### Dev Note

無。
