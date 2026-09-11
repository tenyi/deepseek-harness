# `dsh` CLI（命令列介面）行為參考

[English](README.md) | 中文

本參考定義 profile 啟動、web 別名、插件管理和設定 dump 等命令模式。argv 由 [`src/args.ts`](../src/args.ts) 統一解析一次，[`src/bin.ts`](../src/bin.ts) 只會動態導入選中的執行器。

<a id="profile-boot"></a>

## Profile 啟動

`dsh --profile <name>` 啟動位於 `$DSH_HOME/profiles/<name>` 的 profile。生效設定樹以空根節點為起點，依次疊加 profile manifest（元資料清單）的 `dsh.profile.bundles` 列表中指定的各組合包 patch、profile 自身的 `cordis.patch.yml`、home 級的 `$DSH_HOME/cordis.patch.yml`（這是各 profile 共享的機器本地偏好，因此優先於逐 profile 設定層），以與按 argv 順序指定的各個 `--patch <path>` 覆蓋層。對同一設定行，后應用的層優先。patch 會替換目標行的整個 `config` 值，而不是深度合并其中的鍵；patch 也可以插入新行。`dsh.profile.patchReload` 可選擇 `live` patch 檔案監視或 `startup` 單次加載；自定義 profile 省略該值時預設使用 `live`。設定解析、schema 校驗、模塊解析或插件啟動失敗時，系統會報告錯誤并以非零狀態退出。收到 SIGINT 或 SIGTERM 時，掛載的根節點會先 dispose（資源釋放）再退出。

組合包名稱先從 dsh 安裝目錄解析，再從 profile 目錄解析。因此，內置組合包（`@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app`、`@deepseek-ai/dsh-headless`、`@deepseek-ai/dsh-sdk-app`、`@deepseek-ai/dsh-sdk-minimal`、`@deepseek-ai/dsh-acp-app`）始終來自當前執行的 `dsh` 所屬的安裝；樹外組合包則來自 profile 中由 pnpm 管理的 `node_modules`。patch 行中的裸插件 `name` 會從 profile 目錄開始，按照 Node 的模塊解析規則逐級向父目錄查找，直至由 dsh 維護的安裝后備目錄 `$DSH_HOME/profiles/node_modules`。普通 Node 安裝會為依賴閉包中的每個包放置并修復一個符號連結。pkg 可執行程序則放置真實 ESM 代理，鏡像顯式 exports 并重新導出虛擬包 URL，因為操作系統符號連結無法進入 pkg 的 `/snapshot` 檔案系統。每次啟動還會把僅由所選外部組合包攜帶的包經 dsh 自有目錄連結到當前 profile 的 `node_modules`；已有 pnpm 條目優先，且每個 profile 獨立擁有自己的連結。

`web`、`headless`、`sdk`、`sdk-minimal` 和 `acp` profile 首次使用時會從隨附模板自動初始化（`web`：base + web-app，實時應用 patch；`headless`：base + headless，只在啟動時應用 patch；`sdk`：base + sdk-app，只在啟動時應用 patch；`sdk-minimal`：獨立組合包，只在啟動時應用 patch；`acp`：base + acp-app，只在啟動時應用 patch）。其他缺失的 profile 會顯式報錯，并提示執行 `dsh plugin --profile <name> add <package>`。

`dsh --profile <name> --from-default-profile <template>` 會在啟動前，從上述五個隨附模板之一初始化新的自定義目標。目標名稱不能是隨附 profile 名稱，并且完整的目標 profile 目錄必須不存在。launcher 會以獨占方式領取該目錄，因此殘留檔案和另一個并發建立者都會在不作修改的情況下被拒絕。它把模板當前的組合包列表和 `patchReload` 值復制進一份依賴為空、使用者 patch 為空的新 manifest。它不會讀取 `<template>` 指定的本地同名 profile，不會復制其依賴或 patch，也不會持久化繼承字段；模板列表之后的變化不會改寫新 profile。復制列表中指名的內置組合包仍從當前 dsh 安裝目錄解析。初始化成功不會增加 launcher 輸出。

