---
description: "共享的 dsh 核心：為每個 dsh --profile 表層提供模型訪問、工具、持久會話與安全默認值，供用戶組合或定制 profile。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-base

[English](README.md) | 中文

## 概述

每個基于 base 的 `dsh --profile` 表層都運行在 `dsh-base` 上，因此這些表層共享模型連接、完整工具集、持久會話歷史和 workspace 安全默認值。隨附的 `sdk-minimal` profile 刻意改用完整的獨立配置樹。你通常不直接操作本組合包——隨發行版交付的基于 base 的 profile 已經包含它，自定義的基于 base 的 profile 則把它放在第一位。需要其他默認值時，應修改自己的 profile patch 或添加后續組合包；本包不是供導入的庫。

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

你會自動獲得 dsh 核心：隨發行版交付的 `web`、`headless`、`sdk` 與 `acp` profile 已包含它，自定義 profile 則把它列為第一個組合包。之后一切無需任何額外配置即可工作。

### 最小自定義 profile

要在共享核心之上構建 profile，請創建一個 profile，其 `package.json` 把 `@deepseek-ai/dsh-base` 列在首位：

```json
{
  "name": "my-profile",
  "private": true,
  "dsh": {
    "profile": {
      "bundles": ["@deepseek-ai/dsh-base"]
    }
  }
}
```

運行 `dsh --profile my-profile "your task"`，你就得到一個可用的 agent（智能體），帶模型訪問、工具、持久化與默認權限策略。隨發行版交付的 `web`、`headless`、`sdk` 與 `acp` profile 會在首次使用時為你創建。要添加更多組合包，運行 `dsh plugin --profile <name> add <package>`；內置組合包從 dsh 安裝目錄解析。profile 約定見 [app-boot 的 profile 章節](../../boot/app-boot/README.zh.md)。

### 你得到什么

開箱即用，基于本核心構建的每個 profile 都提供：DeepSeek 模型連接（提供方與模型可配置，你還可以在設置中啟用額外提供方）、完整工具集——文件編輯、shell 命令、web 搜索、公開 HTTP(S) 抓取、subagent、任務與目標跟蹤——可跨重啟存活的持久會話，以及默認權限策略：把文件寫入限制在工作區內，危險操作前征詢許可。Web 抓取無需逐次審批，其提供方會拒絕非公開目的地址。反饋保存在會話日志中。[OTel 會話上傳](../../session/session-telemetry-otel/README.zh.md)對所有用戶默認使用 `FEEDBACK_ONLY`，包括 `deepseek-official`：新的文本反饋、消息評分、編輯與撤回會釋放截至該事件的完整規范會話日志前綴，包含上下文。后續記錄等待下一次顯式反饋；發送已授權批次無需進一步交互或模型調用。`DISABLED` 阻止 OTel 捕獲。需主動開啟的 [DeepSeek 會話日志貢獻器](../../session/session-log-deepseek/README.zh.md)仍是獨立的請求路徑。

默認文件編輯使用 `read`、`write` 和 `edit`。`str_replace_editor` 工具仍可顯式啟用。要將它加入基于 base 的 profile，請在 profile、home 或逐次調用 patch 中添加以下條目：

```yaml
- insert:
    - id: tool-str-replace-editor
      name: '@deepseek-ai/dsh-tool-str-replace-editor'
      config:
        maxOutputChars: 16000
```

### 各平臺的 shell 工具

在 macOS 與 Linux 上你獲得 bash shell 工具；在 Windows 上則獲得對應的 PowerShell 孿生工具，因此每臺機器恰好有一套 shell 棧。各平臺的安全行為完全一致。偏好不受沙盒約束的 PowerShell 執行器的 Windows 主機可以在其 profile patch 中切換 shell 行——切換必須同時禁用兩個 PowerShell 行并重新啟用兩個 bash 行，否則 profile 無法加載。

### 更改默認值

要改變基于本核心構建的 profile 提供的內容——不同的默認模型、更嚴格的權限模式、更多或更少的工具——請編輯 profile 的 `cordis.patch.yml` 或添加后面的組合包。每個 patch 條目會替換目標的整個配置，因此請重述每個想保留的設置。保持沙箱化文件系統提供方作為唯一的文件寫入路徑：在其之上再添加普通文件系統提供方會導致 profile 加載失敗。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本組合包是一份靜態 patch 文檔：一個應用到空 profile 根之上的 `insert` 列表。它不掛載任何服務、不發出任何事件、也不持有任何可變狀態；每條插入行所屬的包負責該行的行為與不變式。

