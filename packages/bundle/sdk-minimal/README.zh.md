---
description: "供需要不含共享 base bundle 的極簡跨平臺 coding agent（編程智能體）的用戶使用的獨立單工具 SDK profile。"
kind: "package-bundle"
---

# `@deepseek-ai/dsh-sdk-minimal`

[English](README.md) | 中文

## 概述

當 SDK 客戶端需要小型、顯式的 coding agent 運行時時，請使用 `dsh --profile sdk-minimal`。該 profile 只公布按平臺選擇的持久 shell，把會話持久化為未壓縮 JSONL，并從 SDK 初始化請求選擇模型。它提供完整 Cordis 配置樹，并刻意排除 `dsh-base`、Web、settings、托管憑據、遙測、壓縮（compaction）、文件系統工具、workspace 指令、skill（技能）、jobs 與 subagent。其 danger-full-access 策略允許 shell 修改進程可訪問的任何路徑，因此只能配合隔離 workspace 使用。

## 目錄

- [使用本包](#use-this-package)
- [理解實現](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

直接啟動該 profile，或從 Python SDK 選擇它。提供顯式 `DSH_HOME`、使用一次性 workspace，并通過 `DEEPSEEK_API_KEY` 提供模型憑據。

```sh
export DSH_HOME=/absolute/path/to/example-dsh-home
dsh --profile sdk-minimal
```

`DSH_CONTEXT_WINDOW` 為不在適配器建議目錄中的模型設置后備容量。`DSH_SYSTEM_PROMPT` 替換默認 persona。SDK 初始化請求是唯一的模型選擇依據，并覆蓋環境默認值。

使用 `dsh plugin --profile sdk-minimal` 管理持久外部依賴。Profile、home 與有序 `--patch` 文件可以替換完整默認配置樹中的配置項，或在該配置樹上方插入 bundle。隨附模板只在啟動時應用 patch。

該 profile 只掛載一套持久 shell：Linux 和 macOS 使用 Bash，Windows 使用 PowerShell。兩套配置都使用 300 秒超時與一個 agent 自有終端；另一平臺的配置項保持禁用。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

該 bundle 的單個 insert 就是完整應用配置樹：SDK stdio 啟動與 JSON-RPC 服務、一個由環境配置的 DeepSeek 適配器、顯式 agent 核心、本地子進程執行、按平臺選擇的持久 shell PTY，以及位于 `$DSH_HOME/sessions` 的未壓縮 JSONL 持久化。它不繼承其他 bundle，因此每個額外配置項都是顯式 profile 變更。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | 完整獨立 profile 配置樹及其環境默認值 |
| [`src/index.ts`](src/index.ts) | Bundle 包入口 |
| — | 不發布運行時不變式伴生項；本包只是靜態 patch 列表載體，插入的各行分別擁有自己的運行時關系和不變式伴生項。 |
| [`tests/sdk-minimal.spec.ts`](tests/sdk-minimal.spec.ts) | 精確組合、profile 名稱與平臺選擇檢查 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [Python SDK 示例](../../../python/sdk/examples/README.zh.md)——從 Python 啟動本 profile，并使用明確指定的 Harness home。
- [SDK 應用 bundle](../sdk-app/README.zh.md)——完整與極簡 SDK profile 復用的 JSON-RPC 應用層。
- [Base bundle](../base/README.zh.md)——本 profile 刻意省略的完整產品基礎。

-----

<a id="model-experience"></a>
## 模型體驗

### 極簡 coding agent 組合

#### 模型看到的內容

系統提示詞取 `DSH_SYSTEM_PROMPT`，未設置時使用 `You are a helpful software engineer assistant.`。對外公布的唯一工具是 Linux/macOS 上 agent 所有的持久 `bash` 或 Windows 上的 `pwsh`；運行時上下文、文件系統工具、workspace 指令、skill、jobs 控制、壓縮與 Harness 身份均不存在。

#### Token 影響

一個穩定 persona 加一個工具 schema。工具結果與普通對話歷史隨會話增長。

#### KV Cache 影響

當 persona、平臺、提供方、模型與 bundle patch 棧固定時保持穩定。Profile 變更在下一個進程生效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **該組合刻意省略共享產品服務** — 需要 settings、托管憑據、策略預設、遙測、Web 工具或完整默認工具清單時，請選擇 `dsh --profile sdk`。
- **用戶 patch 可以擴展配置樹并破壞 stdout** — profile 自定義屬于受信任的應用組合；向 stdout 寫入普通文本的插件會破壞 JSON-RPC 分幀。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者工作上下文——點擊展開</summary>

無。

</details>
