---
description: "工具結果 spill 策略：部署如何用預覽和可檢索的 spill 文件把過大的純文本工具結果擋在模型上下文之外。"
kind: "package-reference"
---

# @deepseek-ai/dsh-spill-policy

[English](README.md) | 中文

## 概述

當過大的純文本工具結果不應進入模型上下文時，掛載本包。超過 `maxInlineBytes` 的結果會變成有界的首尾預覽，并附帶定位信息與取回指引；完整文本仍可通過已配置的 spill 后端訪問。spill 失敗時原始結果仍然可見，省略 `maxInlineBytes` 則會禁用該策略。同一上限也約束 `run_code` 子調用的持久日志副本，但不會改變程序收到的值。

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

把策略與 spill 后端一起掛載，以限制模型看到的工具純文本結果大小。上限作用于工具運行后的最終結果；策略放過的結果仍會原樣通過。

### 最小配置

以 UTF-8 字節計的 `maxInlineBytes` 預算加載策略，并同時掛載 spill 后端：

```yaml
- name: '@deepseek-ai/dsh-spill-local'
- name: '@deepseek-ai/dsh-spill-policy'
  config:
    maxInlineBytes: 50000
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `maxInlineBytes` | 省略 | 純文本結果面向模型的上下文上限（UTF-8 字節）；省略時完全禁用該策略 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-spill-policy)是每個受支持字段的窮盡式真源。負數或小數上限會讓插件加載失敗，而不是破壞每次調用的行為。

### 模型看到什么

過大的純文本結果會在同一預算內被替換為預覽加通知，因此整個替換內容永遠不會超過 `maxInlineBytes`：

```text
<retained head/tail preview>

