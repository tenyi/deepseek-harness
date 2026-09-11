---
description: "供擁有易混淆領域值的包使用的名義字符串與數字類型及無狀態構造函數。"
kind: "package-library"
---

# @deepseek-ai/dsh-brand

[English](README.md) | 中文

## 概述

`dsh-brand` 讓結構相同的字符串或數字在類型層面不可互換：`SessionId` 無法傳給期望 `ToolCallId` 的位置，事件序號也無法傳給需要日志偏移量的位置。`brandString<T>()` 與 `brandNumber<T>()` 在不持有共享運行時狀態的情況下應用名義品牌，讓所屬包可以定義領域類型，而無需導入不相關的能力。

## 目錄

- [使用本包](#use-this-package)
- [理解實現](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [開發備注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

當領域值跨越包邊界，并可能與使用同一原語表示的另一個值混淆時，為其添加品牌；并非每個字符串或數字都需要品牌。品牌化值是給 TypeScript 調用方的約定：它只會進入期望該領域的函數，不同品牌會在編譯期被拒絕。

### 為字符串添加品牌

在所屬包中聲明品牌化類型，并在該包準入字符串的位置應用品牌：

```ts
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'

export type SessionId = Branded<'SessionId'>

const sessionId = brandString<SessionId>('session-1')
```

`brandString()` 只改變靜態類型，不執行運行時校驗。所屬類型若有領域文法，應在調用前完成校驗。添加品牌后，該 id 在比較、日志記錄、JSON 序列化和協議傳輸中仍表現為普通字符串。

### 為數字添加品牌

在所屬包中聲明數字品牌，并且僅在該包準入數字之后應用品牌：

```ts
import { brandNumber, type BrandedNumber } from '@deepseek-ai/dsh-brand'

export type SessionSeq = BrandedNumber<'SessionSeq'>

const seq = brandNumber<SessionSeq>(7)
```

`brandNumber()` 原樣返回數字，不執行校驗。所屬包會在添加品牌前校驗非負安全整數范圍等要求。比較、算術、日志、JSON 序列化與協議傳輸保留普通數字行為；算術會產生未品牌化數字，所屬包必須重新準入該數字，才能讓它再次進入領域。

### 何時添加品牌

為跨包邊界且可能被混淆的值添加品牌——`dsh-llm` 中的 `ToolCallId`、`dsh-session` 中由 agent（智能體）和會話共享的 `SessionId`、`dsh-jobs` 中的 `JobId`，以及 `dsh-session` 中的 `SessionSeq` 與 `SessionLogOffset`。保持局部或無法混淆的值不需要這種抽象。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

該包定義兩個交叉類型：`string & { readonly [BRAND]: B }` 與 `number & { readonly [BRAND]: B }`，其中 `BRAND` 是模塊私有的 `unique symbol`。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 品牌化字符串與數字類型及其無狀態構造函數 |
| — | 不發布運行時不變量配套入口；這個純工具不擁有事件流或可變運行時數據；其值代數由單元測試保障。 |

### 值為何可移植

私有 symbol 在運行時不存在：TypeScript 會將其擦除，因此品牌化值沒有標簽或 prototype。`brandString()` 與 `brandNumber()` 都原樣返回輸入。因此，彼此獨立安裝的副本無需共享注冊表或 constructor identity，也會生成可互換的值。

### 為何保持無依賴

把這些 helper 放在獨立包中，意味著 `dsh-jobs` 可以為 `JobId` 添加品牌，而無需導入不相關的能力包；每個能力仍然擁有其具體 id 的含義與校驗。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當你需要這些原語所品牌化的值或圍繞它們的類型約定時，閱讀以下頁面。

- [核心子系統](../../../docs/subsystems/core.zh.md)——共享 `SessionId` 品牌與類型規則的記錄位置。
- [LSP 子系統](../../../docs/subsystems/lsp.zh.md)——構建在本原語之上的品牌化提供方 id `LspProviderId`。
- [jobs 包](../../jobs/jobs/README.zh.md)——由 jobs 能力擁有的 `JobId` 品牌。

-----

<a id="dev-note"></a>
## 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
