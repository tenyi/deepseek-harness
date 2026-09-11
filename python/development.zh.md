# Python 貢獻者工作流

[English](development.md) | 中文

根據所需的貢獻者成果選擇工作流：構建運行時產物、驗證 SDK、從源碼運行或構建分發包。包行為分別見 [SDK 參考](sdk/README.zh.md) 和[運行時載體參考](sdk-runtime/README.zh.md)。

## 構建運行時產物

各平臺可執行文件是構建產物，不檢入 git。請在倉庫根目錄運行構建：

```sh
pnpm install
pnpm exec tsx scripts/build-exe-for-python-sdk.ts
```

所需 `lib/` 產物已存在時使用 `--skip-build`；如需選擇平臺，請使用 `--targets=node24-linux-x64,node24-linux-arm64,node24-macos-arm64,node24-macos-x64,node24-win-x64`。每個目標都應在其原生架構上構建。產物寫入 `dist-exe/`，腳本會將所選載體同步到 `python/sdk-runtime/`。Windows 會生成 `.exe` 與 `-rg.exe`；macOS 構建還會同步 `node-pty` 所需的配套 spawn 輔助程序。

## 驗證 SDK

請將虛擬環境放在 `python/` 之外，安裝測試組，然后運行 Python 測試套件：

```sh
export UV_PROJECT_ENVIRONMENT="$PWD/tmp/py-sdk-venv"
uv sync --project python/sdk --group test
uv run --project python/sdk pytest
```

`python/sdk/tests/test_bundled_runtime.py` 會運行可用的內置載體；某個載體的產物尚未構建時，會跳過該載體。倉庫級測試政策見 [測試](../docs/testing.zh.md)。

該套件面向的是偽造的運行時對端。`scripts/smoke-python-runtime.py` 面向打包運行時。`python-runtime` CI 任務在拉取請求上構建 Linux x64 與 Windows x64，在 master 推送上構建 Linux arm64 與兩種 macOS 架構。每個選定目標把匹配的 SDK wheel 包與運行時 wheel 包安裝進新的 Python 3.10 虛擬環境，在 checkout 外清除 `PYTHONPATH` 與 `DSH_RUNTIME_MODE` 后運行，證明兩個模塊及可執行文件都來自這些 distribution，然后運行全部 keyless 場景。聚焦的本地源碼 SDK 運行可以選擇一個已構建可執行文件與場景：

```sh
uv run --project python/sdk python scripts/smoke-python-runtime.py \
  --scenario sdk-minimal --exe dist-exe/deepseek-harness-sdk-runtime-macos-arm64
```

其中四個場景會比對 `scripts/snapshots/python-sdk-single-exe/` 下已提交的期望輸出。`minimal/model-visible.json` 固定 Linux／macOS `sdk-minimal` profile 所組裝的系統提示詞、對外公布的工具 schema 與模型可見消息；`minimal/win-x64/model-visible.json` 固定對應的 PowerShell 版本。因此，插件一旦貢獻出計劃外的系統分段或 user 消息，該任務即失敗，且該 profile 發出的每條消息都會參與比對。`advanced/` 跨所有目標固定一個復雜進程的 SDK 結果及父／子會話日志。`restart/` 針對同一持久化根目錄啟動兩個完整 SDK 運行時進程，并跨所有目標固定其彼此隔離的模型歷史、高層結果與獨立持久日志。`sdk-minimal-in-history` 復用持久 shell 與編輯器場景，并在首次 shell 調用成功后更改一個分段。`minimal-in-history/prompt-history.json` 固定兩個提示詞版本、后續請求中不變的首條提示詞、追加的 SDK system-message 事件及 `request/context.systemPromptUpdate`；工具 schema 保持不變，并獨立檢查編輯器創建的文件。重新運行對應場景時加上 `--update-snapshots`，并在提交前審閱該差異。

可信拉取請求與 master 推送還會在各自選定的原生目標上運行 `--scenario sdk-live --installed-wheel`。該場景面向 `https://api.deepseek.com` 執行兩個使用工具的輪次：立即檢查已創建文件，將其內容替換為僅宿主知道的隨機挑戰值，并要求第二輪將變更后的內容復制到全新的回執文件，且不修改源文件。兩個輪次都必須完成、返回精確的哨兵答案并由模型請求調用工具；文件通過外部逐字節比較驗證。倉庫密鑰缺失時失敗，而不是自行 skip。Fork 與 Dependabot 拉取請求會運行完整的 keyless 安裝后 wheel 路徑，但不會獲得密鑰。

