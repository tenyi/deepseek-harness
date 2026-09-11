---
description: "Web GUI 的模型選擇：/model 彈窗與 composer 模型位共用一份按提供方分組的會話級目錄；供模型路由的用戶與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-model-selection

[English](README.md) | 中文

## 概述

Web GUI 允許用戶通過 `/model` 彈窗或 composer 模型控件切換既有會話使用的模型與推理（reasoning）強度。兩個界面呈現同一組按提供方分組的選擇；所選模型決定可用的推理強度名稱與默認值。完整選擇從下一次請求開始生效；運行中的步驟保留其啟動時的模型與推理強度。如果沒有適配器可以服務會話路由，composer 會保持停用，直至路由恢復可用。

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

與 `ui-conversation` 及命令包一起掛載本插件；composer 隨即在待處理指示器旁顯示模型位，`/model` 則以彈窗打開同一份目錄。當確切提供方／模型對仍在已公布分組中時，兩個界面都顯示 Host 報告的當前選擇；目錄行缺席時，可路由的選擇保持不變，觸發器提示 `Select model`。

### 模型與推理強度

模型按提供方分組。composer 菜單只顯示模型與推理強度名稱。`/model` 彈窗顯示提供方名稱與目錄說明；其中兩個內置 DeepSeek 模型的說明使用當前語言，外部提供方說明保持原文。彈窗應用所選模型的默認推理強度；composer 隨后可以選擇任一已公布的推理強度。適配器沒有推理元數據時不顯示 Effort 行；不存在任意推理強度輸入。

### 不可路由的會話

當 Host 報告沒有適配器服務該會話的路由時，本插件注冊一個 composer 阻塞塊，輸入框隨之停用并顯示本插件自己的文案；恢復后無需重新加載即清除。首次加載之前或加載失敗之后的 `null` 絕不阻斷；目錄成員關系同樣不阻斷——一條仍在服務、只是不公布該模型的路由不在分組里，卻可用。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

兩個入口共用一份由 `ModelDirectoryResolver`（`ctx.modelDirectories`）持有的會話級目錄：`/model` popupSelect 貢獻項（經 `ctx.commandUi` 注冊）與 composer 的具名 `conversation.input.model` 位都經 `session.models` 加載會話的建議目錄、經 `session.selectModel` 通過同一個 `ModelDirectory` 實例提交，因此任一入口所做的切換正是另一個入口接下來顯示的。目錄加載與選擇共享一個代次計數器，舊響應不會覆蓋新結果；連接重置丟棄所有常駐投影，并在顯示前重新拉取 Host 恢復的選擇。目錄按會話惰性解析，隨會話作用域一并 dispose（資源釋放）；已尋址 subagent 會話不公開任一入口。每份常駐目錄都會直接在轉發的 `llm/adapters-updated` 與 `settings/document-updated` owner 事件上重拉。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當僅了解模型界面還不夠時，請閱讀以下頁面。這些頁面從瀏覽器界面逐步深入到命令彈窗外殼與選擇約定。

- [ui-commands](../ui-commands/README.zh.md)——`/model` 貢獻項注冊進的 popupSelect 外殼。
- [ui-conversation](../ui-conversation/README.zh.md)——聲明 composer 的 `conversation.input.model` 位與 composer 阻塞塊。
- [dsh-agent-default-model](../../core/agent-default-model/README.zh.md)——為從未選擇的會話提供默認模型的默認模型服務。
- [客戶端包映射](../README.zh.md)——相鄰的瀏覽器 UI 包。

-----

<a id="model-experience"></a>
## 模型體驗

兩個入口提交的 `session.selectModel` 選擇會間接影響模型：Host 會在下一次提示詞組裝邊界為完整的 `ModelSelection` 創建快照，并負責使其對模型生效；運行中的步驟則保留已組裝的選擇。

#### KV Cache 影響

切換路由可能減少提供方側后續請求的緩存復用，或使其失效；提示詞前綴本身不受影響。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制界定了當前模型選擇界面。它們是當前包約束，不是通用模型路由器對比或任務積壓。

- **無創建期或已尋址 subagent 選擇**——兩個入口都要求既有普通會話的 agent（智能體）；沒有可納入會話創建的草稿階段模型選擇，subagent 繼續執行也有意不公開獨立的模型選擇約定。
- **目錄名僅供呈現**——選擇與持久化使用提供方／模型／推理強度 id；目錄查詢或確切模型元數據查詢失敗的提供方以不可選失敗行列出，重新加載前保持原樣。
- **不能任意輸入推理強度**——composer 僅提供確切模型由適配器公布的推理強度；適配器沒有推理元數據時不顯示 Effort 行。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。插件只注冊一個 command contribution，HMR（熱模塊替換）安全性測試證明該注冊的 dispose 能正確完成；它不發出 Cordis 事件，也不持有跨插件可變狀態。