profile 已經存在時，`--from-default-profile` 會被拒絕，且不會修改或啟動它；去掉該選項即可使用它。殘留的目標目錄同樣會被原樣保留，此時必須改用另一個 profile 名稱。未知模板或隨附目標名稱會在建立目標之前失敗；未知模板的診斷會列出有效模板。初始化在組合包解析和應用啟動之前提交，因此后續失敗仍會把新 profile 留在磁盤上，重試時需要去掉建立選項。`--dump-config` 和 `--dump-default-config` 接受該選項：它們初始化目標并打印所要求的設定樹，但不啟動應用。

```sh
dsh --profile rescue --from-default-profile web
dsh --profile rescue
```

### 應用參數

啟動器自身的 flag 必須寫在最前面，并在遇到第一個無法識別的 token 時結束；從該 token 開始的所有內容都會透過 `ctx.cmdlineArgs` 原樣交給已啟動的 profile，注入該 profile 的任意應用插件都可以解析這些內容（[`dsh-cmdline`](../../../packages/boot/cmdline/README.zh.md)）。因此，`dsh --profile rescue --from-default-profile web --no-open` 會先初始化，再把 `--no-open` 交給 Web；`dsh --profile web --port 8080` 會將 `--port` 交給 web 應用；`dsh --profile web --help` 只打印該應用的幫助資訊，不啟動應用；`dsh --help` 沒有可供交付參數的 profile，因此會打印啟動器自身的幫助資訊。`-V`/`--version` 位於應用參數邊界之前時，會打印啟動器的版本。

每套組合只會掛載一次。普通插件注入 `cmdlineArgs`，解析所屬應用的參數，并將解析結果作為服務提供。每個從 flag 取值的設定行都會注入該服務；Loader 會等到服務激活后，再對該行的設定求值（`port: !!js ctx.webStartup.port ?? 3080`），因此 flag 的優先級高於設定行中寫明的值。要維持這一優先級，設定行必須保留該表達式；如果使用者 patch 用字面量替換整個 `config`，也會隨之移除執行時讀取。幫助參數和被拒絕的參數都會要求退出：參數被拒絕時以非零狀態退出，顯示幫助時以 0 退出；依賴該提供方服務的設定行不會激活。在 `patchReload: live` profile 中，編輯 patch 檔案會根f64ee仍在執行的服務重新計算表達式，因此不會重置當前正在使用的端口。

啟動器的 flag 必須寫在應用參數之前，且啟動器的解析器會消耗掉一個 `--`：必須以字面量 `--` 送達應用的參數需要寫成 `-- --`。如果應用的第一個參數恰好等於 `web` 或 `plugin`，會選擇對應的子命令。`ctx.cmdlineArgs.get()` 是共享的不可變讀取：多個插件可以解析同一份快照，沒有讀取方的 profile 則會忽略自己的應用參數。

隨附的應用接受以下命令列參數：

| Profile | 參數 |
|---|---|
| `web` | `--host`、`--port`、可重復的 `--trusted-host`、`--no-open` |
| `headless` | 任務文本，作為位置參數 |
| `sdk` | 無選項；stdio 攜帶 JSON-RPC 通訊協定 |
| `sdk-minimal` | 無選項；stdio 攜帶相同的 JSON-RPC 通訊協定 |
| `acp` | 無選項；stdio 攜帶 ACP（Agent Client Protocol） |

一次性任務（`dsh --profile headless "run the tests"`）透過核心註冊表建立一個全新的持久化 Agent（智能體），提交任務、等待完全停穩并對工作階段執行 flush，再從其持久化事件區間中推導最后一個非空 assistant 文本與最終 `turn/end` 原因。它在 `dsh: reasoning:` 標題下將非空的提供方推理（reasoning）增量流式寫入 stderr，只在 stdout 打印最終文本，并在原因為 `completed` 時以 0 退出，否則以 1 退出；沒有推理內容的成功回應會保持 stderr 為空。沒有任務的呼叫是該應用的用法錯誤。隨附 headless profile 不掛載瀏覽器 Connection、HTTP 伺服器、Web 執行時或瀏覽器客戶端，也不會打開監聽端口。

可在不啟動的情況下檢查組合出的設定樹：

```sh
dsh --profile web --dump-default-config
dsh --profile web --patch ./extra.yml --dump-config
```

