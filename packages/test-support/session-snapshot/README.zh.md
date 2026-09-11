---
description: "面向無密鑰 profile 測試的會話日志快照支持：manifest（元數據清單）、身份脫敏、規范化、workspace 檢查與協議適配器。"
kind: "package-library"
---

# @deepseek-ai/dsh-session-snapshot

[English](README.md) | 中文

## 概述

`dsh-session-snapshot` 提供無密鑰已記錄會話測試（`pnpm run test:snapshot`）背后的共享支持：封閉 manifest、類型化身份脫敏、規范化、workspace 比較、fixture（測試前置數據）保護，以及 headless、SDK、ACP（Agent Client Protocol）與 Web owner 使用的協議適配器。ACP 適配器以真實子進程啟動被測 profile，驅動確定性輸入腳本，并注冊完整的錄制、回放與刷新套件。每個場景都提交足夠證據來證明模型可見輸出與文件系統效果，不依賴 agent（智能體）自述。包入口會導入 vitest，因此只能在 vitest 運行中使用。

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

本包把隨附 profile 場景變成無密鑰快照套件：寫一張場景表和一個 fixture 目錄，調用一次匹配的適配器，工具包就負責啟動或組合 profile、驅動場景、比較規范化輸出并守護已提交的 fixture。

### 編寫快照套件

消費方 `*.snapshot.ts` 就是場景表加一次工廠調用。`AgentUnderTest` 提供絕對 `binScript`、可選 `libBinScript`、`configPath` 與 `tsconfigPath` 路徑，因為子進程 cwd 位于倉庫之外：

```ts
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  defineAcpSnapshotSuite,
  type Scenario,
  type SnapshotSuiteOptions,
} from '@deepseek-ai/dsh-session-snapshot'

function snapshotMode(value: string | undefined): SnapshotSuiteOptions['mode'] {
  switch (value) {
    case undefined:
    case '':
    case 'replay': return 'replay'
    case 'record': return 'record'
    case 'refresh': return 'refresh'
    default: throw new Error(`unknown DSH_SNAPSHOT mode: ${value}`)
  }
}

const SCENARIOS: Scenario[] = [
  { name: 'text-turn', hasModelTurn: true, recorded: true, pinsHeader: true },
]

defineAcpSnapshotSuite({
  agent: { // absolute paths, resolved from the suite's own location
    binScript: fileURLToPath(new URL('../../../apps/cli/src/bin.ts', import.meta.url)),
    configPath: fileURLToPath(new URL('../cordis.yml', import.meta.url)),
    profile: 'acp',
    tsconfigPath: fileURLToPath(new URL('../../../tsconfig.json', import.meta.url)),
  },
  snapshotsDir: join(dirname(fileURLToPath(import.meta.url)), 'snapshots'),
  scenarios: SCENARIOS, // exactly one entry per header class sets pinsHeader
  mode: snapshotMode(process.env.DSH_SNAPSHOT),
})
```

每個已記錄 Session 目錄攜帶封閉的 `snapshot.yml` manifest，以及規范 parent 與連續 child 角色。parent 文件名是 `session[.vN].jsonl`；child 是 `session.<ordinal>[.vN].jsonl`；v0 省略 `.v0`，正版本使用小寫 `.vN`，且每個文件名與其 header 一致。一個角色可以保留舊 generation，但 harness 會選擇數值最高的一項。擁有 fixture 的 manifest 可以聲明 `sessionFormat.version` 與一個或多個封閉 `coverage` 名稱，把該歷史 generation 保留為顯式遷移 fixture；省略此字段時跟隨當前 writer。manifest 還會指名場景、隨附 profile、組合／header 類別、錄制來源，以及已完成 Session 無法重建的 replay、平臺、權限、環境、workspace 或輸入事實。存儲保護檢查每個選定 parent 與 child 角色的工具結果和可移植路徑。提示詞／schema 擦除、消息身份及提示詞先于請求的順序檢查適用于當前 generation；保留的前代維持其歷史表示。適配器注冊預期輸出、Session 日志與可選 `workspace.expected/` 比較；保護會拒絕遺留目錄、缺失角色、非規范名稱、絕對路徑、格式錯誤的 manifest 與平臺專用分隔符。

