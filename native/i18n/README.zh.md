# 雙語文檔

[English](README.md) | 中文

本倉庫的文檔會被公司內外的人和 agent（智能體）閱讀，因此范圍內的每篇文檔都以英文和簡體中文維護。本頁定義配對約定、檢查、范圍與排除規則；[translation-rules.md](translation-rules.zh.md) 定義如何翻譯；[terminology.md](terminology.md) 是術語真源。agent 的日常工作遵循 [docs/AGENTS.md](../AGENTS.md) 中的輕量路徑；擴展版 [.agents/skills/dsh-translate-docs](../../.agents/skills/dsh-translate-docs/SKILL.md) 工作流僅在用戶顯式調用時可用。

<a id="the-pairing-contract"></a>

## 配對約定

- **兩種語言同權。** 一篇文檔可以先用任一語言撰寫和評審（先寫中文的 Agent Note 與先寫英文的一樣正當），另一側由它翻譯而來。兩個文件誰也不高于誰；約束它們的是二者必須說同樣的話。
- **一對文檔是三個同目錄文件。** 英文 `foo.md`、中文 `foo.zh.md`，加一份一致性記錄 `foo.i18n.yaml`，都在同一目錄。不用語言目錄，不用獨立翻譯倉庫，不用中英混排的單文件。配對必須整體合并：PR（Pull Request）永遠不會只帶一種語言而缺其余兩個文件。
- **一致性記錄。**`foo.i18n.yaml` 保存兩側文件在上一次被確認「說同樣的話」時各自的完整 Git blob hash：

  ```yaml
  foo.md: 3f786850e387550fdab836ed7e6dc881de23001b
  foo.zh.md: 89e6c98d92887913cadf06b2adb97f26cde4849b
  ```

  用 blob hash 而不是 commit hash，這樣同一個 PR 里改動的文件也能算出記錄（`git hash-object foo.md`），一致性是純內容比較。`--write` 會先把這些快照存入本地 Git 對象庫再寫下記錄，未提交的 worktree 內容也不例外；它還會在內容尋址的 `refs/dsh/translation-pairing/snapshots/` ref 下固定每個不同的已存 blob，使垃圾回收無法讓已記錄的恢復指針失效。記錄的 hash 能還原任一側上次確認時的確切文本，所以失去同步的配對是「按被改一側的 diff 最小化地修補另一側」，從不整篇重譯。日常工作會直接完成這份修補；用戶顯式調用擴展工作流時，可改由 `pnpm run gen-translation-brief <pair>` 以能安全對齊的最窄粒度匯集這次更新，并由 `--apply` 在結構校驗后拼接僅涉及圍欄代碼塊的改動。兩側對齊后，`pnpm run verify-translation-pairing --write <pair>` 重新記錄兩個 hash；那份 YAML diff 就是「確認一致」這個動作本身，可以被評審，也正因如此，`--write` 要求點名你確認過的配對（`--write --all` 是顯式的全語料形式）。

  當兩個分支都包含同一配對的有效確認時，已安裝的 `dsh-translation-pairing` Git 合并驅動只會在 Git 默認文本合并能分別干凈合并記錄所指向的英文三方 blob 與中文三方 blob，且合并后的配對仍保留必需的語言切換行和結構簽名時，組合出一份新記錄。中文文件必須保留指向英文的反向鏈接；普通撰寫的英文源必須保留指向中文的鏈接，而清單內的生成英文源不作此要求。任何合并驅動無法驗證的結構都保留為普通沖突；`pnpm run resolve-translation-pairing-conflicts` 會對已經停止的合并執行同一套遇錯即保留沖突的操作，暫存每份可安全生成的配對記錄，并在還有其他配對沖突時以非零狀態退出。[自動配對合并 Agent Note](../../.agents/notes/implemented/process/2026-08-08-automatic-translation-pairing-merges.zh.md) 負責記錄該機制與備選方案。
