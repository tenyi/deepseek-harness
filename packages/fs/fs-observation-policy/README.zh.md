---
description: "編輯前讀取的文件系統策略插件：面向選擇或排查受防護寫入/編輯行為的部署方與維護者。"
kind: "package-reference"
---

# @deepseek-ai/dsh-fs-observation-policy

[English](README.md) | 中文

## 概述

`dsh-fs-observation-policy` 要求 agent（智能體）先讀取文件，文件系統工具才可覆蓋或編輯它。如果文件自讀取后發生變化，它也會拒絕變更，并清楚提示重新讀取后重試。讀取缺失路徑會授權帶防護的創建，同時仍防止覆蓋并發創建的文件。需要編輯前讀取安全性的部署請選擇它；由于觀察記錄不持久化，恢復的會話必須重新讀取目標。

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

當部署希望模型在覆蓋或編輯文件之前先讀取該文件時，把本插件與 `ctx.fs` 后端及 `dsh-tool-fs` 工具一起加載。插件無需配置，也不注入任何服務；它只監聽工具分派的 `fs/*` 事件。

### 最小組合

先加載后端，再加載本插件，最后加載工具。策略監聽器應當是 `fs/*` 意圖 slot 上第一個注冊的決策器。

```yaml
- name: '@deepseek-ai/dsh-fs-local'
- name: '@deepseek-ai/dsh-fs-observation-policy'
- name: '@deepseek-ai/dsh-tool-fs'
```

### 對模型而言的變化

掛載策略后，`write` 可以創建新文件，但拒絕覆蓋會話未讀取過的現有文件；`edit` 要求先讀取目標；自讀取以來發生變化（包括缺失）的文件以 `FS_STALE_VERSION` 失敗。缺失也會被記錄：讀取缺失文件會把它標記為確認缺失，因此隨后的 `write` 可以通過防護創建流程重新創建它。會話恢復后不攜帶任何已觀察狀態，因此必須重新讀取文件，防護變更才能再次成功。

### 失敗與恢復

沒有先前觀測的編輯以代碼 `FS_NOT_OBSERVED` 和策略原因 `edit requires reading "<path>" first` 失敗；編輯被觀測為缺失的目標以 `FS_NOT_FOUND` 失敗。工具把策略和提供方的未讀失敗統一為 `cannot modify "<path>": file has not been read — read the file, then retry`，同時保留錯誤碼和原始原因。在外部刪除的文件上遵循該恢復指令會記錄缺失，因此下一次防護寫入可以重新創建它，而不會覆蓋并發創建者。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋策略插件背后的設計決策，并指出實現它們的代碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

插件建立在兩個想法之上：

- **事件門禁，而非方法服務。** 插件只通過 `fs/*` 事件影響外部世界，因此不注冊 `ctx.fsPolicy` 服務，也沒有公開方法。移除它不會在服務注入邊界破壞 `dsh-tool-fs`——工具會直接落到裸提供方。
- **已觀察狀態是先前觀察記錄。** 一張以所有者為弱鍵、記錄各目標的映射表持有三種邏輯狀態——未見、確認缺失、存在于某個版本。插件本身不執行任何文件系統 I/O；它把記錄的狀態轉換為提供方的可選防護，由提供方執行原子新鮮度檢查。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 三個 `fs/*` 監聽器與已觀察狀態門禁 |
| [`src/types.ts`](src/types.ts) | 不透明事件參與者形態，從中派生所有者會話 |

### 決策流程

`fs/write-intent` 把未見或確認缺失解析為 `{ kind: 'createIfAbsent' }`，把已觀測存在解析為 `{ kind: 'replaceIfVersion', version: vObserved }`。`fs/edit-intent` 以 `FS_NOT_OBSERVED` 拒絕未見目標，以 `FS_NOT_FOUND` 拒絕確認缺失的目標，否則提供觀察到的版本作為比較并交換的基礎。`fs/observed` 為該所有者與目標記錄 `{ kind: 'present', version }` 或 `{ kind: 'absent' }`——同步、只有副作用的 `WeakMap.set`，因為成功的變更已經提交。