`--dump-default-config` 只打印組合包各層；`--dump-config` 額外加上 profile 的 `cordis.patch.yml`、home 級的 `$DSH_HOME/cordis.patch.yml` 和 `--patch` overlay。兩者都會打印注釋，標明每行由哪個檔案提供，以與哪些 overlay 修改過它；`!!js` 表達式保持未求值，插入行中的相對插件名以各自 patch 檔案所在目錄解析，找不到目標的 patch 會報告到 stderr。dump 操作會初始化缺失的 profile 檔案，但不會準備 `$DSH_HOME/profiles/node_modules` 下的執行時模塊 fallback。它不會執行應用的命令列參數提供方，因此展示的是解析任何應用參數之前的組合設定樹；如果呼叫中包含應用參數，dump 會拒絕該呼叫。

## 插件管理

`dsh plugin --profile <name> <args...>` 在 profile 缺失時先初始化它（有隨附模板的用模板，其他名稱只裝 `@deepseek-ai/dsh-base`），然后以 profile 目錄為工作目錄，把 `<args...>` 轉發給 `pnpm`：`add`、`remove`、`why`、`update` 與其他所有 pnpm 子命令都照常可用；pnpm 必須在 PATH 上。相對路徑 spec（`.`、`../plugin` 與其 `file:`/`link:` 形式）會先錨定到呼叫目錄，因此在插件 checkout 中執行 `add .` 安裝的是該 checkout，而不是 profile。每次成功執行后，系統都會根f64ee當前安裝狀態更新 `dsh.profile.bundles`：如果某項依賴解析到的包在 manifest 中聲明了 `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`，該依賴就會加入設定層棧；如果某項依賴在 `update` 后獲得該聲明，也會隨即激活。沒有組合包聲明的依賴仍作為普通依賴保留，并顯示一次性警告；已移除的依賴則從設定層棧中刪除。

Codex 與 Claude Code subagent 提供方是兩個彼此獨立的可選組合包。可以只新增一個包、在同一命令中新增兩個包，或獨立移除任一包：

```sh
dsh plugin --profile <name> add @deepseek-ai/dsh-subagent-codex
dsh plugin --profile <name> add @deepseek-ai/dsh-subagent-claude-code
dsh plugin --profile <name> add @deepseek-ai/dsh-subagent-codex @deepseek-ai/dsh-subagent-claude-code
dsh plugin --profile <name> remove @deepseek-ai/dsh-subagent-codex
dsh plugin --profile <name> remove @deepseek-ai/dsh-subagent-claude-code
```

pnpm 操作成功后會改變磁盤上的 Profile manifest 與組合包列表；正在執行的 Profile 會保留本次啟動時的組合包集合。新增、移除或更新組合包后須重啟該 Profile。這個啟動邊界只適用於組合包成員變化，Profile 或 home 中普通 `cordis.patch.yml` 的編輯透過熱重載生效。下一次啟動時，每個已安裝組合包只註冊自己的休眠 Host 提供方；還須在復制出的 Preset 中單獨啟用對應工具行，新 Agent 才能看到該工具。[Codex provider README](../../../packages/subagent/subagent-codex/README.zh.md) 與 [Claude Code provider README](../../../packages/subagent/subagent-claude-code/README.zh.md) 負責可執行檔案、身份驗證、載荷與失敗細節；[base 組合包參考](../../../packages/bundle/base/README.zh.md) 負責預設依賴閉包。

```sh
dsh plugin --profile tui add github:deepseek-harness/turtle-ui
dsh plugin --profile tui remove turtle-ui
dsh --profile tui
```

隨源碼發布的 Git 托管插件會在安裝期間透過 `prepare` 腳本構建，而 pnpm ≥10 預設會阻止該腳本，直到使用方明確允許。首次執行 `add` 會失敗，并顯示 pnpm 的 `allowBuilds` 提示；dsh 還會提示應修改該 profile 的 `pnpm-workspace.yaml`。將輸出的鍵復制到該檔案后，重新執行命令即可。安裝已經構建好的 tarball 或本地 checkout 時，無需加入 `allowBuilds`。

## Web 別名

