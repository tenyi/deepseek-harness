# 使用 Web UI

[English](index.md) | 中文

請先按照[根目錄 README](../../../README.zh.md#run) 中的說明啟動 Web UI；命令會打印其訪問地址。本指南從服務器已經運行的狀態開始。`dsh` 進程會把啟動時所在的目錄作為默認文件系統位置；全新的 Web UI 則不會選中任何工作區，你需要添加一個工作區。

## 配置模型

打開**設置 → 模型**，輸入 [DeepSeek API 密鑰](https://platform.deepseek.com/)并保存。模型路由會立即可用，不需要重啟服務器。

[模型配置指南](./providers.zh.md)介紹其他提供方和自定義 OpenAI 兼容端點。

## 選擇工作區

點擊**選擇工作區**，添加啟動 `dsh` 時所在的項目目錄，然后選中它。選中工作區前，會話輸入框不可用。

## 運行任務

啟動一個會話并發送：

> Summarize this repository and identify its main packages.

Agent（智能體）可以讀取和編輯工作區文件、運行命令、委派工作并維護計劃。如果根據當前權限策略，某項操作需要審批，Web UI 會先詢問你。

## 繼續使用

- [配置模型](./providers.zh.md)
- [使用 Python SDK](./python-sdk.zh.md)
- [使用其他 CLI 模式](../../../apps/cli/README.zh.md)
- [開發插件](../develop/basic/index.zh.md)
