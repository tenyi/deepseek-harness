# DeepSeek Harness Python SDK

[English](README.md) | 中文

用于以子進程方式驅動 DeepSeek Harness 的 Python 包。客戶端 SDK 通過 stdio 使用按行分隔的 JSON-RPC 與內置運行時通信。

## 包

| 目錄 | 分發名／模塊 | 職責 |
|---|---|---|
| [sdk](sdk/README.zh.md) | `deepseek-harness-sdk` / `deepseek_harness` | 高層輪次 API 與低層 JSON-RPC 客戶端 |
| [sdk-runtime](sdk-runtime/README.zh.md) | `deepseek-harness-runtime-bin` / `deepseek_harness_runtime` | 內置 `dsh` CLI（命令行界面）可執行程序與原生伴隨文件 |

## 行為

除非調用方選擇另一個 `dsh` 可執行程序或 profile，否則 SDK 會啟動匹配的內置 `dsh --profile sdk` 運行時。可運行的極簡示例選擇隨附的獨立 `sdk-minimal` profile；同一運行時還會打包 `dsh web` 及其前端產物，供單獨通過 CLI 使用。每次啟動都要求顯式選擇 Harness home；Python 絕不會靜默讀取 `~/.dsh`。[SDK 參考](sdk/README.zh.md) 和 [運行時載體參考](sdk-runtime/README.zh.md) 定義運行時選擇、profile、patch 與外部插件管理約定。

## 貢獻者工作流

[Python 貢獻者工作流](development.zh.md)介紹運行時產物構建、包驗證、源碼模式開發和分發。