`dsh web` 是 `--profile web` 的硬編碼別名；寫在它之后的 flag 屬於 web 應用，由組合包中的普通提供方解析。`--host` 和 `--port` 覆蓋承載它們的那些行的組合取值，可重復的 `--trusted-host` 透過 `ctx.webRuntime.trustedHosts` 提供本次呼叫的 authority（部署表達式會拼接自己的 authority），`--no-open` 則只對本次呼叫關閉預設瀏覽器交接。客戶端插件 HMR（熱模塊替換）接收器始終掛載，在單獨執行的 `pnpm run dev:web` watcher 重建客戶端 bundle 之前保持空閑。

```sh
dsh web
dsh web --no-open
dsh web --patch ./extra.cordis.yml
dsh web --dump-config
dsh web --help
```

生產 Web 執行器需要已構建的包和前端產物（`pnpm run build`）。預設服務位址是 `http://127.0.0.1:3080`；本機啟動時，只在完整 Loader 設定樹結算后才用預設瀏覽器打開該規范宿主機 URL。繼承的 `SSH_CONNECTION` 或 `SSH_TTY` 非空時會跳過瀏覽器交接，因為本地轉發位址由 SSH 客戶端或編輯器持有；宿主機 URL 仍會打印。`--host 0.0.0.0` 會綁定所有網路介面以便 LAN 存取——此時 `/api` 信任柵欄也會接受采樣到的 LAN IP 字面量，未認證的瀏覽器仍只能存取 GUI；以具名主機存取還需額外新增 `--trusted-host` 條目。本機交接前會打印英文提示 `dsh web: opening the default browser; pass --no-open to disable`；若操作系統交接失敗，stderr 診斷會說明原因、給出 URL 供手動存取，伺服器仍繼續執行。`--trusted-host` 可新增 `/api` 瀏覽器信任圍欄接受的具名 authority。

行程關閉時，插件樹最多有 5 秒完成 dispose。首次收到 `SIGINT` 或 `SIGTERM` 時會開始優雅排空：`SIGTERM` 是監督行程發出的常規停止要求，在所有執行模式下都以 0 退出；`SIGINT` 則報告 130。第二次收到信號時會立即強制退出。如果一次性執行在正常結束時已經卡在 dispose 階段，第一次按下 `Ctrl+C` 就會直接升級為強制退出，而不會被忽略。

基於 base 的模式都將執行命令時所在的目錄作為預設 workspace 根目錄，以 65,536 字節渲染預算加載適用的 `AGENTS.md` 或 `CLAUDE.md` 指令，并使用內存 SQLite 工作階段內容索引。獨立的 `sdk-minimal` profile 把執行命令時所在的目錄作為沙箱策略根目錄，但刻意省略檔案系統工具、指令發現與 SQLite。`patchReload: live` profile 會監視 profile 與 home 兩個 `cordis.patch.yml` 設定層的有效變更，并以事務方式重新應用；`startup` profile 則只應用一次。一次性執行模式透過有界關閉流程退出，該流程會 dispose 所有實時監視器。

基於 base 的 profile 中，新工作階段預設使用 `workspace-write` 權限預設。Bash 和檔案系統修改僅限於工作階段 workspace 與平臺臨時根目錄；讀取和網路存取不受限制，行程可見性則取決於所選沙箱后端——bwrap 在私有 PID 命名空間中執行命令并隱藏宿主行程，Landlock 與 Seatbelt 保持宿主行程可見性不變。`DSH_PERMISSION_MODE` 更改行程后備值。General settings 中存儲的權限影響后續 Web 工作階段，不改變已打開的工作階段。獨立的 `sdk-minimal` 設定樹則固定為 `danger-full-access`，且不掛載 approval 或權限 settings 服務。

`DSH_TOOLS_MODE` 為行程選擇 `native`、`ptc` 或 `both`；其他值會導致啟動失敗。隨附的 `minimal` agent preset 會保留該部署的呈現方式，將完整系統提示詞固定為 `You are a helpful software engineer assistant.`，并且僅組合按平臺選擇的持久 shell。建立 Web 工作階段時請選擇極簡模式；該 agent 不包含任何其他提示詞段落或面向模型的插件，而共享的瀏覽器、workspace、持久化、沙箱與權限宿主保持不變。