交互式冒煙測試需要環境變量或倉庫根目錄 `.env` 中存在 `DEEPSEEK_API_KEY`：

```python
from deepseek_harness import DeepSeekHarness

with DeepSeekHarness(dsh_home="/absolute/path/to/test-dsh-home") as harness:
    print(harness.run("say hi").final_response)
```

也可以導出非空 `DSH_HOME`。SDK 會拒絕可能靜默使用 `~/.dsh` 的啟動。

## 針對 Node 源碼運行

倉庫貢獻者可以選擇以下任一開發路徑；兩者都執行普通的 `dsh --profile sdk` 啟動器：

- 設置 `DSH_RUNTIME_MODE=node`，在系統 Node `>=22.19` 上使用已構建的 Node 載體。構建腳本會刷新該載體，但分發物絕不會包含或自動選擇它。
- 將 `dsh_bin` 設置為已構建 `apps/cli/lib/bin.js` 的絕對路徑，直接驗證當前 checkout 的 CLI。請顯式提供 `dsh_home`，并按需提供 `profile` 與有序 `patches`。

`python/sdk/tests/manual_sdk_agent_smoke.py` 使用內部 `_launch_args` 測試適配器，通過 tsx 驗證未構建的 TypeScript CLI。公開 SDK 刻意不提供任意 argv 替換。

## 構建分發包

根目錄 `package.json` 的版本是兩個 Python 分發包的權威版本。暫存腳本會將該版本注入兩個 wheel 包，并將 SDK 固定到同版本的 `deepseek-harness-runtime-bin`。

純 SDK wheel 包只需構建一次；每個原生平臺分別構建一個運行時 wheel 包：

```sh
version="$(python - <<'PY'
import runpy

release = runpy.run_path("scripts/build-python-release.py")
print(release["pep440_version"](release["repository_version"]()))
PY
)"
python scripts/build-python-release.py --package sdk --output-dir dist-python
python scripts/build-python-release.py --package runtime --platform macos-arm64 --runtime-exe dist-exe/deepseek-harness-sdk-runtime-macos-arm64 --output-dir dist-python
pip install \
  "dist-python/deepseek_harness_sdk-$version-py3-none-any.whl" \
  "dist-python/deepseek_harness_runtime_bin-$version-py3-none-macosx_14_0_arm64.whl"
```

運行時分發包僅提供 wheel 包。發布流水線會連同純 SDK wheel 包一起發布五個平臺 wheel 包：Linux x64、Linux arm64、macOS 14 或更高版本的 arm64 與 x64，以及 Windows x64（`win_amd64`）。只有與倉庫版本匹配時，才接受 `python-v<repository-version>` 標簽；`0.0.1-rc.1` 之類的倉庫預發布版本在 wheel 包文件名和元數據中使用規范化的 PEP 440 寫法，例如 `0.0.1rc1`。

## 驗證候選發行版

手動運行 GitHub 的 `Release (Python)` 工作流并設置 `publish=false`，即可構建全部六個 wheel 包，在 Python 3.10 和 3.14 上安裝 Linux 發行集合，檢查精確文件名和元數據，執行 PyPI 默認單文件大小限制，并保留一份帶 SHA-256 哈希的匯總產物。該運行沒有注冊表憑據，dry-run 運行無法進入任何發布作業。

公開發布從私有自動化倉庫運行。包元數據指向獨立的只讀公開源碼鏡像，該鏡像不運行發布 Actions。私有倉庫把倉庫變量 `PYPI_PUBLISHER_REPOSITORY` 定義為自身的 `owner/name`，并且只在有意發布期間把 `PUBLIC_PYPI_RELEASE_ENABLED` 從 `false` 改為 `true`。

獨立的運行時與 SDK 作業使 SDK 上傳失敗后可以繼續執行，而無需重新發送不可變的運行時文件。只有工作流從配置的發布倉庫、匹配的 `python-v*` 標簽運行，且受保護的 `pypi-runtime` 和 `pypi` 環境分別批準運行時與 SDK 作業時，才接受 `publish=true`。PyPI Trusted Publishing 仍會提供短期 OIDC 憑據，但公開 attestation 會披露私有發布倉庫身份，因此將其禁用。
