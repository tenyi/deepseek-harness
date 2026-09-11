# 測試策略

[English](testing.md) | 中文

本文說明本倉庫的分層測試方式，以及保持綠色測試套件有意義的規則。命令見根目錄 [AGENTS.md](../AGENTS.md)；相關 Agent Note 承載設計動機。

## 層級

- **單元測試**（`pnpm run test`）：vitest 運行包和示例各自的 `tests/**` 目錄下的測試，以及匹配 `scripts/**/*.spec.ts` 的倉庫腳本測試；測試文件與其所覆蓋的代碼區域放在一起。每個注冊表都有一個 HMR（熱模塊替換）安全測試（對向該注冊表貢獻內容的 fiber 執行 dispose（資源釋放），并斷言清理完成）。優先覆蓋邊界情況、錯誤路徑、事件順序、并發競態，以及針對約定回歸的永久測試（見 `packages/core/agent-loop/tests/contract-regressions.spec.ts`）。
- **覆蓋率門禁**（`pnpm run test:coverage`）：門禁級運行，對 `packages/*/*/src` 按文件 100% 覆蓋。未覆蓋的行往往是門禁正確標記出的死代碼（應刪除），而非需要補寫的測試。行覆蓋率是必要條件，但永遠不是充分條件：它證明行被執行過，不證明功能按交付預期工作。`packages/shell/pwsh-local/src` 的按文件 100% 覆蓋需要真實的 `pwsh`：缺少它時其執行器套件會自動跳過，`vitest.config.ts` 會豁免該文件以使無 pwsh 的主機保持綠色，而 CI runner 自帶 pwsh，仍按完整標準執行門禁。
- **真實 API e2e**（`pnpm run test:e2e`）：帶密鑰測試調用真實提供方 API，包括 DeepSeek 模型以及各提供方特有的冒煙測試；這些測試各自由自己的密鑰控制（`EXA_API_KEY`、`PERPLEXITY_API_KEY` 等），缺少密鑰時套件會自動跳過，使 keyless CI 保持綠色（[真實 API e2e Agent Note](../.agents/notes/implemented/testing/2026-06-19-real-api-e2e-ci.zh.md)）。
- **所屬位置的預期輸出**（`pnpm run test:expected`）：無錄制會話往返的無密鑰組裝 CLI/進程預期。驅動使用 `*.expected.e2e.ts`，并與 `tests/expected/` 同屬一處；CI 針對構建產物運行。包/腳本預期使用 `test`，瀏覽器預期使用 `test:web`。
- **性能基準**（`pnpm run test:bench`；必需的 Linux PR gate `node 24 / benchmarks`）：`benchmarks/` 按用戶路徑組織門禁。它先構建 library 和 worker；被計時代碼在純 Node 下運行，不使用 TSX。合成輸入執行耗時、堆和縮放預算；包內 `.perf.ts` 保留為診斷（[規則](../.agents/notes/implemented/testing/2026-09-04-session-open-performance-gate.zh.md)）。
- **快照**（`pnpm run test:snapshot`）：頂層場景數值最高的已錄制 parent generation 同時提供用戶輸入和模型回放，并作為持久化結果的預期值。parent 文件名是 `session[.vN].jsonl`；child 角色使用 `session.<ordinal>[.vN].jsonl`；v0 省略 `.v0`，正版本必須使用小寫 `.vN`，且每個文件名必須與其 header 一致。進程級場景都通過 `dsh` 啟動：headless 負責一次性行為，SDK 負責持久控制，ACP 負責自動化協議行為，Web 在同一 Session 旁保留瀏覽器與 ARIA 證據。`snapshot.yml` 聲明 profile、組合與請求頭類別、錄制策略、例外回放或輸入元數據以及 workspace 事實。帶類型的 token 保留父子身份關系；只有請求頭 pin 擁有 prompt/schema sidecar。變更 workspace 的場景會獨立比較完整的 `workspace.expected/` 目錄，record 與 refresh 絕不改寫該目錄。當模型 transcript（文本記錄）變化時使用 `test:snapshot:record`，回放輸入仍有效時使用 `test:snapshot:refresh`；請審查所有結果差異。
- **Web 瀏覽器快照**（`pnpm run test:web`；必需的 Linux PR（Pull Request）門禁）：Chromium 比較 `snapshots/web/` 下由會話驅動的輸出，以及 `apps/web/tests/expected/` 下僅含 UI 的輸出。CI 強制只讀的 `DSH_SNAPSHOT=replay`，絕不寫入預期輸出；record/refresh 留在本地，每處 diff 都須評審（[web e2e 車道](../.agents/notes/implemented/testing/2026-07-24-web-gui-browser-e2e-lane.zh.md)、[CI 門禁決策](../.agents/notes/implemented/testing/2026-07-30-web-browser-snapshot-ci-gate.zh.md)）。`test:web` 會先構建以交付插件 CSS。

