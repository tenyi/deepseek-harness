---
description: "用于 projection state 的不可變的僅追加列表，提供有界追加復制、按插入順序迭代和 Zod 檢查點校驗。"
kind: "package-library"
---

# @deepseek-ai/dsh-chunked-list

[English](README.md) | 中文

## 概述

`dsh-chunked-list` 讓調用方追加值并保留早期列表版本，無需復制整個集合。調用方可以按插入順序迭代所有值，并使用自己的值 schema 校驗 JSON 檢查點。subagent 目錄用它保存不可變的 projection state。

## 目錄

- [使用此包](#use-this-package)
- [理解實現](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與延后工作](#known-limitations-and-deferred-work)
- [開發備注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

當僅追加集合需要不可變版本和兼容 JSON 的存儲時，使用此列表。空列表用 `undefined` 表示；追加返回新的頭節點，不修改已有節點。列表按引用共享所存的值，因此調用方必須將這些值視為不可變。

```ts
import { appendChunkedList, iterateChunkedList } from '@deepseek-ai/dsh-chunked-list'

const first = appendChunkedList(undefined, 'first')
const second = appendChunkedList(first, 'second')
console.log([...iterateChunkedList(second)])
```

示例輸出 `['first', 'second']`；`first` 仍只包含原來的值。`chunkedListSchema(valueSchema)` 校驗 JSON 檢查點并拒絕未知字段、無效值和空分片或超大分片。當外層字段也允許空列表時，在 schema 上使用 `.optional()`。各操作詳見[源碼約定](src/index.ts)。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現內部機制——點擊展開</summary>

最新的分片最多存儲 64 個值。追加最多復制該分片并共享較舊的節點，工作量為有界 O(1)。容量控制存儲布局，不限制列表總長度。迭代以 O(N) 時間訪問全部 N 個值，并使用 O(N / 64) 臨時空間按從舊到新的順序訪問各分片。追加換片與遞歸 Zod 校驗共用一個容量常量。

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 持久化列表操作與檢查點校驗 |
| [`tests/chunked-list.spec.ts`](tests/chunked-list.spec.ts) | 版本隔離、順序、結構共享與檢查點接受條件 |

此庫沒有獨立變化的觀測值，因此不發布運行時不變式伴隨模塊；其操作返回調用方擁有的不可變值。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [工具包映射](../README.zh.md)——共享原語。
- [Subagent 目錄決策](../../../.agents/notes/implemented/architecture/2026-09-01-parent-owned-subagent-catalog.zh.md)——projection state 使用分片的原因。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為此集合不注冊任何面向模型的內容。

#### KV Cache 影響

本包沒有內容進入模型請求，因此不影響提供方緩存復用。

## 已知限制與延后工作

<a id="known-limitations-and-deferred-work"></a>

- **僅追加訪問**——需要刪除或隨機訪問的調用方應使用其他集合。
- **遞歸檢查點**——JSON 序列化與 schema 校驗仍受運行時嵌套深度限制。所存的值本身必須支持調用方的序列化格式。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
