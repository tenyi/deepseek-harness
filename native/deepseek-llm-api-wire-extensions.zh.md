# DeepSeek 官方 LLM API 協議擴展

[English](deepseek-llm-api-wire-extensions.md) | 中文

本參考文檔定義 [`@deepseek-ai/dsh-llm-deepseek`](../packages/llm/llm-deepseek/README.zh.md) 在 `deepseek-official` 聊天補全請求中發送的全部 DeepSeek Harness 特有 HTTP 標頭和附加 JSON 字段。本文不重復定義 DeepSeek 上游 API 持有的字段。提供方無關的 LLM（大語言模型）接口與 `llm-pi-ai` 均不實現這些擴展。

適配器將這些擴展發送至已解析的 `baseURL`，包括已配置的網關。擴展位于 `messages`、系統提示詞和工具 schema 之外，因此不會增加模型輸入 token，也不會改變模型可見前綴。

## 協議命名空間與版本

| 位置 | 命名方式 | 示例 |
|---|---|---|
| HTTP 字段名 | 小寫 kebab-case；HTTP 匹配仍不區分大小寫 | `user-agent`, `x-deepseek-harness-session-id` |
| DeepSeek 請求正文擴展字段 | 使用保留 `dsh_` 前綴的 snake case | `dsh_plugin_packages`, `dsh_session_log` |
| DSH 持有的嵌套 JSON 成員 | Camel case | `afterSeq`, `throughSeq`, `sessionId` |
| 帶標簽的值 | 使用 kebab-case 字符串；持久事件采用 `domain/action` | `session-log-deepseek/delivery-accepted` |

每個正文擴展獨立持有自身的 `version`。版本僅適用于包含該字段的對象；不同字段的版本之間不存在兼容或排序關系。JSON 成員順序不屬于協議。

[`DeepSeekLlmApiExtensionRegistry`](../packages/llm/deepseek-llm-api-extensions/README.zh.md) 為每個頂層擴展名保留一個提供方。空名稱、兩端帶空白的名稱、重復注冊以及與 DeepSeek 基礎請求沖突的名稱都會在 HTTP 分派前失敗。

## 請求標頭

| 標頭 | 出現條件 | 值 |
|---|---|---|
| `user-agent` | 每個提供方 HTTP 請求，包括 Files API 操作 | 采用 `product/version (+url)` 形式的應用身份；默認產品為 `deepseek-harness` |
| `x-deepseek-harness-user-id` | 每個已授權的聊天補全請求 | 已解析 Harness home 的穩定匿名 UUID |
| `x-deepseek-harness-session-id` | 攜帶會話 id 的聊天補全請求 | 確切的請求 `sessionId` 字符串 |
| `x-deepseek-harness-compact` | 用途為 `compaction` 的聊天補全請求 | 字面字符串 `1` |

憑據失敗發生在解析匿名用戶 id 之前，因此未授權請求既不會發送這些標頭，也不會創建身份文件。沒有會話的直接請求會省略 `x-deepseek-harness-session-id`。會話標題請求沒有額外的用途標頭；請求攜帶 `sessionId` 時，仍然適用普通的會話 id 規則。

## 正文擴展事務

適配器先序列化包括確切 `messages` 在內的完整基礎正文，再讓已注冊提供方準備字段。提供方會收到該不可變正文、請求取消信號，以及可選的 `sessionId` 和輔助調用 `purpose`。提供方返回 `undefined` 時，本次請求會省略其字段。

系統將已準備的 JSON 值與提供方持有的狀態分離，再將其作為基礎字段的頂層同級成員合并，并序列化到同一個 HTTP 正文中。準備失敗或沖突會阻止請求。組合未掛載注冊表時，適配器發送未經擴展的基礎正文。

已配置端點返回 HTTP 2xx 后，適配器會在讀取 SSE 正文之前運行已準備的 `accept()` 事務。傳輸失敗和非 2xx 響應不會接受任何貢獻。即使端點返回 2xx，接受失敗仍會使模型請求失敗。接受僅記錄端點級 HTTP 成功，不表示 SSE 流已完整結束，也不表示端點已持久化擴展。

