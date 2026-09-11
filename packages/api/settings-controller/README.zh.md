---
description: "settings 與憑據配置界面的 Host Remote owner，涵蓋脫敏讀取、寫入、憑據引用與原生文檔打開。"
kind: "package-reference"
---
# Settings Controller

[English](README.md) | 中文

## 概述

`@deepseek-ai/dsh-api-settings-controller` 為瀏覽器配置界面提供生成的 `ctx.remote.settings` 與 `ctx.remote.credentials` namespace。它返回脫敏的 settings 與憑據元數據，支持 settings 與憑據寫入而不返回機密值，并在 Host 桌面打開由提供方持有的 settings 或 Agent preset 位置。提供方缺失時，namespace 仍會注冊，并返回可操作的配置錯誤。

## 目錄

- [使用本包](#use-this-package)
- [配置](#configuration)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

請把本包作為 Loader entry 掛載到提供瀏覽器配置的 profile 中。本 entry 不依賴提供方是否存在而注冊兩個 namespace，因此缺少提供方會在調用時產生具名配置錯誤。它生成的 descriptor 進入嚴格 Typert 注冊表，而 settings 與憑據 Definition 仍是普通 Cordis 服務，自身不承擔任何 wire 義務。

`describe(refs)` 以請求的名字為鍵返回一份 map，因此設置頁描述其各行攜帶的全部引用時，這些行會一起落定。單次調用最多接受 64 個名字，無效名字或空寫入值報告為 `bad-request`，并逐字段復制每個答案——提供方返回超出 `CredentialInfo` 聲明的內容也無法擴大跨越 wire 的字段。有效的 `set(ref, value)` 與 `unset(ref)` 調用把提供方拒絕報告為 `credential-rejected`，攜帶提供方的消息，details 中只有該引用。機密值只在這個方向跨越 wire：這里沒有任何方法會返回它。

`settings.describe()` 返回部署信息，以及在 `redactSecrets: true` 下讀取的所有 namespace。`settings.update`、`settings.replace` 與 `settings.mutate` 暴露 settings 服務的三種寫入操作，并返回該 namespace 的新脫敏視圖；陳舊寫入使用 `settings-conflict`，其他提供方拒絕使用 `settings-rejected`。

`settings.openSettingsDocument()` 準備提供方持有的文檔，并用原生文本編輯器意圖將其打開。`settings.canOpenAgentPresetDirectory()` 在 preset 頁面顯示時報告原生打開能力。`settings.openAgentPresetDirectory(id)` 只解析用戶創作的 preset，并打開其目錄，或在原生打開不可用時返回目錄路徑；兩個打開方法都不接受瀏覽器提供的文件系統目標。

-----

<a id="configuration"></a>
## 配置

| 字段 | 默認值 | 含義 |
|---|---|---|
| `nativeOpen` | 平臺探測 | Agent preset 目錄能否交給原生桌面打開器 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-api-settings-controller)是所有受支持字段及其 JSDoc 的完整來源。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為 settings 與憑據配置屬于瀏覽器和 Host 狀態，并且不注冊提示詞、工具或會話事件。

#### KV Cache 影響

無直接影響；讀取或寫入這些配置值不會改變已經在途的模型請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- 批量上限固定為 64 個引用，不是可按部署配置的字段。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。settings 與憑據 seam 負責存儲和更新事件，本包只把它們的方法投影到 wire。
