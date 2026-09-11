---
description: "面向在協議邊界接收調用方所報時區的維護者，說明 IANA 時區校驗與規范化。"
kind: "package-library"
---

# dsh-util-time

[English](README.md) | 中文

## 概述

零依賴的時區詞匯，供接收調用方時區的協議邊界使用。`canonicalClientTimeZone` 只接受 `UTC` 或 IANA `Area/Location` 名稱，并回答該名稱在當前平臺上的規范拼寫，因此別名不會進入持久記錄：時區標識會存儲在消息中，并由另一個進程稍后重新推導；別名在該進程中無法與規范名稱比較為相等。本庫只做校驗與規范化——不格式化任何時間，也不持有失敗詞匯，因為每個邊界拋自己的域碼。

## 目錄

- [使用本包](#use-this-package)
- [API](#api)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

它是**庫，不是服務也不是插件**：無 `ctx`、不注冊任何東西、不持有狀態。

不發布運行時不變量伴生入口；這個純工具不擁有事件流或可變運行時數據，時區規范化由單元測試驗證。

在接收時區的那個邊界上調用它，讓值在進入任何持久物之前先過一遍。不可用的名稱回答 `undefined`，由調用方拋出自己的拒絕——Session 提示詞用 `session/invalid-time-zone`，subagent 續話用 `subagent/invalid-time-zone`。

-----

<a id="api"></a>
## API

```ts
import { canonicalClientTimeZone } from '@deepseek-ai/dsh-util-time'
```

| 導出 | 職責 |
|---|---|
| `canonicalClientTimeZone(value)` | 對接受的時區回答規范的 `UTC` 或 IANA `Area/Location` 名稱；空串、帶空白、縮寫、單段或平臺不支持的名稱回答 `undefined`。 |

<a id="model-experience"></a>
## 模型體驗

間接影響，取決于把規范時區記到持久消息上的那個消費方——`dsh-time-context` 據此渲染該輪模型可見的時區指令與時間戳。

#### KV Cache 影響

自身沒有。把時區派生文本注入請求的那個消費方，對該請求的緩存行為負責。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **別名解析取決于運行時的 ICU 數據**——一個別名組規范化成哪個名稱由平臺回答，因此兩個跑在不同 Node 構建上的進程可能給出不同答案。
- **只做校驗**——不格式化、不做偏移運算、不推導 DST、不做時刻換算；需要這些的消費方直接用 `Intl`。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者工作上下文——點擊展開</summary>

無。

</details>
