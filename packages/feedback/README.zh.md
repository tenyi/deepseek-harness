---
description: "feedback 包組：關于會話與 assistant 消息的用戶反饋，供用戶與維護者選擇、組合或排查反饋采集。"
kind: "package-group"
---

# feedback/：記錄的人類反饋

[English](README.md) | 中文

## 概述

feedback 組收集用戶對 harness 工作成果的意見：用戶可以提交一條關于整個會話的自由文本評價，也可以對單條 assistant 消息評分或加備注。兩類反饋都不會到達模型——它們是關于輸出的信號，絕不是輸入。用戶通過 `/feedback` 命令記錄會話評價；產品界面通過 `messageFeedback` 服務讀取和修改逐消息評分。兩個包相互獨立：會話評價與逐消息評分互不影響。本頁概述該包組；具體包級約定以各包 README 和[反饋子系統頁](../../docs/subsystems/feedback.zh.md)為準。

## 目錄

- [包](#packages)
- [相關文檔](#related-documentation)
- [開發備注](#dev-note)

<a id="packages"></a>
## 包

| 包 | 職責 |
|---|---|
| [`command-feedback`](command-feedback/README.zh.md) | 會話級反饋：`/feedback` 命令、Web 彈窗背后的 `sessionFeedback` Remote，以及固定分類表，均無需模型輪次 |
| [`message-feedback`](message-feedback/README.zh.md) | 逐消息評分、分類與備注，通過 `messageFeedback` 服務提供給產品界面 |

會話評價是單向信號：在對話的任何時刻記錄它都是安全的，且絕不會改變模型看到的內容。在 feedback-gated 共享策略下，記錄會話評價會觸發放行，使該會話可供共享。

逐消息評分與備注與會話一起保存，重啟后依然存在，并且絕不會出現在模型歷史或遙測中。

<a id="related-documentation"></a>
## 相關文檔

- [反饋子系統](../../docs/subsystems/feedback.zh.md)——message-feedback 的類型、服務約定與 Web 消費方。
- [會話遙測子系統](../../docs/subsystems/session-telemetry.zh.md)——`/feedback` 確認文本披露的共享策略。
- [匿名用戶身份](../identity/README.zh.md)——反饋確認文本中嵌入的 id，每個 harness home 各有一個。

<a id="dev-note"></a>
## 開發備注

無。