## `dsh_plugin_packages`

[`@deepseek-ai/dsh-plugin-package-inventory-deepseek`](../packages/llm/plugin-package-inventory-deepseek/README.zh.md) 貢獻完整存活的 Loader-backed 插件包清單。該字段默認啟用。

```json
{
  "dsh_plugin_packages": {
    "version": 1,
    "packages": [
      {
        "name": "@deepseek-ai/dsh-example",
        "version": "0.1.1-rc.2"
      }
    ]
  }
}
```

| 成員 | 類型 | 含義 |
|---|---|---|
| `version` | `1` | `dsh_plugin_packages` 的 schema 版本 |
| `packages` | 數組 | 本次請求的完整存活集合 |
| `packages[].name` | 字符串 | 來自所屬 manifest（元數據清單）的確切非空 npm 包名 |
| `packages[].version` | 字符串 | 來自同一 manifest 的確切非空包版本 |

每個請求都會重新讀取宿主樹中的存活非分組 Loader 配置項；請求會話存在 standing agent-preset 樹時，也會讀取該樹。相對與絕對模塊使用距離自身最近的所屬 manifest；裸包配置項使用激活自身的 Loader 解析基準。具名 manifest 未提供非空版本時，請求準備會失敗。

發送方會對確切 `(name, version)` 組合去重，并使用與 locale 無關的文本比較，先按 `name`、再按 `version` 排序。同一包的多個同時存活版本會保留為獨立配置項。接收方不得按包名折疊該數組，也不得根據數組順序推斷包的激活關系。

該清單不包含已禁用、pending、failed、unloading、disposed 和結構性 Loader 配置項。普通依賴、沒有具名所屬包的松散模塊、以編程方式掛載的子 fiber，以及內存動態插件也不在其中，因為它們沒有權威的 Loader 包來源信息。

清單已啟用但沒有符合條件的配置項時，系統發送 `packages: []`；禁用貢獻插件時，系統省略整個 `dsh_plugin_packages` 字段。包身份屬于提供方元數據，絕不進入模型輸入。

## `dsh_session_log`

[`@deepseek-ai/dsh-session-log-deepseek`](../packages/session/session-log-deepseek/README.zh.md) 貢獻權威會話日志的一段連續后綴。該字段默認禁用。啟用后，它適用于攜帶存活會話且至少存在一個事件的請求；直接請求、陳舊會話 id 或空日志會省略該字段。下方示例使用邏輯 Session 格式 2 僅為說明協議字段，并不標識[當前寫入格式](session-format-status.zh.md)。

```json
{
  "dsh_session_log": {
    "version": 2,
    "sessionFormatVersion": 2,
    "session": {
      "version": 2,
      "id": "session-id",
      "createdAt": 1780000000000,
      "isSeeded": false
    },
    "afterSeq": -1,
    "throughSeq": 0,
    "events": [
      {
        "type": "turn/start",
        "seq": 0,
        "time": 1780000000001,
        "data": {
          "turn": 1
        }
      }
    ]
  }
}
```

| 成員 | 類型 | 含義 |
|---|---|---|
| `version` | `2` | `dsh_session_log` 的 schema 版本 |
| `sessionFormatVersion` | 非負整數 | 該后綴所表示的 Session 格式 generation |
| `session` | 對象 | 當前 Session header 的不可變協議投影 |
| `afterSeq` | 整數 | 本次請求前記錄為已接受的最大序號，或 `-1` |
| `throughSeq` | 非負整數 | 本次請求所表示的最大序號 |
| `events` | 數組 | 從 `afterSeq + 1` 到 `throughSeq` 的連續事件 |

首次上傳使用 `afterSeq: -1`，并攜帶當前的完整日志。此后每次上傳都從同一會話 id 的最大已接受水位（watermark）之后開始。發送方為每次請求僅快照一次事件數組；快照后的追加內容屬于后續請求。

### Session 協議 header

