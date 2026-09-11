---
description: "面向 Web GUI 的工作區文件服務：通過組合文件系統進行有界文件讀取，并在 Session 工作區根內列舉目錄和觀察已埋點的文件系統操作。"
kind: "package-reference"
---

# @deepseek-ai/dsh-api-workspace-files

[English](README.md) | 中文

## 概述

使用本包可從 Web Client 預覽 Session 文件系統允許讀取的文件。它按頁讀取 UTF-8 文本、按有界窗口或完整文件讀取原始字節、從基文件目錄解析關聯文件，并報告文件元數據。文件讀取可以指向工作區外路徑；目錄列舉與已埋點的文件系統觀察仍限定于工作區。本服務不提供修改操作。

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

把本包與 `dsh-fs`、`dsh-sandbox-policy`、Session store 和 Typert Gateway 一起掛載；bundle 把它緊隨 Session Controller 之后掛載。每個方法都在線路上攜帶 Session 身份，Client 調用 `remote.workspaceFiles.read(sessionId, path, range, signal)`、`stat(sessionId, path, signal)`、`readBytes(sessionId, path, range, signal)`、`list(sessionId, path, signal)` 或 `changes(sessionId, signal)`，從不自己指定根。Host 讀取 live Session header，cold Session 則使用持久層 `stat`；它不會激活 Agent、讀取事件正文或借用父 Session 的根。live 讀取不要求掛載 Session persistence；未掛載時 cold Session 無法解析，Gateway 返回 `gateway/lookup-not-found`。

| 方法 | 返回 | 用途 |
|---|---|---|
| `stat(path)` | `WorkspaceFileStat { absolutePath, version, bytes? }` | 一個普通文件的身份、版本與大小，不含內容 |
| `read(path, { offset?, limit? })` | `WorkspaceFileText` = stat + `{ offset, text, lines, eof }` | UTF-8 文本文件的一個行窗口；`lines` 計行數，使單個空行與越過文件末尾的頁可區分 |
| `readBytes(path, { offset?, length? })` | `WorkspaceFileBytes` = stat + `{ offset, data, eof }` | 任意普通文件的一個原始字節窗口，base64 編碼 |
| `readAll(path)` | `WorkspaceFileBytes`，其中 `offset: 0`、`eof: true` | `maxFileBytes` 內的完整原始字節；超大文件失敗，不截斷 |
| `readRelated(path, relativePath)` | `WorkspaceFileBytes` | Host 從基文件目錄解析出的文件的完整字節 |
| `list(path)` | `WorkspaceDirectoryListing { path, entries, truncated }` | 一個目錄的直接子項 |
| `changes()` | `WorkspaceFileWatchFrame` 流 | 訂閱就緒確認，隨后為工作區根內的文件系統觀察 |

### 尋址與路徑

`read`、`readBytes`、`readAll`、`readRelated` 與 `stat` 接受絕對路徑或相對于所選 Session 工作區根的路徑。組合文件系統決定路徑是否可讀；本服務不額外要求文件讀取限定于工作區。`readRelated` 從基文件所在目錄解析相對文件系統路徑，基文件或目標文件位于工作區外時同樣適用。這些方法以文件系統執行環境中的絕對路徑報告文件。`list` 仍限定于工作區，并以相對于該根的路徑報告被列舉目錄。`changes` 同樣只報告工作區根內已埋點的文件系統觀察。

### 分頁

`read` 返回一個行窗口，絕不返回整個文件。`range.offset` 是 1 起算的首行，缺省為 1；`range.limit` 是該頁最多的行數，缺省為 `maxLines` 且不得超過它——更大的 limit，或不是正整數的 offset / limit，都是 `gateway/bad-request`。行以 `\n` 結束，末尾的 `\n` 是最后一行的終止符而不是再起一空行，所以兩行文件就是兩行。頁的 `text` 以 `\n` 連接各行，最后一行之后不帶終止符；`eof` 在該頁含文件最后一行時為 true，offset 越過末尾則返回空頁且 `eof` 為 true。每頁還帶上前置 stat 得到的文件 `version`，消費方據此分辨新頁與舊頁，以及 `bytes`——后端能報告時的整文件大小。服務只把文件讀到該頁之后的第一個字符為止，所以再大的文件每次請求也只占一頁內存。

### 字節窗口

`read` 按行分頁，絕不按字節；字節窗口走 `readBytes`。`range.offset` 是 0 起算的首字節，缺省為 0；`range.length` 是窗口最多的字節數，缺省為 `maxBytes` 且不得超過它——更長的窗口以 `too-large` 失敗而不是被截短，不是整數或越界的 offset / length 則是 `gateway/bad-request`。窗口以 base64 的 `data` 返回，到文件末尾時短于 `length`，位于或越過末尾時為空；窗口含文件最后一個字節時 `eof` 為 true。不做任何解碼，也不按二進制拒絕，因此圖片或含 NUL 的文件在 `read` 以 `not-text` 失敗之處仍可讀出。與頁一樣附帶同一 `version` 與 `bytes`。

