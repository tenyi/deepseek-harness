---
description: "按 Session 尋址上傳瀏覽器文件，提供流式接收、進度、取消和供后續 prompt 使用的暫存憑證。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-file-upload

[English](README.md) | 中文

## 概述

本包讓瀏覽器功能為一個 Session 存儲 `Blob`、精確字節或 `ReadableStream<Uint8Array>`，并取得供后續 prompt 使用的不透明憑證。普通服務頁面發送 Blob 和 stream 請求體時，不會在頁面線程聚合全部字節；Host 位于其他執行上下文中的頁面會在 Cordis 啟動前提供 Fetch 形式的載體。調用方可以觀察已消費字節并取消活動操作。stream 請求體只能消費一次，跨 Worker 邊界時會轉移所有權。獨立的 `?fixture` 頁面通過生成的 Remote 處理可重放的 Blob 與精確字節輸入。

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

在注入 `fileUpload` 的消費方之前掛載本包，再調用 `ctx.fileUpload.upload(sessionId, body, name, signal, onProgress)`。Session 標識同時用于尋址原始路由和生成的 Remote 兜底；調用方不組裝這兩種請求。

```yaml
- id: file-upload
  name: '@deepseek-ai/dsh-client-file-upload'
```

本包沒有 Cordis 配置字段。`Blob` 在專用 Worker 內通過 XMLHttpRequest 發送，因此服務可以報告瀏覽器上傳進度，并在瀏覽器提供總量時一并報告。`ReadableStream` 會轉移給該 Worker，再增量傳入 Fetch；進度只報告已消費字節，不包含總量。`AbortSignal` 會終止專用 Worker，或傳遞給頁面自己提供的載體。精確字節與 fixture Blob 輸入使用生成的 Remote。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

Client 插件提供 `ctx.fileUpload`。其 `upload()` 方法接收所屬 Session 標識，組裝原始路由請求，并為可重放輸入調用生成的 Remote 兜底。提供方只讀取一次可選的 Cordis 啟動前 `__DSH_FILE_UPLOAD__` 鉤子。沒有該鉤子時，每個非 fixture 原始請求擁有一個短期 Worker，并在完成、失敗或取消后釋放。存在該鉤子時，服務通過頁面自己提供的 Fetch 載體發送請求體；Web Worker runtime 會通過請求幀轉移 stream 請求體，再以帶背壓的分片形式交給 Host HTTP bridge。

Host 插件提供 `ctx.fileUploads`。它擁有經過認證的流式路由、編碼 Remote 兜底、命令憑證解析器與暫存憑證生命周期；編碼準入、附件錯誤識別與字節存儲仍由 `ctx.attachments` 提供。憑證表以接收方 Agent 的 Session 對象為鍵。Session Controller 注冊可恢復休眠普通 Agent 的解析器，并在 prompt 準入時消費憑證。Prompt 投遞通過可釋放事務持有每個憑證綁定。成功投遞提交事務前，釋放會恢復原綁定；提交后，隊列或歷史觀察會退休該憑證。

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | Host 流式路由、附件服務準入與按 Agent scope 管理的憑證生命周期 |
| [`src/types.ts`](src/types.ts) | 編碼請求、憑證與持久結果類型 |
| [`src/client/contract.ts`](src/client/contract.ts) | Client 上傳、進度與頁面鉤子類型 |
| [`src/client/runtime.ts`](src/client/runtime.ts) | 專用 Worker 與頁面自有載體實現 |
| [`src/client/index.ts`](src/client/index.ts) | Client 插件注冊與 `ctx.fileUpload` 聲明 |

</details>

**運行時不變式：** 不發布伴生入口。每個上傳憑證只屬于一個準確的 Session，每個請求只使用一個已選定載體。載體不支持的 stream 會在發送請求體前失敗。

-----

<a id="further-exploration"></a>
## 進一步探索

- [Connection](../connection/README.zh.md)——認證 RPC、Host 精確路由與 connection generation。
- [Session Controller](../../api/session-controller/README.zh.md)——消費暫存憑證的 prompt 準入。
- [Web Worker runtime](../../experimental/webworker-runtime/README.zh.md)——頁面到 Host Worker 的請求隧道。
- [客戶端組地圖](../README.zh.md)——瀏覽器服務與 UI 功能包。

-----

<a id="model-experience"></a>
## 模型體驗

無。本包只傳輸瀏覽器請求體，不提供模型輸入。

#### KV Cache 影響

無；本包既不組裝也不發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

以下限制適用于傳輸操作本身。

- **上傳不能斷點續傳**：失敗或取消后的重試會從第一個字節開始。
- **stream 請求體只能使用一次**：轉移 `ReadableStream` 會鎖定調用方的對象，因此重試必須重新創建 stream。
- **stream 進度沒有總量**：stream API 不攜帶字節長度，因此調用方只能收到已消費字節數。
- **瀏覽器 Worker 必須自包含**：其源代碼由函數字符串生成。如果實現需要運行時 import，就必須遷移為由 tsdown 打包的獨立 Worker 入口。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者工作上下文——點擊展開</summary>

無。

</details>
