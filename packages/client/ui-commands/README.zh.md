---
description: "Web GUI 的客戶端命令 API：/ 命令 source、三類派發、會話級命令目錄，以及面向業務包的 popupSelect 與 action 注冊；供斜杠命令的用戶與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-commands

[English](README.md) | 中文

## 概述

鍵入 `/` 命令會打開已注冊的彈窗、運行客戶端動作、進入宿主命令的輸入或直接執行，命令行不會被靜默降級為普通提示詞。業務包通過 `ctx.commandUi` 注冊 popupSelect（`/model`、`/permission`）或 action，也可用這兩種方式裝飾既有宿主命令，同時保留其目錄行與參數聲明。空格與回車根據會話目錄解析命令行：帶 `input` 的宿主描述符是 `leadingInput`，注冊了 `CommandUiSpec` 的是 `popupSelect` 或 `action`，其余是 `execute`。

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

與 `ui-input-trigger` 及 `ui-conversation` 一起掛載本插件；`/` source 隨即出現在觸發菜單中，業務包經 `ctx.commandUi` 注冊自己的命令表面。鍵入 `/model` 打開已注冊的彈窗；帶參數聲明的宿主命令打開其輸入或直接執行。composer 的 `+` 按鈕與鍵入的 `/` 打開同一個菜單：「添加」小節（文件、目標、計劃、反饋）與「指令」小節（壓縮、權限、模型、下載日志）按使用頻次排列，每行帶圖標、本地化的標題與說明，本地化標題與命令名不同時還顯示命令名作為別名。

### 種類與裝飾

貢獻項是客戶端自有命令，與宿主命令同名會明確報錯。它的 UI 是 popupSelect 規格或動作：裸調用消費觸發 token 后運行回調，不提交消息。業務包負責自己的動作及可用性，輸入框通過同一 API 注冊「文件」。裝飾為已有宿主命令添加裸調用彈窗或動作，并保留其目錄行、參數認領與生命周期記錄；沒有匹配的宿主行時不觸發。菜單查詢按順序、不區分大小寫地模糊匹配命令名與標題的子序列，前綴優先，不顯示小節標題。

### 內置行的展示面

內置命令定義攜帶穩定的 `definitionId`。客戶端按標識選擇本地化標題、說明、圖標和輸入寫法，修改宿主說明不會改變選擇結果。沒有匹配標識的同名覆蓋保留自己的文案，也不獲得內置別名。在任何界面語言下，中英文寫法都通過同一個會話有效目錄解析，草稿保留手輸寫法，提交使用宿主注冊名。貢獻項提供自己的 `label`、`description` 和 `icon`，每次生成候選項時讀取。空查詢按名稱確定小節順序，未列出的行排在「指令」末尾。

### 帶附件提交

composer 攜帶圖片或通用文件提交時，只有聲明了 `input.attachments` 的宿主命令繼續。其余命令路徑都會拋出本地化的 `attachmentsUnsupported` 拒絕，以瞬態 toast 呈現，草稿與附件卡保持原位。處理器出錯時保留相同草稿狀態供用戶重試。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

`src/client/contract.ts` 定義貢獻項和裝飾的注冊接口。`CommandDirectory` 負責會話級協議緩存，并通過 `resolution.ts` 解析輸入命令；該模塊負責內置命令標識匹配和本地化輸入寫法。`matchSpace` 同步讀取就緒緩存，`matchEnter` 等待緩存就緒，預熱失敗或取消時拒絕。轉發的目錄和連接事件使緩存失效。宿主執行匹配的命令后，本瀏覽器發布 `command/executed`，其他客戶端只觀察持久命令事件。`PopupSelectController` 負責彈窗狀態，`PopupSelectView` 占據輸入浮層。`presentation.ts` 負責行標題、圖標和分節，展示與解析輔助函數均留在插件內部。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

如果僅了解命令交互還不夠，請閱讀以下頁面。它們從命令 API 進入觸發流水線與宿主命令注冊表。

- [ui-input-trigger](../ui-input-trigger/README.zh.md)——`/` source 注冊進的流水線。
- [ui-conversation](../ui-conversation/README.zh.md)——聲明輸入浮層 slot 并擁有 composer。
- [客戶端包映射](../README.zh.md)——相鄰的瀏覽器 UI 包。

-----

<a id="model-experience"></a>
## 模型體驗

派發路徑通過其觸發的宿主 `command.execute` RPC 間接影響模型：每個命令 handler 的宿主包擁有任何模型可見效果（`/plan` 的 handler 翻轉 plan 模式，其歸屬包注入 policy 段），而命令行、分離結果與所有菜單和 notice 渲染都留在客戶端，永不進入會話日志。

#### KV Cache 影響

無直接影響；該包既不組裝也不發送提供方請求。它觸發的命令 handler 可能改變歸屬宿主包對下一個請求系統提示詞的貢獻——某個 section 的出現或消失會替換較早的請求 token，并使提供方前綴從該點起失效——但這一影響由各命令的宿主包擁有并記錄。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制界定了當前命令交互方式。它們是當前包約束，不是通用命令行對比或任務積壓。

- **脫離會話后，分離結果 notice 回退到 console**——fire-and-forget 路徑經 `SessionInput.notify` 把結果送到觸發會話的 composer；會話銷毀后，console 輸出行是僅剩的呈現面。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。這是基于 wire 命令目錄的瀏覽器側 source，不發出 Cordis 事件，也不持有跨插件可變狀態；dispatch 與 cache 行為由包測試覆蓋。
