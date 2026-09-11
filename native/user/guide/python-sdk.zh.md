# Python SDK 入門

[English](python-sdk.md) | 中文

本教程安裝已發布的 Python SDK，運行隨附的獨立極簡 profile，并說明如何從自己的程序自定義同一個 `dsh` profile。

## 前置條件

- Python 3.10 或更高版本
- Git
- Linux x64、Linux arm64、arm64 上的 macOS 14 或更高版本，或 Windows x64
- DeepSeek 兼容的 API endpoint 與憑據
- 隔離的 workspace 與隔離的 Harness home

## 安裝 SDK

### Linux 與 macOS

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
python -m venv .venv
. .venv/bin/activate
python -m pip install deepseek-harness-sdk
```

### Windows PowerShell

```powershell
git clone https://github.com/deepseek-ai/deepseek-harness.git
Set-Location deepseek-harness
py -3.10 -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install deepseek-harness-sdk
```

安裝內容包含匹配的原生運行時 wheel 與 `dsh` 命令。普通 SDK 運行不需要系統 Node.js。需要構建產物的倉庫貢獻者應使用 [Python 貢獻者工作流](../../../python/development.zh.md)。

## 運行檢入示例

導出憑據；使用兼容代理時再設置 endpoint：

### Linux 與 macOS

```sh
export DEEPSEEK_API_KEY=sk-your-key-here
# export DEEPSEEK_BASE_URL=http://127.0.0.1:8000/v1
```

### Windows PowerShell

```powershell
$env:DEEPSEEK_API_KEY = "sk-your-key-here"
# $env:DEEPSEEK_BASE_URL = "http://127.0.0.1:8000/v1"
```

使用顯式 workspace 與 home 路徑運行一個任務：

### Linux 與 macOS

```sh
python python/sdk/examples/minimal.py \
  --workspace /absolute/path/to/disposable-workspace \
  --dsh-home /absolute/path/to/example-dsh-home \
  --session-id example-001 \
  "Inspect the repository and fix the failing tests."
```

### Windows PowerShell

```powershell
python python/sdk/examples/minimal.py `
  --workspace C:\work\disposable-workspace `
  --dsh-home C:\work\example-dsh-home `
  --session-id example-001 `
  "Inspect the repository and fix the failing tests."
```

腳本會打印最終 assistant 響應。所選 home 會保存生成的 `sdk-minimal` profile、已安裝插件，以及 `sessions/` 下的未壓縮 JSONL 會話日志。示例與 SDK 絕不會靜默讀取 `~/.dsh`。

## 在程序中使用 SDK

```python
from pathlib import Path

from deepseek_harness import DeepSeekHarness

workspace = Path("/absolute/path/to/disposable-workspace").resolve()
dsh_home = Path("/absolute/path/to/example-dsh-home").resolve()
with DeepSeekHarness(
    provider="deepseek-official",
    model="deepseek-v4-flash",
    max_tokens=49_152,
    cwd=str(workspace),
    dsh_home=str(dsh_home),
    profile="sdk-minimal",
) as harness:
    result = harness.run(
        "Inspect the repository and fix the failing tests.",
        session_id="example-001",
    )

