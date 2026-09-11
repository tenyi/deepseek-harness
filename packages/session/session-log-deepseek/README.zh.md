---
description: "面向啟用官方 DeepSeek 請求元數據的部署，增量上傳規范會話日志。"
kind: "package-reference"
---

# @deepseek-ai/dsh-session-log-deepseek

[English](README.md) | 中文

## 概述

用于 DeepSeek 官方 LLM（大語言模型）API 請求的增量規范會話日志上傳。該函數插件注入 `ctx.sessions` 與 `ctx.deepseekLlmApiExtensions`，并擁有 `dsh_session_log` 請求字段以及用于派生接受水位的持久 `session-log-deepseek/delivery-accepted` 事件。僅當官方 API 需要接收會話日志后綴時才啟用它。

## 目錄

- [配置](#configuration)
- [請求字段](#request-field)
- [接受與重試](#acceptance-and-retry)
- [模型體驗](#model-experience)
- [已知限制與暫緩事項](#known-limitations-and-deferred-work)
- [開發備注](#dev-note)

-----

<a id="configuration"></a>
## 配置

| 配置鍵 | 默認值 | 含義 |
|---|---:|---|
| `enabled` | `false` | 注冊 `dsh_session_log` 貢獻。將其設為 `true` 可選擇啟用會話日志上傳。 |

隨附 profile 會掛載該插件，讓 overlay 可以啟用它；默認配置不會注冊請求字段，也不會追加接受水位。

<a id="request-field"></a>
## 請求字段

對于攜帶存活 `sessionId` 的請求，插件會折疊該確切會話格式代的最大已接受水位，對 `Session.events` 取快照，并發送水位之后的連續后綴。進程內 fold 會讓每條事件只被掃描一次并增量消費后續追加；重啟與 HMR（熱模塊替換）會從持久日志重建它。版本 1 字段包含 `sessionFormatVersion`、原始會話 header（僅 seeded Session 攜帶 `seedLength`）、數值型 `afterSeq` 與 `throughSeq`，以及每個已轉換為原始數值 envelope 字段的完整規范事件。只有記錄的會話 id 與格式代均匹配請求來源時水位才生效，因此 fork 會話會忽略從父會話繼承的水位。表層事件必須攜帶 `surfaceOp`，替換范圍使用數值型 `startSeq` 與 `endSeq`；僅 user 與 tool 事件可以攜帶 `sourceEventSeqs`。assistant 的來源保留在內嵌流中，只出現在日志中的事件不攜帶這兩個元數據字段。

<a id="acceptance-and-retry"></a>
## 接受與重試

DeepSeek 適配器會在 HTTP 2xx 后、消費 SSE（Server-Sent Events）正文前調用已準備貢獻的 `accept()`。接受操作會追加 `session-log-deepseek/delivery-accepted`，其中包含已上傳的 `throughSeq` 與 `sessionFormatVersion`；省略格式字段的記錄表示 v0。下一次請求再把該事件作為新后綴的一部分上傳。傳輸失敗與非 2xx 失敗不會追加接受記錄，因此后續請求會重發不確定范圍。并發交付可能亂序得到接受；折疊匹配記錄中最大的 `throughSeq` 可以防止游標回退。

服務端接受后、持久化水位前發生崩潰，可能讓恢復后的進程重放已經接受的范圍。這是至少一次交付的失敗方向：不確定性會制造重復，絕不會跳過序列。普通會話檢查點策略會在下一個語義檢查點持久化水位；本插件不執行獨立 I/O。

缺少存活會話的直接請求會省略 `dsh_session_log`。普通 agent（智能體）、壓縮（compaction）與會話標題調用都會攜帶存活會話 id。

<a id="model-experience"></a>
## 模型體驗

### 會話日志元數據

#### 模型看到的內容

無。`dsh_session_log` 是 DeepSeek 請求中模型輸入字段的同級字段，不會插入 `messages`、系統提示詞或工具 schema。

#### Token 影響

模型輸入 token 為零；該字段只會增加 HTTP 請求字節數。

#### KV Cache 影響

無；模型可見請求前綴保持不變。

## 已知限制與暫緩事項

<a id="known-limitations-and-deferred-work"></a>

- **崩潰窗口重復**——2xx 后、接受水位持久化前進程終止，會在恢復時觸發保守重放。
- **缺少存活會話就沒有字段**——直接調用或陳舊會話調用沒有可供快照的規范日志；顯式缺失語義仍暫緩處理。
- **沒有獨立請求大小上限**——完整交付采用 fail-closed 策略；提供方拒絕會保持游標不變，而非截斷日志。


<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者工作上下文——點擊展開</summary>

無。

</details>
