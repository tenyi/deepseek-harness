---
description: "DeepSeek Harness 包工作區：packages/ 下的 npm 包如何分組、每個組負責什么，以及約束它們的約定。"
kind: "package-group"
---

# 包

[English](README.md) | 中文

## 概述

harness 由 `packages/` 下的 npm 包組裝而成，按能力系列分組：會話與 agent loop（智能體循環）、面向模型的工具、shell 與文件系統執行、Web 訪問、subagent 等等。把本頁當作頂層地圖使用：先找到擁有某能力的組，再打開其 README 查看包列表。每個包都以 `@deepseek-ai/dsh-*` 為作用域、只屬于一個組；每個組的 README 都是該能力系列的權威包映射。

## 目錄

- [包分組](#package-groups)
- [發布預期](#release-expectations)
- [依賴](#dependencies)
- [包 README 約定](#package-readme-contracts)
- [開發備注](#dev-note)

-----

<a id="package-groups"></a>
## 包分組

每個包只屬于一個組；新包加入現有組，新組則更新其自身 README 與本表。

| 組 | 職責 |
|---|---|
| [`core/`](core/README.zh.md) | 產品 API 主干：會話、提示詞、工具、agent 服務與具體循環 |
| [`api/`](api/README.zh.md) | Remote BFF 裝配與 Typert RPC 網關 |
| [`typert/`](typert/README.zh.md) | 類型圖生成、產物加載與運行時注冊表 |
| [`goal/`](goal/README.zh.md) | 同會話 goal 的持久化與生命周期 |
| [`schedule/`](schedule/README.zh.md) | 僅限會話內的定時后續操作 |
| [`feedback/`](feedback/README.zh.md) | 人類反饋的采集與命令 |
| [`identity/`](identity/README.zh.md) | 共享匿名身份 |
| [`llm/`](llm/README.zh.md) | LLM（大語言模型）能力系列：抽象服務 + 提供方適配器 |
| [`e2b/`](e2b/README.zh.md) | E2B 遠程運行時提供方 |
| [`subprocess/`](subprocess/README.zh.md) | 子進程能力系列：Service Definition + 本地進程樹提供方 |
| [`shell/`](shell/README.zh.md) | Bash 能力系列：執行器 seam、本地實現、面向模型的工具 |
| [`terminal/`](terminal/README.zh.md) | 持久 PTY 能力系列：限定所有者范圍的會話、本地實現、面向模型的工具 |
| [`code-runtime/`](code-runtime/README.zh.md) | 代碼執行能力系列：Service Definition + worker 線程提供方 + PTC mode Consumer |
| [`sandbox/`](sandbox/README.zh.md) | 進程限制 seam；bwrap、Landlock、Seatbelt 后端 |
| [`fs/`](fs/README.zh.md) | 文件系統能力系列：seam、本地實現、面向模型的文件工具、發現工具 |
| [`lsp/`](lsp/README.zh.md) | LSP 能力系列：seam、通用 stdio 提供方和 `lsp` 工具 |
| [`skill/`](skill/README.zh.md) | skill（技能）能力系列：提供方注冊表、本地提供方、面向模型的目錄／loader |
| [`compaction/`](compaction/README.zh.md) | 壓縮（compaction）能力系列：Service Definition + 基礎提供方 + 命令 Consumer |
| [`context/`](context/README.zh.md) | 模型可見請求上下文：workspace 指令、時間上下文、引用 |
| [`subagent/`](subagent/README.zh.md) | subagent 能力系列：提供方注冊表約定和面向模型的委托工具 |
| [`jobs/`](jobs/README.zh.md) | 通用后臺任務運行時和面向模型的作業控制工具 |
| [`experimental/`](experimental/README.zh.md) | 私有原型與內部專用插件 |
| [`workflow/`](workflow/README.zh.md) | 工作流 seam、worker 線程引擎、面向模型的 `workflow`／`ralph` 工具 |
| [`webhook/`](webhook/README.zh.md) | 已驗證外部事件、受信規則與即發即棄 Workspace 會話 |
| [`web/`](web/README.zh.md) | Web 能力系列：seam、搜索／獲取提供方、面向模型的 Web 工具 |
| [`attachment/`](attachment/README.zh.md) | 持久附件標識、校驗、本地內容尋址存儲 |
| [`spill/`](spill/README.zh.md) | spill 能力系列：存儲 seam、本地實現、工具結果 spill 策略 |
| [`todo/`](todo/README.zh.md) | 面向模型的 `todo_write` 工具 |
| [`plan/`](plan/README.zh.md) | Plan 協作狀態，提供直接進入命令與經評審的退出 |
| [`preset/`](preset/README.zh.md) | 由 preset `cordis.yml` 按會話組裝 agent |
| [`guard/`](guard/README.zh.md) | 循環衛生守衛：建議性重復調用提醒 + `tools/execute` 截止時間強制執行器 |
| [`bundle/`](bundle/README.zh.md) | 可安裝的 `dsh --profile` 補丁層 |
| [`extensions/`](extensions/README.zh.md) | agent 運行時自修改：實時插件／服務檢查與模型所寫掛載／卸載 |
| [`hooks/`](hooks/README.zh.md) | 鉤子橋接 + 共享的 Claude Code／Codex 線協議庫 |
| [`session/`](session/README.zh.md) | 持久會話數據平面：持久化 seam + 后端、投影 seam、基于日志的標題、會話上報 |
| [`session-query/`](session-query/README.zh.md) | 會話檢索系列：邏輯語料庫、有界讀取、血緣、語義過濾、SQLite 全文搜索 |
| [`settings/`](settings/README.zh.md) | 用戶設置 seam + 基于文件的提供方 |
| [`credentials/`](credentials/README.zh.md) | 憑據引用與憑據記錄 seam + 環境變量優先于 `.env` 的提供方 + 需要向人詢問的授權流程 |
| [`storage/`](storage/README.zh.md) | 非會話存儲中樞 + 后端 + 領域形式 |
| [`workspace/`](workspace/README.zh.md) | Workspace 實體 |
| [`sdk/`](sdk/README.zh.md) | 進程外 SDK：JSON-RPC 協議與 TypeScript 客戶端／服務器 |
| [`acp/`](acp/README.zh.md) | 僅面向自動化的 ACP（Agent Client Protocol）服務器 |
| [`interaction/`](interaction/README.zh.md) | 人機協作平面：批準／交互 seam、權限預設、命令、詢問用戶的工具 |
| [`boot/`](boot/README.zh.md) | 共享的 app bin 啟動粘合層 |
| [`host/`](host/README.zh.md) | web GUI 宿主半側：API 網關 + HTTP 路由服務器 |
| [`client/`](client/README.zh.md) | web GUI 瀏覽器半側：shell、協議層、對象服務、slot、`ui-*` 插件 |
| [`test-support/`](test-support/README.zh.md) | 支持基礎設施（testkit、不變式、回放、Loader 冒煙測試） |
| [`runtime-diagnostics/`](runtime-diagnostics/README.zh.md) | 運行時診斷：按包歸屬的運行時不變式檢查與報告 |
| [`util/`](util/README.zh.md) | 組間共享的低層零依賴工具（`Branded<B>`、home／路徑輔助函數、超時、留存） |

-----

<a id="release-expectations"></a>
## 發布預期

大多數組屬于產品組，提供穩定 API。例外：`e2b/` 是 POC，`experimental/` 不發布，`test-support/`、`runtime-diagnostics/` 與 `util/` 是兼容性預期較低的支持組。

-----

<a id="dependencies"></a>
## 依賴

依賴圖由工具生成：[docs/module-graph.md](../docs/module-graph.zh.md)（`pnpm run gen-module-graph`，CI 中有新鮮度門禁）。

**擴展插件依賴 Service Definition，絕不依賴具體提供方。** `dsh-agent-loop` 可替換；UI、鉤子和工具插件使用 `dsh-agent`。組合包可以依賴主干插件。能力在需要獨立演進時分離 Service Definition／Service Provider／Consumer 角色；詳見[能力 seam](../.agents/notes/implemented/architecture/2026-06-13-capability-seams.zh.md)。

-----

<a id="package-readme-contracts"></a>
## 包 README 約定

每個包 README 都覆蓋用途、配置、擴展點與[模型體驗](../docs/cookbook/adding-a-package.zh.md#4-write-the-package-readme)，列入模型無關[省略允許清單](../scripts/verify-package-readme-model-experience.ts)的包除外。它還要包含 `## Known Limitations and Deferred Work`，或列入其[允許清單](../scripts/verify-package-readme-limitations.ts)。包約定——導出、服務訪問、不變式、測試——見 [packages/AGENTS.md](AGENTS.md)。

-----

<a id="dev-note"></a>
## 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
