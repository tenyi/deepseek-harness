---
description: "面向 Session Controller 列表、交互狀態與逐會話上下文的 React 與 Slot 適配器。"
kind: "package-reference"
---
# @deepseek-ai/dsh-client-ui-session

[English](README.md) | 中文

## 概述

面向會話控制器狀態的 React 與 Slot 適配器。本包在 root scope 提供會話列表和 pending-interaction 鉤子，物化逐會話鉤子與 prop，并擁有標準 `SessionProvider` 渲染行為，但不接管會話 transport 或 lifecycle 狀態。當瀏覽器功能需要通過標準 React prop 和鉤子讀取會話狀態時，請使用它。

## 目錄

- [模型體驗](#model-experience)
- [已知限制與暫緩事項](#known-limitations-and-deferred-work)
- [開發備注](#dev-note)

-----

<a id="model-experience"></a>
## 模型體驗

無，因為本包適配瀏覽器側 Session 狀態，不注冊任何面向模型的內容。

#### KV Cache 影響

無；Session selector 與 Slot scope 不會組裝模型請求。

## 已知限制與暫緩事項

<a id="known-limitations-and-deferred-work"></a>

- **Pending interaction 是進程本地投影**——瀏覽器重連后，所屬 Remote waterfall（瀑布式事件）必須重放仍未完成的請求。


<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。適配器 materialization 路徑已經強制 Session 綁定一致。
