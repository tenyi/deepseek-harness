---
description: "面向用戶的權限預設：供選擇、配置或排查把沙箱模式與審批策略捆綁在一起的 Permissions 選擇器的用戶與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-permission-presets

[English](README.md) | 中文

## 概述

權限預設讓用戶通過一個選擇器同時應用沙箱模式和審批策略。部署可以配置具名預設以及新建會話的默認預設；更改該默認值不會影響現有會話，內置預設表包含 `workspace-write` 和 `danger-full-access`。如果當前組合不匹配任何預設，客戶端會顯示推導出的 `custom` 狀態，但用戶不能選擇或持久化它；切換預設只會更改實際值不同的設置。`/permission` 命令用于報告或更改當前預設，而沙箱執行和審批處理仍由不同的執行機制負責。

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

當部署希望向用戶提供一個 Permissions 選擇器、而非分離的沙箱與審批控件時，選擇此服務。它捆綁旋鈕；執行與審批各自保留自己的取值，因此以后移除本包，最后一次取值依然生效。

### 配置預設

插件配置定義預設表與新會話的默認值。每個預設名稱把一個沙箱模式與一個審批策略捆綁為一組；`name` 與 `description` 是可選的客戶端呈現。

```yaml
- name: '@deepseek-ai/dsh-permission-presets'
  config:
    presets:
      workspace-write:
        sandbox: workspace-write
        approval: ask
      danger-full-access:
        sandbox: danger-full-access
        approval: never
    defaultPreset: workspace-write
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `presets` | `workspace-write`、`danger-full-access` | 預設名稱 → 沙箱／審批捆綁的表 |
| `defaultPreset` | 推斷 | 固定到新會話的預設；組合默認值不匹配任何預設時必填 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-permission-presets)是每個受支持字段及其 JSDoc 的窮盡式真源。`custom` 這個名稱保留給推導出的非預設狀態，不能作為表條目。掛載需要具有約束能力的 bash 執行器（會報告 `sandboxMode` 的執行器）與審批服務。

### 切換預設

切換到某個預設只改變實際值不同的旋鈕；再次選擇當前已生效的預設不會產生任何變化。當前值解析順序為：仍匹配的最近一次記錄選擇，其次表中第一個匹配項，否則為 `custom`。用戶通過 `/permission` 命令切換：不帶參數調用時報告當前預設與可用表，帶預設參數時切換過去。

### 用戶看到什么

客戶端渲染選擇器：按表順序列出每個可切換預設，并僅在當前值為 `custom` 時顯示它。`custom` 僅供顯示——調用方可以從不匹配的旋鈕組合切換出去，但不能通過此服務選中或持久化一個名為 `custom` 的預設。

### 會話默認值

`permission` 設置命名空間為未來會話持有 `defaultPreset`：創建會話時讀取它，將其應用于沙箱模式與審批策略，并把應用的預設記錄為一次 `permission/preset` 選擇。之后的設置變更絕不會改變現有會話。恢復的 seed（包括由 `session/end-seed` 明確標記的空 seed）會保留其有效權限，并只接收缺失的持久事實，而不會接收最新用戶默認值。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

可觀察行為已在[使用本包](#use-this-package)中說明；本節解釋寫入路徑、讀取側與可選子功能。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | `PermissionPresetService`：預設表、寫入路徑、設置命名空間、會話固定、子功能 |
| [`src/types.ts`](src/types.ts) | `permissions` 投影鍵聲明與選擇器載荷類型 |
| [`src/invariant.ts`](src/invariant.ts) | 不變式伴生插件：校驗 `permission/preset` 指向可解析的預設 |

### 寫入路徑

`apply()` 解析預設，僅當有效預設變化時追加 `permission/preset`，然后通過各自的權威 setter——`dsh-sandbox-policy` 的 `setSandboxMode` 與 `dsh-user-approval` 的 `setApprovalPolicy`——寫入每個變化的旋鈕。選擇事件先于旋鈕事件，因此在兩個預設共享同一組取值時保留用戶意圖；凈變化為零的選擇不追加任何內容。

### 讀取側與 `custom`

`current(session)` 讀取 `permissions` 投影；該單元在組合默認值（`ctx.shell.sandboxMode` 與審批配置）之上折疊三個全量值旋鈕事件。host 狀態還會保留 `session/end-seed` 是否已經出現，使會話固定無需重掃日志即可區分顯式為空的恢復 seed 與真正的新會話。仍匹配的最近選擇在共享捆綁時勝出；否則表中第一個匹配項勝出；否則返回推導出的 `CUSTOM_PRESET`。注冊表或投影 key 缺失時會顯式失敗。

### 會話固定與空白復用

掛載時會固定所有存活與未來的會話：真正全新的會話獲得默認預設與兩個旋鈕事實，而 seed 會話或部分初始化的會話保留其有效旋鈕值，只補充缺失的持久事實。投影自有的 seed 標記讓該判斷與旋鈕值共用同一份增量狀態。

### 可選子功能

`permissions` 投影單元僅在組合了 `ctx.sessionProjections` 注冊表時注冊；`/permission` 命令僅在組合了 `ctx.commands` 注冊表時注冊。派生當前預設或固定初始選擇的調用要求該投影存在，缺少注冊表或 key 時會顯式失敗。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從預設詞匯逐步進入執行旋鈕與設計依據。

- [權限預設子系統參考](../../../docs/subsystems/permission-presets.zh.md)——預設表、選擇器載荷與 `ctx.permissionPresets` 的 Cordis 接口面。
- [沙箱切換設計 Agent Note](../../../.agents/notes/implemented/feature/2026-07-06-sandbox.zh.md)——沙箱模式與審批策略如何組合與切換。
- [審批子系統參考](../../../docs/subsystems/approval.zh.md)——此服務捆綁的審批策略旋鈕。
- [交互組映射](../README.zh.md)——相鄰的命令、審批與問答包。

-----

<a id="model-experience"></a>
## 模型體驗

間接地，通過 `dsh-user-approval` 和 `dsh-tool-bash`：二者渲染由此服務的旋鈕事件所選擇的審批策略提示詞、切換通知與經沙箱執行的工具結果；`permission/preset` 本身只寫入日志。

#### KV Cache 影響

不會直接使緩存失效；具名消費方擁有所有請求前綴變更。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明預設服務不提供什么。它們是當前包約束，不是權限系統對比。

- **只組合兩個機制級旋鈕**：預設選擇沙箱模式和審批策略；agent（智能體）／profile 選擇尚未納入 `PresetSpec`。
- **`custom` 只能推導得出**：調用方可以從不匹配的旋鈕組合切換出去，但無法通過此服務選中或持久化一個名為 `custom` 的預設。
- **預設表是進程級配置**：配置在插件生命周期內固定；更改可用預設必須重新加載插件。
- **已存儲的默認值必須保留在預設表中**：移除被引用的預設會導致權限設置注冊失敗，直到更新或重置 `settings.yaml` 中的 `permission` 分節。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
