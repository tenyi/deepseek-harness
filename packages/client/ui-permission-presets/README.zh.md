---
description: "Web GUI 的權限預設界面：通用設置中的默認行與切換當前會話的 /permission 選擇器；供權限策略的用戶與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-permission-presets

[English](README.md) | 中文

## 概述

使用本包可在 Web GUI 中為未來會話選擇權限預設，或切換當前會話的權限預設。通用設置行只更改之后創建會話所用的默認值；`/permission` 選擇器只更改當前會話，并標記其當前預設。內置預設使用本地化標簽；顯式宿主標簽保持原樣，未知的 kebab-case 名稱顯示為 Title Case。完全權限始終需要顯式確認風險。兩個界面都只在宿主推送更改后的權限狀態后確認變更。

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

與設置與命令包一起掛載本插件；權限行隨即出現在通用設置中，`/permission` 選擇器替換裸命令調用。當前會話選擇器恰在投影 key 存在時可用；無權限組合既不顯示選擇器，也不顯示設置行。

### 選擇器

選中即提交 `/permission <preset>` 命令行。帶參路徑（直接鍵入 `/permission <preset>`）仍直接切換；裝飾只替換裸調用。內置標簽在英文界面中是 `Read Only`、`Workspace Write` 和 `Full access`，在中文界面中是 `僅可查看`、`工作區內修改` 和 `完全權限`；`custom` 只是顯示狀態，絕非目標。

### 設置行

該行從宿主動態的 `defaultPreset` enum 推導選項，使用與當前會話選擇器相同的本地化標簽，并寫入一條設置變更操作。該值只在之后創建會話時生效；改變它絕不會切換或改寫當前會話。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

通用行經 `ctx.settingsScope` 讀取顯式暴露的 `permission` Settings 描述符，并攜帶描述符 revision 寫入一條 `settings.mutate` 路徑操作；其 observable 經 slot 系統的 `hooks` 格傳遞，因此 React 鉤子綁定歸渲染器，推送失效通知會重新獲取描述符。該值只在之后創建會話時讀取。當前會話界面是掛在宿主 `/permission` 命令上的 popupSelect 裝飾（`ctx.commandUi.decorate`）：宿主命令保留斜杠菜單行、帶參路徑與持久生命周期記賬，裝飾只把裸調用替換為選擇器。選項與 active 標記讀取會話的 `permissions` 投影——與 composer chip 渲染的同一份宿主計算 select。完全權限選項攜帶 `confirmation` 載荷，由共享彈窗外殼渲染為頁內風險門。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

需要了解權限界面以外的內容時，請閱讀以下頁面。這些頁面從瀏覽器界面進一步介紹宿主策略與命令外殼。

- [dsh-permission-presets](../../interaction/permission-presets/README.zh.md)——這些界面寫入的宿主側權限預設策略。
- [ui-commands](../ui-commands/README.zh.md)——`/permission` 裝飾注冊進的 popupSelect 外殼。
- [ui-conversation](../ui-conversation/README.zh.md)——渲染同一份權限投影的 composer chip。
- [客戶端包映射](../README.zh.md)——相鄰的瀏覽器 UI 包。

-----

<a id="model-experience"></a>
## 模型體驗

間接影響。它的兩個界面寫入權限事實：設置行使未來會話帶著全量值旋鈕事件啟動，而 `/permission` 選擇器切換當前會話時追加相同的事實；這些事件決定后續工具調用解析到的沙箱模式與審批策略。

#### KV Cache 影響

無直接失效；請求前綴的變化由旋鈕消費方自行承擔。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制界定了當前權限界面。它們是當前包約束，不是通用策略對比或任務積壓。

- **設置行僅限 Web**——非 Web 客戶端仍可經 `/permission` 切換當前會話，但不會獲得這項瀏覽器貢獻。
- **預設描述來自宿主**——本地化的內置標簽旁邊可能顯示另一種語言編寫的描述。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。命令與 slot 貢獻的生命周期由 HMR（熱模塊替換）安全性測試驗證；瀏覽器側設置控制器不持有宿主事件或跨插件可變狀態。
