---
description: "為必須限制返回上下文量的工具提供有界的面向模型輸出：項與文本 retainer，以及標準化的省略頁腳。"
kind: "package-library"
---

# @deepseek-ai/dsh-output-retention

[English](README.md) | 中文

## 概述

使用 `dsh-output-retention` 限制工具返回給模型的項或文本量，并報告省略了什么。`ItemRetainer` 保留有序的頭部窗口，并可報告精確的省略項數；`TextRetainer` 保留 head、tail 或 head-and-tail 字節窗口，且不會返回因切割而無效的 UTF-8。`formatRetentionNotice` 添加一致的省略子句，各工具則提供自己的恢復指引。分組、行號、spill 文件與提供方錯誤仍歸工具負責；消費方直接導入本庫，而不通過 `cordis.yml` 加載。

## 目錄

- [使用本包](#use-this-package)
- [理解實現](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

凡是工具必須限制其結果到達模型的數量、并如實報告丟棄內容的地方，都使用 retainer。有序邏輯單元選 `ItemRetainer`，面向字節的流選 `TextRetainer`。

### 限制項列表

```ts
import { ItemRetainer } from '@deepseek-ai/dsh-output-retention'

declare const globMaxResults: number
declare const candidates: AsyncIterable<{ path: string }>
const retainer = new ItemRetainer<{ path: string }>({ kind: 'head', maxItems: globMaxResults })
for await (const entry of candidates) {
  retainer.push(entry)          // keep draining past the cap for an exact count
}
const { items, truncated, omitted } = retainer.finish()
```

`push()` 逐項報告該項是否被保留，`finish()` 返回保留的項與 `omitted`——當調用方持續送入每個已觀察單元時，這是一個精確計數。搜索工具可以收集完整結果集用于 spill 文件，同時只為模型保留第一頁。

### 限制文本流

```text
import { TextRetainer } from '@deepseek-ai/dsh-output-retention'

const out = new TextRetainer({ kind: 'headTail', headBytes: headCap, tailBytes: tailCap })
child.stdout.on('data', (chunk: Buffer) => { out.push(chunk) })
const { text, omittedBytes } = out.finish()
```

`head`、`tail` 與 `headTail` 按字節而非字符或行計數：子進程管道與 HTTP 正文都是字節流。`finish()` 會在每個切割處修剪不完整的碼點，因此返回的文本絕不會攜帶由切割引入的替換字符，碼點也絕不會跨被省略的中間部分重建。

### 構建省略頁腳

```ts
import { formatRetentionNotice } from '@deepseek-ai/dsh-output-retention'

declare const grepMaxMatches: number
declare const items: { length: number }
import type { Omitted } from '@deepseek-ai/dsh-output-retention'

declare const omitted: Omitted

const footer = formatRetentionNotice(
  { scope: 'grep', strategy: 'head', unit: 'items', limit: grepMaxMatches, kept: items.length, omitted },
  ({ kept }) => `Results capped at ${kept}. Narrow the pattern, path, or include to see more.`,
)
```

庫負責標準化省略子句（`Omitted 3 items.`）并把它與工具自有的恢復指引拼接；只有工具知道恢復動作，因此這些措辭由工具提供。

### `truncated` 意味著什么

`truncated` 是預算事實：retainer 因上限而省略了本可獲得的內容。它絕不表示上游不完整——權限失敗、跳過二進制文件、提供方部分失敗與不可讀候選項都留在工具領域字段中，絕不并入 `truncated`。

### 當前工具如何使用它

| 工具 | Retainer | 工具仍負責什么 |
|---|---|---|
| `glob` | `ItemRetainer`，`head` | spill 文件收集、路徑映射、已跳過候選項、`incomplete` |
| `grep` | `ItemRetainer`，`head` | spill 文件收集、逐匹配預覽截斷、分組、排序 |
| `bash` | `TextRetainer`，`tail` 或 `headTail` | spill 文件、退出狀態、信號、超時、后臺任務 |
| `web_fetch` | `TextRetainer`，`head` 或 `headTail` | 提供方與資源上限、錯誤狀態 |
| `web_search` | `ItemRetainer`，`head` | 「來源已達上限」通知措辭與提供方事實 |

`read` 不屬于本庫：它的行窗口分頁（`offset`/`limit`、行號、`totalLines`）是文件專屬渲染器，單個省略計數無法表示該窗口的兩側。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本庫建立在一個分離之上：它負責「保留了什么、省略了什么」這個機制問題；業務含義全部歸工具包所有。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | `ItemRetainer`、`TextRetainer`、`describeOmitted` 與 `formatRetentionNotice` |
| — | 不發布運行時不變式伴生入口；這個純工具不擁有事件流或可變運行時數據；其值代數由單元測試保證。 |

### 兩個 retainer，兩種資源模型

`ItemRetainer` 限制有序邏輯單元，只保留前 `maxItems` 個；調用方持續送入每個已觀察單元，因此省略計數是精確的。`TextRetainer` 用同一個前綴/后綴累加器限制字節：`head` 只留前綴，`tail` 只留后綴，`headTail` 兩者都留；累加器在內存中至多持有 `headBytes + tailBytes + 一個分片`，因此大流不會無界累積。

### 預算事實如何保持誠實

`push()` 返回 `kept`（該單元或分片是否完整保留）與 `truncated`（是否已丟棄任何內容）。`finish()` 按實際返回的字節報告省略，因此丟棄部分碼點字節的 UTF-8 邊界修剪也會被計入——僅按預算推導的通知會高估保留文本。`describeOmitted` 只為 `exact` 打印計數；`unknown` 不打印計數，因為調用方沒有提供。

### read 渲染的排除

`read` 的 `offset`/`limit` 分頁是行窗口渲染器，對所選窗口有自己的字節上限；單個 `Omitted` 值無法表示該窗口兩側，因此它不屬于本庫。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當你需要消費方或庫背后的邊界決策時，閱讀以下頁面。

- [spill 策略](../../spill/spill-policy/README.zh.md)——組合 `TextRetainer`，圍繞 spill 文件通知構建有界預覽。
- [spill 子系統](../../../docs/subsystems/spill.zh.md)——本庫預覽機制所服務的 spill 詞匯。
- [文件搜索工具](../../fs/tool-fs-search/README.zh.md)——為 spill 收集完整結果的 `ItemRetainer` 消費方。

-----

<a id="model-experience"></a>
## 模型體驗

通過渲染保留內容與省略元數據的保留消費方間接影響模型。

#### KV Cache 影響

不會直接導致失效；請求前綴的任何變更由保留消費方負責。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明 retainer 刻意不覆蓋什么。它們是當前包約束，不是任務積壓。

- **項保留只支持 `head`**——tail、head/tail、分頁、分組與提供方完整性語義仍歸工具所有。
- **文本保留面向字節**——`read` 分頁等行窗口與字符窗口需要單獨的渲染器；切割可能丟棄部分 UTF-8 邊界字節，以保持返回文本有效。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
