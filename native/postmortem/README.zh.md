# 事故復盤（postmortem）

[English](README.md) | 中文

事故復盤記錄的是：一個 bug 出現在了不該出現的地方（真實用戶、已合并的 PR（Pull Request）、已發布的版本），值得關注的是*為什么我們的流程放過了它*，而不僅僅是那一行修復。

事故復盤不是 [Agent Note](../../.agents/notes/README.zh.md)（Agent Note 記錄一個經過深思熟慮的設計決策及其被否決的替代方案，或提出未來工作）。它是一份回顧性的失敗記錄：什么壞了、機制是什么、為什么每道安全網都沒攔住、以及為此新增了哪些具體防護措施，以確保同類 bug 下次出現時會明確報錯。

當一個 bug 滿足以下條件時，請撰寫事故復盤：**隱蔽**（機制不顯而易見，即使是細心的工程師也得費力重新推導）、**系統性**（逃逸的原因是測試、工具、約定的缺口，而非一次性的筆誤）、**重新發現的代價高**（它消耗了真實的調試時間，且下次還會如此）。請鏈接該事故復盤所推動建立的防護措施（測試、AGENTS.md 規則、ADR）。

每篇事故復盤以一段**執行摘要**開頭：一個簡短段落，讓忙碌的讀者在三十秒內吸收要點——什么壞了、用直白的話說根因是什么、為什么逃逸了、可長期沿用的教訓是什么——然后才是后續的詳細「概述、時間線、根因、防護措施」各節。

| # | 標題 |
|---|---|
| [0001](0001-acp-default-export-drops-inject.zh.md) | ACP（Agent Client Protocol）服務器在連接時崩潰：`export default` 丟失了插件的 `inject` |
| [0002](0002-js-expression-disabled-filesystem-tools.zh.md) | 文件系統快照工具被一個字面量 `!!js` 對象永久禁用 |
| [0003](0003-web-agent-gui-feedback-loop.zh.md) | Web agent（智能體）驗證了替代服務器，而非承載其會話的 GUI |
| [0004](0004-landlock-partial-notice-misclassified-child-failures.zh.md) | Landlock 部分強制執行通知導致子進程失敗被誤歸類 |
