---
description: "面向用戶與維護者的首消息 LLM（大語言模型）會話標題提供方說明，用于選擇標題策略或排查自動標題生成。"
kind: "package-reference"
---

# @deepseek-ai/dsh-session-title-first-prompt-llm

[English](README.md) | 中文

## 概述

`dsh-session-title-first-prompt-llm` 作為可選的 `ctx.sessionTitle` 提供方，通過 `ctx.llm` 總結第一條符合條件的用戶消息。它注冊 `first-prompt` 節奏，只在全新非 fork 會話首次創建回退時自動運行，并把結果歸因于該消息的確切 seq。自動失敗會保留回退，之后只能通過 `ctx.sessionTitle.refresh()` 重試。它使用 `dsh-session-title-llm` 的完整必填共享 LLM 配置，因此路由、提示詞、預算與取消行為不會漂移。自動行為與配置優先；實現僅在共享策略之上進行輕量注冊。

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

當會話應從第一條符合條件用戶消息生成標題時，在標題服務旁掛載此插件。它要求完整的[共享 LLM 配置](../session-title-llm/README.zh.md#configuration)，且無默認值。

### 標題生成時機

自動生成只對無父會話、也無先前標題的全新會話運行：在其第一條符合條件用戶消息之后，創建回退并發出一次輔助請求來總結該消息。后續提示詞、顯式用戶重命名與繼承的 fork 歷史都不會觸發再次自動調用。自動失敗會保留回退；`ctx.sessionTitle.refresh()` 是顯式重試。fork 會保留繼承的標題，絕不會自動運行此提供方，即使其預置的首消息來自父會話。

### 配置

插件接受完整必填的[共享 LLM 配置](../session-title-llm/README.zh.md#configuration)：`targetWords`、`targetCjkCharacters`、`maxInputBytes`、`maxOutputTokens`、`timeoutMs`，以及可選成對的 `provider`/`model` 路由。同時省略二者，會繼承當前已記錄主請求的確切路由；同時設置二者，則讓標題生成使用獨立路由。生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-session-title-first-prompt-llm)是每個受支持字段的窮盡式真源。

### 失敗與恢復

失敗的生成——主請求之前缺少路由、輸入超過 `maxInputBytes`、超時、取消或無效模型輸出——會發出警告并保留當前標題；只有顯式 `refresh()` 會重試。自動工作不會為主 agent（智能體）請求增加 token 或延遲。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋插件形態；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

一個薄提供方插件：它注冊 `first-prompt` 節奏，用選擇器取第一條符合條件消息，其余全部委托給[共享 LLM 策略](../session-title-llm/README.zh.md)。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：共享配置 schema、以首消息選擇器注冊提供方 |

### 調度

標題服務負責調度自動工作：對 `first-prompt` 節奏，只有當會話無父會話、恰好擁有一條符合條件消息且尚無標題時才啟動修訂；提供方調用在確切主請求路由被記錄后才開始，較新的修訂會取代舊工作。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當提供方約定不夠用時閱讀以下頁面。它們從共享策略逐步進入替代節奏與它所插入的服務。

- [共享 LLM 標題策略](../session-title-llm/README.zh.md)——此提供方使用的生成輔助模塊。
- [全消息標題提供方](../session-title-all-prompts-llm/README.zh.md)——在每條新提示詞后重新生成標題的節奏。
- [會話標題服務](../session-title/README.zh.md)——回退行為、重命名、刷新與提供方注冊。
- [會話包映射](../README.zh.md)——相鄰的持久化、投影、標題與遙測包。

-----

<a id="model-experience"></a>
## 模型體驗

### 首消息標題請求

#### 模型看到什么

標題模型會收到共享標題指令，以及一個只包含第一條符合條件用戶消息的 JSON 數組。后續提示詞與繼承的 fork 歷史不會觸發再次自動調用。

#### Token 影響

全新會話最多自動發出一次輔助請求，并受 `maxInputBytes` 與 `maxOutputTokens` 約束；顯式刷新可能發出額外調用。主 agent 請求不會增加 token。

#### KV Cache 影響

不會使主請求的 KV Cache 失效。輔助請求使用已配置或已記錄路由，其緩存行為由提供方決定。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明此提供方何時不再代表會話。它們是當前包約束。

- **首消息可能過時**——對于長期會話，第一條消息可能不再具有代表性；如果后續提示詞應觸發重新生成標題，請使用全消息提供方。
- **fork 絕不自動重新生成標題**——fork 會保留繼承的標題，絕不會自動運行此提供方，即使其預置的首消息來自父會話。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。這個輕量提供方將請求與結果校驗委托給共享標題服務和 LLM 輔助模塊，不保留獨立的可變狀態。
