---
description: "Web GUI 的 plan 模式狀態徽章：顯示 plan 模式已開啟并可將其關閉的 composer 控件；供 plan 模式的用戶與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-plan

[English](README.md) | 中文

## 概述

本包在 Web GUI 中渲染 plan 模式狀態徽章：當宿主計算的投影有效目標為 plan 模式時，composer 顯示一個 warn 色「Plan ×」按鈕，可關閉 plan 模式；否則該座位保持為空。plan 模式本身——`/plan` 命令、已提交的 `plan/mode` 狀態、投影單元與 policy 段——歸 `dsh-plan-mode` 所有；本包只渲染投影并發送用戶同樣可以手敲的內容。模型經穩定的 `exit_plan_mode` 工具退出 plan 模式；其 plan 評審走已組合的 Web question 通道。

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

與 `ui-conversation` 及 `dsh-plan-mode` 一起掛載本插件；plan 模式激活時，徽章隨即占據 composer 的 plan 座位（訪問模式控件右側）。經 `/plan` 命令路徑進入 plan 模式——從 composer 的 `+` Command 菜單選擇 Plan，或鍵入 `/plan`——再用徽章將其關閉。

### 徽章顯示什么

當有效目標為 plan 模式時，該座位渲染 warn 色「Plan ×」狀態按鈕，執行 `/plan off`。否則座位保持為空：未組合 plan-mode 的宿主，或尚無會話的 Draft，都不顯示任何內容。plan 模式為有效目標期間，composer 文本框的 placeholder 切換為 plan 任務提示——「describe your task to generate plan」——除非所屬 surface 提供自己的 placeholder。

### 失敗

準入失敗（`matched: false`、業務錯誤、傳輸故障）以內聯錯誤呈現，徽章保持顯示直至投影確認退出。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

徽章占據 conversation 聲明的 `conversation.input.plan` 單實例座位；node 半部是空 apply（roster 行）。讀取經 standard-kit 的 `useProjection` 走通用投影對：有效目標是 `pending ? !active : active`——折疊的宿主值而非客戶端樂觀態，因此到達的幀無論哪個方向都會糾正徽章。座位注入面攜帶一個動詞 `exitPlanMode`，經 `ctx.remote.commands.execute` 執行 `/plan off`，并把準入失敗映射為一行內聯錯誤。placeholder 與提示文案位于 ui-conversation 的 `conversation` locale 命名空間，與已認領 `/plan` 命令的提示逐字共用。無障礙描述是「Plan mode on, press to turn off」。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當 plan surface 不夠用時閱讀以下頁面。它們從徽章進入 plan 模式領域與 composer 外殼。

- [dsh-plan-mode](../../plan/plan-mode/README.zh.md)——擁有 plan 模式、`/plan` 命令、投影與 policy 段。
- [ui-conversation](../ui-conversation/README.zh.md)——聲明 composer 的 `conversation.input.plan` 座位與 placeholder locale 鍵。
- [工具目錄](../../../docs/tool-catalog.zh.md#deepseek-aidsh-plan-mode)——模型退出 plan 模式所用的 `exit_plan_mode` 工具 schema。
- [客戶端包映射](../README.zh.md)——相鄰的瀏覽器 UI 包。

-----

<a id="model-experience"></a>
## 模型體驗

間接地，通過 chip 派發的 `/plan off` 命令行：`dsh-plan-mode` 擁有該命令行驅動的模型可見 policy 段、退出工具 schema 與已記錄狀態。

#### KV Cache 影響

進入或離開 plan mode 會改變活躍的 `plan:policy` 系統提示詞段，因此改變請求前綴；chip 本身不添加任何提示詞內容。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制界定了當前 plan 徽章。它們是當前包約束，不是 plan 模式對比或任務積壓。

- **Plan 模式是引導而非執行沙箱**——需要強制只讀規劃的部署必須組合獨立的沙箱與審批策略。
- **徽章屬于默認 composer**——待處理的涉及整個 composer 的交互（如 plan 評審）會臨時取代 InputBar 及其徽章。
- **未激活時無 plan 控件**——入口使用共享 Command source；有能力但模式未激活的會話在工具行不顯示 plan 入口。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。plan state 與 boundary 的所有權由 dsh-plan-mode 審計；本包的 control 是一種 slot effect，其聲明、注冊與清理由本包執行。