`normalizeSessionSnapshot` 在規范化路徑并擦除系統提示文本與工具 schema 后，會保留完整 Session header 與事件 payload，但從已提交 fixture 中省略頂層 `seq`/`time` envelope；它還會規范化嵌入式 stream clock 與歷史 packed-row 的 `seq0`/`time0` envelope 與 catalog child 創建時鐘。事件順序與來源事件引用保持不變。Replay 只在內存中合成頂層 envelope，而運行時持久化仍寫入完整日志。多 Session 比較會先通過嚴格的構建期靜態 Session 格式目錄校驗預期日志與收集日志，再進行身份脫敏與規范化；來源文件名不能改變格式校驗。保留的歷史 replay 輸入不是原生當前格式 writer 輸出的比較基準：結構遷移保留請求含義，但可以產生不同的事件布局。歸一化保留意外的 request-header 字段（包括 `system`），使回歸保持可見。無版本的協議適配器單元測試 fixture 不屬于已發布 Session 格式語料。[當前寫入器格式](../../../docs/session-format-status.zh.md)的 fixture 每個事件占一行；保留的 v0/v1 fixture 可以使用規范 packed row。[臨時倉庫遷移器](../../../scripts/migrate-packed-session-fixtures.ts)（`pnpm run migrate:packed-session-fixtures`）會改寫更舊的歷史布局，由其[移除提案](../../../.agents/notes/proposed/process/2026-07-26-remove-packed-session-fixture-migrator.zh.md)負責刪除該遷移器。

spill 場景通過真實本地提供方保存到私有臨時根目錄。fixture 適配器提供固定長度的邏輯定位符，并僅將本次運行已保存的定位符映射回實際文件以供檢索，在不寫入共享邏輯路徑的情況下保留預覽預算。已知的快照 spill 路徑會規范化為穩定的定位符 token，包括 JSON 省略通知中帶引號、使用 JSON 轉義 Windows 分隔符的路徑。刷新提取會保留匹配路徑的序列化寫法，以便進行字面替換。規范化只改變定位符：保存字節數與省略計數仍作為比較證據。

保留歷史輸入的場景保持規范 Session 文件不變，并繼續選擇它們進行回放；固定歷史版本的目錄中沒有更新的規范同角色文件。其精確的規范化原生當前格式輸出單獨記錄在父會話的 `writer.expected.jsonl` 和子會話的 `writer.<ordinal>.expected.jsonl` 中；這些是輸出比較基準，而非 replay 代際。保留歷史輸入的 SDK 場景使用 `notifications.current.expected.jsonl` 記錄當前協議輸出。比較既不將當前事件反向投影為歷史格式，也不剝除結構差異。獨立遷移測試驗證正式轉換，而不把原生 writer 布局當作其預期事件序列。

### 錄制、回放與刷新

`pnpm run test:snapshot:record` 調用在線 LLM（大語言模型），并在規范具名版本文件下寫入收集到的當前 generation。record 與 refresh 絕不重命名或刪除已完成的 generation，即使后續運行不再產生某個 child 角色也一樣；受審閱的源樹整理只有在同角色存在已驗證的當前替代文件后才移除前代。顯式聲明 `sessionFormat` 的場景在錄制模式下保持只讀。`pnpm run test:snapshot:refresh` 保持無密鑰，運行選定的最高 replay 輸入，并寫入 stdout、各 pin 自有的提示詞與工具 schema 伴隨文件，以及新鮮當前 generation 的可比較 Session 輸出；保留歷史輸入的場景寫入單獨的 writer 輸出比較基準，而非規范當前格式 replay 代際。每個組合 owner 把 replay patch 放在 live patch 旁；頂層 `snapshots/` 擁有 Session 驅動場景，其他預期輸出留在其 package owner 旁。[`dsh-llm-replay`](../llm-replay/README.zh.md) 提供通過 `DSH_SNAPSHOT_*` 環境值選擇的已記錄流。

