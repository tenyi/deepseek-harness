# 開發指南

[English](development.md) | 中文

搭建教程引導新貢獻者從準備前置條件開始，直到檢出目錄通過檢查。后面的貢獻者參考介紹倉庫布局、日常工作流和 CI 組織方式。設計依據與實現細節屬于鏈接的 Agent Note 和腳本。

<a id="setup-tutorial"></a>

## 搭建教程

### 前置條件

- Node.js 支持 22.19+ 與 24+。CI 覆蓋 22.19、24 和 26；見 [Node 引擎下限 Agent Note](../.agents/notes/implemented/process/2026-07-06-node-engine-floor.zh.md)。
- 啟用了 Corepack 的 pnpm。倉庫在 `package.json` 中固定使用 `pnpm@11.7.0`；如果 `pnpm --version` 無法通過 Corepack 解析，請先運行 `corepack enable`。
- Git 2.26 或更高版本；鉤子設置會啟用 Git 的 worktree 專屬配置擴展。
- 可選：一個 DeepSeek API key，用于 Web、headless 和 ACP（Agent Client Protocol）自動化 agent（智能體）演示以及真實 API 的 e2e 測試。

### Windows 與 WSL 2

在 Windows 上，可以使用原生工具開發，也可以通過 WSL 2 使用 Linux 環境。WSL 2 既可用于驗證 Linux 行為，也可在原生依賴編譯或文件系統權限阻礙 Windows 開發時提供使用 Linux 工具鏈的途徑。每種環境都需要準備相應的運行時、編譯工具和權限；WSL 是可選項。

