---
description: "持久會話數據平面的包映射：持久化 seam 及其后端、檢查點策略、投影、基于日志的標題與外發會話遙測。"
kind: "package-group"
---

# session/ — 持久會話數據平面

[English](README.md) | 中文

## 概述

session 組讓對話持久保存，恢復已發布的日志格式，并使已提交歷史在重啟后仍可用。存儲與檢查點包保護請求、工具副作用和已完成步驟；投影包生成客戶端可用的值；標題包為會話命名；遙測包上報活動。先使用隨產品交付的 JSONL 存儲，再添加檢查點，并僅按部署需要添加投影、標題策略或遙測。每個包 README 負責各自的保證與配置，同級查詢組則提供獨立的讀取和工具訪問。

## 目錄

- [包](#packages)
- [相關文檔](#related-documentation)
- [開發備注](#dev-note)

-----

<a id="packages"></a>
## 包

本組分為四個家族：持久存儲（持久化 seam、后端、檢查點策略）、投影、標題與遙測。每個包 README 負責各自的約定與配置。

### 持久化

| 包 | 職責 | ctx key |
|---|---|---|
| [`session-format/`](session-format/README.zh.md) | 純相鄰格式鏈與產物校驗庫 | 庫，不使用 ctx key |
| [`session-format-v0-to-v1/`](session-format-v0-to-v1/README.zh.md) | 凍結的 released-v0 解碼器，以及到 released v1 的恒等遷移 | 庫，不使用 ctx key |
| [`session-format-v1-to-v2/`](session-format-v1-to-v2/README.zh.md) | 凍結的 released-v1 解碼器，以及遷移到 released v2 時會改變基數的 Assistant 流遷移 | 庫，不使用 ctx key |
| [`session-format-catalog/`](session-format-catalog/README.zh.md) | 自動生成的已交付相鄰遷移靜態目錄 | 庫，不使用 ctx key |
| [`session-persistence/`](session-persistence/README.zh.md) | 定義持久會話存儲服務，以及每個后端組合的共享寫入協調機制 | `ctx.sessionPersistence` |
| [`session-persistence-jsonl/`](session-persistence-jsonl/README.zh.md) | 隨產品交付的后端：逐 Session 使用不可變規范 generation 文件名并排他發布后繼；可選 Zstandard 壓縮 | 注冊到 `ctx.sessionPersistence` |
| [`session-checkpoint-policy/`](session-checkpoint-policy/README.zh.md) | 讓模型請求、頂層工具副作用與已完成步驟在下一步動作前持久化 | 包裝 `ctx.llm` 與 `ctx.tools` |
| [`session-log-deepseek/`](session-log-deepseek/README.zh.md) | 把增量規范日志作為可選的官方 DeepSeek 請求元數據上傳 | 貢獻 `dsh_session_log` |

### 投影

| 包 | 職責 | ctx key |
|---|---|---|
| [`session-projection/`](session-projection/README.zh.md) | 定義并驅動把已提交事件折疊為完整當前值的投影單元 | `ctx.sessionProjections` |
| [`session-projection-cache/`](session-projection-cache/README.zh.md) | 持久化投影檢查點，使冷讀跳過全量日志加載 | `ctx.sessionProjectionCache` |
| [`session-stats/`](session-stats/README.zh.md) | 通過 `sessionStats` 單元提供全日志會話計數與墻鐘時間 | 注冊到 `ctx.sessionProjections` |
| [`session-turn-outline/`](session-turn-outline/README.zh.md) | 通過 `turnOutline` 單元提供全日志輪次大綱（輪次、`turn/start` seq、提示詞預覽） | 注冊到 `ctx.sessionProjections` |

### 標題

| 包 | 職責 | ctx key |
|---|---|---|
| [`session-title/`](session-title/README.zh.md) | 基于日志的會話標題，帶確定性回退與一個可選提供方 | `ctx.sessionTitle` |
| [`session-title-llm/`](session-title-llm/README.zh.md) | 供提供方包共享的模型標題生成策略 | 庫，不使用 ctx key |
| [`session-title-first-prompt-llm/`](session-title-first-prompt-llm/README.zh.md) | 根據第一條合格的人類消息為會話生成標題 | 注冊到 `ctx.sessionTitle` |
| [`session-title-all-prompts-llm/`](session-title-all-prompts-llm/README.zh.md) | 根據所有合格的人類消息為會話生成標題 | 注冊到 `ctx.sessionTitle` |

### 遙測

| 包 | 職責 | ctx key |
|---|---|---|
| [`session-telemetry/`](session-telemetry/README.zh.md) | 捕獲會話活動并把記錄交給配置的上報后端 | `ctx.sessionTelemetry` |
| [`session-telemetry-otel/`](session-telemetry-otel/README.zh.md) | 通過 OpenTelemetry 日志以 `FEEDBACK_ONLY` 或 `DISABLED` 模式投遞遙測 | 注冊到 `ctx.sessionTelemetry` |

同一時間只允許一個標題提供方注冊；未注冊時，標題服務保留其確定性回退。下面的子系統頁面是各家族后端無關的參考資料。

-----

<a id="related-documentation"></a>
## 相關文檔

- [會話持久化子系統](../../docs/subsystems/persistence.zh.md)——后端無關的服務語義、flush 檢查點與崩潰恢復。
- [會話投影子系統](../../docs/subsystems/session-projection.zh.md)——投影單元約定與驅動語義。
- [會話標題子系統](../../docs/subsystems/session-title.zh.md)——標題資格、回退與提供方流程。
- [會話遙測子系統](../../docs/subsystems/session-telemetry.zh.md)——捕獲、脫敏與投遞模式。
- [會話子系統](../../docs/subsystems/session.zh.md)——本組每個包持久化或派生的實時事件日志。

<a id="dev-note"></a>
## 開發備注

無。