### 固定請求 header 與系統提示

每個 pin 默認擁有其生成的 `system-prompt.expected.md` 或 `tool-schemas.expected.json` 伴隨文件；當完整的對應序列相同時，`systemPromptSource` 與 `toolSchemasSource` 指定另一個 pin 作為來源，因此每個不同版本只提交一次。系統提示是 surface 節點 0，作為 `system/message` 事件記錄在該步驟第一個 `request/header` 之前；每個 fixture 把其文本塊存儲為 `"text":"{{system}}"`，提示詞伴隨文件保留完整文本。該 pin 的 `request/header` 事件存儲 `"tools":"{{tools}}"`，同時保留配置與原因，結構化 schema 伴隨文件保留完整目錄。自身作用域組合出不同請求的 child Session 按 fixture 索引以 `pinsChildToolSchemas` 與 `pinsChildSystemPrompts` 單獨聲明。運行中改變請求 header 的場景聲明 `expectedHeaderChanges`；運行中提示詞發生變化的場景——替換節點 0，或在 `in-history` 路由上追加到已緩存歷史之后——聲明 `expectedPromptChanges`，每次變化在提示詞伴隨文件中增加一個 `<!-- system/message change N -->` 小節。manifest 中對應字段為 `header.changes` 與 `header.promptChanges`。

### 平臺與組合變體

需要非 Windows 主機的場景聲明 `posixOnly`，在 Windows 上跳過運行測試，但 fixture 保護仍在所有平臺覆蓋其已提交文件；組合需要可用 `pwsh` 的場景聲明 `pwshOnly`。當臨時目錄授權自身待測時，`workspaceParent` 將生成子級 cwd 移出平臺臨時區域；場景簽入的 `workspace/` 會先復制到該子級，隨后 `prepareWorkspace` 在 agent 啟動前針對生成 cwd 運行。默認生成的 workspace 在會話 fixture 中存儲為 `{{cwd}}`，使平臺臨時根目錄與隨機 basename 不影響錄制。headless manifest 在測試 Session workspace 授權本身時使用 `workspace.parent: outside-temp`。適配器在父目錄可寫且位于系統臨時授權之外時，于平臺臨時根目錄旁分配目錄，否則使用 home，并拒絕已被自動臨時寫授權覆蓋的生成 cwd。

### 可能出什么問題

- **子會話輪次等待失敗**——即使首次日志收集就超過期限，`waitForSubagentTurnEnd` 也會指出子會話、目標輪次與等待期限，并通過錯誤的 cause 保留底層失敗。
- **fixture 保護拒絕已提交文件**——遺留場景目錄、缺失文件、一個 header 類別包含多個 pin、重復的伴隨文件內容、未擦除的提示文本或工具 schema、沒有前置 `system/message` 的 `request/header`，以及格式錯誤的 pin header 都會在比較運行前使套件失敗。
- **會話收集需要原始 JSONL mode**——快照配置使用 JSONL 后端的 `compression: 'none'`；壓縮 JSONL 沒有快照收集路徑。
- **構建 mode 需要當前產物**——選擇 `DSH_EXAMPLE_MODE=lib` 前先運行 `pnpm run build`；源 mode 仍是零構建路徑。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋工具包的設計；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計

