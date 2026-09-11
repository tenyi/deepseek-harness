---
description: "test-support 組地圖：面向編寫與運行倉庫測試的開發者，提供無密鑰測試 harness、LLM（大語言模型） mock 與回放服務器以及 Loader 冒煙測試輔助。"
kind: "package-group"
---

# packages/test-support

[English](README.md) | 中文

## 概述

test-support 組為倉庫測試提供確定且無須密鑰的真實產品測試方式。它包含 Loader 應用 harness、session-log 快照適配器、回放 LLM 插件和可通過腳本控制的 OpenAI 兼容故障服務器。每個包都是支持層基礎設施；當某個包獲得產品約定與產品消費方時，它就會移出本組。

## 目錄

- [包](#packages)
- [相關文檔](#related-documentation)
- [開發備注](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 職責 |
|---|---|
| [`session-snapshot`](session-snapshot/README.zh.md) | 為 profile 驅動的測試提供 session-log 快照支持與協議適配器 |
| [`agent-loop-testkit`](agent-loop-testkit/README.zh.md) | 為運行具體 AgentLoop 的測試提供共享先決服務 |
| [`client-runtime`](client-runtime/README.zh.md) | 為瀏覽器功能測試提供 jsdom slot 測試臺 |
| [`remote-mock`](remote-mock/README.zh.md) | 為整體客戶端測試提供端點具名的 Typert Remote mock 與它們安裝的 Connection 載體面 |
| [`loader-smoke`](loader-smoke/README.zh.md) | 啟動由 Loader 組合的應用并驅動 fixture（測試前置數據）輪次以執行冒煙測試 |
| [`llm-mock-server`](llm-mock-server/README.zh.md) | 為恢復測試提供可通過腳本控制的 OpenAI 兼容故障服務器 |
| [`llm-replay`](llm-replay/README.zh.md) | 為無密鑰測試與演示回放已記錄的模型流 |

-----

<a id="related-documentation"></a>
## 相關文檔

- [測試策略](../../docs/testing.zh.md)——這些 harness 所服務的無密鑰快照層，以及何時必須使用該層。
- [運行時不變式子系統](../../docs/subsystems/invariants.zh.md)——每個 test-support 包以 `./invariant` 形式隨附的包自有運行時檢查。
- [包組](../README.zh.md)——支持組與產品組的關系。

-----

<a id="dev-note"></a>
## 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
