---
description: "可選的按輪次 tmux 位置上下文，供啟用或調優 agent（智能體）的會話、window 與 pane 感知的用戶與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tmux-context

[English](README.md) | 中文

## 概述

`dsh-tmux-context` 讓模型識別其 agent 進程所在的 tmux 會話、window、pane 和 pane 樹布局。它僅在位置發生變化時，于每輪的第一個步驟追加一條持久、帶來源的讀數。若終端只繼承了 tmux 環境變量，卻并未在所指名的 pane 中運行，則不添加任何內容；查詢失敗同樣不添加內容，也不會使該輪失敗。本包需主動啟用，且不包含在隨附的 Web 或無頭 profile 中。

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

當 agent 進程運行在 tmux 內、且模型需要知道其 window 與 pane 位置時，掛載此插件。每條讀數都是持久歷史中額外的一條 user 角色消息；位置未變化時不添加任何內容，因此長時會話累積很少。

### 模型能得到什么

在 tmux 狀態發生變化的每一輪，模型會收到一條帶來源標記的上下文消息，包含會話名稱、window 索引與名稱、pane 索引與 id、活動標志，以及緊湊的 pane 樹布局。讀數只發生在每輪的第一個步驟；輪次中途移動或縮放的 pane 會在下一輪反映。像素尺寸有意省略，相鄰 pane 的可見內容從不采集。

### 配置

最小掛載無需任何配置。`refreshIntervalMs` 為正值時，會額外抑制距最近一次注入不足該毫秒數的注入；省略或設為 `0` 時，只要 tmux 狀態自上次注入以來發生變化就注入。

```yaml
- name: '@deepseek-ai/dsh-tmux-context'
  config:
    refreshIntervalMs: 60000
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `refreshIntervalMs` | `0`（每個變化輪次） | 同一會話中兩次持久注入之間的最小毫秒數 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-tmux-context)是所有受支持字段及其 JSDoc 的完整真源。

### 何時知道位置

只有當進程的控制終端與 pane 的 `#{pane_tty}` 一致時，才視為位于 tmux 中；從 tmux shell 啟動的終端（VS Code 集成終端、桌面啟動器）會繼承變量但不在 pane 內，因此被視為不在 tmux 中。`ctx.shell` 缺失、環境變量不存在或讀數格式非法時是空操作；執行器拒絕會被兜住并記錄為警告，而不會使該輪失敗。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋插件的設計；可觀察行為見[使用本包](#use-this-package)。

### 設計理念

插件前置注冊一個 `agent/pre-step` 監聽器，僅在每輪的第一個步驟運行。需要注入時，它通過 `ctx.shell` 執行器服務運行一條只讀命令——部署方的沙箱與策略都會應用，插件不擁有任何子進程代碼。命令在輸出制表符分隔字段前，會比較 `$TMUX_PANE` 的 `#{pane_tty}` 與本進程自身的控制終端，因此繼承的環境會被視為不在 tmux 中。插件只在渲染出的狀態與上次注入不同時重新注入。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：第一步監聽器、shell 查詢、變化抑制、調度 |
| — | 不發布運行時不變式伴生入口；每次讀取都是外部 tmux 狀態的單輪快照，會話沒有可檢查的跨事件關系；調度與格式由流水線測試負責。 |

### 主要流程

在每輪的第一個步驟，監聽器檢查注入是否到期，通過 `ctx.shell` 查詢位置，并把渲染狀態與該來源最近一次持久注入比較。變化抑制與間隔調度會掃描原始持久會話事件，因此調度可跨壓縮（compaction）與恢復的進程存續，無需進程內緩存狀態；各會話獨立調度。下游在步驟前運行的監聽器拒絕或失敗時，該讀數不會被記錄。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

包級約定不夠用時閱讀以下頁面。這些頁面從設計決策講到查詢所經由的執行器以及完整配置。

- [tmux 位置上下文決策記錄](../../../.agents/notes/archived/feature/2026-07-27-tmux-location-context.md)——基于 tty 的檢測與讀數形狀的設計理由。
- [shell 子系統](../../../docs/subsystems/shell.zh.md)——只讀查詢所經由的執行器服務。
- [上下文組地圖](../README.zh.md)——相鄰的請求上下文包。
- [生成的配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-tmux-context)——每個受支持配置字段及其源聲明。

-----

<a id="model-experience"></a>
## 模型體驗

### 準備期 tmux 位置

#### 模型看到的內容

在 tmux 狀態發生變化的每一輪，注入一條帶來源標記、含以下三行的上下文消息。`<window-layout>` 是 tmux 緊湊的 pane 樹描述；pane 與 window 的像素尺寸有意省略，相鄰 pane 的內容從不采集。

##### 變化輪次讀數

```markdown
tmux location (turn <turn>):
session <session>, window <index> "<name>", pane <index> <pane-id>
window active=<0|1>, pane active=<0|1>, layout <window-layout>
```

#### Token 影響

每條三行讀數會累積，直到壓縮將其遮蔽。位置未變化以及間隔抑制不會新增內容。

#### KV Cache 影響

僅追加；新增可見內容位于可復用的請求前綴之后，不會使已有 KV Cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明 tmux 位置上下文何時不合適。它們是當前包約束。

- **僅第一個步驟**——輪次中途移動或縮放的 pane 會在下一輪反映，而非在步驟之間。
- **僅自身位置**——插件從不采集相鄰 pane 的可見文本。
- **只有布局，沒有尺寸**——省略 pane/window 像素尺寸；僅報告布局樹與活動標志。
- **制表符分隔字段**——若 tmux window 名稱包含字面兩字符序列 `\t`，會使讀數分割錯誤并作為非法讀數跳過；常規名稱不受影響。
- **基于 tty 的 pane 判定**——只有當進程的控制終端與 `$TMUX_PANE` 的 `#{pane_tty}` 一致時，才視為「位于 tmux 中」。這會有意排除從 tmux 祖先進程繼承 `$TMUX`／`$TMUX_PANE` 的終端（如 VS Code 集成終端）。`ps -o tty=` 屬于 POSIX；在其或 `#{pane_tty}` 不可用的環境中，該檢查即為空操作。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
