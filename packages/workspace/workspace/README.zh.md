---
description: "面向選擇、掛載或排查持久 workspace 記錄與會話頭校驗成員資格的宿主的 Workspace 實體注冊表（ctx.workspaceRegistry）說明。"
kind: "package-reference"
---

# @deepseek-ai/dsh-workspace

[English](README.md) | 中文

## 概述

使用此包可以維護一個有序、持久的項目目錄列表，以及在每個目錄中運行的會話。宿主可以構建項目側邊欄、在不刪除歷史的情況下把會話從分組中隱藏，并在不刪除文件夾、文件或會話的情況下移除項目。重新添加已移除的目錄會創建一個全新項目，而目錄無法校驗的會話會保持 Ungrouped。需要持久項目分組的 GUI 或宿主工作流適合使用它；它對模型不可見，不增加提示詞或請求上下文成本，但需要會話持久化與存儲后端。

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

使用此包為產品提供項目列表：用戶工作的命名目錄、每個目錄中運行的會話、穩定順序，以及在不丟失會話的前提下將其隱藏的能力。每項操作背后的 API 約定放在實現章節中。

### 何時使用

當產品展示持久 workspace 界面——側邊欄、會話分組或需要命名并排序目錄的自動化——時使用它。它對模型不可見，因此不增加任何 token 或請求成本。沒有分組界面時跳過它；harness 中沒有其他包需要它。

### 設置

此包本身不聲明任何配置；它需要會話存儲、會話持久化后端，以及保存其記錄的存儲行。最小組合如下：

```yaml
- name: '@deepseek-ai/dsh-session'
- name: '@deepseek-ai/dsh-session-persistence-jsonl'
- name: '@deepseek-ai/dsh-storage'
- name: '@deepseek-ai/dsh-storage-json'
- name: '@deepseek-ai/dsh-storage-domain'
  config:
    backend: json
- name: '@deepseek-ai/dsh-workspace'
```

掛載這些行之后，創建項目會立即出現在列表中并在重啟后保留；首次啟動還會按會話運行的目錄對既有會話分組。如果缺少某個必需依賴，workspace 功能會一直不可用，直到它被掛載。

### 創建與排序項目

