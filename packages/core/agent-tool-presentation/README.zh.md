---
description: "面向用戶與維護者的 agent（智能體）平面呈現選擇器說明，用于選擇、配置或調試 agent preset 的模型看到其工具的哪種形態。"
kind: "package-reference"
---

# @deepseek-ai/dsh-agent-tool-presentation

[English](README.md) | 中文

## 概述

在 [agent preset](../../preset/agent-presets/README.zh.md) 中使用 `dsh-agent-tool-presentation`，可固定模型看到全部原生工具 schema、只有帶生成 SDK 的 `run_code`，還是同時看到兩種形態。每個 preset 可獨立選擇，因此 native 與 PTC agent 可以共享同一進程，而不共享工具目錄。選擇 `ptc` 或 `both` 需要兼容的代碼運行時；沒有該運行時的部署會在掛載時拒絕 preset，不會等到收到第一條提示詞。使用本包時 `mode` 字段為必填；省略本包則沿用部署默認值。

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

把這一行加入 agent preset，以固定每個加入該 preset 的 agent 看到其工具的方式。`native` 以函數定義的形式呈現每個可見工具 schema；`ptc` 只呈現 `run_code` 傳輸、一份生成的 SDK 以及「只有 `run_code` 可被直接調用」這條規則；`both` 同時呈現兩種形態。未作聲明的 agent 會拿到 [`dsh-tools`](../tools/README.zh.md) 那一行上的部署級 `mode`。

### 把這一行加入 preset

```yaml
- name: '@deepseek-ai/dsh-agent-tool-presentation'
  config:
    mode: ptc
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `mode` | 必填 | `native`——每個 schema；`ptc`——`run_code` 加生成 SDK；`both`——兩種形態 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-agent-tool-presentation)是每個受支持字段的窮盡式真源。`mode` 是必填而非有默認值，因為不帶這一行的 preset 會繼承部署默認值。

### PTC 模式需要什么

選擇 `ptc` 或 `both` 需要已組合的代碼運行時（`ctx.codeRuntime`），且其語言有已注冊的 SDK 渲染器——TypeScript 運行時經 [`dsh-code-runtime-worker-thread`](../../code-runtime/code-runtime-worker-thread/README.zh.md) 交付，TypeScript 與 Python 的 SDK 渲染器都內置在 `dsh-tools` 中。針對未組裝此類運行時的部署選擇 PTC 模式的 preset 會拒絕掛載并點名這一行，使失敗落在操作者可以行動的地方，而不是落在會話的第一次請求上。

### 每個 agent 只聲明一次呈現方式

一個 agent 只聲明一次呈現方式。同一份組裝里的第二次聲明會被拒絕而不是合并：對「模型看到哪種形態」給出兩個答案是矛盾，不是覆蓋。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋該包如何實現上述行為；可觀察約定已在[使用本包](#use-this-package)中完整說明。

### 設計理念

工具注冊表搬不進 preset：它的消費方全在宿主平面——agent loop（智能體循環）讀它的調度器，API proxy 讀它的展示轉換器，每個工具插件都往里注冊——而一個服務只有在所有消費方一起下沉時才能下沉。preset 能擁有的是這份注冊表的呈現方式。`ctx.tools.presentAs()` 為掛載作用域聲明它，而掛載作用域就是 preset 的常駐掛載，因此該聲明覆蓋每個加入該 preset 的 agent，一個 PTC mode preset 可以與多個 native preset 同進程并存。每個組合一行，而不是每個會話一行。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`mode` 配置、把 `ctx.tools.presentAs` 接到掛載作用域的 `apply` |
| — | 不發布運行時不變式伴生入口；本包只對 `ctx.tools` 發起一次 scoped 調用，不持有自己的事件或快照；它建立的是「某個 agent 的組裝采用哪種呈現方式」這一關系，該關系由工具注冊表持有，`dsh-tools` 會在工具注冊表中觀察該關系。 |

### 行為說明

`native` 立即生效。PTC 模式則等待 `ctx.codeRuntime`——這是一個宿主平面服務：針對未組裝運行時的部署選擇 PTC mode 的 preset 會讓這一行停在 pending，`dsh-agent-presets` 會指名此 id 拒絕掛載。`presentAs` 本身就是 effect，因此該聲明隨這一行撤銷，無需第二個包裝層擁有它。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

包級約定對大多數消費方已經足夠；需要周邊領域時再閱讀以下頁面。

- [tools 包](../tools/README.zh.md)——工具呈現模式與 `presentAs` API。
- [agent-presets 包](../../preset/agent-presets/README.zh.md)——preset 如何組合 agent 及其常駐掛載。
- [code-runtime worker-thread 包](../../code-runtime/code-runtime-worker-thread/README.zh.md)——PTC 模式所需的 TypeScript 運行時。
- [PTC mode 執行器塌縮 note](../../../.agents/notes/implemented/bug-fix/2026-08-07-ptc-executor-collapse.zh.md)——通告面與可調用面為何保持一致。
- [core 分組地圖](../README.zh.md)——core 各包如何組合。

-----

<a id="model-experience"></a>
## 模型體驗

通過在 `dsh-tools` 中選擇的工具呈現方式間接影響——這一行只在 `dsh-tools` 擁有的兩種投影之間選擇，本身不注冊任何提示詞、schema 或結果。

#### KV Cache 影響

沒有直接的失效影響；呈現方式在 agent 組裝時即固定，因此其請求前綴在該會話的整個生命周期內保持穩定。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明這一行何時需要特別留意。它們是當前包約束，不是任務積壓。

- **運行時仍在宿主平面**——preset 可以選擇 PTC mode，卻無法自帶它所需的 TypeScript 運行時；未組裝運行時的部署也就無法組裝任何 PTC 模式的 preset。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