`session` 成員投影 `Session.header`，既不是完整的運行時 Session，也不是 header 對象本身。它復制當前 header 事實，包括必需的 `isSeeded` 譜系位；精確的 `Session.inheritedEventCount` 不屬于該請求字段。外層 `dsh_session_log.version` 選擇本擴展 schema，`session.version` 則選擇邏輯 Session 格式。即使嵌入的邏輯格式同時變化，只要 Session header 投影變化，擴展 schema 也必須升版。

| 成員 | 出現條件 | 含義 |
|---|---|---|
| `version` | 必需 | 來自 `Session.header` 的邏輯 Session 格式版本；見[格式狀態](session-format-status.zh.md) |
| `id` | 必需 | 確切的會話 id |
| `createdAt` | 必需 | 非負安全整數 Unix epoch 毫秒數 |
| `cwd` | 可選 | 創建會話時記錄的絕對工作目錄 |
| `parentSession` | 可選 | fork 的父會話 id |
| `isSeeded` | 必需 | Session 是否包含 fork 繼承的事件前綴 |
| `origin` | 可選 | subagent 子項使用的字面值 `subagent` |
| `delegationDepth` | 可選 | 持久化的非負 subagent 委派深度 |
| `agentPreset` | 可選 | 用于組合該會話的 agent preset id |

### 權威事件信封

每個 `events` 元素都是完整的權威 `SessionEvent`，不依賴任何其他請求字段。事件始終攜帶 `type`、`seq`、`time` 與 `data`；它可以攜帶 `ignorable: true`，展示事件還可攜帶 `sourceEventSeqs` 與 `surfaceOp`。發送方會復制每個已有成員，不執行投影、脫敏或重建。

### 接受水位與至少一次交付

端點返回 HTTP 2xx 后，該貢獻會向同一會話追加以下權威事件：

```json
{
  "type": "session-log-deepseek/delivery-accepted",
  "seq": 8,
  "time": 1780000000002,
  "data": {
    "sessionId": "session-id",
    "sessionFormatVersion": 2,
    "throughSeq": 7
  }
}
```

`delivery-accepted` 表示已配置端點為包含該字段的 LLM 請求返回 HTTP 2xx。它不表示 SSE 已完整結束，也不表示遠端已經持久化。該事件的 `throughSeq` 必須標識一項更早的事件，`sessionId` 標識已發送后綴所屬的 Session，`sessionFormatVersion` 則把水位綁定到該邏輯 generation。缺少該字段表示歷史格式 v0。

發送方只會為當前 Session id 與格式 generation 折疊最大的匹配 `throughSeq`，因此并發已接受請求無法使游標倒退，其他 generation 的水位也不能授權當前后綴。恢復后的進程會從持久日志重建游標。fork 會忽略命名其他 Session 的繼承水位，因此先發送自身完整的繼承前綴，再以子會話 id 推進。水位事件自身屬于下一段未發送后綴。

傳輸失敗和非 2xx 響應不會追加水位。端點接受后、本地持久化前發生崩潰時，系統可能重新發送已接受范圍；不確定性只會產生重復，絕不會產生序號缺口。系統沒有獨立上傳存儲、大小上限或截斷路徑。

## 暴露內容與接收方要求

請求標頭會暴露 Harness 應用版本、一個匿名 Harness-home 身份和可選的會話身份。`dsh_plugin_packages` 會暴露存活 npm 包的名稱與版本。啟用后，`dsh_session_log` 可能暴露會話工作目錄、系統提示詞快照、用戶與 Assistant 內容、嵌入式 Assistant stream、失敗 attempt 輸出、工具參數與結果、壓縮摘要、反饋和插件持有的事件。適配器 API key 不是會話事件，因此不會進入該字段。通過 `baseURL` 選擇的網關會收到與官方端點相同的值。

接收方按名稱定位擴展字段，按各字段自己的 `version` 分派，保留不同的包版本，并忽略 JSON 成員順序。會話日志接收方必須先校驗連續序號范圍，再解釋事件類型。遇到不帶 `ignorable: true` 的未知權威事件時，接收方無法進行無損重建。即使缺少注冊表或某項貢獻，基礎請求仍然可用；字段缺失表示該項貢獻不適用于本次請求。