從任何已存在的絕對目錄路徑創建項目：`C:\` 等文件系統根目錄和普通目錄都有效。相對路徑、`C:work` 等 Windows 盤符相對路徑、不存在的路徑和文件都會被拒絕，且不會創建項目；為已有項目的目錄再次創建會原樣返回現有項目。你可以隨時重命名項目，并把它移動到列表中的任意位置：

```text
// Host consumer code, after the composition above is loaded:
const project = await ctx.workspaceRegistry.create('/path/to/dir', 'My Project')
await project.setTitle('Renamed')
ctx.workspaceRegistry.list() // shows the project, newest first
```

### 將會話歸入項目

會話加入它運行目錄所在的項目：在項目目錄中創建會話，它就會出現在該項目下，新到舊排列。一個會話只能屬于一個項目。目錄無法校驗的會話——沒有記錄目錄，或目錄被移動、刪除——無法加入，保持 Ungrouped。

### 隱藏會話與移除項目

當會話不應再出現在分組中時隱藏它：它會從可見列表中消失，但其會話、歷史與在項目中的位置都保持不變。項目不再需要時移除它：它離開列表，而其文件夾、文件與會話歷史絕不受影響——這些會話變成 Ungrouped。之后再次添加同一目錄會從空項目開始，不會帶回舊會話。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋此功能背后的設計決策，并指出實現它們的代碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

- **每個規范路徑一條記錄。** `fs.realpath` 是唯一的一套唯一性規范：路徑以規范化形式存儲，因此指向已有記錄目錄的符號鏈接會與之沖突，唯一性即規范路徑的字符串相等。
- **成員資格是所有權加實時 cwd 事實。** 記錄的 `sessionIds` 順序是所有權真源；啟動時的頭部索引校驗它，`sessionIds` 在讀取時過濾，下一次變更會持久化剪除無效項。
- **僅讀取頭部。** 引導與 attach 校驗只讀取 `SessionHeader` 字段；事件正文絕不加載。
- **兩次寫入的變更帶顯式標記。** 創建與刪除在記錄/順序對可能分叉之前先持久化 `pendingMutation` 標記，因此啟動只補全被中斷的操作，未標記的分叉作為損壞明確報錯。
- **串行化寫入。** 注冊表操作跑在同一條操作鏈上；實體變更通過領域寫鏈上的 `table.update` 執行，寫入 `updatedAt`，并在其所在的鏈位置決定成員資格。

### API 行為

該 API 是一個由兩個所有者構成的小家族：`WorkspaceRegistry` 負責創建、排序與刪除項目并管理其會話記賬；`Workspace` 實體暴露顯示標題、目錄狀態與會話投影。各方法的精確約定在代碼中，而非本 README——參見 [src/index.ts](src/index.ts) 與 [src/entity.ts](src/entity.ts)。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`WorkspaceRegistry` 服務、頭部索引、引導、操作串行化 |
| [`src/entity.ts`](src/entity.ts) | 包私有 `Workspace` 實現及其唯一的 `mutate` 寫入路徑 |
| [`src/spec.ts`](src/spec.ts) | 領域聲明：記錄 schema、注冊表狀態、`defineDomain` 規范 |
| [`src/types.ts`](src/types.ts) | 公開 `Workspace` 接口與 `WorkspaceId` 品牌 |
| [`src/paths.ts`](src/paths.ts) | `realpath` 唯一性規范 |
| [`src/invariant.ts`](src/invariant.ts) | 不變式伴生插件：實體緩存鏡像持久表 |

### 持久形態

注冊表打開 `workspace` 領域（版本 2）：一張以 `WorkspaceId` 為鍵的 `workspaces` 表，加上一個持有 `workspaceIds`（權威顯示順序）、`archivedSessionIds` 與可選 `pendingMutation` 標記的全局狀態。在 `archivedSessionIds` 存在之前寫入的記錄會通過 schema 默認值解析為空集合。

### 生命周期

啟動時，注冊表打開領域、若存在標記則補全被標記的變更、校驗已存狀態——重復路徑、重復會話記賬與順序漂移都會明確報錯——并在尚未初始化時先憑持久化頭部引導歷史、最后寫入已初始化標記，因此被中斷的引導可以安全恢復。全新空注冊表一旦初始化即成為正式狀態，絕不會再次引導。

### 失敗與恢復

創建或刪除的第二次寫入失敗時，緩存與先前順序會回滾；當操作與回滾都失敗時，持久標記仍指明被中斷的操作，下一次啟動會補全或回滾它。已提交的刪除即使標記清理失敗仍報告成功，下一次啟動會冪等地清除該標記。

### 不變式

`workspace-invariant` 伴生插件注冊歸屬關系：`workspaces` 表的每個持久 `domain/changed` 都必須指向實體緩存已持有的記錄——只有在注冊表從緩存移除實體之后刪除才有效，因此繞過注冊表的寫入路徑會觸發不變式失敗。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當本包的視角不夠用時閱讀以下頁面：子系統參考是權威的功能約定，Agent Note 記錄了項目為何從會話歷史起步、以及移除為何是非破壞性的。

- [Workspace 子系統](../../../docs/subsystems/workspace.zh.md)——項目及其會話的功能約定，以及 workspace 服務的生成 API。
- [Workspace 包映射](../README.zh.md)——本組唯一的包及其倉庫位置。
- [領域 KV 存儲 Agent Note](../../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.zh.md)——為什么項目記錄使用領域數據形式。
- [Workspace UI 產品流 Agent Note](../../../.agents/notes/archived/feature/2026-07-25-workspace-ui-product-flow.md)——首次啟動如何從會話歷史構建項目，以及 GUI 如何排序。
- [刪除 Workspace 注冊記錄決策](../../../.agents/notes/implemented/feature/2026-07-27-workspace-registration-deletion.zh.md)——為什么移除項目絕不會刪除其文件夾或會話。

-----

<a id="model-experience"></a>
## 模型體驗

### Workspace 記錄與會話記賬

#### 模型看到什么

沒有。`ctx.workspaceRegistry` 只向宿主側消費方提供 workspace 記錄：此包不注冊工具、不注入提示詞、不寫入會話事件，因此沒有請求字段會攜帶此包數據。

#### Token 影響

每個請求的直接 token 為零。

#### KV Cache 影響

與實時請求無關：此包絕不觸及請求前綴，因此不會使提供方緩存復用失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明項目列表何時不合適，或何時需要特別的運維注意。它們是當前包約束，不是任務積壓。

- **移除絕不刪除數據**——移除項目會保留其文件夾、文件與會話歷史；這些會話變成 Ungrouped，而會話刪除與文件夾移除是彼此獨立且尚未提供的功能（參見[決策記錄](../../../.agents/notes/implemented/feature/2026-07-27-workspace-registration-deletion.zh.md)）。
- **只有帶記錄目錄的會話才能加入**——只有記錄中帶有可解析為項目路徑的目錄的會話才屬于項目；沒有目錄的會話保持 Ungrouped，來自其他目錄的會話無法移入。
- **外部變更延遲可見**——如果另一進程刪除或損壞目錄，項目只能在下次刷新或重啟后反映出來。
- **歸檔是單向的**——被隱藏的會話保留其歷史與位置，但目前沒有取消歸檔操作；歸檔集合是持久的顯示過濾器。
- **重新添加目錄從空開始**——移除后再次添加同一目錄會創建空會話列表的新項目；舊會話不會自動回來。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文：開放問題與尚未決定的探索方向。它明確不具權威性——已交付的行為、限制與既定理由以上文、包代碼和相關 Agent Note 為準。

#### 開放：`create(path, title?)` 的 title 參數

網關的按名稱創建分支移除后，`title` 參數已無生產調用方；代碼中的 TODO 提議把該參數與其 `@param` 子句一并移除（參見[筆記](../../../.agents/notes/archived/simplification/2026-07-31-one-route-to-add-a-workspace.md)）。

</details>
