---
description: "面向啟動 JSON-RPC harness 運行時的用戶與維護者，說明 SDK stdio 應用 profile。"
kind: "package-bundle"
---

# `@deepseek-ai/dsh-sdk-app`

[English](README.md) | 中文

## 概述

以 [`dsh-base`](../base/README.zh.md) 為基礎的 SDK stdio 應用 `dsh` profile 組合包。它繼承 base 默認禁用模塊 HMR（熱模塊替換）的策略；其 patch 設置 coding agent（編程智能體）persona、掛載應用自有的零選項命令提供方，并且只在該提供方接受調用后啟動 [`dsh-sdk-jsonrpc-server`](../../sdk/server/README.zh.md)。因此，`dsh --profile sdk --help` 會寫出 help 并退出，不會占用 stdin 或 stdout。獨立的 [`sdk-minimal`](../sdk-minimal/README.zh.md) bundle 復用同一個啟動提供方，并提供自己的 profile 名稱。

## 目錄

- [使用本包](#use-this-package)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

啟動提供方把 stdin EOF 接到啟動器的有界成功關閉流程。SDK 協議 `shutdown`、SIGINT 與 SIGTERM 繼續使用各自所屬的 server 或啟動器路徑；dispose（資源釋放）會排空根 profile 配置樹與持久化。stdout 專用于按換行分隔的 JSON-RPC 幀。SDK 不提供 title 表層，因此本組合包禁用模型生成的會話標題；確定性的 fallback title 仍會持久化，但不發起輔助模型請求。繼承的投影緩存會為 SDK 創建的會話寫入檢查點，供后續消費方使用；其持久性屏障會在發布緩存行前 flush 所覆蓋的日志前綴，因此可能拆分原本會合并的 JSONL 行。部署通過 profile 組合包與 patch 文件選擇另一套完整組合，而不是使用另一個應用 bin。

| 配置 | 默認值 | 行為 |
|---|---|---|
| `profile` | `sdk` | 命令幫助中顯示的 profile 名稱；掛載此提供方的 bundle 會設置自己的隨附 profile 名稱。 |

`DSH_MAX_TOKENS_AS_SUCCESS` 保留 SDK 部署映射：未設置或 JSON `true` 把 token 達限的 subagent 完成報告為已接受，JSON `false` 則報告為錯誤。模型提供方／模型與工作區 cwd 通過 SDK 初始化請求傳入；base profile 擁有適配器、工具、持久化、策略、settings 與 credentials。

SDK 使用 base 默認提供的 `read`、`write` 和 `edit`。要添加 `str_replace_editor`，請使用 [base 配置指南](../base/README.zh.md#use-this-package)中的顯式插入 patch。獨立的 `sdk-minimal` profile 自行決定其工具選擇。

-----

<a id="model-experience"></a>
## 模型體驗

### SDK coding agent persona

#### 模型看到什么

profile 在第一方指導之前提供 `You are a coding agent powered by the {{model}} model.`，并在獨立的 persona 后綴中提供 `Your working directory is {{cwd}}.`。確切的 SDK 初始化路由與會話 cwd 會解析其中的占位符。默認文件工具 schema 包含 `read`、`write` 和 `edit`，不包含 `str_replace_editor`。

#### Token 影響

一段簡短穩定的 persona，加上隨數據變化的 base 提示詞段落與所選工具 schema。

#### KV Cache 影響

對固定 profile、提供方、模型與工具清單保持穩定。由于隨附 SDK profile 使用僅啟動時 patch，profile 變化會在下一個進程生效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **profile 可能省略 SDK server**：TypeScript client 選擇的自定義 profile 必須保留本組合包或另一個 `dsh-sdk-jsonrpc-server` 配置項；沒有 peer 響應時，client 初始化會失敗。
- **用戶插件可以破壞 stdout 純凈性**：profile 與逐次啟動 patch 屬于受信任應用組合。隨附組合包不會向 stdout 寫入非協議內容，但無法約束任意插入插件。
- **配置變化需要重啟**：隨附 `sdk` profile 使用 `patchReload: startup`，因此一個 stdio 連接不會觀察到 server 或 agent 依賴被替換。


<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。該 bundle 增加進程傳輸與啟動 latch；幀純度、help 排除和關閉行為由源碼及構建產物的 stdio 測試負責。
