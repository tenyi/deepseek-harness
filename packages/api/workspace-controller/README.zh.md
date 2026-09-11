---
description: "Host 與 Client 工作區控制：修改工作區導航并跟隨其完整投影。"
kind: "package-reference"
---
# Workspace Controller

[English](README.md) | 中文

## 概述

`@deepseek-ai/dsh-api-workspace-controller` 擁有 Host 的 `ctx.workspaceController` 服務和生成的 Client `ctx.remote.workspace` namespace。它的 Remote 方法負責創建、重命名、移除和重排 Workspace，在 Workspace 內重排 Session，從 Workspace 導航中歸檔 Session，以及跟隨完整的 Workspace 投影。當 Client 必須修改或跟隨 Workspace 導航時，請通過 API 網關使用它。本包同時擁有 `ctx.directoryPickerController` 與生成的 `ctx.remote.directoryPicker` namespace，因為它承載的選目錄 seam 是抽象的，自身從不作為 Loader entry。

## 目錄

- [使用本包](#use-this-package)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

Host 控制器會串行執行正確性取決于當前注冊表狀態的變更，并為預期失敗拋出帶有穩定 `workspace/*` 或 `directory-picker/*` 錯誤碼的 `RemoteError`。它的 `follow()` 流會同步訂閱持久 Workspace 變更，先發出一份完整 baseline，再按順序發出 `upsert`、`remove`、`order` 和 `archived` 增量。重連會以替換 baseline 開始新一代，因此消費方不依賴收到斷線期間的每個增量。

Client 入口提供 `ClientWorkspaceModel` 和 `createWorkspaceStateStream()`。該模型擁有 Workspace 行、registry 順序、已歸檔 Session id、一元變更回顯，以及流與一元調用的競態處理。較新的 Host 行按 `updatedAt` 獲勝；已提交的流順序優先于較舊的一元響應；已經移除的 Workspace id 不會被延遲數據復活。該包公開與框架無關的快照和訂閱，把導航策略與 React 鉤子留給 UI owner。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為 Workspace 組織屬于瀏覽器和 Host 的控制狀態，并且不注冊提示詞、工具或會話事件。

#### KV Cache 影響

無直接影響；Workspace 變更不會改變模型請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- `follow()` 在重連后替換完整投影，不提供持久 cursor 或增量追趕協議。
- 進程內刪除標記只會在 Client 模型生命周期內阻止延遲數據復活已移除的 Workspace。


<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。Workspace 注冊表負責持久化，每次流生成都是完整投影。
