---
description: "preset 掛載的可組裝人設行，讓單個 agent 擁有自己的系統提示詞人設，供配置或排查它的用戶與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-persona

[English](README.md) | 中文

## 概述

`dsh-persona` 讓單個 agent（智能體）擁有自己的人設：preset 掛載這一可組裝的行來注冊人設前綴與后綴段落，為該會話遮蔽部署級默認值。它還可以把前綴變成該會話的完整系統提示詞、抑制所有其他段落，并可為該會話關閉動態 runtime-context 快照。請把它掛在 preset 組裝內部——全局掛載會與提示詞注冊表自身的人設注冊相撞并明確報錯。沒有這一行，preset 能改變 agent 的工具，卻永遠改不了它的身份。

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

在 preset 組裝內部掛載本行，讓該 preset 的會話擁有自己的人設。本行需要 agent scope：在 scope 之外掛載會與提示詞注冊表自身的 `deployment:persona-prefix` 注冊相撞并明確報錯——部署級人設已經有歸屬，而本行存在的意義正是為某一個 agent 遮蔽它。

### 配置

```yaml
- name: '@deepseek-ai/dsh-persona'
  config:
    prefix: You are a terse systems engineer who answers in short commands.
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `prefix` | 必填 | 作為 `deployment:persona-prefix` 段落渲染的人設文本 |
| `suffix` | `''` | `deployment:persona-suffix` 模板；省略或空文本會遮蔽掉全局后綴 |
| `complete` | `false` | 僅將渲染后的前綴用作系統提示詞；忽略后綴 |
| `includeRuntimeContext` | `true` | 是否為此 agent 作用域包含動態 runtime-context 快照；false 會抑制所有上下文貢獻，但不禁用擁有它們的服務 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-persona)是每個受支持字段及其 JSDoc 的窮盡式真源。

### 人設行為

人設 `prefix` 與 `suffix` 都是模板：完整的 `{{…}}` 組在提示詞**渲染**時（而非組裝時）嚴格解析為已注冊的提示詞變量。每個空模板仍會遮蔽對應的部署級段落，然后在渲染時消失。省略 `suffix` 時默認為空，不繼承全局后綴。啟用 `complete: true` 時，組裝仍會解析上下文、工具、變量與協作式監聽器，但提示詞注冊表會把這確切前綴恢復為唯一段落；身份、后綴、工具引導或監聽器都無法追加提示詞文本。啟用 `includeRuntimeContext: false` 時，此作用域的上下文提供方不會被求值，組裝監聽器添加的上下文也會被丟棄。

### 何時使用

當 preset 必須改變 agent 的身份、而不只是工具時，使用本行。部署級人設本身配置在 `dsh-system-prompt` 行上，不在這里；本行只用于為某一個 agent 遮蔽或替換它。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

### 本行如何注冊

本行使用注冊表共享的名稱與具名順序來注冊帶作用域的人設前綴與后綴段落。兩者分別遮蔽對應的部署默認值，而不是出現在其旁邊；排序、插值與完整提示詞執行歸注冊表所有。`includeRuntimeContext: false` 會調用 `ctx.systemPrompt.suppressRuntimeContext()`。

### 本行為何僅限 scope 內使用

`dsh-system-prompt` 以自身配置持有全局人設并無條件注冊 `deployment:persona-prefix`，因此一個進程只有一份。本行在 agent scope 之外與該項注冊相撞，這是刻意的：本行的存在是因為 preset 無法自行掛載提示詞注冊表。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`Config` schema、人設段落注冊、runtime-context 抑制 |
| — | 不發布運行時不變式伴生入口；本行不擁有事件流或可變運行時數據，而是注冊提示詞段落；身份、完整提示詞強制執行、遮蔽與資源釋放均歸提示詞注冊表。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面；它們從 preset 組裝逐步進入本行所供給的提示詞注冊表。

- [agent-presets 包](../agent-presets/README.zh.md)——本行掛載進的 preset 組裝。
- [系統提示詞子系統](../../../docs/subsystems/system-prompt.zh.md)——段落、組裝，以及本行所遮蔽的人設槽位。
- [生成的配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-persona)——每個受支持配置字段及其源聲明。

-----

<a id="model-experience"></a>
## 模型體驗

### 人設段落

#### 模型看到什么

位于 order `0` 的 `deployment:persona-prefix` 段落攜帶本行的 `prefix`；位于 order `10200` 的 `deployment:persona-suffix` 在第一方指導之后攜帶其 `suffix`。兩者分別替換對應的部署默認值，并解析提示詞變量。在完整模式下，模型只會看到渲染后的前綴段落作為系統提示詞。Runtime context 默認保持啟用；禁用后，新建 agent 不會收到來自沙箱策略、批準策略、委派或其他 system-prompt 上下文提供方的 runtime-context 快照。

#### Token 影響

對給定 preset 而言是固定的：該 agent 的每次請求都攜帶人設前綴與后綴的 token，其他 agent 一個都不帶。空文本不貢獻任何 token。完整模式會移除該 agent 的其他所有系統提示詞 token。

#### KV Cache 影響

渲染后的模板變量與文本不變時，前綴保持穩定。模型、前綴與工具一致時，后綴變化不改變前置指令。前綴變化會影響靠前的前綴；不保證提供方共享緩存。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本行何時不合適。它們是當前包約束，不是任務積壓。

- **不支持全局掛載**——提示詞注冊表擁有未加 scope 的人設槽位，因此本行只能從帶 scope 的組裝中使用。要改變部署級人設，應在 `system-prompt` 行自身的配置中修改。
- **runtime-context 抑制是全有或全無**——`includeRuntimeContext: false` 會關閉該作用域的所有上下文貢獻，包括沙箱策略、批準策略與委派；沒有按提供方過濾的選項。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