## 共享部署行為

基礎組合包掛載原生 DeepSeek 適配器、settings 與憑f64ee提供方、穩定的 `web_search` 和 `web_fetch`、僅限公網的 HTTP fetch 提供方，需主動開啟的 DeepSeek 工作階段日志上傳，以與面向所有使用者的反饋門控 OTel 上傳。提供方憑f64ee依次從繼承環境、`$DSH_HOME/.credentials.yaml`、呼叫目錄的 `.env` 和 `$DSH_HOME/.env` 解析；受管文檔從不物化進 `process.env`，而兩個 `.env` 檔案都是普通啟動環境層。搜索使用 `DEEPSEEK_API_KEY` 并接受 `DEEPSEEK_SEARCH_BASE_URL`。已啟用的抓取呼叫會在所有 sandbox 與審批模式下執行，無需逐次確認；提供方會在連線前拒絕非公開目的位址。Web app 會禁用 base 工具設定項，再透過 `cordis`、`ptc` 與 `standard` agent preset 暴露相同工具。

反饋記錄在工作階段日志中，不會啟動模型工作。開啟 [DeepSeek 工作階段日志貢獻器](../../../packages/session/session-log-deepseek/README.zh.md)后，后續 DeepSeek 要求會傳送尚未確認接收的完整日志后綴，包括經已設定網關傳送的要求。[OTel 工作階段上傳](../../../packages/session/session-telemetry-otel/README.zh.md)適用於所有使用者和提供方，包括 `deepseek-official`，無需要求頭。基礎設定預設使用 `FEEDBACK_ONLY`：新的自身文本反饋、消息評分、編輯與撤回會釋放截至該事件的完整規范日志前綴，包含存儲的上下文；后續記錄等待下一次顯式反饋。繼承的父級反饋不構成 fork 的授權。要求、恢復、掛載和 HMR 不觸發捕獲。SDK 批處理可完成已授權上傳，無需進一步交互或模型工作。`DSH_TELEMETRY_MODE=DISABLED` 禁止 OTel 投遞；`FULL` 被拒絕，任何非空的 `DSH_TELEMETRY_DISABLED` 都會禁用其設定行。`DSH_TELEMETRY_OTLP_URL` 選擇采集端。交接盡力而為，不代表采集端接受；不提供持久化 outbox 或重試保證。這些 OTel 設定不會開啟或關閉 DeepSeek 貢獻。兩條路徑都不改變模型輸入，但導出可能包含消息文本、工具參數和結果，以與工作區路徑。

透過 `dsh plugin --profile <name> add <package-or-git-spec>` 安裝外部插件組合包。安裝的包擁有其依賴，并貢獻其聲明的 `cordis.patch.yml` 層。CLI 還隨附 `@deepseek-ai/dsh-mcp-client` 作為供 patch 層使用的依賴，但預設不啟用 MCP 伺服器，因為每條伺服器命令都是 agent 沙箱之外的受信任可執行代碼。

<a id="source-execution"></a>
## 源碼執行

請在倉庫根目錄中，於全新 checkout 之后與產物需要更新時單獨執行 `pnpm run build`，然后使用 `pnpm dsh <args...>`。`package.json` 中的腳本不會構建，而是透過 `node --import tsx/esm` 啟動 `apps/cli/src/bin.ts`，并轉發所有參數。Typert Host 產物缺失時，profile 啟動會因不含構建指引的模塊解析錯誤而失敗。這些 Host 產物存在后，如果前端或 Client plugin 組合包缺失，啟動會失敗并提示執行 `pnpm run build`。啟動器不會檢查產物是否為最新，因此已有的陳舊組合包可能繼續執行舊版瀏覽器代碼，直至重新構建。該行程會繼承啟動環境，且 `runProfile` 會在任何 entry 掛載之前從該快照解析出站代理，因此 `HTTP_PROXY`／`HTTPS_PROXY`（以與寫在 `.env` 層中的代理）無需任何額外開關即可生效。安裝形式會直接啟動構建后的 `apps/cli/lib/bin.js`，不會重新構建倉庫。
