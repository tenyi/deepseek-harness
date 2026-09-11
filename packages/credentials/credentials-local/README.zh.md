---
description: "面向用戶與維護者的文件型憑據提供方：選擇、配置或排查本地憑據存儲及其環境分層。"
kind: "package-reference"
---

# @deepseek-ai/dsh-credentials-local

[English](README.md) | 中文

## 概述

`dsh-credentials-local` 把 API 密鑰和其他機密保存在 harness home 下的私有文件中。你可以通過配置界面保存憑據，也可以直接編輯文件；變更會自動重載，保存的值也會跨重啟保留。憑據查找采用固定優先級：啟動環境優先，其次是存儲文件、項目 `.env` 和 harness home 的 `.env`；新保存的值會立即覆蓋 `.env` 中的舊值。只有你的 OS 用戶能讀取該文件，但 agent（智能體）的工具進程以同一用戶身份運行，因此該存儲無法向 agent 隔離機密。

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

本包為組合提供本地憑據存儲：API 密鑰與其他機密只需保存一次，之后每個按名引用它們的請求都會用到。常用路徑是顯式的：加載存儲、通過配置界面或 `ctx.credentials` 保存密鑰，然后在需要時由產品解析。

### 何時使用

把它作為默認本地存儲：產品的基礎組合會加載它，你通過配置界面保存的密鑰會立即生效。當部署必須讓提供方密鑰遠離自身 agent 時選擇其他存儲——文件權限做不到這一點，因為 agent 的工具進程以你的 OS 用戶身份運行（見「誰能讀取該文件」）。

### 設置

```yaml
- name: '@deepseek-ai/dsh-credentials-local'
  config:
    path: /absolute/path/to/.credentials.yaml
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `path` | `<harness home>/.credentials.yaml` | 憑據文件所在位置 |
| `dshHome` | `$DSH_HOME` 或 `~/.dsh` | `path` 缺省時使用的 harness home |
| `watch` | `true` | 文件在磁盤上變化時自動重載 |
| `debounceMs` | `100` | 變化后等待這么久再重載，單位為毫秒 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-credentials-local)完整列出了所有受支持字段及其 JSDoc，是這些信息的真源。

### 存儲與移除密鑰

用 `set` 保存密鑰、用 `unset` 移除、用 `describe` 檢查密鑰是否已配置——與憑據 API 提供的操作相同：

```ts
import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'

declare const ctx: Context

const ref = credentialRef('DEEPSEEK_API_KEY')
await ctx.credentials.set(ref, 'sk-…')          // save
await ctx.credentials.describe(ref)             // { configured, source?, writable } — never the value
await ctx.credentials.unset(ref)                // remove
```

你保存的密鑰會被下一個按名引用它的請求使用；`describe` 報告它是否已設置、來自哪里、能否寫入——絕不返回值本身。記錄也持久化在同一文件中：插件按 `<owner>/<id>` 尋址一條記錄，并用 seam 的記錄操作（`readRecord`、`describeRecord`、`listRecords`、`modifyRecord`、`deleteRecord`）管理它。

### 密鑰從哪里來

密鑰按一個固定順序解析——先有值的位置勝出：

| 位置 | 可寫？ | 優先于 |
|---|---|---|
| 你啟動時的環境（`DEEPSEEK_API_KEY=… dsh`） | 否 | 一切 |
| 存儲文件 | 是（`set`/`unset`） | 兩個 `.env` 文件 |
| 項目的 `.env`（`<invocation cwd>/.env`） | 不在此處 | 主目錄 `.env` |
| 主目錄的 `.env`（`$DSH_HOME/.env`） | 不在此處 | 無 |

啟動環境優先，因為按次覆蓋——`DEEPSEEK_API_KEY=… dsh`、CI 機密、容器 `-e`——代表本次運行的明確意圖；它無法從產品內部修改，因此被報告為只讀，寫入會被拒絕。其他一切來源都輸給存儲文件，這正是你保存的密鑰會立即生效的原因，即使某個 `.env` 里還留著更舊的密鑰；沒有存儲任何東西時，那兩個 `.env` 層會參與解析。環境層是啟動時拍攝的啟動器[環境快照](../../util/launch-environment/README.zh.md)，因此啟動之后才導出的變量不會被看到。

### 憑據文件本身

帶版本的 YAML 文檔，每個鍵空間一個分節，除此之外別無他物：

```yaml
version: 1

refs:
  DEEPSEEK_API_KEY: sk-…
  OPENAI_API_KEY: sk-…

