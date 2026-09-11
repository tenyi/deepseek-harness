---
description: "Host 與 Client 會話控制：創建、恢復、提示、跟隨歷史并投影實時會話狀態。"
kind: "package-reference"
---
# Session Controller

[English](README.md) | 中文

## 概述

`@deepseek-ai/dsh-api-session-controller` 擁有 Host 的 `ctx.sessionController` 服務，以及生成的 Client `session`、`skills` 和 `fileReferences` Remote namespace。它提供 Session 生命周期與歷史、Host generation 模型目錄、工作區路徑打開、用戶可調用 skill（技能）發現和 Agent（智能體）范圍的文件引用。當 Client 需要按 Session 尋址的操作時，請通過 API Gateway 使用它。

## 目錄

- [使用本包](#use-this-package)
- [會話媒體引用](#session-media-references)
- [配置](#configuration)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

歷史頁與 follow opening 快照為每個持久 Session 事件攜帶一條 `{ type: 'event', event: SessionWireEvent }` record。Client 把每條已接受 record 保留為一個持久 `SessionEventLikeEntry`；Assistant token 邊界保留在 `assistant/message` 或 `assistant/attempt` 的緊湊流內。工具參數、結果內容、失敗信息和 `tool/result.data.meta` 原樣通過；控制器不解析工具定義、不運行展示轉換器，也不附加 UI 數據。

Client journal 在發布 follow 快照、live entry 或歷史頁之前驗證精確的 V3 事件 envelope。它復用瀏覽器安全的 Session validator，檢查必需的 surface marker、精確的 replacement endpoint、更早且唯一的 source seq、內嵌 Assistant 來源、request header 可選字段的省略規則以及工具錯誤一致性。無效 record 直接失敗，不刪除字段或歸一化；范圍成員與來源存在性仍由 Host 的持久日志檢查。

每個 endpoint 都聲明自己的激活策略。列表只讀取持久化 header 與 projection cache row，絕不調用逐 Session stat 或打開冷 Session body。當前格式 cache identity 可以提供全部列表 hint；生命周期匹配的 predecessor cache 只能提供版本兼容的 title，作為可能過時的展示事實，絕不能作為權威 fold seed。搜索、附件、歷史頁、日志跟隨、skill 發現和工作區路徑打開可以在不激活 Agent 的情況下檢查 persistence；`canOpenWorkspacePath()` 無需指定 Session 即可報告原生打開能力。queue 變更與取消要求 live 狀態；模型、重命名、prompt 和文件引用操作可以解析或恢復普通 Session。提示詞會在解析 Agent 或追加 Session 事件前，拒絕既沒有非空白文本也沒有附件的 content；queue edit 只接受非空文本 content。prompt 準入從注入的 [`fileUploads`](../../client/file-upload/README.zh.md) Host 服務取得不透明憑證，在把完整有序內容列表交給 `ctx.attachments` 前解析每個屬于同一 Agent 的憑證。`requestId` 已進入 queue 或日志時，prompt 重試直接返回原來的接受結果，不會重復插入消息。只有 create 與 fork 會直接創建新 Agent。該服務把同一套感知 preset 的恢復策略和 subagent ownership fence 同時用于自身方法，以及其他 Remote namespace 使用的 Typert Agent 與 Session lookup。Queue 變更只有一個狹窄例外：當前 projection identity 為 continuable 且來自自身非 seed suffix 的在線 child，可以在兩個 inbox 目標上使用普通 Edit、Remove 與 QueueDock Steer action。One-shot、缺失、未知、損壞、僅含 seed identity 或冷 child 繼續被拒絕，且不會恢復。skill 目錄優先使用已有 live Agent，否則使用所記錄 preset 的常駐 scope，因此列表查詢絕不會啟動 Agent。經過鑒權的文件交付路由通過 `workspaceDesktop()` 獲取提供服務的 Host 名稱和文件管理器行為。`openWorkspacePath({ path, action: "reveal" })` 將文件管理器導航委托給原生適配器；省略 `action` 時打開默認應用。

Client 適配器提供 `SessionEventStream`，即綁定到一個普通 Session 或 direct subagent address 的 Gateway `RemoteJournalStream`。它在讀取首個 page 前打開 follow，只發布連續的 `replace`、`prepend`、`append` 與 `settle-assistant` 變更，并通過 tail page 修復重連或 seq 缺口。向后分頁有兩個動詞：`loadOlder()` 拉一頁 50 條消息，而 `loadThrough(seq)`——輪次跳轉加載器——按每頁 200 條消息循環拉取直到窗口覆蓋目標 seq，重復調用會下調共享目標，遇到無進展的頁即停止，忙碌狀態復用同一個 `loadingOlder` 快照位。Web 適配器顯式選擇接收無 cursor 的 Assistant frame：每個 opening 攜帶活躍 attempt 的 `startedAfterSeq`、`nextIndex` 與緊湊 stream，每個 stream member 都成為排在持久 cursor 之間的 Client-only `assistant/live-chunk` 條目。Host 會隨該 baseline 捕獲 follower 本地到達序號，并抑制該 cut 及之前的 buffered frame；replacement Agent 可以從 revision 一重新開始。活躍 opening 之后到達的持久 `assistant/message` 或 `assistant/attempt` 只有在其 seq 晚于 `startedAfterSeq` 且輪次與步驟匹配時才會保持暫存；匹配的 end type、seq 與 index 會發布一個具名 settlement delta，刪除該 attempt 的瞬態 row、加入持久條目，并保留同一步驟中更早的 retry。已知 attempt 的 revision、密集 index 或 settlement 缺口會重新打開 follow；若 controller 錯過 start，則忽略 unknown-attempt frame，并正常發布其持久 settlement。Abandoned end 會發布不含持久條目的 settlement delta，使瞬態 row 立即退出。持久缺口修復 page 不攜帶 Assistant baseline，因此 held notification 會重新打開 follow 一次，以取得配對的 page 與 baseline。每條歷史 record 只覆蓋自身的事件 seq。業務、persistence 或無法恢復的連續性錯誤會終止 stream，只有物理載體斷開才觸發自動恢復。`SessionControlStream` 是 Gateway `RemoteSnapshotStream`；每代都以完整的進程本地 baseline 開始，因此重連會替換 queue、jobs 和 projection 狀態，而不會把瞬態值當作持久事件。每次 inbox 變更時，Host 會先發布 projection frame，再從同一份已校驗的折疊后值派生 queue replacement，因此監聽器注冊順序不會產生陳舊的 queue frame。Client Agent 上下文提供獨立 [`fileUpload`](../../client/file-upload/README.zh.md) 服務使用的身份；Session 對象提供生命周期、prompt、queue 與歷史操作，不提供文件傳輸。

Session 對象還承載本地提交回顯：`session.beginSubmission` 在調用方序列化與提示詞之前，同步把一條回顯寫入 `SessionSnapshot.pendingSubmissions`，會話 UI 因此能在點擊提交的當幀顯示消息。回顯按順序存放圖片預覽與持久文件引用。Session 根據當前運行狀態與請求的投遞模式推導其 `transcript`、`queued` 或 `steering` 位置，并在序列化期間保留該位置。提示詞的 `requestId` 是關聯標識：Host 把它回顯為 durable user source 的 `rpcId`，queue occurrence 也把它投影為 `SessionQueuedItem.rpcId`。回顯在觀察到其 durable event 或 queue occurrence 后延遲一個動畫幀退休，帶標識的提示詞失敗或被放棄時立即退休，銷毀時按 failed 退休。每次退休恰好觸發一次 `onRetire`；observed 退休還會攜帶有序的持久附件引用，讓 composer 釋放成功卡片并保留失敗草稿。回顯只存在于 Client 內存；刷新與重連只從持久事件重建會話。


面向用戶調用的 `skills/list` 元數據包含勝出提供方可選的指令文件 `path`。輸入框可據此預覽文件，無需加載每個 skill 的正文或激活冷態 Agent。

<a id="session-media-references"></a>
## 會話媒體引用

當 `connection`、`fs` 與 `attachments` 均被組合時，`SessionMediaReferences` 在鑒權 `connection.fetch` 通道上掛載 `GET|HEAD /api/file?path=<絕對路徑>`。它通過 `ctx.fs` 讀取普通文件，包括已注冊工作區之外的臨時路徑與遠程提供方中的文件。目錄包含關系與 MIME 類別均不限制訪問；`mime-types` 提供響應類型，未知擴展名使用 `application/octet-stream`。GET 復用 `readBytes` 執行讀取前及讀取中的字節限制；HEAD 只讀取元數據。所有文件均使用 `ctx.attachments.imageLimits.maxImageBytes`（通常為 20 MiB）；超過此上限返回 413。響應包含完整文件，忽略 Range，并攜帶 `private, no-store`、`nosniff` 與沙箱 CSP，使直接打開的 HTML/SVG 無法以 API 源身份執行腳本。客戶端重寫位于 `ui-chat`（`AssistantMarkdown`）；音視頻文件響應已可用，Markdown 音視頻播放器節點仍是獨立工作。

-----

<a id="configuration"></a>
## 配置

| 字段 | 默認值 | 含義 |
|---|---:|---|
| `nativeOpen` | 平臺探測 | 是否能把 Session 工作區路徑交給原生桌面打開器 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-api-session-controller)是所有受支持字段及其 JSDoc 的完整來源。

-----

<a id="model-experience"></a>
## 模型體驗

無；任何模型可見效果都由被調用的 Agent 命令負責。

#### KV Cache 影響

無直接影響；模型請求仍由 Agent 和 LLM（大語言模型）包擁有。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- 圖片字節上限不校驗解碼后的尺寸或像素數。
- Control baseline 表示進程本地狀態，因此 Host 重啟后無法重建 jobs。
- follow 恢復失敗會對調用方可見，而不會無限重試。
- 瀏覽器原始字節上傳使用一次不帶斷點續傳偏移的流式 HTTP 請求；重試會從第零字節重新傳輸整個文件。
- 文件引用補全使用共享 Agent lookup，因此可能恢復冷 Session；`skills/list` 目錄是不激活 Agent 的 skill 元數據讀取路徑。


<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。每個分頁與幀都會對照其指向的持久 Session 校驗。
