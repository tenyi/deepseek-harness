---
description: "lsp 組地圖：通過 LSP seam、其 stdio 提供方與面向模型的 lsp 工具實現的語言服務器代碼導航，供瀏覽本組的用戶與維護者閱讀。"
kind: "package-group"
---

# lsp/：語言服務器代碼導航

[English](README.md) | 中文

## 概述

lsp 組讓 agent（智能體）通過配置好的語言服務器導航代碼：轉到定義、查找引用與實現，以及閱讀懸停文檔。使用 `lsp-stdio` 連接本地 stdio 語言服務器命令和擴展名映射，使用 `tool-lsp` 向模型提供這些操作。共享的 `lsp` 包使提供方選擇和規范化結果保持一致，因此更換服務器不會改變模型請求。部署必須自行提供并配置語言服務器；本組不隨附任何語言服務器。

## 目錄

- [包](#packages)
- [相關文檔](#related-documentation)
- [開發備注](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 職責 | ctx key |
|---|---|---|
| [`lsp/`](lsp/README.zh.md) | 定義代碼導航服務：按文件擴展名選擇提供方、四種規范化的只讀操作與結構化錯誤 | `ctx.lsp` |
| [`lsp-stdio/`](lsp-stdio/README.zh.md) | 通過 `ctx.fs` 與 `ctx.subprocess` 驅動配置好的 stdio 語言服務器命令，注冊為提供方 | 注冊到 `ctx.lsp` |
| [`tool-lsp/`](tool-lsp/README.zh.md) | 通過 `lsp` 工具向模型暴露精確的代碼導航 | 注冊到 `ctx.tools` |

提供方注冊的是能力而非工具：`tool-lsp` 是面向模型的名稱、schema、提示詞指引與呈現的唯一 owner，因此更換提供方絕不會改變模型請求導航的方式。

-----

<a id="related-documentation"></a>
## 相關文檔

- [LSP 導航子系統](../../docs/subsystems/lsp.zh.md)——操作、坐標、請求與結果，以及 `LspError` 錯誤碼。
- [生成的工具目錄](../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-lsp)——模型接收的 `lsp` schema。

-----

<a id="dev-note"></a>
## 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