### 文件讀取與目錄檢查

每項操作都先通過 `lstat` 拒絕不存在的路徑、末端符號鏈接或錯誤的文件類型。文件操作隨后通過組合文件系統解析和讀取，不做額外的工作區包含檢查。只有 `list` 要求解析后的目錄仍位于工作區內。配置的分頁、窗口、完整文件和目錄列舉上限仍然適用。文本頁還拒絕無效 UTF-8 與 NUL 字節；字節讀取不解碼內容。空路徑是 `gateway/bad-request`。

### 變更流

`changes` 是 `stream` 模式的 Remote。一代流注冊觀察隊列并解析 Session 工作區根之后，才產出 `{ kind: 'ready' }`。隨后產出 `{ kind: 'change', change }`，其中 `change` 對存在的文件為 `{ absolutePath, version }`，對被觀察到已消失的文件為 `{ absolutePath, absent: true }`。來源是按該根內目標過濾的 `fs/observed`；操作系統并未被監視。一代流首次拉取后的觀察都會排隊，包括解析根期間的觀察。流在取消或插件釋放時結束。

### 配置

| 字段 | 默認值 | 含義 |
|---|---|---|
| `maxBytes` | `2097152`（2 MiB） | 單頁文本與單個字節窗口的字節上限（含）；更大的頁或窗口失敗 |
| `maxFileBytes` | `33554432`（32 MiB） | `readAll` 和 `readRelated` 的完整文件字節上限（含）；更大文件以 `too-large` 失敗 |
| `maxLines` | `5000` | 頁大小的缺省值與上限（行）；更大的 `limit` 被拒絕 |
| `maxEntries` | `2000` | 返回目錄條目數上限；其余丟棄并報告截斷 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-api-workspace-files)是每個可接受字段及其 JSDoc 的完備來源。

### 失敗

每種失敗都是一個帶類型化 details 的 `RemoteError` 代碼，聲明于 [`src/types.ts`](src/types.ts)：`workspace-file/not-found`、`workspace-file/outside-workspace`（僅目錄列舉）、`workspace-file/too-large`（帶 `limit`，即適用的頁、窗口或完整文件上限）、`workspace-file/not-text`、`workspace-file/not-regular-file`（`kind` 為 `directory`、`symlink` 或 `other`）以及 `workspace-file/not-directory`（`kind` 為 `file`、`symlink` 或 `other`）。調用方按代碼分支，絕不按消息文本。

### Client 文件資源

瀏覽器導出向 `ctx.resources` 注冊 `file` 提供方，要求 `resources`、`remote` 和 `remote.workspaceFiles` 在場。bundle 中單個 `workspace-files` 條目供應兩面；Client 沒有單獨配置。組件通過 `useResource<'file'>(address)` 讀取 `WorkspaceFileStat { absolutePath, version, bytes? }` 元數據，內容另經 Remote 讀取。任何 UI（包括 Global）訪問同一完整地址都共享觀察。

`session/<sessionId>/<path>` 地址攜帶授權 Session，以及相對或絕對路徑；前導斜杠保留，例如 `dsh-resource://file/session/s//etc/hosts`。Host 原樣接收路徑，負責解析與權限檢查；Client 不需要 Session `cwd`。`absolute/<path>` 仍可解析，但沒有授權 Session，以 `workspace-file/unknown-workspace` 失敗，不借用當前或 Tab Session。不支持的地址以 `workspace-file/unsupported-address` 失敗。語法由 [workspace-path](../../util/workspace-path/README.zh.md) 定義；Resource 泛型層只認地址和 `signal`。

提供方等到 Host 的 `ready` 幀后才發首次 `stat`，讀取期間將變更排隊，隨后將跟隨者綁定到 `stat.absolutePath`。排隊與實時變更都按該 Host 返回路徑匹配。新的寫入版本更新元數據并保留最近的字節大小；重復版本被忽略。消失通知會重新 stat 文件。stat 失敗后仍跟隨地址，后續寫入可使其恢復；首次成功綁定路徑前，Session 內任何寫入都可觸發重試。幀是 `RemoteResult` 值，編程異常不被捕獲。

每個 Session 的所有被跟隨文件共用一條受監督的 `changes` 流。跟隨者按反斜杠歸一為斜杠的絕對路徑匹配。載體掉線由 Gateway 監督器重連；Host 結束或終態失敗的流會結束其跟隨者，最后的元數據仍可讀取，直到重新打開。最后一個跟隨者離開時釋放流，后繼流等待該釋放完成，插件拆除等待所有在途關閉。提供者聲明 `ResourceProtocolMap.file`；文本預覽聲明其 Sidebar 行號導航參數。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現內幕——點擊展開</summary>