### 單 slot、先到者勝

每個意圖 slot 只容納一個決策器：本插件會完整決策，絕不調用 `next()`。slot 按注冊順序先到者勝——由本插件擁有 slot 只是默認部署約定，不是事件強制的不變式。分層權限、審計或沙箱攔截屬于 `tools/execute` waterfall（瀑布式事件）。

### 生命周期

已觀察狀態在插件 dispose（資源釋放）時丟棄，以確保 HMR（熱模塊替換）安全，且絕不跨會話持久化——恢復的會話從無觀察狀態開始。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從策略逐步進入它所組合的約定、工具與后端。

- [文件系統子系統](../../../docs/subsystems/filesystem.zh.md)——窮盡式提供方約定、策略事件與錯誤分類體系。
- [dsh-fs](../fs/README.zh.md)——`ctx.fs` 約定與 `fs/*` 事件詞匯。
- [tool-fs](../tool-fs/README.zh.md)——分派 `fs/*` 事件的面向模型工具。
- [fs-local](../fs-local/README.zh.md)——本策略所防護的宿主文件系統后端。
- [fs-sandbox](../fs-sandbox/README.zh.md)——與本策略組合的沙箱強制后端。
- [Fsspec 風格 seam 拆分 Agent Note](../../../.agents/notes/implemented/simplification/2026-06-26-fsspec-style-fs-seam.zh.md)——策略為何是事件插件而非提供方方法。

-----

<a id="model-experience"></a>
## 模型體驗

### 文件系統工具結果

#### 模型看到的內容

該插件不添加提示詞或 schema。沒有先前觀測時，它會以代碼 `FS_NOT_OBSERVED` 和策略原因 `edit requires reading "<path>" first` 拒絕編輯；編輯被觀測為缺失的目標返回 `FS_NOT_FOUND`。正向觀測陳舊時，帶防護的變更會傳播由提供方擁有的 `FS_STALE_VERSION` 錯誤。[`dsh-tool-fs`](../tool-fs/README.zh.md) 擁有模型側錯誤包裝：它把所有 `FS_NOT_OBSERVED` 來源規范化為 `cannot modify "<path>": file has not been read — read the file, then retry`，而 `FS_STALE_VERSION` 保留提供方原因并追加 `— re-read the file, then retry`；兩者都保留錯誤碼和原始原因。外部刪除目標后，遵循陳舊恢復指令會記錄缺失：下一次帶防護的寫入可以通過 `createIfAbsent` 重新創建該目標，而提供方會以原子方式保留任何并發創建者寫入的文件。

#### Token 影響

允許的操作除了普通工具結果外不增加 token。拒絕會添加少量保留的錯誤結果，并避免產生成功 payload。

#### KV Cache 影響

僅追加；新增可見內容位于可復用請求前綴之后，不會使現有 KV Cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本策略何時不合適，或何時需要特別的運維注意。它們是當前包約束，不是通用文件系統對比或任務積壓。

- **已觀察狀態無法在會話恢復后保留**：該記錄的持久化工作延期處理，因此恢復的會話必須重新讀取文件，才能執行防護寫入與編輯。
- **沒有 agent 會話的參與者絕無法滿足策略**：它們的編輯會拋出 `FS_NOT_OBSERVED`，寫入總會解析為 `createIfAbsent`，因此非 agent 調用方無法通過門禁覆蓋現有文件。
- **直接 `ctx.fs` 讀取不會發出 `fs/observed`**：在 `read` 工具之外讀取的文件仍未觀察；后續防護編輯會以 `FS_NOT_OBSERVED` 拒絕，直到工具讀取該文件。
- **授權依據是版本新鮮度，而非視圖完整性**：任何窗口讀取都會授權對未變文件執行全文件覆蓋，這有意弱于完整視圖規則（見[seam 拆分 Agent Note](../../../.agents/notes/implemented/simplification/2026-06-26-fsspec-style-fs-seam.zh.md)）。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。本包沒有獨立事件序列或可變數據關系，相關約定在所屬 seam 強制執行。
