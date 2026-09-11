# 翻譯語體樣例（style samples）

本文件是翻譯語體的校準錨點：每組樣例是一段英文原文與一段人工定稿的中文譯文，覆蓋本倉庫文檔的主要文體。**譯文的語體以這些樣例為準**——文體樣例的效力高于對語氣的文字描述，但術語表、忠實性與結構規則仍然優先。翻譯或評審時對照最接近的文體樣例。本文件中英對照、自成雙語，不參與配對（見 [README.md](README.md) 排除清單）。

維護方式：人工評審校準出新的金標段落后追加到對應文體；發現語義、結構或術語錯誤時直接修正。新增或修正樣例都需經過 PR 評審。

## ① 架構敘述

> This document describes the architecture of the DeepSeek Harness — the foundation of **DeepSeek Code**. The governing principle, from the microkernel design discussion: **everything is a plugin**. The core is deliberately tiny — a handful of abstract services plus one concrete loop plugin (`dsh-agent-loop`) — and every product feature is a plugin against the extension API described here, without modifying the loop.

本文介紹 DeepSeek Harness 整體架構，它是 **DeepSeek Code** 的底層基座。微內核設計討論中確立了核心設計準則：**一切皆插件**。內核刻意做得極精簡，僅包含少量抽象服務，外加一個實體循環插件 `dsh-agent-loop`。所有產品功能均基于本文定義的擴展接口開發為獨立插件，無需改動主循環邏輯。

> Dependency rule: extension plugins depend on interfaces, never on `dsh-agent-loop` (the loop is swappable); composition bundles such as `dsh-base` and `dsh-sdk-minimal` may assemble the concrete loop.

依賴約束規范：各類擴展插件僅依賴抽象接口，嚴禁直接依賴 `dsh-agent-loop`（該主循環支持替換實現）；`dsh-base` 與 `dsh-sdk-minimal` 等組合包可以組裝具體循環。

> This document covers **behavior**; type definitions live in [subsystems/](../subsystems/core.md), the per-event/service reference lives in the generated regions of [subsystems/](../subsystems/core.md), and package contracts in the package READMEs state each package's required configuration and behavior ([map](../../packages/README.md)).

本文檔描述整體行為邏輯；類型定義存放于 [subsystems/](../subsystems/core.zh.md)；各類事件、服務的詳細參考見 [subsystems/](../subsystems/core.zh.md) 中的生成區塊；相應的 README 說明每個包（package）要求的配置和行為（[索引](../../packages/README.zh.md)）。

## ② 防御模式規則

> Hard-won bug-class rules: each pattern below is a class of defect that actually shipped or nearly shipped here, stated as the rule that prevents its recurrence. Read this before writing lifecycle, concurrency, subprocess, or teardown code.

這些都是踩坑總結得出的缺陷分類規范：下文每種范式都對應一類曾上線、或險些流入線上的問題，每條規范旨在杜絕同類問題復現。編寫生命周期、并發、子進程、資源銷毀相關代碼前，請務必閱讀本文檔。

> **Dispose must reach quiescence, not just request it** — A teardown that issues kills/aborts but returns before the work stops leaves orphans. Make cleanup async and await the children's exit (kill → await `done`), and close listener/notification registries BEFORE killing so late completions stay silent. Tests prove disposal waited (pid gone right after `await fiber.dispose()`), not merely that the process eventually dies.

**dispose（資源釋放）必須等待所有任務完全停穩，不能僅下發終止指令就返回**：如果清理過程只發出終止或中斷信號，卻不等任務停止就返回，就會留下孤兒進程。清理應采用異步方式，等待所有子任務徹底退出（先發出終止信號，再等待退出）；發出信號前應先關閉監聽器與通知注冊表，使延遲到達的完成事件不再觸發通知。測試要證明 dispose 的確等到清理完成：執行完 `await fiber.dispose()` 后進程 PID 立即消失，不能只檢查進程最終會自行消亡。

