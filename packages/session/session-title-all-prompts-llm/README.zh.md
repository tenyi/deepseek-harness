---
description: "面向用戶與維護者的全消息 LLM（大語言模型）會話標題提供方說明，用于選擇標題策略或排查自動標題生成。"
kind: "package-reference"
---

# @deepseek-ai/dsh-session-title-all-prompts-llm

[English](README.md) | 中文

## 概述

`dsh-session-title-all-prompts-llm` 作為可選的 `ctx.sessionTitle` 提供方，通過 `ctx.llm` 總結所有符合條件的用戶消息。它注冊 `all-prompts` 節奏，并在每條新用戶提示詞后啟動新修訂，使用預置歷史與子會話提示詞。較新的修訂會中止并取代舊工作，即使提供方忽略取消，也無法提交陳舊輸出。它使用 `dsh-session-title-llm` 的完整必填共享 LLM 配置，因此路由、提示詞、預算與取消行為不會漂移。本文優先介紹自動行為與配置；實現只是基于共享策略進行的輕量注冊。

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

當會話應隨其增長而重新生成標題、使標題持續代表整個對話時，在標題服務旁掛載此插件。它要求完整的[共享 LLM 配置](../session-title-llm/README.zh.md#configuration)，且無默認值。

### 標題生成時機

每條新的符合條件用戶提示詞之后都會啟動新修訂，包括子會話中的提示詞；生成會折疊截至當前修訂的所有符合條件消息，預置歷史也包含在內。較新的修訂會中止并取代舊工作，因此陳舊的完成結果永遠無法提交。自動失敗——包括輸入超過 `maxInputBytes`（此時請求失敗而非截斷歷史）——會發出警告并保留先前標題；`ctx.sessionTitle.refresh()` 是顯式重試。

### 配置

插件接受完整必填的[共享 LLM 配置](../session-title-llm/README.zh.md#configuration)：`targetWords`、`targetCjkCharacters`、`maxInputBytes`、`maxOutputTokens`、`timeoutMs`，以及可選成對的 `provider`/`model` 路由。同時省略二者，會繼承每個當前已記錄主請求的確切路由；同時設置二者，則讓標題生成使用獨立路由。生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-session-title-all-prompts-llm)是每個受支持字段的窮盡式真源。

### 失敗與恢復

如果最終封裝的聚合提示詞超過 `maxInputBytes`，請求會失敗而不是截斷歷史；自動使用時會發出警告并保留先前標題，只有顯式 `refresh()` 會重試。自動工作不會為主 agent 請求增加 token 或延遲。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋插件形態；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

一個薄提供方插件：它注冊 `all-prompts` 節奏，用恒等選擇器選取所有符合條件消息，其余全部委托給[共享 LLM 策略](../session-title-llm/README.zh.md)。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：共享配置 schema、以全消息選擇器注冊提供方 |

### 調度

標題服務負責調度自動工作：對 `all-prompts` 節奏，每條新的符合條件用戶消息都會啟動一個修訂，較新的修訂會取代舊工作；提供方調用在確切主請求路由被記錄后才開始。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當提供方約定不夠用時閱讀以下頁面。它們從共享策略逐步進入替代節奏與它所插入的服務。

- [共享 LLM 標題策略](../session-title-llm/README.zh.md)——此提供方使用的生成輔助模塊。
- [首消息標題提供方](../session-title-first-prompt-llm/README.zh.md)——只根據首條提示詞為會話生成一次標題的節奏。
- [會話標題服務](../session-title/README.zh.md)——回退行為、重命名、刷新與提供方注冊。
- [會話包映射](../README.zh.md)——相鄰的持久化、投影、標題與遙測包。

-----

<a id="model-experience"></a>
## 模型體驗

### 全消息標題請求

#### 模型看到什么

標題模型會收到共享標題指令，以及一個 JSON 數組，其中按日志順序包含截至當前修訂的所有符合條件用戶消息和確切 seq。預置歷史也包含在內。

#### Token 影響

每條符合條件的新提示詞之后都可能發出一次輔助請求，每次請求受 `maxInputBytes` 與 `maxOutputTokens` 約束；顯式刷新可能增加調用。主 agent（智能體）請求不會增加 token。

#### KV Cache 影響

不會使主請求的 KV Cache 失效。每條提示詞后，輔助輸入都會增長或變化，因此提供方專用緩存復用會在第一個變化的 JSON token 處結束。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明提供方如何對待長會話與異構會話。它們是當前包約束。

- **沒有基于摘要繼續生成摘要的機制**——輸入溢出時保留先前標題；對于很長的會話，此提供方沒有基于摘要繼續生成摘要的機制或保留策略。
- **消息被平等對待**——它平等對待所有符合條件的用戶消息，不提供權重、過濾或手動標題優先級。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。這個輕量提供方將請求與結果校驗委托給共享標題服務和 LLM 輔助模塊，并且不保留獨立的可變狀態。
