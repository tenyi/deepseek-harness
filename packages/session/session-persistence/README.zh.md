---
description: "面向用戶與維護者的持久會話存儲 seam 說明，用于選擇持久化后端、恢復會話，或按共享服務約定構建后端。"
kind: "package-reference"
---

# @deepseek-ai/dsh-session-persistence

[English](README.md) | 中文

## 概述

本包讓應用通過后端無關的 API 持久存儲并恢復會話事件日志。讀者可以創建、打開、檢查、列出、追加、讀取、刷新和關閉已存儲會話，同時保持連續且僅追加的歷史記錄。只有完成 flush 才構成持久性屏障；讀取方不會收到撕裂尾部或無效記錄，并且每個后端實例內每個會話只允許一個寫入方。若希望每個會話使用一份壓縮日志，可選用隨產品交付的 [JSONL 后端](../session-persistence-jsonl/README.zh.md)；也可以實現具備相同可觀察保證的其他后端。

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

掛載一個持久化后端即可讓會話持久化。后端把自己注冊為 `ctx.sessionPersistence`，并把每個已發布會話的實時事件路由進該會話的活躍寫句柄；agent-loop——會話在生產環境中的發布點——在發布之前獲取每個會話的寫句柄，因此組合中的其他部分不變。

### 選擇后端