> **Async state is not synchronous state** — `agent.followup()` does not flip status before returning; a background job's completion races turn boundaries; `reader.close()` fires for both EOF and disposal. Never gate control flow on a status you only just requested — drive lifecycle off the events/promises that actually fire (`agent/status`, `task.done`), and observe the transition (saw `running` THEN `idle`) instead of treating status as a per-follow-up result: several queued follow-ups run as consecutive turns under one `running` interval, while cancellation or disposal can discard unstarted items.

**異步狀態不等同于同步瞬時狀態**：調用 `agent.followup()` 不會在返回前同步更新狀態；后臺任務的完成時間與輪次邊界存在競態；`reader.close()` 既會在讀到文件末尾時觸發，也會在資源釋放時觸發。切勿把剛剛發起的狀態變更當成已經生效，據此控制流程；生命周期邏輯應以實際觸發的事件和已完成的 promise（`agent/status`、`task.done`）為準，并觀察完整的狀態變化（先 `running`，再 `idle`），不要把狀態當作逐次 `followup()` 的結果：多次排隊的 `followup()` 會作為連續輪次運行，但可能共用一個 `running` 區間；取消或資源釋放還可能丟棄尚未啟動的隊列項。

## ③ 測試政策清單

> **Coverage gate** (`pnpm run test:coverage`): the gating run, per-file 100% on `packages/*/*/src`. An uncovered line is often dead code the gate is correctly flagging for deletion, not a missing test to bolt on. Line coverage is necessary, never sufficient — it proves lines ran, not that the feature works as shipped.

覆蓋率門禁（`pnpm run test:coverage`）：作為合入門禁校驗，要求 `packages/*/*/src` 目錄下每個文件行覆蓋率達到 100%。未覆蓋代碼行大多是無用死代碼，門禁標記這類代碼是提示刪除，而非單純補充測試。行覆蓋率是必要條件，但遠不充分：它僅能證明代碼被執行過，無法保證功能符合線上預期。

> We are DeepSeek — do not ration real-API tests. A no-key test proves the plumbing; only a with-key run proves the agent works against a real model. Write many: real prompts that write files, multi-turn conversations, tool use, cancellation mid-stream. Cheapest and highest-value are **smoke tests** that boot the real example, send one real prompt, and check the world — they catch the "green unit tests, broken product" class that mocks structurally cannot. The self-skip exists only so secretless CI and keyless contributors aren't blocked; it is not a cost signal.

我們是 DeepSeek：真實接口相關測試不得刻意縮減用例數量。無密鑰測試僅能驗證底層通路；只有攜帶有效密鑰執行的用例，才能確認 agent（智能體）可正常對接真實模型。請大量編寫此類測試：包含文件寫入類真實提示詞、多輪對話、工具調用、流式中途取消等場景。

成本最低、收益最高的是**冒煙測試**：拉起完整真實示例，發送一條真實提示，并檢查文件、進程等外部可觀察結果。這類用例能捕獲一類問題——單元測試全部綠燈，但產品實際運行故障，單靠 mock 完全無法發現這類缺陷。

自帶自動跳過邏輯，僅用于保障無密鑰 CI 環境、無權限貢獻者不會被流程攔截，不代表可以以此為由削減真實接口測試投入。

> **Prefer the real implementation over a mock** — Mock only genuinely expensive or non-deterministic dependencies (the LLM adapter, the network, the clock); keep everything downstream real. A hand-rolled stand-in proves the bridge moves bytes, not that the shipping tool behaves as asserted — the two drift while the test stays green.

**優先使用真實實現，而非 mock 替身**——僅對開銷極大、結果不確定的依賴做 mock（LLM（大語言模型）適配器、網絡、時鐘），其余下游組件全部使用真實實現。手寫的 mock 替身只能驗證數據通路能傳輸字節，無法保證線上工具符合預期邏輯；長期下來業務邏輯與 mock 實現會出現偏差，但測試仍會顯示通過。

## ④ 機制描述