### 組合機制

patch 會替換目標行的整個 `config`，而不是合并進它。后續組合包層與用戶的 profile `cordis.patch.yml` 按 id 覆蓋行，每行最后一次寫入生效。按模式取值不同的行不屬于這里：每個模式組合包重述自己的完整配置，讓任何單一行最多只屬于一個組合包層加用戶層。完整行集合及其設計依據以行內注釋寫在 [`cordis.patch.yml`](cordis.patch.yml) 里；[生成的組合圖](../../../apps/cli/composition.md)負責渲染它。

### 平臺門控

patch 在自身上按平臺門控兩個 shell 棧：`bash-sandbox` 與 `tool-bash` 攜帶 `disabled: !!js process.platform === 'win32'`，孿生行 `pwsh-sandbox` 與 `tool-pwsh` 以取反的表達式僅在 win32 掛載。權限面與 POSIX 完全一致：沙箱策略通過 Windows ACL 受限令牌 runner（`dsh-sandbox-local` → `@deepseek-ai/dsh-sandbox-windows-acl`）執行相同的文件效果策略，`fs-sandbox` 繼續圍欄 `ctx.fs` 寫入——在其旁再掛載 `dsh-fs-local` 會重復注冊 `ctx.fs` 并在加載時失敗。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | 組合包的實體：基礎插件行，附以行內注釋說明各行依據 |
| [`src/index.ts`](src/index.ts) | 包入口；不攜帶任何運行時 API |
| — | 不發布運行時不變式伴生入口；本包是靜態 patch 列表載體（由其他包擁有的 loader 行構成的 YAML 文檔）；它不掛載任何服務、不發出任何事件，也沒有任何可檢查的可變關系。每條插入行所屬的包負責該行的不變式。 |
| [`tests/base.spec.ts`](tests/base.spec.ts) | manifest（元數據清單）聲明與平臺門控檢查 |

### 不變式歸屬

不發布不變式伴生入口，因為本包是靜態 patch 列表載體：每條插入行由所屬的包負責其不變式，組合包自身沒有任何可審計的可變關系。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當你想深入了解 profile、基于本核心構建的表層或確切組合時，閱讀以下頁面。

- [app-boot 的 profile 章節](../../boot/app-boot/README.zh.md)——profile 如何解析、分層與定制。
- [組合包索引](../README.zh.md)——基于本核心構建的表層。
- [生成組合圖](../../../apps/cli/composition.md)——隨發行版交付的每個 profile 使用的確切插件集合。
- [Profile 組合包設計筆記](../../../.agents/notes/implemented/architecture/2026-08-05-profile-plugin-bundles.zh.md)——profile 與組合包的組合設計。
- [Codex 與 Claude Code 提供方組合包](../../subagent/README.zh.md)——可疊加安裝的可選提供方組合包。

-----

<a id="model-experience"></a>
## 模型體驗

通過每條插入行所屬的包間接產生影響，由各包負責其行的模型可見行為。

#### KV Cache 影響

組合包本身不添加任何請求前綴；每條插入行所屬的包負責各自的緩存影響。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制告訴你核心何時需要額外注意、覆蓋應放在哪里。它們是當前包約束，不是通用對比或任務積壓。

- **覆蓋會替換整個設置塊**——patch 條目會替換目標的整個配置，因此你的覆蓋必須重述每個想保留的設置；不會自動合并。
- **按表層的設置屬于該表層的組合包**——web GUI 與 headless 模式取值不同的默認值放在對應表層的組合包里，而不是共享核心。
- **Windows 的臨時目錄授權是按會話的私有子目錄**——`workspace-write` 把寫入限制在工作區與會話自己的 temp 子目錄（`<temp>\dsh-<hash>`，受限子進程的 TMP/TEMP 被改寫）；`read-only` 不授予任何臨時目錄寫入權限。見 `@deepseek-ai/dsh-sandbox-windows-acl`。
- **在沙箱化文件系統提供方之上添加普通提供方會導致 profile 失敗**——兩者注冊同一個服務，profile 因此拒絕加載；二選一。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
