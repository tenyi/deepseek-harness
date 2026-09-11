---
description: "強制沙箱的 `ctx.fs` 后端：面向把模型文件變更限制在會話工作區內的部署方與維護者。"
kind: "package-reference"
---

# @deepseek-ai/dsh-fs-sandbox

[English](README.md) | 中文

## 概述

`dsh-fs-sandbox` 按各會話的沙箱模式限制模型對文件的寫入與編輯，同時保留本地文件系統的讀取行為。`read-only` 拒絕所有變更；`workspace-write` 只允許目標位于會話工作區或平臺臨時根目錄內；`danger-full-access` 不限制變更。當會話需要將文件變更限制在工作區內時，使用它代替 `fs-local`，并加載 `ctx.sandboxPolicy`。被拒絕的操作返回 `FS_SANDBOX_DENIED`，文件系統工具會顯示當前模式和同輪次升級提示。

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

當模型的文件寫入與編輯必須受會話沙箱模式約束、而讀取保持不受約束時，掛載此后端以替代 `fs-local`。圍欄按調用生效：工具層把調用會話的模式與工作區根目錄解析為與 bash runner 收到的相同策略，因此文件系統與 shell 兩個能力族絕不會約束到不同根目錄。

### 最小組合

先加載共享策略服務，再加載此后端，最后加載工具；編輯前讀取策略插件仍為可選。

```yaml
- name: '@deepseek-ai/dsh-sandbox-policy'
- name: '@deepseek-ai/dsh-fs-sandbox'
  config:
    cwd: /absolute/path/to/workspace
- name: '@deepseek-ai/dsh-tool-fs'
```

后端的配置與本地后端完全相同（`cwd` 解析默認值與 `diffBasisMaxBytes` 覆寫上限）；[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-fs-sandbox)是完整配置的真源。

### 圍欄行為

有效模式來自調用會話的覆蓋值或升級授權，兩者都未生效時才回退到部署默認值。`read-only` 以結構化 `FS_SANDBOX_DENIED` 拒絕所有變更。`workspace-write` 只允許目標規范化后位于工作區根目錄或平臺臨時區域（`/tmp`、`os.tmpdir()`）之下的變更——與 Seatbelt profile 授權的可寫集合相同。`danger-full-access` 不加圍欄直接委托。

### 可觀察的成功與失敗

讀取、列出與元數據操作與 `fs-local` 完全一致。被拒絕的變更返回攜帶有效模式的 `FS_SANDBOX_DENIED` 錯誤；經工具，模型會看到 `[sandbox: file access denied under <mode> mode]` 及唯一一次獲批更寬權限的重試提示，與 bash 的拒絕完全相同。獲得批準升級的會話可以在該次調用中以嚴格更寬的模式重試同一操作。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋沙箱后端背后的設計決策，并指出實現它們的代碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

圍欄是在可信代碼中檢查模型控制路徑的策略，而非內核邊界。操作屬于 seam 自身（open、rename），只有目標路徑不可信，因此「規范化后檢查包含關系」就是該接口的完整答案。不可信代碼的內核級隔離仍由 `ctx.shell` 負責。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | `SandboxedFileSystem`：`writeText`/`editText` 上的模式圍欄、`sandboxMode` 事實 |
| [`src/containment.ts`](src/containment.ts) | 祖先包含檢查，帶詞法快速路徑與基于身份的兜底 |

### 變更如何被圍欄

每次變更先解析按調用策略（`danger-full-access` 原樣返回調用方目標；`read-only` 拋出 `FS_SANDBOX_DENIED`），`workspace-write` 則立即重新規范化目標，并要求它位于由唯一的 `writableRoots` 函數派生的某個可寫根之下——與 Seatbelt profile 授權的集合相同，因此 fs 圍欄與 bash runner 不會漂移。被變更的正是這個新目標，因此工具解析后被替換的符號鏈接祖先也會被發現。

### 威脅模型

解析到系統調用之間殘留的 TOCTOU 通過寫入前立即重新規范化來縮小，并為該威脅模型所接受；內核嚴密邊界需要 `openat2` 一類原語，其可移植性成本在此不值。拒絕是結構化 `FsError`，而不是 stderr 推斷——進程內圍欄準確知道自己拒絕了什么。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從本后端逐步進入共享策略歸屬及其背后的隔離決策。

- [文件系統子系統](../../../docs/subsystems/filesystem.zh.md)——窮盡式提供方約定、策略事件與錯誤分類體系。
- [dsh-fs](../fs/README.zh.md)——本后端實現的 `ctx.fs` 約定。
- [fs-local](../fs-local/README.zh.md)——本后端擴展的本地后端。
- [sandbox-policy](../../sandbox/sandbox-policy/README.zh.md)——本后端所需的共享逐會話策略解析器。
- [進程沙箱子系統](../../../docs/subsystems/sandbox.zh.md)——模式、逐調用策略與故障關閉錯誤。
- [跨能力族 fs 沙箱決策](../../../.agents/notes/implemented/feature/2026-07-14-cross-family-fs-sandbox.zh.md)——共享模式圍欄及其升級編排。

-----

<a id="model-experience"></a>
## 模型體驗

### 文件系統策略與拒絕

#### 模型看到的內容

策略歸屬方貢獻與具體能力無關的 `sandbox:policy` 上下文。作為間接影響，`dsh-tool-fs` 會把本后端的 `FS_SANDBOX_DENIED` 拒絕渲染為 `[sandbox: file access denied under <mode> mode]` 標記和同輪次升級提示。

#### Token 影響

該后端掛載期間，當前策略條款會增加一條簡短的運行時上下文消息；拒絕則會把有界標記與升級提示追加到對話歷史。

#### KV Cache 影響

常駐策略發生變化時，會在保留的歷史之后追加一份由歸屬方渲染、取代先前狀態的運行時上下文快照；操作結果保持僅追加。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明沙箱后端何時不合適，或何時需要特別的運維注意。它們是當前包約束，不是通用沙箱對比或任務積壓。

- **策略圍欄，而非內核邊界**：該檢查是可信代碼處理模型控制的路徑，因此解析到系統調用之間殘留的 TOCTOU 會被原位重新規范化縮小，但不會消除；對抗性宿主進程不在范圍內。不可信代碼的內核級隔離仍屬于 `ctx.shell`。
- **圍欄與 runner 的一致性由單一所有方派生**：可寫集合來自 `writableRoots`，該函數與 Seatbelt profile 共享；在其他位置定義可寫集合的 runner profile 會發生漂移。
- **要求 `ctx.sandboxPolicy`**：工具使用它解析每個會話策略，后端用它處理無 agent（智能體）調用的回退；未組合該服務時，后端不會實施約束。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。這個無狀態適配器把策略與文件系統關系委托給各自所屬的 seam。
