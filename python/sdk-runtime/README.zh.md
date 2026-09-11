# deepseek-harness-runtime-bin

[English](README.md) | 中文

DeepSeek Harness Python SDK 的平臺運行時 wheel 包。它把普通 `dsh` CLI（命令行界面）及其封閉的 Node 依賴樹打包成原生可執行程序，因此使用 SDK 不需要系統 Node.js。本包只發布 wheel 包。

## 安裝命令與產物

wheel 包會安裝 `dsh` 控制臺命令和 `deepseek_harness_runtime` Python 模塊。`dsh` 將參數轉發給內置可執行程序，并要求非空 `DSH_HOME`；它不會回退到 `~/.dsh`。

生產可執行程序位于模塊的 `runtime/` 目錄，命名為 `deepseek-harness-sdk-runtime-<platform>-<arch>`；Windows 使用 `.exe` 后綴。Linux 與 macOS wheel 包含目標平臺原生的 `-rg` 伴隨程序，Windows 包含 `-rg.exe`，macOS 還包含 `node-pty` 使用的 `-spawn-helper`。已發布目標是 Linux x64、Linux arm64、macOS arm64、macOS x64 與 Windows x64。wheel 包標簽必須與載荷嚴格匹配；不發布 Windows arm64 wheel 包。

倉庫構建還會物化僅限開發的 `runtime/node/` 載體。它在系統 Node 22.19 或更高版本上運行 `node runtime/node/node_modules/@deepseek-ai/dsh/lib/bin.js`。系統不會自動選擇它，而且 wheel 包與 sdist 均不包含它。

兩種載體執行相同的 `dsh` 語法與隨附 profile，包括獨立的 `sdk-minimal` 配置樹，以及包含前端產物的完整 `web` profile。私有 `dsh-python-runtime-closure` manifest（元數據清單）定義打包依賴閉包；不存在 Python 專用 Node 應用或檢入的默認 `cordis.yml`。

## Python 模塊 API

- `bundled_package_dir() -> Path` 返回已安裝模塊數據根目錄，并校驗發布元數據。
- `bundled_runtime_path() -> Path` 返回當前平臺可執行程序，并校驗必需伴隨文件。
- `resolve_bundled_launch_args(mode=None) -> tuple[str, ...]` 默認返回可執行程序 argv。顯式 `mode="node"` 或 `DSH_RUNTIME_MODE=node` 會選擇僅限倉庫使用的 Node 載體。
- `main()` 實現已安裝的 `dsh` 控制臺命令，并拒絕缺失或空白的 `DSH_HOME`。在 Windows 上，它讓打包進程繼承標準流，等待其結束并轉發退出狀態；在 POSIX 上，它替換 Python 進程。

不支持的平臺以及缺失的可執行程序或伴隨文件會拋出 `FileNotFoundError`，并指出構建與安裝路徑。未知運行時模式會拋出 `ValueError`。

## 打包后的 profile 解析

`dsh` 在顯式指定的主目錄下初始化隨附 profile、組合其 bundle patch，并從可執行程序的虛擬文件系統加載內置插件。操作系統符號鏈接無法進入該文件系統，因此打包運行會在 `$DSH_HOME/profiles/node_modules` 下維護小型真實 ESM 代理包。每個代理復現運行時的顯式導出項、記錄原包身份，并重新導出虛擬模塊 URL。因此，內置配置項與外部插件 peer 會共享同一個 Cordis／模塊實例。原生共享庫與 Windows ConPTY addon 會同其他原生 addon 一起打包；ripgrep 與 macOS PTY helper 仍是可執行伴隨程序。

外部 profile 管理使用 `dsh plugin --profile <name> ...`。該命令要求 `PATH` 中存在 `pnpm`；普通 SDK／profile 運行不需要它。

## 構建與分發

生產部署允許工作區中不屬于運行時閉包的補丁保持未使用；閉包內包的補丁仍必須成功應用。此例外僅用于部署命令，倉庫安裝仍拒絕未使用的補丁。

在倉庫根目錄運行 `pnpm exec tsx scripts/build-exe-for-python-sdk.ts`，會校驗閉包、構建包、部署無符號鏈接的文件樹、打包所選目標，并把可執行程序及伴隨文件同步到本模塊。`scripts/build-python-release.py` 按倉庫根版本暫存發布形態的 wheel 包，并將 `deepseek-harness-sdk` 固定到完全相同的運行時版本。

已安裝 wheel 包冒煙測試會在檢出目錄外創建干凈的虛擬環境，驗證分發物與可執行程序的來源，然后覆蓋默認及自定義 SDK profile、外部插件、MCP、原生工具、直接 JSON-RPC、檢入快照，以及可信運行中的真實提供方。另見 [Python 貢獻者工作流](../development.zh.md) 與 [installed-wheel 測試決策](../../.agents/notes/implemented/testing/2026-08-23-installed-python-wheel-black-box-ci.zh.md)。
