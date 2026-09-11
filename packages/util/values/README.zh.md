---
description: "供運行時包使用的無損 JSON 校驗、分離式快照、深度凍結、結構相等與窮盡聯合類型輔助函數。"
kind: "package-library"
---

# @deepseek-ai/dsh-util-values

[English](README.md) | 中文

## 概述

`dsh-util-values` 為運行時包提供統一的無損 JSON 值、不可變對象圖、JSON 結構相等和封閉聯合類型窮盡失敗實現。調用方可以校驗不受信任的值、創建分離的 JSON 快照、凍結待發布值、比較 JSON 兼容數據，或終止不可達分支，而無需導入某個能力包。這些 helper 不持有共享注冊表、constructor identity 或可變模塊狀態。

## 目錄

- [使用本包](#use-this-package)
- [理解實現](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

### 校驗 JSON 數據或創建快照

需要 predicate 時使用 `isJsonValue()`，還需要分離副本時使用 `snapshotJsonValue()`。兩者只接受無損 JSON 根值：`null`、布爾值、除負零外的有限數字、字符串、稠密的內建數組，以及只含可枚舉字符串鍵的普通或 null-prototype 記錄。循環、稀疏數組、自有 symbol 屬性或自有不可枚舉屬性、函數和 class 實例都會被拒絕。

```ts
import { isJsonValue, snapshotJsonValue, type JsonValue } from '@deepseek-ai/dsh-util-values'

declare const input: unknown

if (!isJsonValue(input)) throw new TypeError('expected lossless JSON')
const snapshot = snapshotJsonValue(input) as JsonValue
```

### 發布或比較值

`deepFreeze(value)` 原地凍結對象圖并返回同一個值。它遍歷可枚舉字符串鍵的子項，并刻意讓活躍 `AbortSignal` 對象保持可變。`deepEqualJson(a, b)` 按結構比較 JSON 兼容數組與記錄；調用方必須先校驗惡意或不受約束的值，再進行比較。

### 封閉可辨識聯合類型

在封閉可辨識聯合類型的 default 分支中使用 `assertNever(value, context?)`。新增變體會讓每個窮盡 switch 在 TypeScript 編譯時失敗；如果某個運行時值逃過了聲明類型，該函數會拋出帶可選上下文標簽的錯誤。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

JSON 校驗器使用顯式工作棧，并只跟蹤當前祖先鏈，因此深層嵌套值不會消耗 JavaScript 調用棧，重復但無循環的引用仍然有效。快照寫入使用自有數據屬性，包括 `__proto__` 等名稱。其他 helper 的結果只取決于傳入參數，不在調用之間保留狀態。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | JSON 值類型、校驗與快照遍歷、結構相等、深度凍結和窮盡聯合類型失敗 |
| — | 不發布運行時不變量伴生入口；這些值操作沒有共享運行時狀態，其代數行為由單元測試覆蓋。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [工具包映射](../README.zh.md)——相鄰的無狀態 helper。
- [會話子系統](../../../docs/subsystems/session.zh.md)——要求無損 JSON 的持久事件。
- [工具子系統](../../../docs/subsystems/tools.zh.md)——構建于 `JsonValue` 之上的 schema 校驗與規范工具結果。

-----

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **`deepEqualJson` 假定輸入兼容 JSON**——它不是通用對象比較器，不為 prototype、symbol、accessor、循環、map 或 set 定義語義。
- **`deepFreeze` 沿可枚舉字符串鍵遍歷子項**——它不會把任意宿主對象變成不可變數據，并會刻意跳過活躍 `AbortSignal` 實例。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
