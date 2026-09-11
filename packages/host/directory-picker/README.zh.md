---
description: "面向 web GUI 宿主的工作區目錄選擇 seam：原生與瀏覽后端所實現的服務約定、能力詞匯與錯誤碼。"
kind: "package-reference"
---

# @deepseek-ai/dsh-host-directory-picker

[English](README.md) | 中文

## 概述

web GUI 讓操作者通過 OS 選擇器或應用內瀏覽器選擇工作區目錄。操作者能接觸宿主屏幕時使用原生選項；遠程客戶端或需要在應用內列舉和創建目錄時使用瀏覽選項。消費方會獲得交互類型，并能呈現匹配的工作流。目錄選擇僅限 GUI 宿主，不會影響 agent loop（智能體循環）。瀏覽工作流一次只公開一棵目錄樹；不支持多根目錄。

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

掛載且只掛載一個目錄選擇后端，然后讓工作區流程驅動它：seam 本身只是服務約定，因此沒有后端的組合就無從選擇目錄。

### 選擇后端

當操作者坐在宿主屏幕前時，[原生后端](../directory-picker-native/README.zh.md)是正確選擇：`directoryPicker/pick` 打開一個 OS 選擇器，返回所選絕對路徑，取消時返回 `null`。[瀏覽后端](../directory-picker-browse/README.zh.md)處處可用——它在瀏覽器中列舉一個目錄層級并創建子目錄，因此無法觸達 OS 對話框的遠程客戶端依然能選擇工作區。當宿主處境在兩次啟動之間變化時，組合[自適應選擇器](../directory-picker-auto/README.zh.md)，它在啟動時判定一次處境并掛載匹配的后端。

### 能力約定

`capability()` 返回一個可辨識聯合類型，說明操作者如何選擇目錄：OS 選擇器為 `{ kind: 'native', pick(signal) }`，應用內瀏覽器為 `{ kind: 'browse', list(path?), createDirectory(path, name) }`。消費方按 `kind` 分支；遇到未知能力類型時，界面會隱藏選擇入口，而不是失敗。瀏覽失敗拋出帶類型的 `DirectoryPickerError`，其錯誤碼集合是封閉的——`directory-unreadable`、`directory-exists` 或 `directory-create-failed`——每個都攜帶出錯對象的路徑，目錄選擇 Remote 控制器將其 1:1 映射為協議錯誤碼。

### 行攜帶什么

`DirectoryEntry` 行暴露絕對 `path` 與宿主判定的 `hidden` 標志（POSIX 上為點前綴約定），展示策略留在客戶端；客戶端絕不自行拼接路徑段。`DirectoryListing.crumbs` 是從文件系統根到被列舉目錄的祖先鏈——每個 crumb 都是跳轉目標，根 crumb 以完整路徑標注。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

### 設計理念

該 seam 建立在一個分離之上：后端提供的交互形態是約定，而不是實現細節。`DirectoryPicker` 是只有一個 `capability()` 方法的抽象 Cordis 服務；后端子類以 `ctx.directoryPicker` 注冊，加載第二個實現會拋出標準的重復服務錯誤。能力對象在服務生命周期內必須保持穩定，因為消費方可能跨調用持有它。

### 可合并擴展的詞匯

`DirectoryPickerCapabilities` 是以能力類型為鍵的可合并擴展映射，`DirectoryPickerCapability` 從它派生聯合類型。新后端通過聲明合并將其形態加入此映射（條目的 `kind` 字面量必須等于其鍵），而無需改動本包。每個后端包還隨附一個 browser 入口，在 ui-workspace 的 directory-flow slot 中注冊匹配的交互，因此一行組合配置同時選擇宿主能力與客戶端流程。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | Service Definition：抽象 `DirectoryPicker`、能力詞匯、類型化錯誤、Context 合并 |

### 失敗詞匯

`DirectoryPickerError` 攜帶封閉的 `DirectoryPickerErrorCode` 加出錯對象的絕對路徑，消費方無需字符串匹配即可映射業務錯誤碼。設計依據、與 `ctx.fs` 的切分與策略裁決見 seam Agent Note。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當 seam 約定不夠用時閱讀以下內容：先看決策記錄，再看組合它的兩個后端與自適應選擇器。

- [目錄選擇能力 seam 決策](../../../.agents/notes/archived/architecture/2026-07-28-directory-picker-capability-seam.md)——設計依據、`ctx.fs` 切分與策略裁決。
- [原生后端](../directory-picker-native/README.zh.md)——OS 選擇器交互及其平臺工具。
- [瀏覽后端](../directory-picker-browse/README.zh.md)——面向遠程客戶端的應用內列舉與創建交互。
- [自適應選擇器](../directory-picker-auto/README.zh.md)——兩個后端之間的啟動時判定。
- [工作區子系統](../../../docs/subsystems/workspace.zh.md)——接收所選目錄的工作區記錄。

-----

<a id="model-experience"></a>
## 模型體驗

無。GUI 宿主的目錄選擇 seam 不注冊任何面向模型的內容。

#### KV Cache 影響

無；該包既不組裝也不發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明 seam 約定何時把決定留給未來的消費方。它們是當前包約束，不是任務積壓。

- **不支持多根目錄**——瀏覽約定每次列舉只公開一條祖先鏈；按部署限定瀏覽根（以及在盤符根的上一級枚舉 Windows 各盤符根目錄）等到出現需要它的消費方再做，見 DirectoryPicker Agent Note。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。這個無狀態 Service Definition 只定義 capability vocabulary，觀察由 backend 與 Remote controller 負責。
