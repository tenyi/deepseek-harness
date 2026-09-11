---
description: "Web 會話日志 ZIP 導出：Host 流式傳輸、認證下載路由、Session Header 操作與 /export 命令。"
kind: "package-reference"
---

# @deepseek-ai/dsh-session-log-export

[English](README.md) | 中文

## 概述

`dsh-session-log-export` 讓 Web 界面可以下載會話的完整歷史：Session Header 更多操作按鈕下的 `下載 Session 日志` 菜單項與 `/export` 斜杠命令都會把會話樹——會話本身、其子會話與附件——作為 ZIP 交給瀏覽器下載。本包擁有 Host 歸檔流、經過認證的 Fetch 路由以及瀏覽器控件和反饋。下載目標位置由瀏覽器選擇。設置與用法在前，隨后說明實現細節。

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

當 Web bundle 需要讓用戶導出會話日志時使用本包。它需要 Connection、命令注冊表、Session 查詢與持久化以及附件服務。掛載插件，然后在 Session Header 的更多操作菜單中選擇 `下載 Session 日志` 或輸入 `/export`；瀏覽器會下載 `dsh-session-<id>.zip`。

### 何時選擇

為需要帶可見下載彈窗的面向用戶的會話導出的 Web 部署選擇它。需要程序化或 Host 側導出時避免使用：本包產生的是瀏覽器下載，而非 Host 路徑寫入。日志從持久化讀句柄序列化而來，因此任何已掛載后端都受支持。

### 組合

```yaml
- id: session-log-download
  name: '@deepseek-ai/dsh-session-log-export'
```

Web bundle 將本包與 Connection、`dsh-commands`、`dsh-client-ui-commands` 和 `dsh-client-ui-conversation` 一起掛載。

### 配置

| 字段 | 默認值 | 含義 |
|---|---|---|
| `compressionLevel` | `6` | 每個 ZIP 條目的 DEFLATE 級別，范圍為 0 到 9。 |

### 命令約定

| 輸入 | 結果 |
|---|---|
| `/export` | 記錄用戶命令的生命周期；提交命令的瀏覽器下載 `GET /api/session.export?sessionId=<id>&includeDescendants=true` |
| `/export <path>` | 錯誤；瀏覽器下載通過瀏覽器的普通下載行為選擇目標位置 |

### 預期行為

彈窗報告三個階段：準備中、開始下載或失敗。關閉彈窗不會取消正在進行的下載，該操作隨后結束時彈窗也不會重新打開。每個會話同時只允許一項下載，重復操作共用該任務。導出包含實時會話的最新事件：Host 端點在讀取前會 flush 活動的根會話，因此斜杠命令觸發的 ZIP 會包含啟動下載的 `command/run` 與 `command/done` 事件對；非活動的持久化會話不需要 flush。每份邏輯日志在歸檔中使用當前 generation 的規范文件名（v0 為 `session.jsonl`，其他版本為 `session.vN.jsonl`），每個子會話目錄下也遵循同一規則。圖片使用 `media/<attachmentId>.<ext>`，通用文件使用 `files/<digest-prefix>/<digest>/<name>`。通用文件以有界分塊讀取并壓縮，因此導出大型上傳文件時不會把它完整緩沖進內存。

### 失敗

當 ZIP 流式傳輸開始前的預檢失敗時——例如 Host 端點不可達或配置錯誤——彈窗顯示準備階段錯誤。瀏覽器接受 GET 后發生的子會話或附件讀取失敗由瀏覽器下載管理器報告，不通過彈窗報告。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋本包如何接入導出控件，并指出實現它的代碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計拆分

本包分為兩部分。Host 半包（[`src/index.ts`](src/index.ts)）注冊 `/export` 命令，并向 Connection 貢獻精確的 `GET`/`HEAD /api/session.export` Fetch 路由；[`src/archive.ts`](src/archive.ts) 構建有界 ZIP 流。瀏覽器半包（[`src/client/index.ts`](src/client/index.ts)）提供共享下載控制器和 UI，并觀察 `command/executed`，因此只有提交命令的瀏覽器會啟動下載。

### 下載流程

兩條入口都會先向 `/api/session.export?...` 發出 `HEAD` 預檢請求，然后把 GET URL 交給瀏覽器下載管理器，JavaScript 不緩沖 ZIP。一個控制器按會話持有一項進行中的下載，把并發操作折疊進該任務，并在插件釋放時取消預檢。彈窗狀態存放在按會話鍵控的快照存儲中，因此按鈕與命令按會話共享一個彈窗。

Host 路由是由該功能擁有的精確 Fetch 路由貢獻。Connection 應用 Host/Origin 與瀏覽器會話檢查并橋接流式 `Response`；本包擁有查詢校驗、活動會話 flush、基于句柄的日志讀取與附件讀取、ZIP 生成和 HTTP 狀態語義。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從 Web 控件逐步進入 Host 端點及相關的命令與會話接口。

- [dsh-client-connection](../../client/connection/README.zh.md)——Host 端點使用的認證 Fetch 路由載體。
- [命令子系統參考](../../../docs/subsystems/commands.zh.md)——`/export` 命令注冊的用戶命令注冊表。
- [dsh-client-ui-commands](../../client/ui-commands/README.zh.md)——渲染并確認 `/export` 的瀏覽器命令界面。
- [會話查詢包映射](../README.zh.md)——本包所屬的檢索包族。

-----

<a id="model-experience"></a>
## 模型體驗

### 用戶 `/export` 控制

#### 模型看到什么

無。`/export` 留在用戶命令平面，ZIP 下載不會進入模型歷史。

#### Token 影響

為零。該命令不創建模型輪次。

#### KV Cache 影響

無。僅日志命令生命周期與瀏覽器下載不會改變派生請求前綴。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本包何時不合適，或何時需要特別的運維注意。它們是當前包約束，不是任務積壓。

- **瀏覽器下載，而非 Host 路徑寫入**——目標位置由瀏覽器選擇；不會返回 Host 路徑或原生文件夾操作。
- **預檢只報告流式傳輸前的失敗**——瀏覽器接受 GET 后發生的子會話或附件讀取失敗由瀏覽器下載管理器報告，不通過彈窗報告。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文：開放設計問題與尚未決定的探索方向。它明確不具權威性——已交付的行為、限制與既定理由以上文、包代碼和相關頁面為準。

#### 未來：瀏覽器之外的導出目標

下載刻意限定在瀏覽器范圍；Host 路徑或原生文件夾導出需要新的端點約定，并決定 ZIP 的落盤位置。

</details>

**運行時不變式：** 不發布伴生入口。Connection 與命令注冊表持有兩個注冊，每次導出均讀取權威的 Session 服務。