將檢出目錄、已安裝的依賴和工具鏈放在同一操作系統環境中。使用 WSL 2 時，將檢出目錄放在 Linux 文件系統中；使用 Windows 原生工具時，則使用 Windows 文件系統。跨兩種文件系統訪問會給 Git、依賴安裝和構建等 I/O 密集型操作增加開銷。參見微軟的[文件存儲與性能指南](https://learn.microsoft.com/en-us/windows/wsl/filesystems#file-storage-and-performance-across-file-systems)。

在每種環境中分別安裝依賴，因為不同操作系統使用的原生二進制和鏈接可能不同。測試結果適用于執行測試的環境；Windows 特有行為仍需在原生 Windows 上驗證。

### 首次搭建

在倉庫根目錄安裝依賴：

```sh
pnpm install
```

安裝過程還會通過 `scripts/install-lefthook.mjs` 配置 worktree 本地的 Lefthook 鉤子和 `dsh-translation-pairing` Git 合并驅動。[worktree 本地鉤子 Agent Note](../.agents/notes/implemented/process/2026-07-27-worktree-local-lefthook.zh.md) 負責鉤子路徑的安全約定；[自動配對合并 Agent Note](../.agents/notes/implemented/process/2026-08-08-automatic-translation-pairing-merges.zh.md) 負責合并驅動。

如果依賴是從緩存恢復或 `postinstall` 被跳過而導致任一集成缺失，請手動安裝：

```sh
node scripts/install-lefthook.mjs
```

如果包裝腳本拒絕現有 Git 配置或報告陳舊鎖，請遵循其診斷和所鏈接的 Agent Note，不要憑猜測編輯 worktree 元數據。移動檢出目錄后，請重新運行包裝腳本以重新生成自有路徑。

新克隆后請先運行一次類型檢查：

```sh
pnpm run typecheck
```

`pnpm run typecheck` 成功退出即表示搭建完成。

## 貢獻者參考

<a id="typescript-project-layout"></a>

### TypeScript 項目布局

倉庫使用相互隔離的 Host 與 Client aggregate。普通包只登記進其中一個 aggregate；Host 包進入 `tsconfig.host.json`，Client 包進入 `tsconfig.client.json`；`host/webserver`、`compaction/compaction` 與 `typert/registry` 三個包被兩個 aggregate 同時引用，作為共享 leaf，讓兩側對同一份源碼做類型檢查。

| 文件 | 角色 | 是否構成 program？ |
|---|---|---|
| `tsconfig.json` | solution 根：`extends` base、`files: []`、引用兩個 aggregate。它是 tsserver 發現入口，也是顯式執行整張 Project Reference 圖時的入口；經繼承的 `paths` 充當 tsx 運行 `scripts/` 時的解析配置。 | 否 |
| `tsconfig.host.json` | Host aggregate：Host 包、示例、測試、腳本和 website，以及 `api/remotes` 的 Host 特例 project。 | 是 |
| `tsconfig.client.json` | Client aggregate：`packages/client/*` 包及其測試、`apps/web`，以及 `api/remotes` 的 Client 特例 project。 | 是 |
| `tsconfig.base.json` | 共享 compilerOptions 與源碼 `paths` 映射。同時是各 vitest 配置讓 vite-tsconfig-paths 指向的解析門面：它沒有 `include`，因此其 `paths` 適用于任何 importer。 | 否 |
| `tsconfig.base.client.json` | 瀏覽器編譯設置（`jsx`、DOM lib、`types: []`），由 Client aggregate 和每個 `packages/client/*` 包 extends。 | 否 |

Host 與 Client 保持兩個 aggregate program，是因為兩側在相同鍵下以不同服務對 cordis `Context` 接口做聲明合并；單一 program 同時看到兩份合并會報沖突。這種沖突只存在于 `ts.Program` 內部——模塊解析永遠不會觸發它——所以 solution 可以同時引用兩個 aggregate，一個 paths 門面也可以橫跨兩側。由此推出三條紀律：

- `tsconfig.base.json` 永不添加 `include` 或 `files`：它們會泄漏進每個 extends 它的包項目，并收窄門面的全匹配范圍。
- 構造全倉 `ts.Program` 的腳本顯式以 `tsconfig.host.json` 或 `tsconfig.client.json` 為種子——根 solution 永不作為種子，因為把兩個 aggregate 展平進一個 program 會撞上 `Context` 合并沖突。
- 新包只登記進一個 aggregate；只有上述拆分包同時攜帶兩個 leaf 配置，共享 leaf 因兩側需要對同一份源碼做類型檢查而登記進兩個 aggregate。包同時具有 Node loader 入口和 browser 入口并不構成拆分理由；普通 Client 插件的兩份運行時產物都在 Client 構建階段生成。

拆分 Host/Client tsconfig 的包有六個：`api/remotes`、`api/gateway`、`api/session-controller`、`api/workspace-controller`、`client/connection` 與 `session-query/session-log-export`。`api/remotes` 的 Host 入口進入 Host Typert 圖，而 Client 入口導入生成的 `/remote` 聲明；`session-log-export` 則讓 Node archive 生產代碼不進入瀏覽器 controller。每個拆分包根 `tsconfig.json` 因此只作為 solution，兩個 aggregate 和直接消費方分別引用 `tsconfig.host.json` 或 `tsconfig.client.json`。workspace `constraints` 門禁遍歷可達的 Project Reference 圖，并按各引用 project 自身的 compiler face 檢查：只有單一配置的目標可由任一 face 引用，拆分配置的目標則必須引用匹配的 leaf，不得引用 solution 根或另一側 leaf；該門禁按「兩個 leaf 配置同時存在」自動發現拆分包，所以新拆分的包會自動納入管轄。[`api-remotes` README](../packages/api/remotes/README.zh.md) 與 [`session-log-export` README](../packages/session-query/session-log-export/README.zh.md)分別說明其拆分。

根構建按生成依賴排序：

```sh
tsc -b tsconfig.host.json
tsdown --env.DSH_BUILD_FACE host
tsc -b tsconfig.client.json
tsdown --env.DSH_BUILD_FACE client
pnpm run build:web
```

兩次 tsdown 都使用同一組完整 workspace 匹配，不掃描構建產物來發現 Client 包，也不維護 Host/Client 包過濾表。包內 tsdown 配置根據 `DSH_BUILD_FACE` 決定當前階段的入口：普通 Client 插件在 Client 階段同時生成 Node loader 與 browser bundle；`api-remotes` 通過 `hostPhase: true` 提前生成 Host 入口，再在 Client 階段只生成 browser bundle。tsdown 只消費 `lib/types` 中由前置 tsc 發射的 JavaScript。

Typert 只在 Host tsdown 中以 `tsconfig.host.json` 為種子運行。它分析 Host 類型并生成 Host 反射產物及 Host-for-Client Remote 投影；Client tsdown 不啟動 Typert。`pnpm run typecheck` 因此先執行完整 Host lib 階段，再運行 Client tsc；`pnpm run build` 繼續執行 Client tsdown 和 Web 構建。

`pnpm run build` 會內聯根包版本、七位源碼 commit，并在 Git 報告本地變化時內聯 dirty 標記；調用方提供的其他 `DSH_CLIENT_*` 值也會被繼承。`pnpm run build:official` 是與 CI 和 release 產物構建等價的跨平臺本地命令，并省略本地 dirty 標記。每次完整構建成功后都會寫入一份被 gitignore 的記錄，把精確公開值與 Vite 輸出及動態 client bundle 綁定；release 打包和 built Web 測試會拒絕缺少記錄或被后續局部構建改動的產物。`pnpm run dev:web` 仍需要先執行完整構建來準備產物樹，但會在啟動時讀取一次當前版本和 Git 狀態，并在本次會話的所有 watcher stage 之間共享該環境；它不會校驗完整構建記錄，因為 watcher stage 會重寫記錄覆蓋的產物。

靜態分析和測試通過 base 的 `paths` 映射把工作區 import 解析到 `src`，且必須在干凈樹上通過；消費構建產物 `lib/` 的門禁顯式聲明該依賴。生成的 Host-for-Client Remote 聲明是有意設置的例外：公共 `typecheck`、`lint` 和 `doc-typecheck` 命令會先生成這些聲明，而內部 `*:contracts-ready` 腳本假定調用它的公共命令或調度器門禁已經依賴 Typert 約定生成階段或完整構建。tsc-first 發射職責見 [ts-build-config Note](../.agents/notes/implemented/process/2026-06-17-ts-build-config.zh.md)，門禁準備約定見 [Typert Remote Agent Note](../.agents/notes/implemented/architecture/2026-08-02-typert-remote-method-calls.zh.md)。

業務服務在 Host 使用 `@Remote` 或 `@RemoteScope` 聲明可調用方法；Host 構建生成 Host-for-Client 類型與運行時貢獻，Client 的 `api-remotes` 組合加載這些貢獻并掛到 `ctx.remote` 與作用域 `agentCtx.remote` namespace。兩側的生成產物、裝配關系、SRC 開發回退和 Web 構建順序見 [API Gateway](api-gateway.zh.md)。

如果相關的本地檢查需要使用構建后的包產物，請先構建一次：

```sh
pnpm run build
```

`pnpm run hygiene` 包含 `publint`（用構建出的 `lib/*.js` 文件校驗包入口點）和 `verify-node-next-types`（用一個臨時的 NodeNext 消費方校驗構建出的聲明文件）。新 worktree 在 `pnpm run build` 運行之前沒有打包的 JS 和聲明文件；普通提交和推送無需構建，除非所選檢查會使用這些產物。

### 環境變量

真實的 DeepSeek 適配器和需要密鑰的 agent 演示從環境變量或倉庫根目錄一個被 gitignore 的 `.env` 文件讀取憑證：

```sh
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_BASE_URL=https://... # optional
```

`DEEPSEEK_BASE_URL` 可選，默認為公開 API。請勿提交真實憑證。未設置 `DEEPSEEK_API_KEY` 時，真實 API 的 e2e 套件會自動跳過。

### Git 集成

當兩種語言的文件都使用 Git 默認文本策略且能干凈合并時，配對合并驅動會根據已確認的祖先、當前和另一側的配對文檔 blob，推導出發生沖突的 `.i18n.yaml` 記錄。配對文檔發生沖突、存在非文本合并配置或記錄無效時，它會拒絕處理并保留沖突；如果合并已經因沖突而停止，請運行 `pnpm run resolve-translation-pairing-conflicts`，該命令會暫存每份可安全生成的配對記錄；如果其他配對沖突仍需手工處理，則以非零狀態退出。[雙語文檔約定](i18n/README.zh.md#the-pairing-contract)列出該驅動接受的確切文件和狀態。

安裝腳本在發布 worktree 配置前，會探測確切的 Node/tsx 驅動入口點。如果該運行時之后變得不可用，不依賴 Node 的啟動器會寫入 Git 的普通文本合并結果、讓伴隨文件保持未解決狀態，并打印恢復路徑；請恢復依賴后運行 `pnpm run resolve-translation-pairing-conflicts`，或運行 `git merge --abort`。如果 `pre-merge-commit` 拒絕原本能干凈完成的合并，Git 會把完整結果留在暫存區但不創建提交；請修復失敗后運行 `git commit`，或中止合并。確切的索引與 `MERGE_HEAD` 狀態由[自動配對合并 Agent Note](../.agents/notes/implemented/process/2026-08-08-automatic-translation-pairing-merges.zh.md#failure-contract)負責記錄。

lefthook 在 `lefthook.yml` 中配置，作為快速的本地檢查點：

- `pre-commit` 對照暫存的配對文檔 blob 校驗暫存的配對記錄，使用不加載項目的 `.oxlintrc.staged.json` 配置驗證暫存文件，并通過一次有界重試應用 Oxlint 修復，在暫存文件屬于 `THIRD_PARTY_NOTICES.md` 的輸入時重新生成該文件，然后檢查暫存 diff 中的空白錯誤，并運行 vendor manifest（元數據清單）守衛；
- `pre-merge-commit` 在 Git 創建自動合并提交前執行同樣以索引為準的配對檢查；
- `pre-push` 運行 `pnpm run typecheck`；該命令會先完成包含 Typert 約定生成的完整 Host lib 階段，再運行 Client TypeScript 檢查。

vendor manifest 守衛檢查 `vendor/*/src` 下的改動是否連同對應的 `vendor/README.md` manifest 更新一起暫存。請在編輯 vendor 代碼前先閱讀 `vendor/README.md`。

除限定范圍的暫存記錄校驗外，這些鉤子有意不運行測試、快照、文檔檢查、構建或 `hygiene`。貢獻者只運行一次[與改動行為相關的檢查](../AGENTS.md#run-relevant-checks-locally)；CI 負責全量覆蓋率門禁、構建產物冒煙測試，以及 Node 22.19、24 和 26 兼容性矩陣。

貢獻者可以選擇運行 `pnpm run check:all`，執行全面的本地門禁集。該命令獨立于 Git 鉤子，也不是對 agent 的指令。

### CI 門禁

keyless [CI 工作流](../.github/workflows/ci.yml) 將獨立門禁分組到若干寬粒度 lane，并在受支持的 Node 版本上運行一組較小的兼容性檢查。產物消費方在各自 lane 內等待一次 build。必需 benchmark 在標準 GitHub 托管 Linux 上獨立運行；[benchmark 運行器決策](../.agents/notes/implemented/testing/2026-09-06-standard-hosted-benchmark-runner.zh.md)擁有路由及 job 超時。單獨的真實 API 工作流按其配置的 worker 上限運行 `pnpm run test:e2e`。當前門禁和 job 清單以 [scripts/run-gates.ts](../scripts/run-gates.ts) 和工作流文件為準。

不帶憑據的 dsh 依賴布局檢查與 dsh/vendor 打包演練僅在 `DSH_CI_FAILOVER_LINUX=selfhosted`，且事件為受信任的 master 推送或同倉庫、非 fork、非 Dependabot 拉取請求時使用現有 Linux 自托管池。其余情況（包括手動觸發）均使用 `ubuntu-24.04`；手動發布仍使用托管運行器。持久化存儲隔離與回退限制見[發布演練運行器決策](../.agents/notes/implemented/process/2026-09-06-release-rehearsal-selfhosted.zh.md)。

### 日常命令

根目錄的[貢獻者說明](../AGENTS.md#commands)概述常用命令，[`package.json`](../package.json) 與 [scripts/run-gates.ts](../scripts/run-gates.ts) 則負責當前腳本和門禁清單。請選擇覆蓋變更表面的最小檢查集。文檔變更使用 `pnpm run doc-sync`；包公開行為變更還需更新所屬 README 或 JSDoc，而基于構建產物的檢查需要先運行 `pnpm run build`。

### Profile 運行

從源碼 checkout 運行這些演示前，請單獨執行倉庫構建：

```sh
pnpm run build
```

單次運行的 Headless coding agent 需要環境變量或倉庫根目錄 `.env` 中的 `DEEPSEEK_API_KEY`：

```sh
pnpm dsh --profile headless "summarize this workspace"
```

PTC mode 演示啟用代碼式工具展示，并運行同一個 headless profile：

```sh
pnpm run demo:ptc -- "summarize this workspace"
```

### TODO 標記

請使用以下三種注釋標簽之一標記代碼中的已知問題，按緊急程度排序：

- `FIXME`：應當阻塞新版本發布的問題。除非評審者明確同意該更改可以合并，否則發布版本不應包含未解決的 `FIXME`；
- `TODO`：應當盡快修復的問題，等資源到位即可處理；
- `XXX`：也許某天會修復的問題，優先級最低，不作承諾。

請選擇與緊急程度匹配的標簽，讓瀏覽代碼的人一眼分清「發布阻塞」和「有空再說」。

<a id="documenting-types-verbatim-ts-type-equiv"></a>

### 逐字記錄類型定義（`ts type-equiv`）

[子系統](subsystems/README.zh.md)頁面會把與源碼等價的聲明及其原始 JSDoc 一并粘貼，讓讀者看到確切類型定義和源碼約定。為防止粘貼內容在源碼變化時漂移，請將其圍欄為 ` ```ts type-equiv `（而不是 ` ```ts `），并在 `scripts/type-equiv.manifest.json` 中登記它鏡像的源文件和符號：

```json
{ "doc": "docs/subsystems/session.md", "symbol": "SessionEvent", "source": "packages/core/session/src/types.ts" }
```

`pnpm run verify-type-equiv`（`doc-sync` 的一環）隨后通過 TypeScript 解析器從源碼提取該符號的聲明及其附帶的 JSDoc，并斷言代碼塊同時匹配兩者。對于不應把實現體寫進目錄的類，請使用 ` ```ts public-api ` 并設置 `"projection": "public-api"`；門禁檢查的投影會保留公共字段、構造函數、訪問器、方法以及類和成員的原始 JSDoc，同時省略實現體和私有或受保護成員。比對會忽略空白和非 JSDoc 注釋，但要求保留每條原始 JSDoc（包括成員文檔），讓讀者同時看到源碼約定和確切類型定義。該門禁按文檔、符號和投影，在主塊與 manifest 條目之間強制 1:1 對應；只有當配對 `.zh.md` 塊的完整受跟蹤圍欄序列與其無后綴兄弟文件按字節一致且順序相同時，才會復用后者的條目。`doc-typecheck` 對可編譯圍欄應用同一派生規則，同時跳過兩種源碼等價圍欄的編譯，并將其排除在 opt-out 比例的計算之外。當你改動一個已記錄的類型聲明或其 JSDoc 時，門禁會失敗直到你更新粘貼內容；當你增刪一個主塊時，請在同一個變更里更新 manifest。
