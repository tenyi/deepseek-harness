# Cordis 入門

[English](cordis-primer.md) | 中文

Cordis 是 DeepSeek Harness 底層以 vendor 方式引入的插件框架。本文介紹 harness 插件作者在閱讀[子系統頁面](subsystems/core.zh.md)上生成的服務/事件參考之前需要了解的 Cordis 核心概念；[Cordis 教程](cordis-tutorial/index.zh.md)則通過實踐逐一講解這些概念。vendor 源碼與同步流程見 [vendor/README.md](../vendor/README.md)。

## 五個核心概念

- **插件是實現 Service 的對象。** 它可以是一個帶有可選 `inject` 和 `apply(ctx)` 字段的函數，也可以是一個 `Service` 子類，其生命周期由 Cordis 掛載到當前上下文中。
- **上下文是服務的容器。** 一個服務占據一個穩定的 `ctx.<key>`（如 `ctx.tools`、`ctx.llm`、`ctx.sessions`）；其他插件通過 key 查找服務，而非導入具體實現。
- **通過 `inject` 聲明服務依賴。** 插件聲明所需的服務后，會等待這些服務就緒才啟動；加載順序通過服務依賴表達，而非手動編排啟動序列。
- **類型化事件用于通信。** 服務通過 TypeScript 聲明合并注冊事件名，然后以 `emit`、`waterfall`（瀑布式事件）、`parallel`、`serial` 或 `bail` 方式分發，分別對應監聽者觀察、包裝、并行扇出、按序執行或停在首個 bail 值。
- **注冊是可逆的副作用。** 提示詞片段、工具 schema、適配器、提供方和監聽器通過 `ctx.effect()` 或 `ctx.on()` 安裝，reload 和 teardown 時會按預期撤銷。

<a id="dispatch-modes"></a>

## 分發模式

每個事件具有以下分發模式之一，且只能通過對應方法分發。

| 模式 | 是否 await？ | 分發順序 | 是否有返回值？ |
|---|---|---|---|
| `emit` | 否 | 監聽器按注冊順序觀察 | 否 |
| `waterfall` | 否 | 監聽器按注冊順序觀察 | 是 |
| `parallel` | 是 | 所有監聽器并行觀察事件 | 否 |
| `serial` | 是 | 監聽器按注冊順序觀察 | 是 |
| `bail` | 否 | 監聽器按注冊順序觀察，直到某個監聽器返回 bail 值 | 是 |

分發模式是事件公開約定的一部分。新的 harness 事件通過 `@mode` 標簽記錄模式，以便生成的目錄可以將聲明與分發調用點做交叉校驗。

<a id="cordis-waterfall-semantics"></a>

## Cordis Waterfall 語義

`ctx.waterfall` 是環繞中間件。監聽器接收 `(...args, next)`。調用 `next()` 會執行下游監聽器；下游返回值通過 `next()` 返回當前包裝層，可由該層包裝后繼續向外返回。不調用 `next()` 直接返回則短路。

協作式監聽器通常修改一個共享的請求或決策對象，然后委托。監聽器也可以選擇完全替換結果，下游監聽器將只看到替換后的結果。僅當監聽器必須在普通注冊之前運行時才使用 `prepend: true`。

對于單決策事件，短路是設計意圖。策略監聽器在擁有決策權時可以不調用 `next()` 直接返回，而僅做標注或觀察的監聽器則必須委托。

<a id="loader-configuration"></a>

## Loader 配置

`@deepseek-ai/cordis-plugin-include` 將 `!!js` 解析為表達式節點。Loader 在聲明的注入激活后，基于該插件上下文（`ctx.serviceName`）插值條目的 `config`，并在每次掛載決策時基于 loader 上下文插值其 `disabled` 字段；Include 會保留嵌套行表達式，直到目標行激活。其余條目元數據保持字面值。由環境選擇插件時，請使用 overlay。

## 實踐規則

將行為封裝為插件：工具流水線事件屬于 `ctx.tools`，模型流式輸出屬于 `ctx.llm`，實時 agent（智能體）協調屬于 `ctx.agents`。攔截和策略優先使用事件；直接能力調用優先使用服務方法。

每個注冊都應有對應的 disposer（資源釋放函數）：要么從 `ctx.effect()` 返回一個，要么使用 Cordis 提供的輔助方法自動處理。如果 teardown 順序有要求，請將相關工作放在同一個 effect 中，以確保資源按預期順序釋放。
