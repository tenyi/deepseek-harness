# 實操手冊：添加 Session 日志格式版本

[English](adding-a-session-format-version.md) | 中文

## 概述

本教程介紹如何添加下一個結構性 Session 日志版本，同時不改寫已發布數據。閱讀[版本與發布狀態真源](../session-format-status.zh.md)，確定工作區寫入器與最新已發布格式。令 N 表示經核實的已發布格式，N+1 表示目標版本；名稱與元數據中的這些占位符須替換為數字。開始前，請準備可用的貢獻者工作區，并閱讀[包檢查清單](adding-a-package.zh.md)、[格式庫](../../packages/session/session-format/README.zh.md)和[已發布格式決策](../../.agents/notes/implemented/architecture/2026-08-31-released-session-format-migrations.zh.md)。

## 目錄

- [1. 選擇版本與發布基線](#choose-the-version)
- [2. 添加恒等遷移邊](#add-an-identity-edge)
- [3. 實現每份產物獨占的 Stage 與校驗](#stages-and-validation)
- [4. 更新當前版本消費方](#current-version-consumers)
- [5. 創建快照后繼代際](#snapshot-successors)
- [6. 驗證集成結果](#validate)
- [開發備注](#dev-note)

<a id="choose-the-version"></a>
## 1. 選擇版本與發布基線

當 header、事件信封、核心事件語義或表面重建發生結構性變更時，提升格式版本。普通事件新增不需要提升版本；遵循[版本規則](../../.agents/notes/implemented/architecture/2026-08-10-session-log-version-mechanism.zh.md)。區分 Session 格式整數與包發布版本、SQLite schema 版本、投影單元版本及協議包裝層版本。

為 N+1 使用共享的 `release/*` 集成基線。基線變更添加寫入器、codec、catalog 接線、恒等遷移與驗證。從該基線創建各個獨立子分支，并將其 PR（Pull Request）的目標設為發布分支，而非另一個獨立子分支。每個子分支在同一個相鄰遷移包內添加自身的結構變換、校驗器、消費方和測試。不要只為表示評審順序而分配額外版本。通過 PR 將評審后的子分支合入發布分支，并在發布前驗證組合結果。遵守發布分支的強制推送與刪除保護；不要強制同步該分支。

已發布 codec 和遷移語義保持凍結。不要通過修改已發布遷移邊來實現新的結構性功能。只有 N→N+1 遷移邊可在 N+1 發布前納入協同變更；發布后，進一步的結構性變更需要下一條相鄰遷移邊。

未發布 N+1 的集成測試應使用可丟棄、相互隔離的 Harness home。中間版本產生的 N+1 文件已標為目標寫入器版本，因此后續對 N→N+1 的修改不會再次遷移該文件。請在全新測試 home 中從未變更的歷史輸入重新運行；絕不通過改寫已提交代際或復用真實用戶 home 來修復這個問題。

<a id="add-an-identity-edge"></a>
## 2. 添加恒等遷移邊

按照包檢查清單為 N→N+1 創建庫，而非掛載插件。恒等正文轉換僅是最初的接線骨架。[V2 到 V3 規范](../../packages/session/session-format-v2-to-v3/README.zh.md#v2-to-v3-specification)是明確轉換與保留規則的固定示例，而不是可繼續擴展或視為恒等轉換的遷移邊。

在 manifest（元數據清單）中聲明 `dsh.sessionFormatMigration`，包含數值 `from: N` 和 `to: N+1`、導出路徑，以及導出的遷移、源 codec、目標 codec、目標 header 校驗器和目標恢復器。復用前一條遷移邊所屬包導出的源 codec，并依賴該包；不要復制或重新定義已發布 codec。從新包導出目標 codec 和校驗器。將遷移邊加入 catalog 的直接依賴，并添加工作區的 TypeScript 路徑與項目引用。

在添加新遷移邊聲明的同時，將[核心 Session 類型](../../packages/core/session/src/types.ts)中的 `SESSION_FORMAT_VERSION` 設為 N+1，然后生成 catalog。下面的命令只生成已聲明的遷移鏈；它不會實現新版本：

```sh
pnpm run gen-session-format-catalog
```

[生成器](../../scripts/gen-session-format-catalog.ts)要求從零到寫入器版本的每一步恰好有一個相鄰遷移包，目錄與包名匹配、相鄰 codec 導出匹配，并聲明所需依賴。它拒絕缺口、重復或多余的遷移邊、未知元數據成員，以及未通過對等依賴（peer dependency）加開發依賴共享 Session 的 catalog。請修復聲明，而非手改 `generated.ts`。Catalog 在構建時靜態確定；插件掛載不得決定歷史數據是否可讀。

<a id="stages-and-validation"></a>
## 3. 實現每份產物獨占的 Stage 與校驗

使用 [Stage 接口](../../packages/session/session-format/src/types.ts)，不要使用整份產物的數組到數組遷移器。不可變的 `SessionFormatMigration` 聲明提供 `migrateHeader`、`validateTargetHeader` 和 `createStage`。每次調用 `createStage` 都為一份源產物創建獨立狀態。計數器、待處理事件和引用映射歸該狀態所有；不同 Session 之間絕不共享可變 Stage。

實現 `transformEvent(event, context)`、`transformRun(run, context)` 和 `finish(context)`。通過 `context.emitEvent` 或 `context.emitRun` 同步輸出；一次調用可以產生零個、一個或多個輸出。讓 Stage 直接消費 codec 所有的緊湊 run，或者迭代 `run.expand()`，而不物化中間數組。調用方負責調度，遷移鏈先結束上游 Stage，再結束下游 Stage。

繼承截點是邏輯事件數量，不是物理行數。只有在 EOF 前已知時才公開 `headerInheritedEventCount`；`finish` 返回精確的目標截點。前一條改變事件數量的遷移邊可能使該數量在構造時不可知。必要時從已校驗的種子標記推導它，并測試從每個受支持歷史代際到 N+1 的有種子多跳恢復，而非僅測試直接 N 輸入。絕不以零替代未知截點。

顯式定義新遷移邊的事件準入與變換規則。[V2 到 V3 源審計](../../packages/session/session-format-v2-to-v3/README.zh.md#source-audit)和 [Alpha V0→V1 規則](../../.agents/notes/implemented/architecture/2026-08-31-alpha-historical-unknown-event-refusal.zh.md)分別負責對應已發布遷移邊的策略，而非新遷移邊的策略。不要將任一策略推廣到所有遷移邊。結構或事件位置變化時，必須分類源事件、載荷成員與引用，并顯式判斷不透明數據能否保持有效。[同版本保留](../../.agents/notes/implemented/architecture/2026-08-30-retain-ignorable-external-session-events.zh.md)本身不能證明結構變換安全。校驗目標語義，并為每個新增可接受案例提供一個被拒絕的反例；絕不放寬舊遷移邊來掩蓋不受支持的轉換。

通過 `sessionFormatCatalog.createRestore(header, { recovery: 'strict', validation: 'current' })` 驗證嚴格恢復，按順序傳入各行并調用 `finish()`。這會執行物理解碼、完整遷移鏈與已安裝當前 Session 校驗。生產環境的 recoverable/transformed 策略不能替代 fixture（測試前置數據）和發布驗證所需的嚴格校驗。保留已記錄的歷史校驗例外，不要宣稱源校驗比遷移邊實際執行的更嚴格。

<a id="current-version-consumers"></a>
## 4. 更新當前版本消費方

追蹤每個當前版本消費方，包括 Session 創建與恢復、JSONL 文件名選擇與發布、catalog 的當前編碼器與恢復器、投影緩存的代際身份、回放與快照歸一化，以及 TypeScript/Python SDK 錄制。當值表示當前版本時使用寫入器常量；在已發布 codec 和歷史 fixture 中保留字面歷史版本。通過各自所有者更新當前文檔與生成參考。

不要自動提升無關版本。請求包裝層的 `sessionFormatVersion` 標識嵌入的 Session 代際；外層 schema 版本有自己的含義。投影單元狀態版本同樣不能替代緩存的 Session 代際身份。

驗證讀取與寫入兩條路徑。僅 header 的列表操作不得讀取正文或發布。歷史讀取打開可以直接返回遷移后的內存產物而不寫入；寫入打開必須先校驗并發布唯一的最終當前后繼代際，再允許追加。源路徑、字節與 inode 保持不變。所選代際高于當前版本或無效時，不得回退到前代。[準備階段決策](../../.agents/notes/implemented/architecture/2026-09-05-read-only-session-migration-preparation.zh.md)負責發布時序。

<a id="snapshot-successors"></a>
## 5. 創建快照后繼代際

閱讀[快照所有權](../../snapshots/AGENTS.md)和[快照庫](../../packages/test-support/session-snapshot/README.zh.md)。選擇擁有數據的場景，而非僅引用它的適配器。實現 N+1 后，保留每份歷史文件，并按目標版本的規范父子文件名生成后繼文件。絕不將前代重命名為目標文件名，或僅修改其 header。

如果回放輸入不變，在所有者上執行無密鑰 refresh，再執行不寫回的 replay。以下 SDK 命令使用 `text-turn` 和工作區的寫入器版本。先實現并接入 N+1，才能用它們生成該版本；功能變更應選擇實際受影響的所有者：

```sh
pnpm run test:snapshot:refresh snapshots/sdk/sdk.snapshot.ts -t text-turn
pnpm run test:snapshot snapshots/sdk/sdk.snapshot.ts -t text-turn
```

一起審查新代際、請求伴隨文件與協議輸出。驗證每個前代的字節保持相同，且父子角色連續。選擇規則采用數值最高的代際，因此應將共享引用更新為所有者選中的父代際。不要把 packed 布局遷移器當作版本升級器。如果模型 transcript（文本記錄）必須變化，由場景所有者按照[測試策略](../testing.zh.md)使用所需提供方密鑰進行實時錄制。

通過 `snapshot.yml` 的 `sessionFormat.version` 與受支持的 `coverage` 名稱顯式保留歷史案例；record 和 refresh 不改動這些 Session fixture。更新[語料策略](../../scripts/session-snapshot-corpus-policy.ts)以采用當前代際，同時保留聚焦的直接遷移邊、多跳、packed row、重試/失敗及交付 profile 覆蓋。檢查語料和兩個 SDK 投影；不要僅為消除校驗失敗而批量 refresh 無關場景。

<a id="validate"></a>
## 6. 驗證集成結果

從倉庫根目錄運行。以下命令檢查 catalog 聲明、Stage 組合、已發布的 V2→V3 遷移邊與代際選擇。它們是基線檢查；需為新遷移邊添加聚焦覆蓋：

```sh
pnpm run verify-session-format-catalog
pnpm exec vitest run scripts/gen-session-format-catalog.spec.ts packages/session/session-format/tests packages/session/session-format-v2-to-v3/tests packages/session/session-format-catalog/tests
pnpm run test:snapshot scripts/session-snapshot-corpus.corpus.ts
```

實現新遷移邊后，將其實際測試路徑加入聚焦的 Vitest 命令。根據實際 diff 添加受影響的 JSONL、回放、投影與 SDK 測試；發布 Worker 路徑變化時還需構建產物冒煙測試。要求嚴格遷移成功、骨架保持恒等、拒絕格式錯誤與未知必需事件、重復恢復確定、并發 Stage 狀態獨立、有種子的多跳截點正確、前代不變且無回退。報告確切命令與失敗，不要推斷整個測試套件的結果。

更新[所屬 Agent Note](../../.agents/notes/implemented/architecture/2026-08-31-released-session-format-migrations.zh.md)，而非添加重復決策記錄。發布前保持[發布記錄](../session-format-status.zh.md#updating-the-record)不變；發布后，使用已核實的發布證據更新它。審計相關活躍記錄的取代關系；保留獨立理由，并保持歸檔記錄凍結。一起更新雙語正文，通過倉庫工具重新記錄每個變更的配對，然后運行文檔檢查：

```sh
pnpm run verify-translation-pairing --write docs/cookbook/adding-a-session-format-version.md
pnpm run test:docs
pnpm run doc-sync
pnpm run lint
git diff --check
```

<a id="dev-note"></a>
## 開發備注

無。
