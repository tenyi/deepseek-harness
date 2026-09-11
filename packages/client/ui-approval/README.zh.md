---
description: "通過作用域交互路徑響應 Host 權限請求的瀏覽器批準界面。"
kind: "package-reference"
---
# @deepseek-ai/dsh-client-ui-approval

[English](README.md) | 中文

## 概述

基于 Agent-scoped Remote Event waterfall 的瀏覽器審批界面。插件通過 `ctx.uiSession` 發布每個待處理請求、接管 Conversation composer、按需渲染關聯的 Tool 詳情，并將用戶決定返回給等待中的 Host 請求。當瀏覽器必須為等待中的 Host 操作收集批準時，請使用它。

## 目錄

- [模型體驗](#model-experience)
- [已知限制與暫緩事項](#known-limitations-and-deferred-work)
- [開發備注](#dev-note)

-----

<a id="model-experience"></a>
## 模型體驗

無，因為本包只在瀏覽器中呈現審批請求，不注冊任何面向模型的內容。

#### KV Cache 影響

無；審批請求和響應的呈現不會改變模型請求。

## 已知限制與暫緩事項

<a id="known-limitations-and-deferred-work"></a>

- **面板只提供臨時決定**——它支持僅本次允許和拒絕；持久權限策略仍由 Host 側審批包擁有。


<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。Remote listener 與臨時 Slot entry 由各自注冊表持有并觀察。
