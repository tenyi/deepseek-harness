---
description: "面向啟動持久 harness agent（智能體）的用戶與維護者，說明純自動化 ACP（Agent Client Protocol）stdio 應用 profile。"
kind: "package-bundle"
---

# `@deepseek-ai/dsh-acp-app`

[English](README.md) | 中文

## 概述

以 [`dsh-base`](../base/README.zh.md) 為基礎的純自動化 ACP stdio 應用 `dsh` profile 組合包。它繼承 base 禁用模塊 HMR（熱模塊替換）的策略；其 patch 設置 coding agent（編程智能體）persona 與默認模型路由、掛載應用自有的零選項命令提供方，并且只在該提供方接受調用后啟動 [`dsh-acp`](../../acp/acp/README.zh.md)。因此，`dsh --profile acp --help` 會寫出 help 并退出，不會占用 stdin 或 stdout。

## 目錄

- [使用本包](#use-this-package)
- [標準自動化工作流](#standard-automation-workflow)
- [模型體驗](#model-experience)
- [已知限制與待辦事項](#known-limitations-and-deferred-work)
- [開發備注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

啟動提供方把 stdin EOF 綁定到啟動器的有界成功關閉。ACP 連接關閉、SIGINT 與 SIGTERM 會在退出前排空 bridge 自有 agent 以及根 profile 樹。Stdout 僅保留給換行分隔的 ACP JSON-RPC 幀。ACP 不提供標題呈現能力，因此本組合包禁用模型生成的會話 title；確定性的 fallback title 仍會持久化，但不發起輔助模型請求。繼承的投影緩存會為 ACP 創建的會話寫入檢查點，供后續消費方使用；其持久性屏障會在發布緩存行前 flush 所覆蓋的日志前綴，因此可能拆分原本會合并的 JSONL 連續段。部署方通過 profile 組合包與 patch 文件選擇另一套完整組合，而不是使用另一個 app bin。

隨附配置項使用 `deepseek-official` 與 `deepseek-v4-flash` 創建會話；后續 patch 可以替換該配置項的完整配置。base profile 負責適配器、工具、持久化、策略、設置、憑據，以及 ACP client 為每個會話提供的工作區。

-----

<a id="standard-automation-workflow"></a>
## 標準自動化工作流

ACP v1 SDK 客戶端先初始化 `dsh --profile acp`，再用絕對 `cwd` 與可選的標準 stdio／HTTP MCP 聲明創建會話，選擇公開的 `model` 或 `reasoning_effort`，在觀察標準語義更新的同時提交提示詞，最后調用 `session/close`。另一個進程可以針對同一個 profile 持久化根目錄使用 `session/list` 與 `session/resume`；恢復會重新連接該請求提供的 MCP 聲明，但不會回放歷史。

完整的受支持方法矩陣、MCP 信任模型、更新映射與停止原因見 [`dsh-acp` 協議約定](../../acp/acp/README.zh.md#standard-acp-v1-surface)。該 profile 不增加私有方法、能力、`_meta`、環境變量或傳輸字段。免密鑰控制面一致性測試通過公開 ACP SDK 驅動真實 profile。

<a id="model-experience"></a>
## 模型體驗

### ACP coding-agent persona

#### 模型看到什么

profile 在第一方指導之前提供 `You are a coding agent powered by the {{model}} model.`，并在獨立的 persona 后綴中提供 `Your working directory is {{cwd}}.`。ACP 配置項的路由與每個 `session/new` 的 cwd 會解析其中的占位符。

#### Token 影響

一段簡短穩定的 persona，加上 base 提示詞中隨數據變化的部分與已選工具 schema。

#### KV Cache 影響

固定 profile、提供方、模型與工具集合下保持穩定。隨附 ACP profile 只在啟動時加載 patch，因此 profile 更改會在下一個進程生效。

## 已知限制與待辦事項

<a id="known-limitations-and-deferred-work"></a>

- **profile 可以省略 ACP bridge**：自定義 ACP 啟動 profile 必須保留本組合包或另一個 `dsh-acp` 配置項；否則沒有 peer 響應 client。
- **用戶插件可能破壞 stdout 純凈性**：profile 與單次啟動 patch 屬于受信任的應用組合。隨附組合包不會向 stdout 寫入非協議內容，但無法約束任意插入的插件。
- **配置更改需要重啟**：隨附 `acp` profile 使用 `patchReload: startup`，確保一條 stdio 連接不會觀察到 bridge 或 Agent 依賴被替換。


<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。該 bundle 只增加進程傳輸與啟動 latch；幀純度、help 排除和關閉行為由源碼及構建產物的 stdio 測試負責。
