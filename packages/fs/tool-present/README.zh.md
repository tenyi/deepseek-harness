---
description: "通過 present 聲明交付可訪問的文件；配置、Session 歸屬與源文件打開。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-present

[English](README.md) | 中文

## 概述

使用 `present` 聲明交付Session 文件系統可訪問的最終文件，包括通過 shell 命令創建的文件。用戶使用默認應用打開當前源文件。工具記錄路徑和可選說明，不復制文件內容。

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

`standard`、`ptc` 與 `cordis` Agent preset 掛載本插件。創建文件后，以 `files: [{ path, description? }]` 調用 `present`。文件必須是 Session 文件系統可訪問的普通文件。相對路徑按 Session 工作目錄解析；絕對路徑可以指向工作區外的文件，包括 `/tmp` 或 Downloads。文件缺失、為目錄、最終路徑為符號鏈接或提供方拒絕訪問時，調用失敗。Shell 沙箱私有 `/tmp` 中的文件需要先寫入 Session 文件系統可訪問的位置。

在 Agent 的 Cordis 組合中掛載，并提供 `tools`、`fs` 和 `turnBoundary` Session 投影：

```yaml
- name: '@deepseek-ai/dsh-tool-present'
  config:
    maxFiles: 8
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `maxFiles` | `8` | 每次調用的最大文件數，為正整數 |

掛載時校驗文件數量上限。工具要求 Agent Session 具有工作區和尚未結束的輪次。交付歸調用方 Session 所有；父 Session 如需聲明交付子 Agent 創建的文件，必須自行調用 `present`。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

工具通過配置的文件系統提供方解析路徑，檢查普通文件元數據，不讀取內容。成功的最終 `tools/result` 通知追加 `deliverables/presented`，嵌套調用也適用。外層程序隨后失敗不會撤銷已完成的聲明。被阻止的結果不發布聲明。每個插件實例只記錄其實際執行的調用；同名作用域工具不能通過其他實例發布交付。

純 `./types` 入口聲明 `PresentedFile` 與 Session 事件，不導入 Host 運行時代碼。Web 消費方在展示或打開文件前校驗持久聲明。事件不保存 Session ID，因此 fork 歷史中的相對路徑按當前查看的 Session 工作區解析。

**運行時不變式：** 不發布伴生入口。工具與事件注冊歸 effect 所有，Session 日志擁有文件聲明；插件不維護獨立的文件內容存儲。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [文件系統子系統](../../../docs/subsystems/filesystem.zh.md)——提供方路徑與錯誤。
- [Web 交付](../../client/ui-deliverables/README.zh.md)——源文件打開與卡片。
- [交付決策](../../../.agents/notes/implemented/feature/2026-09-08-present-workspace-source-files.zh.md)——Session 歸屬與讀取端必須識別的事件。

<a id="model-experience"></a>
## 模型體驗

### present

#### 模型看到的內容

[present schema](../../../docs/tool-catalog.zh.md#present)要求已有且可訪問的文件：“Declare existing files accessible through the Session filesystem as final deliverables. When a file you create or update is an output the user asked to receive, you must call present after writing it and before your final response, including files created through Bash or code execution. Mentioning its path in your reply does not replace this call. The files must already exist. The user opens the current source files; their contents are not copied or preserved.” 每個文件的結果為 `Presented <path>`；程序結果和持久事件包含路徑及可選說明。

#### Token 影響

每個掛載的 Agent 增加一個工具 schema，每個交付文件增加一行結果。文件字節不進入模型消息。

#### KV Cache 影響

工具 schema 在掛載期間保持靜態。交付結果文本擴展對話，不重寫提示詞前綴。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- 元數據和 Host 路徑檢查無法原子性地阻止桌面應用打開文件前發生的路徑替換。
- 編輯會改變打開的內容。源文件刪除或移動后，無法通過原聲明打開。
- Session ZIP 導出包含聲明，不包含文件內容。交付版本持久化和寫時復制存儲延期實現。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
