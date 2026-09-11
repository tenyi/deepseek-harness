# Session 格式版本與發布狀態

[English](session-format-status.md) | 中文

## 概述

本參考區分工作區的 Session 寫入器版本與最新已發布的 Session 格式。代碼常量擁有寫入器版本；下方發布記錄擁有最新已發布格式及其發布證據。其他文檔鏈接到這里，而不重復聲明哪個版本是當前、下一個或尚未發布的版本。

## 目錄

- [單一真源](#sources-of-truth)
- [發布記錄](#release-record)
- [更新記錄](#updating-the-record)
- [開發備注](#dev-note)

<a id="sources-of-truth"></a>
## 單一真源

- **工作區寫入器：**[核心 Session 類型](../packages/core/session/src/types.ts)中的 `SESSION_FORMAT_VERSION` 是代碼中唯一手工維護的當前寫入器版本號。[目錄生成器](../scripts/gen-session-format-catalog.ts)推導 codec 順序，并檢查相鄰遷移是否到達該版本。包版本、codec 導出名稱、fixture（測試前置數據）文件名或投影緩存版本都不是寫入器版本的權威來源。
- **最新已發布格式：**下方記錄中的 `latestReleasedVersion` 標識已發布的 Session 格式。`evidenceTag` 指定一個已發布的產品版本，其標簽對應的寫入器具有該值；它不必是首次攜帶該格式的發布。雙語副本按同一記錄校驗，不作為獨立決策維護。
- **發布狀態：**比較寫入器常量與已核實的發布記錄。相等表示寫入器格式已經發布。寫入器版本更高表示它是超出記錄中發布版本的開發目標。用較新分支中已核實的記錄對比舊工作區時，較低的寫入器版本表示較舊的寫入器格式；本地一致性門禁會拒絕同一工作區內的這種大小關系。不另行維護 released 布爾值。在聲明更高版本尚未發布前，必須核實是否已有產品發布推進了記錄。

產品的 alpha、beta 或 release-candidate 發布都會確立已發布 Session 格式的義務。GitHub 的 prerelease 標記不會讓持久化用戶數據成為可丟棄數據。缺少發布記錄不代表尚未發布。[版本與真源決策](../.agents/notes/implemented/architecture/2026-08-10-session-log-version-mechanism.zh.md)擁有兼容性決策；[已發布格式遷移](../.agents/notes/implemented/architecture/2026-08-31-released-session-format-migrations.zh.md)擁有不可變代際與相鄰轉換規則。

<a id="release-record"></a>
## 發布記錄

```yaml session-format-release
latestReleasedVersion: 3
evidenceTag: dsh-v0.1.5-alpha.1
```

證據：[已發布產品版本](https://github.com/deepseek-harness/deepseek-harness/releases/tag/dsh-v0.1.5-alpha.1)及[對應標簽的寫入器源碼](https://github.com/deepseek-harness/deepseek-harness/blob/dsh-v0.1.5-alpha.1/packages/core/session/src/types.ts)。

<a id="updating-the-record"></a>
## 更新記錄

實現結構性寫入器變更時，一起更新代碼常量與相鄰遷移目錄；不要在產品發布前推進此發布記錄。當產品首次發布更高的 Session 格式時，確認發布事實及對應標簽的寫入器，然后在同一次雙語更新中推進本記錄與兩個證據鏈接。后續攜帶相同格式的產品發布無需改變此記錄。開發主干上的記錄絕不降低。

[文檔標準測試](../scripts/doc-standard.spec.ts)檢查記錄結構、雙語一致性、證據鏈接一致性，以及文檔中的已發布版本不高于工作區寫入器。這個無密鑰檢查不會查詢 GitHub，也不能證明記錄是最新的；核實發布事實仍屬于發布更新的一部分。

一般行為使用“當前格式”和“下一條相鄰版本”等表述。固定遷移的輸入與輸出、協議 schema、歷史證據及針對特定版本的測試保留明確版本號。[格式版本實操手冊](cookbook/adding-a-session-format-version.zh.md)用 N 表示已核實的最新發布格式，用 N+1 表示其后繼版本。

<a id="dev-note"></a>
## 開發備注

無。
