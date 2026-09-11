---
description: "identity 包組：由遙測、反饋與 DeepSeek 提供方請求共享的匿名關聯 id，每個 harness home 一個。"
kind: "package-group"
---

# identity/ — 共享身份

[English](README.md) | 中文

## 概述

identity 組為每個 harness home 提供一個匿名 id，該安裝的遙測、反饋與 DeepSeek 請求會把它附加到各自的記錄上，因此離開同一個 home 的所有內容都能被識別為來自同一套安裝，而無需識別用戶身份。無需配置任何東西：id 會在這些功能之一首次運行時自動出現，并在文件被刪除前保持穩定。本組只有一個包；本頁列出本組的組成，包 README 負責細節。

## 目錄

- [包](#packages)
- [相關文檔](#related-documentation)
- [開發備注](#dev-note)

<a id="packages"></a>
## 包

| 包 | 職責 |
|---|---|
| [`anonymous-user-id`](anonymous-user-id/README.zh.md) | 讓每個 harness home 擁有一個匿名 id，遙測、反饋與 DeepSeek 請求把它附加到記錄上，使來自同一安裝的記錄無需識別用戶即可被辨認 |

<a id="related-documentation"></a>
## 相關文檔

- [會話遙測子系統](../../docs/subsystems/session-telemetry.zh.md)——在導出中攜帶該 id 的遙測功能。
- [dsh-llm-deepseek](../llm/llm-deepseek/README.zh.md)——在請求中攜帶該 id 的 DeepSeek 提供方。
- [dsh-command-feedback](../feedback/command-feedback/README.zh.md)——在確認文本中點名該匿名安裝的反饋命令。

<a id="dev-note"></a>
## 開發備注

無。