seam 隨產品交付 [JSONL](../session-persistence-jsonl/README.zh.md) 后端。它為每個會話存儲一份僅追加的 `.jsonl.zstd` 日志。第三方后端可以直接實現該服務；必須遵守的[后端約定](#understand-the-implementation)見下文。

### 服務提供什么

掛載后端后，五個服務方法尋址已存儲會話：

```text
const handle = await ctx.sessionPersistence.create(header)     // store a new session, take write ownership
const handle = await ctx.sessionPersistence.open(id, 'write')  // claim single-writer ownership of an existing session
const reader = await ctx.sessionPersistence.open(id, 'read')   // observe without ownership
const snap = await ctx.sessionPersistence.stat(id)             // header + revision (+ eventCount / sizeBytes) without a log read
const all = await ctx.sessionPersistence.list()                // one snapshot per visible stored session
await ctx.sessionPersistence.flush()                           // backend-wide durability barrier over every active write handle
```

服務級 `flush()` 排空每個活躍寫句柄已路由的事件并把其會話實體化，效果與各句柄自己的 `flush` 完全相同；失敗按會話聚合為一個 `AggregateError` 而不中途放棄清掃，清掃途中被關閉的句柄視同已 flush，因為 close 本身會持久排空。

每一次日志讀寫都流經返回的 `SessionHandle`；不存在按 id 尋址的 append 或 load 方法。`handle.read(offset?, length?)` 返回 `{ eventState, events }`：外層 slice 屬于調用方，`eventState` 則區分由調用方獨占的 `detached` 事件圖與可能同時位于后端緩存中的 `shared-frozen` 事件圖。該狀態由生成方確定，即使切片為空也會保留。兩種狀態都能直接接管而無需復制；需要可變事件的消費方必須先克隆事件。讀取絕不包含撕裂尾部，同一句柄上的重復讀取絕不會觀察到比先前讀取更舊的狀態，寫句柄也能讀到自己成功的 append。`handle.append(events)` 追加一個連續批次，其第一個 `seq` 等于已存儲 next-seq；完成時的持久化是盡力而為的——批次被接受、有序，并對同一后端實例上的讀取可見，只有完成的 `flush` 才承諾它在崩潰后依然存在（交付的 JSONL 后端恰好會立即持久化每個批次）。`handle.flush()` 是持久性屏障，同時把空的已創建會話實體化，使其可被持久列出。`handle.close()` 冪等且不可取消：讀句柄釋放本地資源；寫句柄完成待處理的持久化并釋放寫所有權。一旦某次 `append` 或 `flush` 完成，其后在同一后端實例上開始的讀取——無論經由任何句柄，還是經由 `stat`/`list`——至少能觀察到該前綴。

### 所有權與可見性

`create` 與 `open(id, 'write')` 取得進程內單寫者所有權：在持有者活躍期間第二次以寫模式打開會以 `SessionAlreadyOwnedError` 拒絕，對已占用 id 執行 `create` 會以 `SessionAlreadyExistsError` 拒絕，在 `read` 句柄上執行修改會以 `SessionReadOnlyError` 拒絕——一種句柄類型，運行時拒絕。對已關閉句柄的任何操作會以 `SessionHandleClosedError` 拒絕，`SessionOwnershipLostError` 標記寫所有權已永久丟失的寫句柄（關閉并重新打開）。已創建的會話自 `create` 完成之刻起即可在本進程內被觀察到，而后端可以把物理實體化推遲到第一次 `append` 或 `flush`；其他進程只能看到已實體化的會話，一個在崩潰前從未實體化的會話等于從未存在。

### 實時寫路徑與關閉排空

實時寫路徑由后端自持：它一次性安裝會話監聽器，把每個已發布會話的事件按 id 路由到該會話的活躍寫句柄——`session/event` 復制進有界的內部批處理窗口，`session/flush` 是即時的持久性與錯誤觀察屏障，`session/disposed` 執行最終排空并關閉句柄。沒有活躍寫句柄的已發布會話不做任何持久化。后臺寫入失敗時按序保留其事件、暫停自動路徑并記入日志；下一次顯式 flush 會重試，并在再次失敗時明確返回拒絕。`close()` 本身會先經由仍然打開的存儲排空路由緩沖區再釋放所有權，因此即便根 fiber 的 dispose（資源釋放）并發運行各 fiber 的 disposer，后端拆卸時的關閉清掃也能保證應用關閉不丟數據。

### 恢復與崩潰恢復

持久化返回物理上有效的日志；語義修復屬于讀方。中途崩潰的會話保留其未閉合的最終輪次——單個輪次可能很大，而這些事件在崩潰前已持久追加；只有從未確認的撕裂尾部中不完整的碎片會被丟棄——從中恢復的完整記錄由寫路徑在句柄的第一次新 append 之前持久重寫。恢復（agent-loop）通過其寫句柄讀取已存儲日志，計算 `interruptedTurnClosers`——合成 `tool/result` 錯誤、任何未閉合的 `step/end`，以及 `turn/end {interrupted}`——并把它們作為普通批次通過同一句柄追加。只讀觀察方（session-query）僅在內存中用同樣的 closer 配平被中斷的冷日志。

### 失敗與恢復

當前構建無法忠實解讀的存儲日志會被拒絕，并返回指明拒絕方向的錯誤，絕不會被誤讀。`SessionHandle` 只暴露由 `SESSION_FORMAT_VERSION` 標識的當前邏輯記錄；提供方必須在返回句柄前轉換任何受支持的歷史存儲，隨產品交付的 JSONL 提供方會通過靜態 catalog 遷移受支持的歷史代際。更新的格式會要求操作者升級 harness。本構建不認識的事件類型會被拒絕，除非其信封標記為 `ignorable`；已提交前綴中的損壞以 `SessionPersistenceCorruptionError` 拒絕。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節說明 seam 如何實現持久存儲以及后端如何接入；可觀察約定見[使用本包](#use-this-package)與生成的 [Cordis API](../../../docs/subsystems/persistence.zh.md#cordis-surface)。

### 設計理念

本包是 seam，而不是后端框架：它只導出抽象 `SessionPersistence` 服務、`SessionHandle` 約定、消費方捕獲的穩定錯誤類、純函數的存儲記錄校驗輔助（`storage-contract`）以及帶品牌類型的修訂值——再無其他。每個提供方擁有自己完整的存儲運行時（句柄類、修改排序、單寫者記賬、實時事件路由、拆卸），`tests/` 下的兩套共享測試套件——`runPersistenceContract` 與 `runLiveWritePathContract`——固定所有提供方都必須一致的可觀察行為。有意為之的后果：各提供方在存儲恰好相似之處可以彼此相像，但沒有任何實現機制跨越包邊界。

### 每個后端必須遵守的不變量

- **僅追加，連續 `seq`。** 已提交事件絕不重寫；`append` 的第一個 `seq` 必須等于已存儲 next-seq，缺口會被拒絕。
- **撕裂的物理尾部絕不到達讀取方。** 它屬于一次從未完成的 append；寫路徑在第一次新 append 之前將其持久截斷。
- **無損 JSON 數據。** 批次與 header 經過共享的單遍校驗并快照邊界（`materializeAppendBatch`/`materializeCreateHeader`）；無法序列化的載荷在調用處被拒絕。
- **持久性。** `append` 盡力而為地持久化；`flush`——逐句柄或服務級——是承諾存儲并同時把空會話實體化的屏障。
- **遇到未知或無效格式時拒絕讀取。** `validateStoredEvents` 拒絕未知事件詞匯與已廢棄的預發布形態；`assertVersion` 拒絕外來格式版本。
- **每個后端實例單寫者。** 提供方的進程內認領在 `create`/`open('write')` 時取得，在句柄關閉時釋放。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：抽象 `SessionPersistence` 服務與重新導出的 seam 詞匯 |
| [`src/handle.ts`](src/handle.ts) | `SessionHandle` 約定：read/append/flush/close 語義與新鮮度規則 |
| [`src/storage-contract.ts`](src/storage-contract.ts) | 共享校驗：版本門禁、未知事件詞匯拒絕、批次實體化、連續性 |
| [`src/errors.ts`](src/errors.ts) | 穩定的句柄/所有權失敗與格式拒絕 |
| [`src/revision.ts`](src/revision.ts) | 帶品牌類型的不透明修訂值 token |
| — | 不發布運行時不變式伴生入口；持久化正確性需要后端往返與崩潰尾部測試；本包不暴露可持續觀察的進程內關系。 |

### 寫入路徑概覽

寫入器會話的每個 `session/event` 都復制進該句柄的內部緩沖。第一個待處理事件開啟固定批處理窗口；后續事件加入但不重置截止時間。窗口到期后經由句柄的修改鏈排空待處理前綴；排空期間接納的事件按順序合并進下一個鏈上的批次。`session/flush` 取消等待并排空至完全停穩，隨后運行 `handle.flush()`，因此 loop 在下一輪次前把它用作排序與錯誤觀察檢查點。失敗的后臺排空保留其事件并暫停自動計時器；顯式 flush、寫入器 close 或后端拆卸會立即重試，并在再次失敗時明確返回拒絕。構造 seed 事件絕不發出 `session/event`，因此發布前通過句柄追加的 seed 絕不會被重新入隊。

### 存儲記錄校驗

seam 的共享輔助函數校驗由 `SESSION_FORMAT_VERSION` 標識的當前邏輯記錄，append 只寫當前格式（[理由](../../../.agents/notes/implemented/architecture/2026-08-31-released-session-format-migrations.zh.md)）。歷史解碼與不可變后繼發布屬于各提供方內部，并在其返回句柄前完成。每個后端都在句柄讀取與寫 open 預熱時運行 `storage-contract` 校驗，把未知事件類型作為 `SessionFormatUnsupportedError` 拒絕，把格式錯誤的當前記錄作為 `SessionPersistenceCorruptionError` 拒絕，并在后端為每個會話保留一份產物時附上原始日志的 `SessionLocation`。

</details>
-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從共享持久性模型逐步進入隨產品交付的后端與決策證據。

- [會話持久化子系統](../../../docs/subsystems/persistence.zh.md)——完整服務約定、句柄語義、flush 檢查點、崩潰恢復與生成的 Cordis API。
- [基于句柄的持久化 Agent Note](../../../.agents/notes/implemented/architecture/2026-08-27-handle-based-session-persistence.zh.md)——seam 設計及其所有權模型。
- [JSONL 持久化后端](../session-persistence-jsonl/README.zh.md)——隨產品交付、按會話存儲文件的后端。
- [會話檢查點策略](../session-checkpoint-policy/README.zh.md)——在語義邊界上經由 `session/flush` 刷新的插件。
- [會話包映射](../README.zh.md)——相鄰的持久化、投影、標題與遙測包。

-----

<a id="model-experience"></a>
## 模型體驗

### 恢復的對話歷史

#### 模型看到什么

seam 不添加提示詞或 schema。恢復會將已存儲的表層事件還原為消息歷史；已存儲請求 header 重建較早調用，新 loop 則為下一次請求組合當前系統提示詞、工具與會話前綴。崩潰修復將沒有持久調用的 assistant 請求標記為 `TOOL_NOT_STARTED`；有持久調用但無結果時變為 `TOOL_OUTCOME_UNKNOWN`，其文本允許模型重試只讀或冪等工作，但要求驗證副作用或詢問用戶，而不是盲目重試。

#### Token 影響

普通持久化期間為零 token。恢復后會重新計入保留歷史的 token 用量，并照常計入當前請求 envelope 的 token 用量；每個已修復調用都會增加一段以引用形式保留的錯誤文本。

#### KV Cache 影響

持久化不修改當前請求前綴。只有當重建歷史、當前 envelope 與模型路由匹配時，恢復 loop 才能重用提供方緩存；崩潰修復結果僅追加，不重寫較早歷史。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制界定 seam 保證的終點。它們是當前包約束，不是待辦事項。

- **seam 只保證單個后端實例內的寫所有權**——跨進程排他由具體提供方負責。隨產品交付的 JSONL 提供方通過內核鎖在不同實例和進程之間提供租約；其他提供方必須記錄等效保證，或要求部署方阻止并發寫入。
- **在有活躍會話時重載后端插件會使其寫入器明確報錯**——重載后的后端無法服務舊實例簽發的句柄；寫入會持續失敗直到會話重啟，沒有任何機制靜默重新接管日志。
- **只有通過句柄獲取的會話才會持久化**——僅靠 `ctx.sessions.create` + `session/flush` 不存儲任何內容；agent-loop 是生產環境的獲取點，測試通過 `create`/`append`/`close` 寫入初始存儲數據。
- **無刪除或保留接口**——剪枝已存儲會話屬于帶外后端維護。
- **`list()` 無分頁且無過濾**——它返回每個已存儲會話的快照；適合本地存儲，大規模時無索引。
- **合成 closer 是唯一崩潰方案**——恢復通過寫句柄追加 `interruptedTurnClosers`；沒有繼續中斷輪次而不先關閉它的部分輪次恢復。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