> Blob hashes, not commit hashes, so the record is computable for files edited in the same PR (`git hash-object foo.md`) and consistency is a pure content comparison. The recorded hash also recovers the exact last-confirmed text of either side (`git cat-file -p <hash>`), so an out-of-sync pair is updated by diffing the edited side against its last-confirmed state and patching the counterpart minimally — never by re-translating whole files.

系統采用文件 blob hash 而非 commit hash 記錄狀態。同一 PR 內修改文件時，可通過 `git hash-object foo.md` 直接算出對應 blob hash，僅對比文件內容即可判斷雙語文檔是否同步。通過記錄的 blob hash，可使用 `git cat-file -p <hash>` 還原上次確認對齊時兩側的原文。當雙語文檔不一致時，只需對比修改版本與上次確認版本的差異，最小幅度同步修改另一側譯文，無需全文重新翻譯。

## ⑤ 政策聲明

> The gate's limit, stated plainly: a green gate means the pair was confirmed consistent at these exact contents, not that the confirmation was sound. It checks hashes and Markdown structure; it cannot judge whether the two sides actually say the same thing — that is the reviewer's half of the contract. A re-recorded pair with a sloppy counterpart passes the gate; it must not pass review.

門禁的限制很明確：通過門禁只說明兩側文件當前的 blob hash 與伴隨記錄吻合，并且 Markdown 結構簽名一致，也就是說，這組內容曾被確認一致；它不代表這次確認可靠。評審人必須檢查兩種語言是否真正表達了相同的意思。即使譯文粗糙、表意有誤，重新記錄配對后仍能通過門禁，但絕不能通過人工評審。

## ⑥ Agent Note 論證

> Comparing git timestamps of the pair (no record) — rejected: formatting-only edits would false-positive, and a counterpart committed after an unrelated edit would false-negative; content identity is the only signal that means what the gate claims.

對比雙語文件的 git 時間戳（無記錄方案）——不予采納：僅調整格式的改動會觸發誤報，無關修改后再提交譯文又會造成漏檢。只有基于內容本身的標識（每側文件的 blob hash 與伴隨記錄比對），才能承載門禁所聲稱的語義。

## ⑦ 統一要求（長段拆分示范）

> **Universal requirement**: every in-scope document merges as a complete bilingual pair. The manifest contains only explicit exclusions: it has no per-file rollout list, date cutoff, or README-specific policy class. […] Pairing is a continuing obligation: every later edit to either side updates the counterpart and consistency record in the same change.

**統一要求**：每篇納入范圍的文檔合入時都必須構成完整的雙語配對。manifest（元數據清單）只包含顯式排除項：其中沒有逐文件推進清單、日期分界或 README 專用政策類別。（……）配對是一項持續義務：后續修改任一側時，都必須在同一變更中同步更新對側文件和一致性記錄。

## 從樣例提煉的要點

- 語體是規范制度文：完整主謂、確定語氣；不口語化，也不學術腔。
- 給句子補顯式執行主體：英文的被動句和抽象主語，中文寫成「系統／門禁／工具／評審人」做主語。
- 用中文工程慣用語替換直譯：false positive/negative→誤報／漏檢、ratchet→只向前收緊不倒退放寬、reviewable act→評審憑證。
- 隱喻本地化而非移植：bilingual from birth→從創建起就要求雙語齊備；grandfathered→歷史存量遺留。
- 類別名詞說中文并在首現括注英文：實操手冊（cookbook）、事故復盤（postmortem）；指目錄或路徑時保留代碼體英文。
- 長段按語義單元拆段，一段一件事；名詞短語展開為動詞句。
- 母語重寫不等于刪減：原文每個語義成分都要落地。
- 樣例與 [terminology.md](terminology.md) 沖突時，以術語表為準：收錄樣例前按表修正術語（例如 agent、mock、LLM 保留英文，cancellation 譯「取消」）。
- 代碼體標識符（事件名 `agent/status`、狀態值 `running`、包名 `dsh-bash-local` 等）在譯文中保留 code span 原文，不得口語化改寫；Pass 2 必須逐句核驗。