Session fixture 保留 header 與 payload，但省略正文 seq/time envelope；replay 會合成這些 envelope。Replay、record 與 refresh 會選擇每個 parent/child 角色的最高 generation。當前 fixture 在文件名與 header 中使用[寫入格式](session-format-status.zh.md)，每個事件一行，并嵌入緊湊 Assistant stream。歷史 fixture 保留其已發布表示；顯式 `sessionFormat` 所有者保留遷移覆蓋。按照[格式版本實操手冊](cookbook/adding-a-session-format-version.zh.md#snapshot-successors)添加后繼代際，不改動前代。

## spec 如何被執行

fork 出的 worker 會同時運行多個 spec 文件，coverage gate 會拆成并發的 partition，與同一個 job 中的其它 gate 并排運行，而自托管 runner 共用同一臺宿主機和同一個卷。被隔離的只有進程：端口、可預測路徑、外部命名空間和繼承而來的子進程都不隔離。為每個占用的資源負責到它的 teardown，并把「只有單獨運行時才通過」的 spec 讀作該 spec 的缺陷，而不是 runner 不穩定。[dsh-ci-test-reliability](../.agents/skills/dsh-ci-test-reliability/SKILL.md) 負責資源分配、狀態恢復、同步、超時預算、平臺差異與 teardown 規則；它的 [flake 診斷流程](../.agents/skills/dsh-ci-test-reliability/references/ci-flake-diagnosis.md)用于歸類已經存在的概率性失敗。

## 帶密鑰策略：推理（inference）在這里很便宜

我們是 DeepSeek，不要吝惜真實 API 測試。無密鑰測試只能證明底層通路；只有帶密鑰運行才能證明 agent（智能體）能對接真實模型正常工作。覆蓋文件寫入提示詞、包含多個輪次的對話、工具使用和流中取消。價值最高的是**冒煙測試**：啟動已交付的 `dsh` profile、發送一條提示詞，并檢查外部世界；它們能捕獲「單元測試全綠、產品卻壞了」這一類 mock 無法發現的問題（[事故復盤 0001](postmortem/0001-acp-default-export-drops-inject.zh.md)）。自動跳過讓無密鑰 CI 和無密鑰貢獻者不受阻塞；它不是成本信號。Profile 級集成測試位于 `apps/cli/tests/profiles/`；包專屬組合留在對應包的測試目錄中。

## 優先使用真實實現而非 mock

只 mock 開銷高或不確定的邊界（LLM（大語言模型）適配器、網絡、時鐘）；下游一切保持真實。手寫替身只能證明橋接層在搬運字節，不能證明交付的工具行為符合斷言。橋接工具調用測試把真實的工具注冊表與執行管線保留在腳本化 mock 模型下游：`makeBridgeHarness()`（packages/acp/acp/tests/harness.ts）掛載 agent loop、會話存儲、工具注冊表與 JSONL 持久化，唯一 mock 是腳本化 `MockAdapter`。

恢復測試按步驟區分分片前與分片后的失敗，并證明失敗分片不會派生出消息或工具副作用。覆蓋耗盡、取消、策略組合、持久化、狀態、協議計數、會關閉傳輸的空閑超時，以及交付的 Loader 組合。

## 驗證外部世界，而非自我報告

e2e 斷言應重新運行命令或從外部重新讀取文件；對 agent 自身輸出做關鍵詞探測會讓作弊的 agent 通過。斷言未修改的文件逐字節一致。e2e 測試自行管理資源：在測試中創建 harness，在 `afterEach` 中 dispose（即使失敗/重試/超時也要釋放）；共享 fixture 放在普通的 `tests/harness.ts` 中，絕不放在另一個 `*.e2e.ts` 中（導入一個 spec 會重新注冊其 `describe`，導致真實 API 調用重復執行）。

## 測試真實入口路徑

- 產品可見的插件必須有一個非單元的真實組合測試。手動構建的 `ctx.plugin(...)` 套件不夠：通過 Loader 和 app/process 啟動僅用于測試的 `cordis.yml`，只 mock 外部服務或非確定性輸入，斷言模型可見的請求/日志、持久狀態或用戶可見輸出。不要把 opt-in 選項混入交付默認值。
- 一個守衛只有在回歸能讓它失敗時才有效。對于沒有 `inject` 的插件（bundle/組合插件），Loader 冒煙測試在默認導出替換必需的具名導出時仍然綠著——需要添加顯式的 `expect('default' in mod).toBe(false)` 加 `unwrapExports` 往返斷言，并證明它有效：引入回歸、觀察變紅、回退。
- 「真實入口路徑」指已發布的產物：包的 `bin` 所運行的是構建后的 `lib/bin.js`，并由普通 `node` 執行，從而暴露 tsx 會掩蓋的失敗（結算競態、模塊解析、被吞掉的加載失敗）。同樣的規則適用于非 index 運行時入口（worker-thread 的同級文件 `lib/worker.cjs`），也適用于多個 bundle 共享的單例模塊（`packages/sdk/server/tests/built-scope-carrier.e2e.ts`）。保持構建產物冒煙測試綠色（`packages/examples/*/tests/built-bin.e2e.ts`、`packages/code-runtime/code-runtime-worker-thread/tests/built-lib.e2e.ts`），并斷言真正缺失的配置以非零狀態退出。

## 測試解析：僅限源碼

- 每個 vitest 配置都將 vite-tsconfig-paths 指向 `tsconfig.base.json`；工作區包的裸導入解析到 `src`（[布局](development.zh.md#typescript-project-layout)），絕不會經由包的 `exports` 解析到構建后的 `lib/`，因為其中的陳舊產物會加載第二份模塊單例。構建產物只在顯式指定時使用：以 `lib` 模式運行的子進程，以及下文的構建產物冒煙測試。

## 測試子進程啟動模式

- CI 與已有構建產物的測試通道通過共享雙模式啟動器，從構建后的 `lib/` 運行每個 profile 或 Cordis 配置子進程。不要為這些子進程手寫 `--import tsx`。
- 不加載 Cordis 的協議與操作系統 fixture 直接通過 Node 運行使用可擦除語法的 `.ts` 文件，不經過 tsx 或根路徑映射。
- 只有測試對象本身是源碼路徑解析時，才可以選擇 `src`；在測試中寫明這一約定。

## 何時需要快照測試

每項非平凡的模型可見、協議可見或人類可見變更，都在同一 PR 中添加或更新無密鑰錄制會話場景；包級、e2e、僅 mock 和 PR 理由證據不能取代組裝后的 transcript。Headless、SDK、ACP 和 Web 錄制分別位于 `snapshots/session/`、`snapshots/sdk/`、`snapshots/acp/` 和 `snapshots/web/`；Web 渲染可以顯式借用另一個場景的規范會話。不由錄制會話驅動的預期輸出保留在所屬應用、包或腳本的 `tests/expected/` 下，并且不使用 `*.snapshot.ts` 后綴。[`dsh-session-snapshot`](../packages/test-support/session-snapshot/README.zh.md) 擁有共享存儲規則和 profile 適配器。Agent loop、會話生命周期和 `SessionEventMap` 變更應更新兩個 SDK 投影：`snapshots/sdk/` 擁有 TypeScript，[Python 運行時 CI](../.agents/notes/implemented/process/2026-09-06-master-only-platform-ci.zh.md) 擁有 `scripts/snapshots/python-sdk-single-exe/`。新增 capability seam、生命周期或 transcript 變體應在計劃階段列出每個必需層級。
