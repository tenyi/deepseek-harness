# Python SDK 示例

[English](README.md) | 中文

基于唯一應用啟動器 `dsh --profile sdk-minimal` 的可運行 Python SDK 示例。Python 客戶端負責 JSON-RPC stdio；profile 負責 agent（智能體）組合、持久化、執行策略與插件。

## 運行極簡 agent

安裝 `deepseek-harness-sdk`、導出模型憑據，然后提供隔離的 Harness home 與 workspace：

```sh
export DEEPSEEK_API_KEY=sk-your-key-here
python python/sdk/examples/minimal.py \
  --dsh-home /absolute/path/to/example-dsh-home \
  --workspace /absolute/path/to/disposable-workspace \
  --session-id example-001 \
  "Inspect the repository and fix the failing tests."
```

如需使用兼容代理，請設置 `DEEPSEEK_BASE_URL`；可通過 `DSH_MODEL` 設置腳本的默認模型，通過 `DSH_SYSTEM_PROMPT` 指定部署角色設定。`--model` 是唯一運行時模型選擇，不要求匹配的環境變量；`--profile` 可以選擇另一個提供 SDK 服務的 profile。所選 home 保存生成的 `sdk-minimal` profile，并在 `sessions/` 下保存未壓縮 JSONL 會話日志；腳本絕不會隱式讀取 `~/.dsh`。

隨附的 [`@deepseek-ai/dsh-sdk-minimal` 組合包](../../../packages/bundle/sdk-minimal/README.zh.md) 是該模式完整且顯式的 Cordis 配置樹。它只暴露：

- Linux／macOS 上所有者作用域內的持久 `bash`，或 Windows 上的 `pwsh`

該組合包不包含 `dsh-base`，因此每一個新增配置項都是顯式 profile 變更。運行時上下文、文件系統工具、本地指令發現、壓縮（compaction）、設置、托管憑據、遙測、Web 工具、subagent 與完整默認工具清單均不存在。配置樹保留 SDK 啟動與 JSON-RPC 服務、一個由環境配置的 DeepSeek 適配器、本地執行和 JSONL 持久化。

持久 PTY 可以修改運行時進程可訪問的任何路徑，因此只應在一次性 checkout 或容器中使用。

## 添加插件

對同一個顯式 home 使用運行時 wheel 包提供的 `dsh` 命令，以進行持久 profile 變更：

```sh
export DSH_HOME=/absolute/path/to/example-dsh-home
dsh plugin --profile sdk-minimal add file:/absolute/path/to/my-plugin-bundle
```

在該命令中使用 `sdk-minimal` 可擴展本示例，使用 `sdk` 則擴展基于完整 base 的 SDK profile。Python 調用也可以在 `patches=(...)` 中傳入更多絕對 patch 路徑；后面的文件優先。所選 profile 必須保留 `@deepseek-ai/dsh-sdk-app` 或另一個 JSON-RPC server 配置項。該示例不接受完整 Cordis 文件或任意進程 argv。

同一個運行時 wheel 包還打包了供直接 CLI（命令行界面）使用的 `web` profile 及其前端產物：`dsh web` 會啟動這個獨立應用。Python SDK 客戶端不能選擇 `web`，因為其中沒有 JSON-RPC 服務器配置項。

另見 [Python SDK 教程](../../../docs/user/guide/python-sdk.zh.md) 與 [SDK 參考](../README.zh.md)。
