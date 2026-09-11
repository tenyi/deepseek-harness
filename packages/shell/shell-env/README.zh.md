---
description: "受管 DSH_* shell 環境，供選擇、配置或擴展每次模型 shell 調用所運行環境的使用者與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-shell-env

[English](README.md) | 中文

## 概述

`dsh-shell-env` 提供每次模型 shell 調用——bash 或 pwsh——所運行的受信 `DSH_*` 環境：內置事實如 `DSH_HOME`、`DSH_SHELL=1` 與 agent（智能體）的 `DSH_SESSION_ID`。插件作者可以注冊自己的事實，帶聲明鍵、按每次執行收集，并隨插件釋放；重復所有權或未聲明的運行時鍵會明確報錯，而不是靜默覆蓋。注冊表不會改變模型看到的其他任何內容——shell 工具擁有各自的 schema 與提示詞。任何掛載了模型 shell 工具的組合都適合選擇它；配置只決定 Harness 主目錄。

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

在任何掛載模型 shell 工具（`dsh-tool-bash` 或 `dsh-tool-pwsh`）的組合中加載本插件：此后每次前臺或后臺 shell 調用都會運行在新收集的受管環境中，而不是進程繼承來的任意 `DSH_*` 值。

### 每次 shell 調用都會收到什么

每次調用都會收到 `DSH_HOME`（Harness 主目錄的絕對路徑）、`DSH_SHELL=1`，agent 調用還會收到 `DSH_SESSION_ID`（調用方會話的 id）。

### 添加你自己的環境事實

其他插件通過注冊一個 contributor 來貢獻事實，需要提供穩定名稱、它可能返回的完整 `DSH_*` 鍵集合、每個鍵的描述，以及為一次執行計算取值的 resolver：

```ts
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-shell-env'

export const inject = ['shellEnv']

export function apply(ctx: Context): void {
  ctx.shellEnv.register({
    name: 'deployment-region',
    variables: { DSH_DEPLOYMENT_REGION: { description: 'Current deployment region.' } },
    resolve: execution => execution.agent === undefined ? {} : { DSH_DEPLOYMENT_REGION: 'cn-north' },
  })
}
```

contributor 必須聲明它返回的每個鍵；返回未聲明或非字符串的值會讓該次調用失敗。注冊隨注冊插件的釋放而釋放，因此熱重載插件會移除它的事實。

### 選擇 Harness 主目錄

唯一配置字段決定暴露為 `DSH_HOME` 的主目錄；默認解析順序為 `dshHome` 配置、環境變量 `$DSH_HOME`，然后是 `~/.dsh`。

| 字段 | 默認值 | 含義 |
|---|---|---|
| `dshHome` | `$DSH_HOME`，然后 `~/.dsh` | 暴露為 `DSH_HOME` 的 Harness 主目錄絕對路徑 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-shell-env)是每個受支持字段及其 JSDoc 的窮盡式真源。

### 可能出什么問題

兩個 contributor 聲明同一個鍵，或 contributor 聲稱擁有保留內置鍵（`DSH_HOME`、`DSH_SHELL`、`DSH_SESSION_ID`），都會導致插件加載時明確報錯。`DSH_*` 鍵必須全大寫并帶下劃線（例如 `DSH_REGION`），缺少描述也會讓注冊失敗。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋注冊表背后的設計決策，并指出實現它們的代碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

- **受信命名空間，每次調用重建。** 環境是歸 Harness 所有的 `DSH_*` 命名空間：shell 執行器丟棄繼承的 `DSH_*` 值，并為每次執行合并注冊表的當前快照，因此嵌套 harness 與并發的父子 agent 無法泄漏陳舊身份，`process.env` 也永不被修改。
- **聲明所有權，沖突明確報錯。** contributor 預先聲明鍵，使重復所有權在第一條命令之前就被發現；resolver 只能返回已聲明的鍵。
- **內置鍵留在這里。** `DSH_HOME`、`DSH_SHELL` 與 `DSH_SESSION_ID` 為注冊表保留；contributor 不能聲稱擁有它們。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口、`ShellEnvRegistry` 服務與內置事實 |
| — | 不發布運行時不變式伴生入口；環境注冊表會在每次注冊和收集時校驗所有權與收集值，也不發布可供伴生入口交叉檢查的獨立快照。 |

### 收集

`collect(execution)` 從內置鍵出發，當執行攜帶 agent 時加入會話 id，再按 contributor 名稱排序合并每個已注冊 contributor 解析出的值。結果是一個凍結、按鍵排序的快照，通過 `ShellExecRequest.dshEnv` 傳遞。`list()` 枚舉聲明而不運行 resolver，因此無法反映依賴執行的值。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從 shell 家族逐步進入執行器 seam 與生成目錄。

- [shell 包映射](../README.zh.md)——bash 能力家族及其角色。
- [Bash 執行器子系統](../../../docs/subsystems/shell.zh.md)——工具執行所經由的 `ctx.shell` seam。
- [tool-bash](../tool-bash/README.zh.md)——消費本環境的 bash 工具。
- [tool-pwsh](../tool-pwsh/README.zh.md)——消費本環境的 pwsh 工具。
- [home paths 包](../../util/home-paths/README.zh.md)——`DSH_HOME` 如何解析。
- [生成的配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-shell-env)——每個受支持配置字段及其源聲明。

-----

<a id="model-experience"></a>
## 模型體驗

通過 shell 工具（`dsh-tool-bash`、`dsh-tool-pwsh`）間接產生影響；這些工具把本注冊表的受管 `DSH_*` 事實暴露在每次 shell 工具調用中。

#### KV Cache 影響

受管環境永遠不會進入請求前綴，因此不會使提供方緩存復用失效；任何前綴變更都取決于 shell 工具定義與當前請求信封。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明注冊表何時不合適或需要小心使用。它們是當前包約束，不是任務積壓。

- **`list()` 只枚舉插件貢獻的變量**——注冊表自有的內置鍵（`DSH_HOME`、`DSH_SHELL`、`DSH_SESSION_ID`）不包含在內，因此診斷、提示詞或 UI 代碼不得把 `list()` 當作完整的環境目錄。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
