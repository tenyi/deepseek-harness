---
description: "ctx.lsp 的 stdio 語言服務器提供方：配置好的服務器命令、擴展名映射與有邊界的臨時打開查詢，供組合本地代碼導航的用戶與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-lsp-stdio

[English](README.md) | 中文

## 概述

使用 `dsh-lsp-stdio` 可讓 agent（智能體）從顯式配置的本地語言服務器獲得定義、引用、實現與懸停信息。它把文件擴展名映射為語言標識符，按需為每個工作區啟動一臺服務器，并在每次查詢時重新讀取文件，不在查詢之間保留文檔狀態。語言服務器進程與源文件讀取共享已掛載的文件系統和子進程環境。本包不安裝服務器，也不提供沙箱；部署方必須提供命令、映射和所需的隔離措施。同一服務器與工作區的查詢串行執行，不同工作區可并行運行。

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

當部署擁有本地語言服務器——例如 `typescript-language-server`——并希望 harness 通過它們導航代碼時，掛載此提供方。它需要位于同一執行世界的文件系統與子進程提供方，以及 `dsh-lsp` seam；若要向模型開放，還需要 `dsh-tool-lsp`。

### 最小配置

`servers` 記錄把每個穩定的提供方 id 映射到一條服務器命令。提供方會在清理 credential 后于加載時解析每個可執行文件，因此一個壞配置項會阻止所有提供方注冊；進程在第一次匹配查詢時惰性啟動。