- **語言切換行。** 中文文件一律在 H1 標題后立即以 `[English](foo.md) | 中文` 鏈回英文。普通撰寫的英文文件在同一位置以 `English | [中文](foo.zh.md)` 互鏈；清單內的生成英文源省略此行，以便與生成器輸出逐字節一致。發布到 GitHub 以外位置的 README（例如 PyPI 項目元數據）可以改用指向同一對側文件的規范 `https://github.com/deepseek-ai/deepseek-harness/blob/master/<repository-path>` URL，使切換行在該位置仍可訪問。
- **結構與另一側一一對應。** 標題深度與順序、列表類型、有序列表起始編號、列表項數量、表格行列數、保留原樣 query/fragment 后綴的語義鏈接目標，以及逐字節一致的代碼塊在配對兩側一一對應。相對文檔鏈接的目標屬于活躍雙語語料時，英文側使用其 `.md` 路徑，中文側使用其 `.zh.md` 路徑。該范圍內缺少對側屬于配對完整性錯誤，不得回退；范圍外的目標保留原路徑。完整保持規則見 [translation-rules.md](translation-rules.zh.md)。既有 Markdown 門禁對 `.zh.md` 文件原樣生效（`verify-md-wrap`、`verify-md-links`）。

## 門禁：verify-translation-pairing

`pnpm run verify-translation-pairing`（`doc-sync`（文檔同步門禁）的一環，貢獻者會針對文檔變更在本地運行，CI 則會完整運行）機械地強制執行這份約定：

1. 范圍內的每篇文檔都有完整配對。發現 README 時，basename 不區分大小寫，因此 `missions/readme.md` 與其他文檔根一樣屬于范圍。
2. 任何已存在的配對產物都完整且一致：三個文件齊全、每一側的當前 blob hash 等于記錄值（改了任一側而沒重新確認配對就變紅）、中文側和所有普通撰寫的英文源都帶語言切換行（清單內的生成英文源除外）、每條普通相對文檔鏈接都使用源文件一側對應的目標 locale，且結構簽名按序一致：標題深度、逐字節一致的代碼塊（信息字符串與內容）、表格行列數、列表類型、有序列表起始編號、列表項數量，以及除切換行之外保留原樣 query/fragment 后綴的語義鏈接目標。
3. 列為 `excluded` 的文件完全沒有 `.zh.md`，也沒有 `.i18n.yaml`。`.agents/notes/archived/` 下凍結的 Agent Note 不受這個持續演進的門禁約束；專用校驗器會要求其現有的三個配對文件完整，并將其封存。

面向源碼的代碼門禁會把精確的 `.zh.md` 圍欄序列視為其無后綴兄弟文件的派生內容，而不會再次編譯相同代碼或在 manifest（元數據清單）中重復登記。該序列必須在長度、順序、圍欄類型和按字節精確的正文上一致；否則兩份副本仍會獨立受檢，配對門禁也會報告結構不匹配。

`pnpm run verify-translation-pairing --list` 打印范圍內每篇文檔的當前配對狀態（missing、out-of-sync 或 ok）。它從不失敗；其中 `missing` 與 `out-of-sync` 行指出普通檢查會拒絕的違規。

`pnpm run verify-translation-pairing <pair...>` 只檢查被點名的配對——配對的三個文件中的任意一個（或其裸詞干）都能點名它——因此更新循環幾秒內就能驗證自己的配對，而不必重新掃描全語料。`doc-sync` 與 CI 運行的是無參數的全語料形式；限定范圍的綠燈在 PR 層面永遠不能替代它。

這個門禁帶來的實際規則是：**當一個 PR 修改了已配對文檔的任一側時，同一個 PR 在術語指導下直接一次完成對側文件的更新，并用 `--write <pair>` 重新記錄配對**，與本倉庫既有的代碼與 README 的 doc-sync 規則完全一致。留下失去同步的配對的 PR 會在 CI 變紅。

門禁的限制很明確：**門禁通過意味著這組文檔在當前內容上的一致性得到了確認，不代表確認本身正確可靠。** 它檢查記錄的 hash 與 Markdown 結構；它無法判斷兩側是否在說同樣的話，也無法判斷措辭是否準確、術語是否得當、行文是否自然；這部分約定由評審者把關，見 [translation-rules.md](translation-rules.zh.md)。重新記錄了 hash 但另一側翻得潦草的配對能通過門禁；它不得通過評審。