### 設計概念

經 `ctx.fs` 的讀取使用后端的讀取權限；沙箱后端限制寫與編輯，而不限制讀取。Typert lookup 從 live Session header 或持久層的 header-only `stat` 導出 `WorkspaceFileScope`，所以 cold subagent Session 不需要激活 Agent 或讀取事件正文。本服務增加普通文件檢查與有界傳輸，工作區包含要求只屬于目錄列舉與變更觀察。頁從 `streamText` 切出，后者逐塊解碼并拒絕非 UTF-8：切頁器對窗口之前的行只計數不保留，對窗口內的每個片段先按字節上限驗收再緩沖，并在窗口之后的第一個字符處返回。流之前的一次 `stat` 給出頁所報告的版本與大小。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | `WorkspaceFiles`：`workspaceFiles` 服務與 Remote 命名空間、`Config`、四道關、切頁器、`read`、`readBytes`、`readAll`、`readRelated`、`stat`、`list` |
| [`src/changes.ts`](src/changes.ts) | `WorkspaceChangeFeed`：`fs/observed` 訂閱與每個打開的 `changes` generation 各一條隊列 |
| [`src/types.ts`](src/types.ts) | 線路類型與 `RemoteErrorDetailsMap` 錯誤碼，以 `./types` 發布給 Client 包 |
| [`src/client/index.ts`](src/client/index.ts)、[`provider.ts`](src/client/provider.ts)、[`change-feed.ts`](src/client/change-feed.ts) | 瀏覽器插件、文件元數據與每 Session 變更流 |
| [`src/client/types.ts`](src/client/types.ts)、[`remote.ts`](src/client/remote.ts) | 資源值、參數、Client 錯誤碼與生成的 Remote 類型 |
| — | 不發布運行時 invariant 伴生件；每個 Host 答案都在調用時由 `ctx.fs` 與沙箱策略推導。 |

Typert 生成 `./typert` 與 `./remote` 暴露的 Host 與 Client Remote 產物。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [文件系統能力](../../fs/fs/README.zh.md)——本服務經由讀取的 `ctx.fs` 約定，含 `fs/observed` 與 `readByteRange`。
- [沙箱策略](../../sandbox/sandbox-policy/README.zh.md)——Session 工作區根的來源。
- [Remote 裝配](../../api/remotes/README.zh.md)——Client 包如何觸達 `workspaceFiles` 命名空間。
- [Client 資源](../../client/resources/README.zh.md)——資源模型、`useResource`、pin 與提供者生命周期。
- [工作區路徑輔助](../../util/workspace-path/README.zh.md)——`fileAddressFor` 與 `parseFileAddress`，兩端共享的 `dsh-resource://file/…` 地址語法。
- [Sidebar 文本預覽](../../client/ui-sidebar-documentpreview/README.zh.md)——經 `file` 提供者跟隨文件并讀取其頁的 tab 類型。

-----

<a id="model-experience"></a>
## 模型體驗

無，本包不注冊任何工具、不貢獻提示詞章節、不追加任何會話事件。

#### KV Cache 影響

無；本包既不裝配也不發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **僅覆蓋已埋點操作**——`changes` 轉發 `fs/observed` 的發射；子進程、shell 命令或用戶編輯器改動的文件不產生任何幀。
- **僅目錄受限**——盡管文件預覽可以讀取文件系統后端允許的任意路徑，`list` 與 `changes` 仍限定在 Session 工作區內。
- **沒有總行數**——頁只報告 `eof`，不報告后面還有多少行；需要總數的消費方要翻到末尾或按 `bytes` 估算。
- **超長單行沒有頁**——超過 `maxBytes` 的單行在包含它的每個窗口都以 `too-large` 失敗，因為頁按行而非按字節切。
- **讀取不具備事務性**——結果元數據來自內容讀取之前的 stat；并發寫入可能使報告版本與返回內容不一致。
- **generation 隊列無界**——一個 `changes` generation 會緩沖每一條被包含的觀察直到消費方 pull；停滯的消費方會在流的生命期內持續增長 Host 內存。
- **`maxEntries` 限制的是答案，不是列舉**——`list` 讓 `ctx.fs.listDir` 列出全部子項后再截斷數組，遠超上限的目錄仍讓 Host 付出整個列舉的代價（`fs-local` 上每個子項一次 stat）；要限制這份工作，需要文件系統 seam 的 `listDir` 支持上限。
- **失效流保留元數據**——Host 結束 `changes` 或流終態失敗后，已打開的值保持最后已知狀態，直到重新打開。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者工作上下文——點擊展開</summary>

無。

</details>