共享核心擁有 manifest、generation 限定角色選擇、workspace 設置／比較、類型化身份映射、normalizer 與 fixture 不變式。ACP 適配器增加四個可組合層：launcher、場景 harness、normalizer 與 suite factory。`launchAcpTestAgent` 在 tsx 下啟動源碼 profile，或在普通 Node 下啟動已構建 `lib` profile，通過原始字節 stdout tee 連接 SDK client，收集 Session update 與 stderr，默認拒絕未處理的權限請求，并負責關閉。`runScenario` 驅動 ACP JSON-RPC stdio，并收集每個 Session 目錄中數值最高的持久原始 JSONL generation。純 normalizer 把 cwd 路徑與類型化身份變為穩定 token，將時間歸零、展開物理來源區間，并擦除系統提示詞文本與工具 schema bulk。`defineAcpSnapshotSuite` 注冊比較、generation 限定 fixture 回寫與實時一致性保護。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/launcher.ts`](src/launcher.ts) | 子進程/客戶端啟動器與關閉所有權 |
| [`src/harness.ts`](src/harness.ts) | 腳本化場景驅動與會話日志收集 |
| [`src/manifest.ts`](src/manifest.ts) | 封閉 `snapshot.yml` schema、收集與歸屬規則 |
| [`src/session-files.ts`](src/session-files.ts) | 規范 parent/child generation grammar、header 一致性與最高角色選擇 |
| [`src/identity.ts`](src/identity.ts) | 跨父子日志的類型化首次出現身份 token 化 |
| [`src/normalize.ts`](src/normalize.ts) | 純規范化器與擦除輔助 |
| [`src/workspace.ts`](src/workspace.ts) | 場景 workspace 設置與完整預期狀態比較 |
| [`src/suite.ts`](src/suite.ts) | 場景表套件工廠、fixture 保護、錄制/刷新回寫 |
| [`src/index.ts`](src/index.ts) | 再導出四個層的包入口 |
| — | 不發布運行時不變式伴生入口；該測試支持包不擁有任何生產事件流或可變數據；消費它的測試套件會檢驗該工具包。 |

### 數據流

場景在啟動器下運行 agent，通過 harness 向它喂入輸入腳本，并捕獲 stdout 與持久化日志。規范化器把捕獲內容規范化——id 轉為首次出現序列、生成 cwd 轉為 `{{cwd}}`、`system/message` 文本轉為 `{{system}}`、header 工具 schema 轉為 `{{tools}}`——使已錄制與本次運行可以結構化比較。隨后工廠把規范化 stdout 與重新持久化日志同已提交 fixture 比較，或在錄制/刷新模式下回寫它們；其保護在任何比較結果被采信之前就拒絕畸形或漂移的 fixture。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從快照工具包逐步進入模型 fixture 來源、啟動機制與要求該層級存在的策略。

- [llm-replay](../llm-replay/README.zh.md)——回放模式消費的無密鑰模型 fixture 來源。
- [loader-smoke](../loader-smoke/README.zh.md)——啟動器所依賴的模式感知子進程啟動機制。
- [測試策略](../../../docs/testing.zh.md)——無密鑰快照層、其適用時機與 fixture 歸屬規則。
- [test-support 組地圖](../README.zh.md)——兄弟 harness 與支持包。

-----

<a id="model-experience"></a>
## 模型體驗

無。該測試專用支持會記錄、規范化并比較 profile 會話，不會改變 agent 組裝的模型請求。

#### KV Cache 影響

無；本包既不組裝也不發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明何時需要對該工具包特別小心。它們是當前包約束，不是任務積壓。

- **會話收集需要原始 JSONL mode**——`runScenario` 收集持久化 `.jsonl` 日志，因此快照配置使用 JSONL 后端的 `compression: 'none'`；壓縮 JSONL 沒有快照收集路徑。
- **構建 mode 需要當前產物**——選擇 `DSH_EXAMPLE_MODE=lib` 前先運行 `pnpm run build`；源 mode 仍是零構建路徑。
- **ACP 繼續覆蓋協議行為**——刺激來自 ACP 客戶端的取消與權限往返留在該適配器；組裝式一次性行為與持久控制行為使用 headless 與 SDK 適配器。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