print(result.final_response)
```

SDK 會延遲啟動內置的 `dsh --profile sdk-minimal` 進程，并復用到上下文管理器退出。Profile、其持久 patch、home patch 與任何有序 `patches` tuple 共同組成應用配置。不存在獨立 Python 運行時 bin 或完整配置選項。

## 安裝或定義插件

需要在該 home 中持久保存依賴與 bundle 層時，使用 `dsh plugin`：

### Linux 與 macOS

```sh
export DSH_HOME=/absolute/path/to/example-dsh-home
dsh --profile sdk-minimal --dump-default-config >/dev/null
dsh plugin --profile sdk-minimal add file:/absolute/path/to/my-plugin-bundle
```

### Windows PowerShell

```powershell
$env:DSH_HOME = "C:\work\example-dsh-home"
dsh --profile sdk-minimal --dump-default-config | Out-Null
dsh plugin --profile sdk-minimal add file:C:/work/my-plugin-bundle
```

第一個命令初始化隨附的獨立 profile。第二個命令把包管理轉發給 `pnpm`，然后記錄所有導出 `dsh.bundle` 層的已安裝包。只有執行此管理命令時才需要安裝 `pnpm`；啟動已安裝 SDK 不需要它。持久配置項變更應編輯 `$DSH_HOME/profiles/sdk-minimal/cordis.patch.yml`；單次啟動變更則從 Python 傳入 patch 文件。

另一個 `profile` 只有包含 `@deepseek-ai/dsh-sdk-app` 或另一個 JSON-RPC server 配置項時才有效。缺失 server 配置項、無法解析的插件和非法 patch 會在啟動時失敗，不會回退到其他組合。

<a id="opt-in-to-str_replace_editor"></a>
### 顯式啟用 `str_replace_editor`

隨附運行時包含 `str_replace_editor`，但 `sdk-minimal` 的默認 Cordis tree 不掛載它。要使用該工具，請將以下配置保存為 `editor.patch.yml`；`insert` 會添加 editor，以及極簡 profile 缺少的文件系統后端：

```yaml
- insert:
    - id: fs-local
      name: '@deepseek-ai/dsh-fs-local'
      config:
        cwd: !!js process.cwd()
    - id: tool-str-replace-editor
      name: '@deepseek-ai/dsh-tool-str-replace-editor'
```

構造 `DeepSeekHarness(profile="sdk-minimal", ...)` 時傳入 `patches=("/absolute/path/to/editor.patch.yml",)`，或將 patch 寫入 `$DSH_HOME/profiles/sdk-minimal/cordis.patch.yml` 以持久保存配置。下次運行時啟動后，模型請求會在持久 shell 之外包含 `str_replace_editor`。本地文件系統后端以運行時工作目錄解析相對路徑；與極簡 shell 一樣，它不會將訪問限制在該目錄內。對于標準 `sdk` profile，只插入 editor 配置項，讓它使用已有的文件系統后端與策略。

## 理解極簡 profile

| 屬性 | 值 |
|---|---|
| 系統提示詞 | `DSH_SYSTEM_PROMPT`，未設置時為 `You are a helpful software engineer assistant.` |
| `minimal.py` 的模型 | `--model`，然后是 `DSH_MODEL`，最后是 `deepseek-v4-flash` |
| 面向模型的工具 | Linux／macOS 上的持久 `bash` 或 Windows 上的 `pwsh` |
| Shell 超時 | 300 秒 |
| 運行時上下文與 compaction | 不存在 |
| 會話持久化 | `<dsh_home>/sessions` 下的未壓縮 JSONL |

該 profile 的唯一組合包會在空根之上插入完整配置樹，且不包含 `dsh-base`，因此基礎 profile 以后新增的工具不會隱式出現。它包含 SDK 協議、一個由環境配置的 DeepSeek 適配器、本地執行與持久化；文件系統工具、settings、托管憑據、遙測、Web 工具、subagent、本地指令發現和 compaction 均不存在。它固定使用 `danger-full-access`，因此按平臺選擇的持久 shell 可以修改運行時可見的任何路徑；應使用一次性 checkout 或容器。

已安裝 wheel 仍會打包完整 `web` profile 與前端產物。如果 Python SDK 部署還需要瀏覽器應用，請針對顯式 `DSH_HOME` 運行 `dsh web`；`web` 是獨立 CLI 應用，不能為 Python SDK client 提供服務。

需要隔離 profile、插件、憑據、設置與會話時，應使用新的 home。獨立工作應使用新的 session id；只有繼續同一段持久對話和會話資源時，才同時復用 harness、home 與 id。

[組合包參考](../../../packages/bundle/sdk-minimal/README.zh.md)定義確切配置樹，[示例參考](../../../python/sdk/examples/README.zh.md)定義可運行程序。[Python SDK 參考](../../../python/sdk/README.zh.md)介紹生命周期、結果、通知與底層行為；[dsh CLI 參考](../../../apps/cli/reference/README.zh.md)介紹 profile 分層。
