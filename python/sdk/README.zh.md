# DeepSeek Harness Python SDK

[English](README.md) | 中文

用于通過 stdio 上按行分隔的 JSON-RPC 驅動 DeepSeek Harness 的 Python 子進程 SDK。安裝 `deepseek-harness-sdk` 時，會同時安裝當前平臺上版本完全相同的 `deepseek-harness-runtime-bin` wheel 包。

```sh
python -m pip install deepseek-harness-sdk
```

## 啟動運行時

Python SDK 沒有獨立的應用入口。它以 `--profile sdk` 啟動內置的 `dsh` CLI（命令行界面）；所選 profile 負責 JSON-RPC 服務器、agent（智能體）組合、憑據、持久化、工具和關閉流程。

每次啟動都必須顯式指定 Harness home。請傳入 `dsh_home`，或在子進程環境中提供非空的 `DSH_HOME`。SDK 刻意不會發現 `~/.dsh`。

```py
from deepseek_harness import DeepSeekHarness

with DeepSeekHarness(
    dsh_home="/absolute/path/to/isolated-dsh-home",
    cwd="/absolute/path/to/workspace",
    provider="deepseek-official",
    model="deepseek-v4-flash",
    reasoning_effort="max",
    max_tokens=49_152,
) as harness:
    result = harness.run("Say hi.", session_id="example-001")

print(result.final_response)
```

`DeepSeekHarness` 延遲啟動運行時，并在調用 `close()` 或退出上下文管理器前復用該進程。首次 profile 握手通過 `initialize_timeout_seconds` 使用獨立的 30 秒默認上限；普通輪次在未設置 `request_timeout_seconds` 時仍不設上限。超時診斷會指明所選 profile，并包含保留的運行時診斷。`cwd` 是 agent workspace；`runtime_cwd` 獨立選擇子進程工作目錄。兩者都會在啟動前轉成絕對路徑。`provider`、`model`、可選的 `reasoning_effort` 和可選的正整數 `max_tokens` 通過 JSON-RPC 初始化發送。`base_url` 與 `api_key` 會顯式覆蓋子進程環境中的 `DEEPSEEK_BASE_URL` 與 `DEEPSEEK_API_KEY`。

## 自定義插件

持久自定義屬于 `dsh` profile。使用運行時 wheel 包提供的 `dsh` 命令初始化隨附的 SDK profile，并安裝外部 bundle：

```sh
export DSH_HOME=/absolute/path/to/isolated-dsh-home
dsh --profile sdk --dump-default-config >/dev/null
dsh plugin --profile sdk add file:/absolute/path/to/my-plugin-bundle
```

`file:` 形式會把本地 bundle 安裝到 profile 包樹中，使其 peer import 可以到達內置安裝后備。profile manifest（元數據清單）會記錄已安裝依賴與有序 bundle 層；`$DSH_HOME/profiles/sdk/cordis.patch.yml` 是持久用戶 patch。只有管理外部包時，`dsh plugin` 才需要 `pnpm`。運行 SDK 不需要系統 Node.js。

對于單次調用的變更，可傳入一個或多個 patch 文件。它們會轉成絕對路徑，并在 profile 層與 home patch 層之后按順序傳給 CLI：

```py
with DeepSeekHarness(
    dsh_home="/absolute/path/to/isolated-dsh-home",
    profile="sdk",
    patches=("/absolute/path/to/first.patch.yml", "/absolute/path/to/last.patch.yml"),
) as harness:
    result = harness.run("Make the requested code change.")
```

`profile` 可以選擇另一個已存在的 profile，但該組合必須保留 `@deepseek-ai/dsh-sdk-app` 或另一個 `@deepseek-ai/dsh-sdk-jsonrpc-server` 配置項。配置錯誤會在 CLI 啟動或 SDK 初始化時失敗；不存在完整配置回退。`dsh_bin` 可以選擇另一個 `dsh` 可執行程序，同時保持相同的 profile 語法。任意 argv 替換僅是內部 fake-runtime 測試適配器，不屬于公開 API。

`provider` 選擇指定 Cordis 組合所注冊的提供方路由；`model` 是該適配器解析出的模型 ID。`reasoning_effort` 是該確切路由可選的非空適配器自有標識符；省略時保留模型自身的默認值。`max_tokens` 是一個可選的正整數，用于限制根 agent 及其進程內后代在每次請求中輸出的 token 數量；省略該參數時，由提供方的默認行為決定輸出上限。缺少適配器、模型不可用或推理強度不受支持時，初始化會在提示詞運行前拒絕。壓縮（compaction）摘要繼續使用壓縮插件單獨配置的上限。內置默認組合注冊 `deepseek-official`。自定義組合可以掛載 `llm-pi-ai`，在其中配置各提供方專屬的憑據和端點，并選擇 pi-ai 已安裝 catalog 中存在的任意提供方／模型組合。

隨附的 `sdk-minimal` profile 是獨立顯式配置樹，而不是 `dsh-base` 上的 overlay。使用 `profile="sdk-minimal"` 選擇它；普通 `model` 參數是唯一運行時模型選擇，也適用于不在適配器建議目錄中的模型 ID。它只提供按平臺選擇的持久 shell、本地執行與 JSONL 會話；文件系統工具、設置、托管憑據、遙測、Web 工具與完整默認工具清單仍由獨立的完整 `sdk` 與 `web` profile 提供。

## 結果與通知

`Session.run()` 的活動區間從提示詞被持久 inbox 接收時開始，到整個 agent 下一次進入空閑狀態時結束，并返回 `RunResult(session_id, final_response, finish_reason, events, notifications)`。`final_response` 是該區間內根會話最后提交的助手文本。`finish_reason` 是最后一個根會話 `turn/end` 的 `kind`，例如 `completed`、`max-tokens` 或 `error`；沒有輪次結束時為 `None`。缺少字符串 `data.reason.kind` 的 `turn/end` 違反協議，并會拋出 `SdkProtocolError`。

`HarnessClient` 會在運行時進程的整個生命周期內保留已發現的 subagent 譜系。在 `Session.run()` 期間，`RunResult.notifications` 與 `on_notification` 按協議順序接收根會話和已知后代的通知。`RunResult.events` 只包含根會話事件，因此后代輸出不會替換根響應。底層 `session_prompt()` 會立即返回已排隊消息的 id；繞過 `Session.run()` 的調用方自行負責后續活動邊界。

所選 home 保存 profile、插件與每個 profile 自有的持久資源。完整 `sdk` profile 使用其中的憑據、設置與會話存儲；`sdk-minimal` 只使用自己的 JSONL 會話存儲。需要隔離這些資源時應使用新的 home；獨立工作應使用新的會話 ID。同時復用 harness 與會話 ID 會延續持久對話和會話資源。

另見 [Python 教程](../../docs/user/guide/python-sdk.zh.md)、[可運行示例](examples/README.zh.md) 和 [運行時 wheel 包參考](../sdk-runtime/README.zh.md)。
