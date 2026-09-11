---
description: "供持久化讀取方使用的構建期靜態第一方 Session 格式編解碼器與相鄰遷移裝配。"
kind: "package-library"
---

# @deepseek-ai/dsh-session-format-catalog

[English](README.md) | 中文

## 概述

`dsh-session-format-catalog` 為持久化提供一個確定性的 Session 格式讀取器，且無需查詢已掛載插件。它裝配從最早受支持格式到[當前寫入格式](../../../docs/session-format-status.zh.md)的編解碼器與相鄰遷移邊，在模塊初始化時校驗完整且無缺口的遷移鏈，并通過 `sessionFormatCatalog` 暴露物理分派、僅 header 分類、單遍行還原和當前格式逐記錄編碼。

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

當持久化與測試支持讀取方需要在任何功能插件掛載前取得完整第一方已發布格式清單時，導入本庫。功能組合不會注冊或重排其條目。它不發布運行時不變式伴生入口，因為構造過程會拒絕無效靜態清單，每次完成的還原也會校驗結果；可變行 decoder 狀態只屬于一次由調用方持有的流式還原。

### 入口

```text
const descriptor = sessionFormatCatalog.readHeader(physicalHeader)
const restore = sessionFormatCatalog.createRestore(physicalHeader, { recovery: 'recoverable', validation: 'transformed' })
for (const row of physicalRows) restore.decodeRow(row)
const current = restore.finish()
const headerRecord = sessionFormatCatalog.encodeCurrentHeader(current.header, current.inheritedEventCount)
const eventRecords = current.events.map(sessionFormatCatalog.encodeCurrentEvent)
```

從包根導入 `sessionFormatCatalog`。JSONL 與 fixture（測試前置數據）讀取方創建一次 restore，把每個已解析物理行傳給 `decodeRow()`，再調用一次 `finish()`。Writer 通過 `encodeCurrentHeader()` 與 `encodeCurrentEvent()` 序列化返回的當前產物。列表讀取調用 `readHeader()`，絕不打開事件正文。

Production 歷史讀取使用 `{ recovery: 'recoverable', validation: 'transformed' }`。Worker 與 fixture 校驗使用 `{ recovery: 'strict', validation: 'current' }`。Transformed validation 會在遷移后執行已發布 current 規則，但對已經是 current 的輸入有意跳過已安裝語義校驗。

該目錄直接包含所有受支持的歷史讀取器。Profile 無法通過掛載功能插件來添加、移除或重新排列遷移邊。它通過對 `dsh-session` 的對等依賴（peer dependency）獲得已安裝的當前事件詞表與當前還原規則，而歷史遷移邊校驗器保持凍結。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

[`src/generated.ts`](src/generated.ts) 是編解碼器與遷移邊順序的靜態所有者。[`src/current.ts`](src/current.ts) 把最終標頭、事件信封、消息、表面、種子和當前請求標頭校驗委托給已安裝的 Session 語義。底層構造函數會在開始讀取任何 Session 之前拒絕重復編解碼器、重復遷移邊、缺口，以及超過當前版本的條目。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [遷移機制](../session-format/README.zh.md)——目錄構造與分派行為。
- [已發布 v0 到 v1 遷移邊](../session-format-v0-to-v1/README.zh.md)——編解碼器與校驗器所有權。
- [已發布 v1 到 v2 遷移邊](../session-format-v1-to-v2/README.zh.md)——Assistant 流嵌入與基數變化引用重映射。
- [已發布 V2 到 V3 規范](../session-format-v2-to-v3/README.zh.md#v2-to-v3-specification)——轉換、保留與拒絕。
- [JSONL 持久化](../session-persistence-jsonl/README.zh.md)——不可變 generation 命名與排他發布。

-----

<a id="model-experience"></a>
## 模型體驗

### 目錄分派

#### 模型看到什么

沒有直接內容。該目錄只還原由請求重建邏輯消費的 `SessionEvent` 歷史。

#### Token 影響

不直接產生 token。

#### KV Cache 影響

沒有直接影響；還原后的歷史在其消費方中決定緩存身份。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **僅包含第一方構建清單**——尚不支持外部遷移所有權與分發。
- **生成順序封閉**——運行時插件注冊無法補充缺失的歷史遷移邊。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
