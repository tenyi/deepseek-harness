# 連接第三方記憶 MCP 服務

[English](mcp-memory.md) | 中文

這三份**默認關閉的參考配置**通過 [`@deepseek-ai/dsh-mcp-client`](../../../packages/mcp/mcp-client/README.zh.md) 將一個記憶系統連接到 DSH。請選擇其中一份，或復制相同的通用 MCP 配置項來連接其他服務器。

這些第三方配置僅作為互操作參考；收錄不代表 DeepSeek 的認可、推薦、合作關系或持續支持承諾。

## DSH 負責什么

DSH 解析選中的 Cordis overlay，啟動已配置的 stdio 命令或連接已配置的 Streamable HTTP URL，發現 MCP 工具，并以 `mcp__<serverName>__<tool>` 的形式公開這些工具。DSH **不負責** 下載服務器、初始化其數據庫、選擇模型或 embedding 提供方、創建云端賬戶、遷移提供方數據，也不監管獨立的 HTTP 服務。對于 stdio，通用客戶端會隨 DSH 插件生命周期啟動和停止子進程；對于 HTTP，上游服務必須已經運行。

stdio 橋接器在啟動子進程前會主動移除環境中名稱通常表示憑據的變量和所有 `DSH_*` 變量；其余環境變量仍會繼承。每份示例僅添加其基線所需的覆蓋項。如果某個可選的上游功能還需要其他密鑰，請將該變量添加到配置項的 `config.env`，不要把密鑰直接寫進 YAML。

## 選擇一個

| 系統 | 已測試版本 | 傳輸方式 | 上游前置條件 |
|---|---:|---|---|
| [Memorix](https://github.com/AVIDS2/memorix) | `memorix@1.3.0`（`500792cad3144142293bfbb20acb4841c9f7fcfa`） | stdio | Node 22.18+，并執行 `npm install --global memorix@1.3.0` |
| [MCP Reference Memory](https://github.com/modelcontextprotocol/servers/tree/main/src/memory) | `@modelcontextprotocol/server-memory@2026.7.4`（`6dd0a683e198783e30feabf7abaf42f925bd18b1`） | stdio | `npm install --global @modelcontextprotocol/server-memory@2026.7.4` |
| [Engram](https://github.com/Gentleman-Programming/engram) | `v1.20.0`（`ba9e46ced152c37a7cb9e576153c41995873e2fc`） | stdio | Go 1.25.10+，并執行 `go install github.com/Gentleman-Programming/engram/cmd/engram@v1.20.0`，或安裝匹配的發布版二進制文件 |

## 啟用一個

將一份 overlay 傳給 DSH：

```sh
dsh web --patch "$PWD/apps/cli/config/examples/mcp-memory/memorix.cordis.yml"
```

請將文件名替換為 `mcp-reference-memory.cordis.yml` 或 `engram.cordis.yml`。該路徑可以指向磁盤任意位置的一份復制文件。交付組合不包含任何記憶服務器，因此不傳 `--patch` 就會讓這三項全部保持關閉。

如果要跨次運行保留所選配置，請將對應文件中的單個 `insert` patch 合并到用戶 patch 層：只對一個 profile 生效則寫入 `$DSH_HOME/profiles/<name>/cordis.patch.yml`，對本機所有 profile 生效則寫入 `$DSH_HOME/cordis.patch.yml`。不要覆蓋已有文件，其中可能已經包含無關的用戶 patch。

## 提供方設置

### Memorix

```sh
npm install --global memorix@1.3.0
dsh web --patch "$PWD/apps/cli/config/examples/mcp-memory/memorix.cordis.yml"
```

Memorix 無需 LLM（大語言模型）或 embedding 服務，即可在本地啟發式模式下運行。請在 Memorix 自己的 `~/.memorix/config.toml` 或項目 `memorix.toml` 中配置可選提供方。該示例沿用 DSH 工作目錄中的 Git 項目標識，并使用 Memorix 自身的默認目錄 `~/.memorix/data`。若要覆蓋該目錄，請在啟動 DSH 前設置 `MEMORIX_DATA_DIR`。

### MCP Reference Memory

```sh
npm install --global @modelcontextprotocol/server-memory@2026.7.4
dsh web --patch "$PWD/apps/cli/config/examples/mcp-memory/mcp-reference-memory.cordis.yml"
```

該參考服務器存儲本地知識圖譜，并公開實體、關系、觀察、讀取、搜索和打開工具。它不需要模型或 embedding 服務。該示例將 JSONL 存儲在 `$HOME/.dsh-mcp-reference-memory.jsonl`，而不是已安裝的 npm 包目錄中。若要覆蓋該路徑，請在啟動 DSH 前設置 `MEMORY_FILE_PATH`。

搜索只對實體名稱、類型和觀察進行不區分大小寫的子字符串匹配，不是語義檢索。該服務器不提供 embedding、自動摘要、沖突消解或遺忘策略。

### Engram

```sh
go install github.com/Gentleman-Programming/engram/cmd/engram@v1.20.0
dsh web --patch "$PWD/apps/cli/config/examples/mcp-memory/engram.cordis.yml"
```

Engram 負責存儲和項目選擇：它默認使用 `~/.engram`，從 DSH 工作目錄檢測 Git 項目，并接受 `ENGRAM_DATA_DIR` 或 `ENGRAM_PROJECT` 作為環境覆蓋項。

## 可選的共用模型指令

如果服務器的工具描述無法可靠觸發記憶使用，請將以下簡短、與提供方無關的指令添加到你現有的模型指令中：

> 用戶要求記住某事時調用記憶寫入工具；歷史信息可能相關時，檢索記憶并使用相關結果。

這只是附加指導。示例不會替換 DSH 系統提示詞中的 persona。

## 驗證寫入、新會話召回和使用

請在整個過程中使用一個唯一值，并保持提供方的存儲范圍不變：

1. 在 DSH 會話 A 中提出：`Remember that my validation drink is lapsang-<unique suffix>.`。確認模型調用了提供方的寫入工具，并且工具返回成功。
2. 在同一個仍在運行的 Host 中創建 DSH 會話 B。不要復制會話 A 的對話。提出：`What is my validation drink? Check memory.`。確認模型調用了提供方的搜索或召回工具，并返回該值。
3. 繼續在會話 B 中提出：`Use that preference to suggest one drink for the meeting.`。確認回答使用了召回的值。

必須新建 DSH 會話，但不需要重啟 Host。MCP 子進程崩潰后會觸發帶退避的自動重連與工具重新同步；停機期間工具仍保持列出，調用只在停機期間失敗；重連預算耗盡后工具會被注銷，重連停止，直到重新加載或重啟。初始發現過程是異步的，因此發送第一條驗證提示詞前，請等待提供方的 `mcp__...` 工具出現。

## 接入其他 MCP 服務器

復制相同的條目字段，并使用唯一的 `id` 和 `serverName`：

```yaml
- insert:
    - id: memory-my-server
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: my-memory
        transport: stdio
        command: my-memory-mcp
        args: []
        env: {}
        cwd: !!js process.cwd()
```

對于遠程服務器，請改用 `transport: streamable-http`、`url` 和 `headers`。提供方專屬的安裝、身份、認證、模型、embedding、持久化和許可仍由提供方負責。
