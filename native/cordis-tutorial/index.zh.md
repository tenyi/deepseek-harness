# Cordis 教程

[English](index.md) | 中文

Cordis 是 DeepSeek Harness 底層的插件框架：它是一個小型運行時，其中的每項能力，包括工具、LLM（大語言模型）適配器、文件訪問乃至 agent loop（智能體循環）本身，都是掛載到共享上下文中的插件。本教程通過動手實踐講解 Cordis：每一章都是一個可以運行的示例，你將在本倉庫內的臨時目錄中逐步構建它，最后把一個插件接入真實的 harness 服務。

本教程面向 agent 開發者。你不需要深入掌握 TypeScript；下文的 [TypeScript 說明](#typescript-notes)會解釋可能陌生的語法，并且每一章都會給出確切命令和預期輸出。

如果你想閱讀精簡的概念參考，而不是逐步實踐，請參閱 [Cordis 入門](../cordis-primer.zh.md)。詳盡的 API 參考見[子系統頁面](../subsystems/core.zh.md)上生成的 `cordis-surface` 區塊，以及 [Cordis 核心 API](../cordis-api/context.zh.md) 頁面。

如果你要為 harness 本身編寫插件——由 `cordis.yml` 加載、在 Web UI 中驅動，而不是下面這個啟動器——請從[第一個 Harness 插件](../user/develop/basic/index.zh.md)開始。

<a id="setup"></a>

## 準備工作

你需要克隆本倉庫并安裝依賴；[開發指南](../development.zh.md#setup-tutorial)列出了前置條件。本教程不需要 API 密鑰；所有示例均可在無密鑰環境中運行。

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
```

創建各章使用的臨時目錄。`tmp/` 已被 git 忽略，因此你在其中寫入的任何內容都不會進入版本控制：

```sh
mkdir -p tmp/cordis-tutorial
cd tmp/cordis-tutorial
```

每一章都從該目錄運行同一條命令：

```sh
node --import tsx ../../vendor/cordis/bin.js
```

這個單文件啟動器（見 [vendor/cordis/bin.js](../../vendor/cordis/bin.js)）會創建根 `Context`、掛載 Loader 插件，并讓它從當前目錄加載 `./cordis.yml`。其余所有內容，包括有哪些插件以及如何配置它們，都來自你稍后將編寫的 YAML 文件。`--import tsx` 標志讓 Node 無需構建步驟即可運行配置所指向的 TypeScript 文件。

## 章節

1. [你的第一個插件](01-first-plugin.zh.md)：插件是函數，由 loader 掛載。
2. [生命周期與 effect](02-lifecycle-and-effects.zh.md)：由 Cordis 管理的注冊會在所屬插件卸載時撤銷。
3. [服務](03-services.zh.md)：在 `ctx` 上公開一項能力，并通過 `inject` 依賴它。
4. [事件](04-events.zh.md)：類型化事件、廣播分發和 waterfall（瀑布式事件）的短路行為。
5. [配置](05-config.zh.md)：讀取 `cordis.yml` 中經過校驗的配置，并在輸入錯誤時明確報錯。
6. [組合與 HMR（熱模塊替換）](06-composition-and-hmr.zh.md)：把配置文件作為插件樹，使用熱重載，并診斷始終無法加載的插件。
7. [進入 harness](07-into-the-harness.zh.md)：基于真實的 harness 服務注冊一個可由模型調用的工具。

<a id="typescript-notes"></a>

## TypeScript 說明

這些示例使用了普通現代 JavaScript 之外的三項 TypeScript 功能：

- **類型注解**描述值，但不會改變運行時行為：`ctx: Context` 表示 `ctx` 具備 Cordis 上下文 API，`who: string` 接受文本，而 `string[]` 表示字符串數組。
- **`import type { Context } from '@deepseek-ai/cordis'`** 只導入類型信息。它在運行時會消失，因此僅為類型注解使用 `Context` 的插件文件不會增加運行時依賴。
- **聲明合并**（`declare module '@deepseek-ai/cordis' { ... }`）會為 Cordis 已經聲明的接口添加你的條目，例如新 `ctx.greeter` 屬性的類型或事件名稱。它不會生成任何運行時接線；插件必須另行提供服務或發出事件。第 3 章會完整展示該模式。

第 5 章還會使用 `interface` 描述配置對象的字段，并使用 `Schema<Config>` 這類泛型表示 schema 校驗哪些對象字段。你可以直接照寫這些聲明；周圍的正文會解釋每項聲明連接了什么。

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