```yaml
- name: '@deepseek-ai/dsh-fs-local'
- name: '@deepseek-ai/dsh-subprocess-local'
- name: '@deepseek-ai/dsh-lsp'
- name: '@deepseek-ai/dsh-lsp-stdio'
  config:
    servers:
      typescript:
        command: typescript-language-server
        args: ['--stdio']
        extensionToLanguage:
          '.ts': typescript
- name: '@deepseek-ai/dsh-tool-lsp'
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `command` | 必填 | 要 spawn 的可執行文件——絕對路徑，或在加載時從子進程 PATH 解析；不使用 shell 啟動 |
| `extensionToLanguage` | 必填 | 小寫、以點開頭的擴展名 → LSP language id（例如 `{ '.ts': 'typescript' }`） |
| `args` | `[]` | 傳給可執行文件的參數 |
| `env` | `{}` | 合并到已清理 credential 的環境之上的額外 env；匹配 `KEY`／`PASSWORD`／`SECRET`／`TOKEN` 的變量以及所有 `DSH_*` 名稱不會被轉發 |
| `initializationOptions` | `null` | 轉發給服務器的靜態 `initialize` 選項 |
| `configuration` | `null` | 每個 `workspace/configuration` 配置項的靜態答案 |
| `maxMessageBytes` | `16000000` | 從服務器接受的單條 framed 消息最大大小 |
| `maxStderrBytes` | `1000000` | 為診斷保留的 stderr 尾部最大大小 |
| `maxDocumentBytes` | `4000000` | 該主機可打開的源文件大小上限 |
| `shutdownTimeoutMs` | `5000` | 升級前用于優雅 `shutdown`／`exit` 的預算 |
| `killGraceMs` | `2000` | 請求取消及 SIGTERM→SIGKILL 升級的寬限期 |

`servers` 必須至少包含一個配置項，每個 id 都必須非空；定時器預算必須是 Node 定時器范圍內的正整數，字節上限必須為正。生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-lsp-stdio)是每個受支持字段的窮盡式真源。

### 查詢做什么

首次查詢某個工作區時，提供方會為該工作區啟動一個服務器進程并放入池中。每次查詢通過 `ctx.fs` 讀取當前源文件，在服務器中打開它（`textDocument/didOpen`），執行所請求的操作，然后關閉——因此服務器始終看到當前文本，調用之間不會殘留任何文檔狀態。同一服務器與工作區的查詢一次只執行一個；不同工作區并行運行。如果池化進程在只讀查詢之前或期間發生故障，提供方會在新進程上重試該查詢一次。

### 可觀察的成功與失敗

成功的導航返回規范化位置，懸停返回規范化文本或無可懸停提示；空結果是成功的無結果響應。當服務器不支持該操作或臨時打開／關閉同步（`LSP_UNSUPPORTED_OPERATION`）、源文件缺失、非普通文件、非 UTF-8、過大或位于規范工作區之外（在服務器啟動前被拒絕），或服務器返回格式錯誤的載荷（`LSP_MALFORMED_RESPONSE`）時，查詢會失敗。被強制殺死的 harness 會讓服務器繼續運行直到自行退出——優雅關閉只發生在服務釋放時。

### 安全邊界

本提供方信任所配置的服務器，不提供任何沙箱隔離；服務器獲得的是已掛載執行世界的文件系統與進程權限。它會在服務器啟動前拒絕缺失、非普通文件、非 UTF-8、過大或規范化后位于工作區之外的查詢源。結果位置可以指向工作區外部，但外部路徑永遠不能成為查詢源。為同一執行世界掛載文件系統與子進程提供方——分裂世界組合無效。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋提供方背后的設計決策并指出實現它們的代碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

- **通用主機，不是目錄。** 部署顯式配置命令與映射；預設應放在 `cordis.yml` overlay 中，而不是本包內。
- **兼容性優先的臨時打開。** 每次查詢都執行 `didOpen`（版本 1、完整文本）→ 請求 → `didClose`，因此服務器始終看到當前字節，第一版不需要 `didChange`、內容 cache 或文檔 LRU。
- **先讀后啟動。** 源文件在工作區隊列內先完成解析、包含關系檢查與字節限制，然后才創建任何進程，因此排隊查詢只會在輪到自身時讀取當前字節，無效源文件也不會留下空閑的池化進程。
- **每個規范工作區一個池化進程。** 實例按 `(server id, canonical workspace target)` 進行 single-flight；傳輸故障會在等待釋放完成后于新進程上重試一次該只讀查詢。
- **逐工作區串行化。** 每個工作區一條可中止隊列，串行執行源讀取／打開／查詢／關閉生命周期；不同工作區并行運行，無法停止服務器的取消只會終止該實例。
- **有邊界的釋放。** 優雅 `shutdown`／`exit` 會升級到 subprocess 提供方的 managed-range 終止流程；是否完全停穩由等待整個 range 確認，而非由終止請求自身的結果確認。
- **執行世界配對。** 服務器通過 `ctx.subprocess` 啟動，`processId: null`（另一臺機器或 PID namespace 不得監視 harness）；源文件通過 `ctx.fs` 讀取；不發出 `fs/observed` 事件——只有 LSP 結果對模型可見。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：config schema、可執行文件解析、提供方注冊、進程池 |
| [`src/host.ts`](src/host.ts) | 通過 `ctx.fs` 完成工作區規范化與有邊界的源讀取 |
| [`src/instance.ts`](src/instance.ts) | 單個服務器進程：initialize 握手、串行化臨時打開查詢、有邊界的釋放 |
| [`src/connection.ts`](src/connection.ts) | JSON-RPC 端點：id 關聯、出站請求、入站服務器請求、stderr 上限 |
| [`src/framing.ts`](src/framing.ts) | `Content-Length` 分幀與有邊界的解碼器 |
| [`src/protocol.ts`](src/protocol.ts) | 協議類型子集：能力、位置、懸停、文本文檔同步 |
| [`src/translate.ts`](src/translate.ts) | 能力檢查、UTF-16 協商、`Location`／`LocationLink`／hover 規范化 |
| [`src/abort.ts`](src/abort.ts) | 融合調用方與釋放信號的取消輔助 |
| — | 不發布運行時不變式伴生入口；進程池與隊列是私有狀態，本提供方也不發布獨立的生命周期事件流或可枚舉快照。 |

### 協議行為

初始化會聲明 UTF-16 位置、工作區文件夾與配置、markdown／plaintext hover，以及定義與實現使用的 link 支持，且不進行動態注冊；服務器返回的能力具有最終決定權。服務器省略 `positionEncoding` 時默認為 `utf-16`；其他任何值都會使查詢失敗。客戶端通過靜態配置回答 `workspace/configuration`，接受生命周期記賬請求，并拒絕 `workspace/applyEdit`——它絕不應用編輯或運行命令。導航直接映射 `Location`，并從 `LocationLink` 的 `targetUri` + `targetSelectionRange` 映射；hover 規范化接受 `MarkupContent` 與 `MarkedString` 形狀，保留字符串值，把帶 language tag 的值渲染為圍欄代碼，并用一個空行連接數組。缺失結果、格式錯誤的范圍或位置，以及格式錯誤的 hover 編碼，都會以結構化 `LSP_MALFORMED_RESPONSE` 錯誤失敗。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從共享的導航模型逐步進入 seam 與工具。

- [LSP 導航子系統](../../../docs/subsystems/lsp.zh.md)——操作、坐標、請求與結果，以及 `LspError` code。
- [dsh-lsp](../lsp/README.zh.md)——本提供方注冊到的 seam。
- [dsh-tool-lsp](../tool-lsp/README.zh.md)——基于該 seam 的面向模型工具。
- [lsp 組地圖](../README.zh.md)——三個包的家族及其相關文檔。

-----

<a id="model-experience"></a>
## 模型體驗

通過 `dsh-tool-lsp` 間接影響；該工具呈現此提供方的規范化結果，本主機自身不貢獻提示詞或 schema。

#### KV Cache 影響

不會直接失效；請求前綴變更由 `dsh-tool-lsp` 負責。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本提供方何時不合適，或何時需要特別的運維注意。它們是當前包約束，不是任務積壓。

- **不提供隔離策略**——本包信任所配置的服務器，不對其進程實施沙箱；受限部署必須提供適當的進程與文件系統提供方，或使用同一執行世界的沙箱包裝層。
- **臨時打開兼容性下限**——同步能力省略打開／關閉（或聲明 `None`）的服務器不受支持，即使關閉文檔查詢能夠工作；固定的 TypeScript e2e 只建立一項兼容性下限，不代表跨語言承諾。
- **逐服務器與逐工作區串行化延遲**——共享同一個服務器與工作區的并行 agent 會在一個進程后排隊；長生命周期工作區進程會占用內存直到釋放。
- **被強制殺死的 harness 會遺留語言服務器**——`initialize.processId: null` 取消了服務器側的客戶端 PID 監視，因此服務器只能由服務的優雅釋放清理；被 SIGKILL 的 harness 會讓它們繼續運行，直到自行退出。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
