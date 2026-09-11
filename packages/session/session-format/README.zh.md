---
description: "純函數式相鄰會話格式規劃、無損 JSON 值檢查、僅標頭遷移與物理編解碼分派。"
kind: "package-library"
---

# @deepseek-ai/dsh-session-format

[English](README.md) | 中文

## 概述

`dsh-session-format` 讓持久化代碼可以直接還原當前會話，或在只消費一次物理行的同時組合唯一的相鄰遷移序列。一次還原會讓調用方擁有的已解析值流經有狀態 Stage，不復制或凍結中間產物。物理分幀、壓縮、不可變 generation 命名、排他發布和 Cordis 生命周期行為不屬于本庫。

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

### 何時使用

當持久化或格式目錄代碼需要分類物理會話 header、還原當前邏輯值或組合已發布相鄰遷移時，使用本庫。它不是 Cordis 插件，也沒有 profile 掛載行。它不發布運行時不變式伴生入口，因為每個已完成操作都會校驗結果；decoder 與 transformer 狀態只屬于一次尚未完成的流式還原，絕不在多次還原間共享。

### 入口

```text
const catalog = createSessionFormatCatalog({ currentVersion, codecs, currentEncoder, migrations, restoreCurrent, restoreTransformedCurrent, restoreCurrentHeader })
const descriptor = catalog.readHeader(physicalHeader)
const restore = catalog.createRestore(physicalHeader, { recovery: 'recoverable', validation: 'transformed' })
for (const row of physicalRows) restore.decodeRow(row)
const current = restore.finish()
const headerRecord = catalog.encodeCurrentHeader(current.header, current.inheritedEventCount)
const eventRecords = current.events.map(catalog.encodeCurrentEvent)
```

`createSessionFormatCatalog()` 接收每個受支持版本的一個凍結 codec、當前格式的逐記錄 encoder、每組相鄰版本的一個遷移，以及當前產物與 header 還原器。`readHeader()` 在不讀取事件的情況下返回 `current`、`migration-required`、`unsupported` 或 `malformed` 描述符。正文讀取方創建一次 restore，把每個已解析物理行傳給 `decodeRow()`，再調用一次 `finish()` 獲得當前產物。寫入方逐條編碼其 header 與事件。

`recovery` 選項決定嚴格拒絕故障行，還是執行可恢復后綴處理。`validation: 'current'` 會執行所有已安裝的 current 格式校驗。`validation: 'transformed'` 會在歷史遷移后執行已發布的 current 格式校驗；已經是 current 的輸入則只接受其 codec 的物理校驗。

可恢復解碼器返回已接受的邏輯前綴。編解碼器可以丟棄一個格式錯誤或序號不連續的行及其未提交后綴，但后續成功解碼的 `turn/end` 會使原始問題成為致命錯誤。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

遷移鏈在構造時校驗唯一且無缺口的順序。源切點可以在 EOF 前保持未知；依賴頭部切點的 Stage 拒絕缺失值，而基于標記的 Stage 從已發出的事件推導切點。每個 Stage 在完成時返回精確的目標切點，且必須與預聲明切點一致。Catalog 把一個行 decoder 與有狀態的相鄰事件 transformer 組合起來，只保留其有界狀態與最終當前事件，并在 `finish()` 時執行目標校驗；只有調用方決定是否發布該結果以及如何發布。

| 文件 | 職責 |
|---|---|
| [`src/chain.ts`](src/chain.ts) | 相鄰計劃構造與當前格式繞過 |
| [`src/catalog.ts`](src/catalog.ts) | 物理版本分派與標頭分類 |
| [`src/json.ts`](src/json.ts) | 分離的無損 JSON 快照與通用坐標校驗 |
| [`src/filename.ts`](src/filename.ts) | 持久化、導出與 fixture（測試前置數據）共用的規范 `session[.vN].jsonl` 文件名 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [已發布 v0 到 v1 遷移邊](../session-format-v0-to-v1/README.zh.md)——凍結的歷史解碼與恒等轉換。
- [靜態目錄](../session-format-catalog/README.zh.md)——第一方編解碼器與遷移裝配。
- [JSONL 持久化](../session-persistence-jsonl/README.zh.md)——持久化分幀與代際發布。

-----

<a id="model-experience"></a>
## 模型體驗

### 會話還原

#### 模型看到什么

沒有直接內容。消費方通過 `deriveMessages()` 從經過校驗的當前產物重建模型歷史。

#### Token 影響

不直接產生 token。

#### KV Cache 影響

沒有直接影響。遷移若改變當前歷史，可能改變由請求重建邏輯擁有的緩存身份。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **最終當前歷史仍常駐內存**——流式處理只保留有界中間狀態，但返回的當前事件數組和必需的序號重映射表仍為 O(事件數)。
- **僅支持相鄰整數版本**——本庫不暴露 span、穩定事件身份或通用引用重寫代數。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
