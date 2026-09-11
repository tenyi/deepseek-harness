---
description: "面向發送官方 DeepSeek 請求的部署，說明活躍 Loader 包清單元數據。"
kind: "package-reference"
---

# @deepseek-ai/dsh-plugin-package-inventory-deepseek

[English](README.md) | 中文

## 概述

用于 DeepSeek 官方 LLM API 請求的完整活躍 Loader 插件包清單。該函數插件注入 Loader、存活 Agent 注冊表與 `ctx.deepseekLlmApiExtensions`，并擁有 `dsh_plugin_packages` 字段。當官方 API 需要活動包清單進行請求診斷時，請啟用它。

## 目錄

- [配置](#configuration)
- [收集](#collection)
- [模型體驗](#model-experience)
- [已知限制與暫緩事項](#known-limitations-and-deferred-work)
- [開發備注](#dev-note)

-----

<a id="configuration"></a>
## 配置

| 配置鍵 | 默認值 | 含義 |
|---|---:|---|
| `enabled` | `true` | 注冊 `dsh_plugin_packages` 貢獻。將其設為 `false` 可省略包元數據。 |

隨附 profile 使用該默認值，因此只要準備成功，每個 DeepSeek 官方請求都會攜帶包清單。

<a id="collection"></a>
## 收集

每次請求都會重讀宿主 Loader 樹中的活躍非 group 配置項。存在可選 `ctx.agentPresets` 且 `sessionId` 解析到已加入 standing preset 的存活 Agent 時，該 preset 的獨立 Loader 樹也會加入同一次收集；未掛載該服務的部署只報告宿主樹。只有根 fiber 處于 `ACTIVE` 且 Loader 有效狀態為啟用的配置項才會納入。

裸包與包子路徑 specifier 通過 Node 包搜索路徑解析，無需包導出 `./package.json`。每個普通配置項使用其所屬 Loader 樹的基址。standing preset 的根配置項使用宿主基址，與 preset Loader 對裸包的顯式覆寫保持一致；嵌套 include 仍使用自身基址。相對與絕對模塊會向上查找最近的 manifest（元數據清單）；沒有 `name` 的 manifest 只標記松散模塊，不貢獻包身份。具名包 manifest 還必須聲明非空 `version`，格式錯誤的包元數據會使請求準備失敗。系統使用與 locale 無關的比較按確切名稱／版本對去重并排序，同時存活的不同版本仍會分開保留。

版本 1 的 `dsh_plugin_packages` 字段只包含 `{ name, version }` 對。系統會排除禁用、pending、failed、disposed、unloading 狀態，結構性 `cordis:` 配置項，普通依賴，沒有所屬包身份的松散文件，以編程方式掛載的子 fiber，以及內存動態插件。

<a id="model-experience"></a>
## 模型體驗

### 包清單元數據

#### 模型看到的內容

無。`dsh_plugin_packages` 是位于模型消息、系統提示詞與工具 schema 之外的提供方元數據。

#### Token 影響

模型輸入 token 為零；完整清單只會增加 HTTP 請求字節數。

#### KV Cache 影響

無；包生命周期變化不會改變模型可見前綴。

## 已知限制與暫緩事項

<a id="known-limitations-and-deferred-work"></a>

- **僅含 Loader 包來源**——以編程方式創建的子 fiber 與內存動態插件沒有權威 NPM 名稱／版本來源，因此不在該清單內。
- **省略松散模塊**——沒有具名且帶版本所屬 manifest 的相對文件是插件模塊，不是插件包。
- **原地替換包需要重啟**——manifest 身份會在進程存活期內緩存。Loader 的啟用、禁用、掛載、卸載與普通源碼 HMR 仍會刷新存活配置項集合，但在同一進程中把已掛載包的 manifest 替換為另一版本并不是受支持的升級路徑。


<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。每次請求直接讀取權威 Loader fiber 狀態與 package manifest，插件不保留獨立可變 inventory。