(Omitted N bytes. Full formatted result stored at: /…/session-…/…-web_fetch.txt. Use read with offset/limit, or grep this path to search within it.)
```

當通知本身已占滿預算（上限極小或定位信息很長）時，預覽為空，只返回通知；如果連這也會超過上限，策略會保留原始內聯結果——上限內的替換內容總比原始結果小。完整文本仍保留在 spill 文件中，成功的替換只改變面向模型的副本，絕不改變規范的程序化結果。

### 哪些結果會受影響

策略只作用于最終、已接受且純文本的結果。不超過上限的結果、包含任何非文本塊的結果、嵌套復合調用、`read` 結果、被阻止的決策與已接受的值替換都會原樣通過。此前已經發生的提供方級截斷（例如 `web-fetch-http.maxBodyChars`）無法在此恢復——spill 文件保存的是工具實際返回的內容。

### 盡力而為的故障行為

缺少會話所有者、缺少 `ctx.spillStore` 后端或 `saveText` 拒絕時，會記錄警告并返回原始結果。spill 失敗絕不會把成功的調用變成錯誤，也絕不會隱藏內聯結果。

### 持久日志副本

同樣的上限也約束每個 `run_code` 子調用結果的會話日志副本：程序仍會收到完整值，只有日志副本被替換為預覽與定位信息。過大的 `read` 子調用結果在此同樣設界，因為日志副本不是模型上下文。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋該策略背后的設計決策；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

該策略刻意保持狹窄：它只決定**何時** spill，并組合通知。它不注冊服務、不負責存儲、也不負責預覽機制——`dsh-output-retention` 的 `TextRetainer` 負責構建首尾預覽。兩個不變式塑造了代碼：面向模型的替換永遠不會超過 `maxInlineBytes`（先為通知預留字節成本），且 spill 失敗永遠不會改變工具調用的結果。

### 兩條分支

`tools/post-execute` waterfall（瀑布式事件）監聽器（以 `prepend` 注冊、通過 `next()` 委托）約束面向模型的結果；`tools/ptc-dispatch-log` 監聽器約束每個 `run_code` 子調用的持久日志副本。兩者共享同一個替換輔助函數，因此兩個投影字節一致。post-execute 分支跳過 `read` 以避免 read → spill → read 循環；dispatch-log 分支約束 `read` 子調用，因為日志副本不是模型上下文。

<a id="shared-notice-ownership"></a>
### 共享通知的所有權

瀏覽器安全入口 `@deepseek-ai/dsh-spill-policy/notice` 同時負責生產方使用的 `formatSpillNotice(omitted, ref)` 和展示消費方使用的 `hasSpillNotice(text)`。格式化與識別共用通知分隔符；省略信息通過現有的 `describeOmitted` 格式化函數校驗，而非復制一套文案。識別支持預覽之后或單獨出現的完整末尾通知，并保留持久化通知的原有拼寫。它只讀取已記錄的文本，不改寫文本。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`Config` 校驗、兩個 waterfall 監聽器、共享替換輔助函數 |
| [`src/notice.ts`](src/notice.ts) | 瀏覽器安全的通知格式化與識別，以 `./notice` 發布 |
| [`src/types.ts`](src/types.ts) | `SpillPolicyExec`：策略讀取所屬會話 id 所需的最小結構化工具執行視圖 |
| — | 不發布運行時不變式伴生入口；除在所屬 seam 處強制執行的約定外，本包不公開獨立的事件序列或可變數據關系。 |

### 故障模式

兩條分支都適用盡力而為降級：沒有會話所有者、沒有后端、保存被拒絕或沒有上限內的替換時，記錄警告并保留原始內容。加載時校驗會拒絕負數或小數 `maxInlineBytes`，讓錯誤配置失敗在部署階段，而不是讓每次超大調用都失敗。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。

- [spill 存儲服務](../spill/README.zh.md)——策略替換背后的 `saveText` 約定。
- [dsh-spill-local](../spill-local/README.zh.md)——保存 spill 文本的本地后端。
- [dsh-output-retention](../../util/output-retention/README.zh.md)——策略組合的預覽機制（`TextRetainer`）。
- [工具輸出 spill 決策](../../../.agents/notes/implemented/architecture/2026-07-08-tool-output-spill-files.zh.md)——能力邊界與設計依據。

-----

<a id="model-experience"></a>
## 模型體驗

### 過大的純文本結果

#### 模型看到什么

不超過 `maxInlineBytes` 的結果、嵌套結果、`read` 結果、被阻止的決策與包含非文本塊的結果保持不變。過大的純文本面向模型結果會變成有界的首尾預覽，后面附加 `(Omitted <bytes> bytes. Full formatted result stored at: <locator>. <retrievalHint>)`；存儲或歸屬失敗時原始結果仍然可見。

#### Token 影響

成功的替換最多為 `maxInlineBytes` 個 UTF-8 字節，并保留在歷史中直到壓縮（compaction）；完整 spill 文本不會重新發送給模型。

#### KV Cache 影響

僅追加；新可見內容位于可重用請求前綴之后，不會使現有 KV Cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明策略在哪些情況下無法提供幫助。它們是當前的包約束。

- **文本識別無法認證輸出來源**——工具也能打印相同的通知文本；`hasSpillNotice` 識別的是文本約定，不能證明策略保存過結果。
- **只能對最終純文本結果執行 spill**——混合內容結果、阻止反饋與 `read` 會原樣通過；此前已經發生的提供方截斷或工具自有保留無法在此恢復。
- **通知無法容納時會禁用該次調用的替換**——上限極小或定位信息很長時，后端已經保存了無引用的 spill，但過大的原始結果仍留在內聯位置。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文：開放方向。它明確不具權威性。

#### 未來：逐工具配置

逐工具選擇退出或逐工具策略聲明仍然延期；內置的 `read` 跳過已覆蓋已知循環，第二個真實工具需求才能證明配置的合理性。

#### 未來：更早的 spill

該策略只能看到最終格式化文本，因此已被提供方截斷或只以運行時產物形式存在的內容（例如 bash 流或 subagent 展開）仍在觸達范圍之外；通過 `ctx.spillStore` 實現的工具自有早期 spill 仍然延期。

</details>
