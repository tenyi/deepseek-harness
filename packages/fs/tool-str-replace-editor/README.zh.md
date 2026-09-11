---
description: "基于 `ctx.fs` 的獨立 str_replace_editor 工具：供為 agent（智能體）組合 Claude Code 風格文件編輯能力的用戶與維護者使用。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-str-replace-editor

[English](README.md) | 中文

## 概述

`dsh-tool-str-replace-editor` 提供基于 `ctx.fs` 的獨立面向模型 `str_replace_editor` 工具：`view` 顯示帶行號的文件內容或淺層目錄列表，`create` 創建新文件，`str_replace` 應用唯一的字面量替換，`insert` 在選定的邊界處插入行。它可以與持久 Bash、一次性 Bash、沙箱 Bash 或其他終端接口組合。修改操作遵守與 fs 家族其余部分相同的編輯前讀取策略與沙箱圍欄，具體由所掛載的后端與策略插件強制執行。當部署需要 Claude Code 風格、使用絕對路徑的單一編輯器工具時選擇它；`dsh-tool-fs` 包提供替代的 `read`/`write`/`edit` 套件。

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

當模型應通過熟悉的 `view`/`create`/`str_replace`/`insert` 命令詞匯在絕對路徑上編輯文件時，把工具與 `ctx.fs` 后端（以及需要防護變更時的策略插件）一起掛載。

### 最小組合

一個后端、可選地加策略插件，然后是工具；編輯器可與任何終端接口組合。

```yaml
- name: '@deepseek-ai/dsh-fs-local'
- name: '@deepseek-ai/dsh-fs-observation-policy'
- name: '@deepseek-ai/dsh-tool-str-replace-editor'
```

### 配置

| 鍵 | 默認值 | 含義 |
|---|---|---|
| `maxOutputChars` | `16000` | 文件和目錄查看結果保留的前綴字符數 |
| `description` | `Custom editing tool for viewing, creating and editing files`（多行） | 面向模型的工具描述 |

### 命令

`view` 返回從 1 開始編號的文件內容（保留制表符，因此顯示的文本仍可作為有效的字面量替換輸入）或忽略隱藏、依賴與 Python 緩存條目的兩層目錄列表。`create` 創建新文件，并拒絕覆蓋現有文件。選定命令不使用的專用字段可以包含 `null` 占位符；必填字段仍保持必填，`view_range: null` 選擇完整視圖，`str_replace.new_str: null` 會被拒絕，因此刪除內容必須省略該字段。`str_replace` 要求字面量唯一匹配，錯誤只使用公開的 `old_str` 詞匯；`insert` 遵循所選的零基插入邊界，不會隱式補尾換行。修改操作會保留請求編輯范圍之外的制表符。

### 失敗與恢復

`view`、`str_replace` 或 `insert` 發生元數據未命中時，工具會在返回 `FS_NOT_FOUND` 前記錄確認缺失，因此后續 `create` 可以通過已掛載策略的防護創建流程恢復外部刪除的路徑；缺失狀態絕不會授權 `str_replace` 或 `insert`。防護變更繼承策略插件的錯誤碼與恢復指令——`FS_NOT_OBSERVED`（先讀取文件再重試）、`FS_STALE_VERSION`（先重新讀取再重試）——沙箱拒絕則表現為 `[sandbox: file access denied under <mode> mode]` 標記。路徑必須是絕對路徑；相對路徑會被拒絕并給出提示。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋編輯器工具背后的設計決策，并指出實現它們的代碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

該工具是基于 `ctx.fs` 的單一 schema、四個命令。修改操作絕不帶著自己的假設直接觸碰提供方：每個操作都運行 `fs/write-intent` 或 `fs/edit-intent` waterfall（瀑布式事件）以取得策略插件的防護，在已掛載的 `ctx.fs` 實施沙箱限制時解析每次調用的沙箱策略，并把強制執行委托給提供方。`str_replace` 與 `insert` 還會重新讀取文件，并在沒有策略插件提供防護時把觀察到的版本作為比較并交換的基礎。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 整個工具：schema、命令分派、查看渲染、修改策略 |

### 各命令如何運行

每個命令都先解析絕對路徑；修改操作隨后遵循同一條共享流程——策略防護、提供方強制執行、成功后記錄 `fs/observed`——而 `view` 只執行 stat 并渲染。整個工具——schema、命令分派與查看渲染——都位于 `src/index.ts`。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從工具逐步進入它所組合的約定、策略與后端。

- [文件系統子系統](../../../docs/subsystems/filesystem.zh.md)——窮盡式提供方約定、策略事件與錯誤分類體系。
- [dsh-fs](../fs/README.zh.md)——本工具消費的 `ctx.fs` 約定。
- [tool-fs](../tool-fs/README.zh.md)——替代的 `read`/`write`/`edit` 工具套件。
- [fs-observation-policy](../fs-observation-policy/README.zh.md)——通過 `fs/*` 事件防護變更的策略插件。
- [fs-sandbox](../fs-sandbox/README.zh.md)——圍欄變更的沙箱強制后端。
- [生成工具目錄](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-str-replace-editor)——本包注冊的窮盡式 schema。

-----

<a id="model-experience"></a>
## 模型體驗

### 工具 schema

#### 模型看到的內容

生成的 [`str_replace_editor` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-str-replace-editor)，包含配置的 `description`。本插件不貢獻獨立系統提示詞段。

#### Token 影響

`str_replace_editor` 可見時產生固定的 schema 成本。

#### KV Cache 影響

配置的描述與 schema 不變時前綴穩定。

### 工具結果

#### 模型看到的內容

查看操作返回帶行號文本或淺層目錄列表。調用會提供文件位置，創建/替換調用還會向展示層提供 diff 卡片。修改操作返回簡潔確認。長查看結果保留前綴并追加截斷提示。

#### Token 影響

隨數據變化，并受 `maxOutputChars` 與固定截斷提示約束。

#### KV Cache 影響

工具結果以追加方式位于可復用請求前綴之后。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明編輯器工具何時不合適，或何時需要特別的運維注意。它們是當前包約束，不是通用編輯器對比或任務積壓。

- **操作面向 UTF-8 文本**——不支持二進制文件。
- **`str_replace` 刻意拒絕零匹配或多匹配**——它沒有 `replace_all` 參數。
- **每個修改操作都會經過已掛載的策略與沙箱**——`fs/write-intent` 或 `fs/edit-intent` 解析當前會話的沙箱策略，并把強制執行委托給已掛載的文件系統與策略插件，因此未掛載它們的部署會得到無條件變更。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。工具適配器不持有獨立持久狀態；文件系統修改關系屬于提供方與策略插件。