## 范圍與排除

**范圍**：根目錄 `CONTRIBUTING.md`、`BRAND_GUIDELINES.md` 與 `SAFETY.md` 文檔、除 vendor 源碼外的全部 README，以及 `.agents/notes/**`、`docs/**` 與 `python/**` 下的全部活躍文檔。匹配 README 時只看文件名且不區分大小寫，因此今后新增的目錄無需再修改 manifest。依賴目錄、被忽略的構建產物目錄以及凍結的 `.agents/notes/archived/` 目錄樹只在發現階段排除，不屬于持續演進的翻譯源文檔。

有經評審的中文對側的生成英文參考文檔和圖文檔遵循配對規則。生成器仍是英文真源，新鮮度門禁與配對門禁各自獨立強制其約束；重新生成導致英文變化后，配對會保持失去同步狀態，直至經評審的中文對側完成更新并重新記錄。Cordis subsystem 區塊生成器等同時擁有兩側輸出的生成器，會把配對文檔路徑投影到各自 locale，同時保持其余生成字節一致。生成的英文源文件不含普通撰寫文檔所帶的語言切換行，因為添加該行會使生成器新鮮度檢查失敗；中文對側仍鏈接回英文源。生成頁的中文對側只能改寫若直譯便不再符合經評審譯文事實的自指生成與維護說明；所有技術內容仍受普通忠實性規則約束。

**排除**（永不配對，門禁拒絕為它們建 `.zh.md` 或 `.i18n.yaml`）：

- [cordis-api/inherited.md](../cordis-api/inherited.md)：該生成文檔沒有經評審的中文對側，因此網站的兩個 locale 都投影英文源文件。
- `docs/AGENTS.md`、`.agents/notes/**/AGENTS.md` 以及指向它們的 `CLAUDE.md` 指令符號鏈接：agent 指令，與根 `AGENTS.md` 一樣只以英文維護。
- `docs/i18n/terminology.md` 與 [style-samples.md](style-samples.md)：二者本身即為中英對照文檔。
- [translation-prompt.md](translation-prompt.md)：自動翻譯流水線的提示詞模板；正文逐字進入模型請求，配對翻譯會改變流水線行為。
- [review-ownership/README.md](../../.github/review-ownership/README.md)：倉庫內部審批策略，只以英文維護。
- `.agents/notes/archived/`：凍結的歷史三文件配對。[`verify-archived-agent-notes`](../../scripts/verify-archived-agent-notes.ts) 校驗其完整性和內容封存記錄；翻譯維護絕不能重寫這些文件。

**統一要求**：當前及今后納入范圍的每篇文檔，合并時都必須構成完整的雙語配對。[scripts/translation-pairing.manifest.json](../../scripts/translation-pairing.manifest.json) 只包含顯式排除項；不存在逐文件推進清單、日期分界或 README 專用政策類別。

## 分工

日常更新對側文件時，負責處理的 agent 會先加載 [terminology.md](terminology.md)，再直接一次性更新；它不會調用翻譯 skill（技能）、生成簡報、執行單獨的翻譯評審輪次，也不會委派給 subagent。擴展版 [dsh-translate-docs](../../.agents/skills/dsh-translate-docs/SKILL.md) 工作流保留這些較重的機制，僅供用戶顯式調用。門禁負責檢查配對是否完整、記錄的 hash、中文反向鏈接和普通撰寫源的切換行（生成源按本文規則例外），以及本文列出的結構簽名；翻譯質量、術語和簽名未涵蓋的結構要求仍由評審把關。提示詞約定也有可執行實現：[scripts/translation-prompt.ts](../../scripts/translation-prompt.ts) 會把倉庫內置的模板（注入術語表；模板自帶經人工校準的規則）渲染為英譯中或中譯英兩個方向的提示詞，并解析三段式響應；`doc-sync` 中的 `verify-translation-prompt` 會檢查兩個渲染方向與倉庫內示例。