records:
  llm-pi-ai/openai-codex:
    kind: grant
    payload:                    # written verbatim; this provider does not interpret it
      type: oauth
      access: eyJhbGciOi…
      refresh: rft_9f8e7d…
      expires: 1786000000000
  llm-pi-ai/amazon-bedrock:
    kind: api-key               # environment values, no key: this route uses an AWS profile
    env:
      AWS_PROFILE: prod
  llm-pi-ai/amazon-bedrock-dev:
    kind: api-key               # neither: the owner confirmed the ambient credential chain
```

你可以直接編輯該文件——存儲會自動重載并接收變更，包括你刪除的密鑰或記錄。`refs` 按環境變量名存放密鑰值；`records` 按 `<owner>/<id>` 存放各插件的憑據，每條都帶 `api-key` 或 `grant` 標簽，其中 grant 的 payload 由存儲逐字保留，因為只有它的擁有者能解釋。產品寫入時會保留注釋與未觸及條目的排版；直接位于某條目上方的注釋屬于該條目的注解，會隨它一起刪除。文件只存放憑據，因此任何其他內容都會被明確拒絕，而不是被靜默忽略：非 mapping 的根、未知的頂層鍵、在其鍵空間內不可尋址的鍵、類型錯誤或空的值、未知的記錄標簽或字段、重復鍵以及格式錯誤的 YAML 都會在啟動時失敗；運行期熱重載時則保留最后可用內容并告警。

密鑰的值可以是任意文本，包括多行值——不需要任何引號技巧。空值等于「沒有密鑰」，這正是文件中的空字符串被拒絕的原因：移除密鑰是刪除它，而不是把它置空。`grant` 的 payload 必須經受 JSON 往返，進出兩個方向都會強制這一點，因此存儲會拒絕無法逐字讀回的值。如果磁盤上的文件已無法解析，保存會失敗，而不是覆蓋產品讀不懂的內容。

### 誰能讀取該文件

只有你的 OS 用戶能讀取該文件：產品以僅屬主可訪問的權限創建它，在 POSIX 上還會拒絕加載任何其他用戶可讀的文件——錯誤會提示你運行 `chmod 600`。Windows 沒有可檢查的 mode，因此在那里跳過該檢查而不是偽造它。agent 不是另一個用戶：它的工具進程以你的身份運行，因此它們讀這個文件與讀你擁有的任何其他文件毫無二致。產品絕不把文件路徑交給 agent，也絕不把文件載入環境，因此要拿到某個值，需要刻意去讀一條并未交給 agent 的路徑。這是審慎，不是邊界：必須讓提供方密鑰遠離自身 agent 的部署無法靠文件權限做到。

### 可能出錯的地方

- **啟動環境提供的密鑰是只讀的**——`DEEPSEEK_API_KEY=… dsh` 在本輪運行中優先，保存或移除它都會被拒絕。請先在啟動 shell 中清除該變量。
- **空值無法保存**——存儲空字符串會被拒絕；請改為移除密鑰。
- **存儲拒絕加載它無法信任的文件**——任何其他用戶可讀的文件、格式錯誤的 YAML 或無法訪問的路徑都會在啟動時失敗；運行期熱重載則保留最后可用內容并告警。
- **同一時刻的修改都會被保留**——如果你在產品寫入的同時編輯文件，你的變更會被并入，而不是被覆蓋。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋提供方背后的設計決策，并指出實現它們的代碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

- **一套明確的優先級。** 繼承環境優先，因為它是本次運行的明確意圖且無法從進程內部修改；它之下的所有來源都輸給受管存儲，因此已存密鑰永遠不會被陳舊的 `.env` 擠掉。
- **文檔只存放憑據。** 它是帶 `refs` 與 `records` 分節的版本化文檔，而不是 dotenv 文件：一個 harness 擁有、且絕不物化進環境的存儲，不能同時充當用戶的環境層，否則會以自己的優先級遮蔽非機密條目。
- **寫入打補丁，重載整體替換。** 行編輯在跨進程寫鎖下保留注釋與未觸及條目；重載整體交換解析后的快照，已刪除條目絕不在內存滯留。
- **信任攸關處明確報錯。** 啟動與重載都會拒絕不可讀、無效或可被屬主之外讀取的文檔；運行期重載失敗時會保留最后可用快照并告警，而不是拖垮進程。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 提供方：層解析、嚴格文檔解析、寫鎖下的引用與記錄寫路徑、watcher 生命周期、權限檢查 |
| — | 未發布運行時不變式配套入口；Service Definition 的配套入口（`dsh-credentials/invariant`）負責 `credentials/reference-updated` 生命周期約定；本提供方的文件與環境分層屬于異步 I/O，并由其單元測試套件加以約束。 |

### 解析與寫入路徑

`resolve` 與 `describe` 按優先級順序讀取繼承環境快照、已解析文檔快照與 `.env` 后備層。`set`/`unset` 排入同一條獨占操作鏈：入口檢查提前拒絕（已釋放、空值、被環境遮蔽），隊列在運行時會重新判定，隨后在寫鎖下執行讀-改-寫、提交，并恰好觸發一次 `credentials/reference-updated`。

`modifyRecord` 走同一條鏈與同一把鎖：它重新讀取文檔、把當前記錄交給變更函數、準入其結果——非空的 API 密鑰、能經受 JSON 往返的 grant payload——整體渲染該記錄并提交，恰好觸發一次 `credentials/record-updated`。并非由產品 CLI（命令行界面）啟動的組合只有繼承環境這一層。

### 重載生命周期

watcher 事件或就緒時的對賬會將一次刷新排到同一鏈條之后。`reconcileFromDisk` 重新檢查權限、重讀文本，文本有差異時整體替換兩個快照，并按變更引用或記錄逐個發布事件；與文本緩存一致的內容——包括提供方自己的寫入——是 no-op。釋放時設置關閉標志、停止接收事件、關閉 watcher，并等待排隊操作結算完畢，確保資源銷毀后不再發布任何事件。

### 文檔版本化

文檔攜帶 `version: 1`，每次寫入都會蓋上版本戳。啟動時若識別出預發布扁平布局——沒有 `version` 的裸引用名 mapping——會在寫鎖下就地升級，把原始行嵌套到 `refs:` 之下，值、注釋與拼寫逐字節保留；任何其他無版本形態都會按名拒絕，而不會被當作空存儲。運行期熱重載絕不遷移：中途恢復的扁平文檔會保留最后可用快照，直到下一次啟動。

### 診斷信息絕不引用值

YAML 解析器自己的消息會引用出錯的那行源碼，而在這份文檔里那行就是機密本身。因此每條診斷只攜帶錯誤碼與位置——鍵名可以安全打印，值不行。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當提供方級約定不夠用時閱讀以下頁面。它們從 seam 約定逐步進入環境快照、原子寫入原語與啟動期環境層。

- [憑據引用 seam](../credentials/README.zh.md)——`resolve`、`describe`、`set`、`unset`、記錄操作與 seam 的更新事件。
- [憑據子系統參考](../../../docs/subsystems/credentials.zh.md)——`CredentialRef`、按操作解析、對 UI 安全的 `CredentialInfo`、提供方層。
- [啟動環境快照](../../util/launch-environment/README.zh.md)——解析讀取的凍結層快照，而非 `process.env`。
- [原子寫入](../../util/atomic-write/README.zh.md)——每次寫入所用的寫鎖與原子替換。
- [應用啟動與 Harness home 各層](../../boot/app-boot/README.zh.md)——產品 CLI 如何把 `.env` 載入快照與 `process.env`。

-----

<a id="model-experience"></a>
## 模型體驗

經由 `ctx.credentials` 的消費方間接生效：消費方擁有存儲值所啟用的全部模型可見行為。

#### KV Cache 影響

無直接失效；存儲值絕不進入請求前綴。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本提供方何時不合適，或何時需要特別的運維注意。它們是當前包約束，不是任務積壓。

- **同一引用的并發寫入是后寫勝出**——寫鎖加讀-改-寫讓并發寫入者不會丟掉彼此的條目，但兩個寫入者編輯同一個引用時仍以較后的寫入為準；沒有修訂檢查。
- **同 UID 進程可以讀取該文檔**——文件效果沙箱模式不會拒絕讀取，OS 鑰匙串提供方仍是延后項。
- **環境變化不可見**——快照在啟動時凍結，因此啟動之后 export 的變量既不會進入解析，也不會進入 `describe`；要更換來自環境的憑據需要重啟。
- **原子但不具備崩潰持久性**——繼承自 `dsh-atomic-write`；存儲在啟動時重新讀取。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文：開放問題與尚未決定的探索方向。它明確不具權威性——已交付的行為與限制以上文和包代碼為準。

OS 鑰匙串提供方——一種模型進程根本無法讀取的存儲——是同 UID 限制的延后答案，應當作為平級包與本提供方并列。seam 的接口還為輔助命令與 KMS 后端提供方預留了空間；目前沒有任何一種隨附。

</details>
