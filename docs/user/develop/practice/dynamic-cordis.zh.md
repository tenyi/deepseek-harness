# 用 Cordis 工具擴展運行中的智能體

[English](dynamic-cordis.md) | 中文

本實戰指南啟用 [`@deepseek-ai/dsh-tool-cordis`](../../../../packages/extensions/tool-cordis/README.zh.md)。智能體可以檢查當前 Cordis 進程，并在內存中掛載或卸載模型編寫的插件。臨時插件會在卸載或進程退出時消失，并可能影響同一進程中的其他會話。

## 運行

使用倉庫內 overlay 啟動瀏覽器界面：

```sh
pnpm dsh web --patch apps/cli/config/examples/cordis/cordis.yml
```

該命令需要模型憑據。[Cordis 工具參考](../../../../packages/extensions/tool-cordis/README.zh.md)定義了四類約定：工具參數、存續時間、清理行為和安全性。
