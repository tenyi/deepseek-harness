---
description: "用于實時組合的運行時不變量檢查：運行包自有檢查的注冊表服務，供用戶和維護者選擇、配置或排查。"
kind: "package-reference"
---

# @deepseek-ai/dsh-invariants

[English](README.md) | 中文

## 概述

`dsh-invariants` 在 DeepSeek Harness 組合中運行包自有的運行時檢查——不變量：任何包都可以發布一個 `./invariant` 配套入口，在組合運行期間驗證其自身的持久關系（權威事件流與可變快照）。檢查自動運行，失敗的檢查會報告歸因到擁有被違反關系的包的 `InvariantError`。需要帶全局開關與包名過濾器的自檢診斷時選擇它；標準 agent（智能體）組合已掛載它及四個核心配套入口，而單獨加載服務不會安裝任何檢查。

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

當組合需要驗證自身運行時約定時掛載注冊表，然后決定運行哪些包的檢查。服務暴露 `ctx.invariants`；配套入口以其包的精確 npm 名稱注冊檢查，每次失敗都會攜帶所屬包名。

### 何時使用

需要實時診斷的組合請使用注冊表。[`dsh-sdk-minimal`](../../bundle/sdk-minimal/README.zh.md) 掛載它及四個核心有狀態配套入口——`dsh-session`、`dsh-agent`、`dsh-scope` 與 `dsh-agent-loop`；`dsh-base` 刻意省略運行時診斷。自定義組合掛載注冊表，并為任何其他已加載、且希望檢查其約定的包添加配套入口。單獨加載注冊表不會安裝任何檢查：它自身不攜帶任何產品檢查，因此從不掛載配套入口的組合不會觀察到任何診斷行為。

### 啟用檢查與選擇包

注冊表默認啟用，并在沒有過濾器的情況下檢查每個已注冊的包。用 `enabled` 作全局開關，用 `package_allowlist` 只接納指定包，用 `package_blocklist` 在 allowlist 匹配之后排除包——blocklist 匹配優先于 allowlist 匹配。模式是區分大小寫的 JavaScript 正則表達式源（除非自帶 `^` 與 `$`，否則不錨定）；無效、空白或重復的條目會使服務啟動失敗，而不是被跳過。

```yaml
- name: '@deepseek-ai/dsh-invariants'
  config:
    enabled: true
    package_allowlist:
      - '^@deepseek-ai/dsh-'
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `enabled` | `true` | 所有已注冊檢查的全局開關 |
| `package_allowlist` | `[]` | 接納包名的正則源；為空則全部接納 |
| `package_blocklist` | `[]` | 在 allowlist 匹配之后排除包名的正則源 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-invariants)是每個受支持字段及其 JSDoc 的窮盡式真源。

### 運行哪些檢查

每個配套入口保護其包擁有的關系，且只為可觀察的事件或可變數據關系安裝檢查——絕不針對服務或方法是否存在。已發布的可執行配套入口覆蓋：

| 配套入口 | 檢查 |
|---|---|
| `dsh-session`、`dsh-agent`、`dsh-scope`、`dsh-agent-loop` | 會話日志包含關系與調用/結果跟蹤、agent 狀態轉換、經過作用域過濾的分發主體、loop 所構建請求的重建 |
| `dsh-llm`、`dsh-llm-retry`、`dsh-tools`、`dsh-system-prompt` | LLM（大語言模型）流語法、重試失敗形狀、工具流水線階段配對與凍結結果、提示詞組裝章節名 |
| `dsh-compaction`、`dsh-hook-protocol`、`dsh-sandbox-policy` | 壓縮（compaction）流配對、鉤子調用/結果配對、沙箱 mode 值 |
| `dsh-fs`、`dsh-subagent`、`dsh-workflow`、`dsh-tool-workflow` | 文件系統事件身份、subagent 提供方與開始/結束配對、工作流生命周期身份、工作流記錄形狀 |
| `dsh-goal`、`dsh-goal-round-driver` | 持久 goal 流折疊與重建的繼續提示詞 |
| `dsh-permission-presets`、`dsh-user-approval`、`dsh-commands` | preset 引用指向活動 preset、審批詢問/決定配對、命令運行/完成配對 |
| `dsh-jobs`、`dsh-tool-todo`、`dsh-time-context` | 任務快照字段關系、整表 todo 形狀、持久時鐘讀數 |
| `dsh-credentials`、`dsh-settings`、`dsh-storage-domain`、`dsh-workspace` | 提交事件對照活動服務或內存狀態、實體緩存鏡像 |
| `dsh-agent-presets`、`dsh-session-title`、`dsh-plan-mode`、`dsh-schedule` | preset 掛載位置、標題來源引用、plan-mode 載荷、schedule 流 |
| `dsh-client-hmr`、`dsh-client-modules`、`dsh-client-runtime` | 瀏覽器/node 側 stat-watcher 生命周期、啟動入口圖、slot 變更版本化 |

其余工作區包省略配套入口，并在各自 README 中說明包級原因。

### 向自定義組合添加配套入口

配套入口就是掛載在注冊表旁的普通插件。它聲明所需的服務，并以其包的精確 npm 名稱注冊；注冊表會先完成其設置再完成注冊。

```ts
import type { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as SessionInvariant from '@deepseek-ai/dsh-session/invariant'

declare const ctx: Context

ctx.plugin(InvariantRegistry, { enabled: true })
ctx.plugin(SessionInvariant)
```

### 檢查失敗時

違規會從報告它的上下文拋出 `InvariantError`：它攜帶穩定的 `INVARIANT` 代碼、所屬包的完整 npm `packageName`，以及以 `invariant violated by "<package>": …` 開頭的消息。失敗因此可以歸因到某個包，而注冊表無需導入任何產品代碼。installer 本身失敗的配套入口會被釋放，其注冊會回滾，因此損壞的檢查不會遺留部分監聽器。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋注冊表背后的設計；可觀察行為已在[使用本包](#use-this-package)中說明。

### 設計理念

- **與產品無關的注冊表。** 服務不導入任何 session、agent、scope 或 agent-loop 包，也不包含它們的檢查；配套入口把檢查放在其歸屬者旁邊。
- **真實關系，而非人為斷言。** 配套入口只檢查其包擁有的事件流或可變數據關系；確認方法、插件名、注入或固定純函數結果是類型、加載或單元測試關注點，絕不是運行時不變量。
- **注冊保留歸屬。** 即使過濾器讓 installer 保持非活動，包名也會被保留，因此兩個插件永遠不會靜默認領同一個名字。
- **配套入口接線由機械規則強制。** `pnpm run verify-package-invariants` 拒絕空 installer、省略或忽略 reporter 的 installer、錯誤注冊名、不完整的發布接線，以及省略配套入口后殘留的接線（[省略配套入口筆記](../../../.agents/notes/implemented/simplification/2026-08-28-omit-unneeded-invariant-companions.zh.md)）。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`Config` schema、`InvariantRegistry` 服務、選擇、注冊、`InvariantError` |
| — | 不發布運行時不變量配套入口；注冊歸屬與子級生命周期本身就是服務的變更邊界；由同一注冊表觀察它們只會重復其實現。 |

### 選擇與注冊生命周期

`register(packageName, installer)` 保留完整 npm 名稱并返回作用域化 disposer。啟用的 installer 在專用子 fiber 中運行；`installer.inject` 聲明該 fiber 可訪問的服務，同步或異步完成都會在注冊成功前被 join。失敗會釋放子級并原子地收回保留。服務擁有每個注冊 fiber，返回的 disposer 同時屬于配套 fiber，因此卸載任一側都會移除監聽器、跟蹤狀態與保留——配套入口可以重新加載并再次注冊同一名稱而不保留舊狀態。由會話支撐的配套入口從持久事件重建 baseline；僅實時配套入口觀察重新加載后開始的操作。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從生成的服務參考逐步進入決策證據與組地圖。

- [運行時不變量子系統](../../../docs/subsystems/invariants.zh.md)——`Config`、installer、服務與配套入口約定的生成參考。
- [生成的配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-invariants)——每個受支持配置字段及其源聲明。
- [運行時不變量約定 Agent Note](../../../.agents/notes/implemented/architecture/2026-07-19-package-invariant-runtime-contracts.zh.md)——運行時不變量可以斷言什么，以及強制配套入口接線的機械門禁。
- [runtime-diagnostics 組地圖](../../README.zh.md)——相鄰的診斷包。

-----

<a id="model-experience"></a>
## 模型體驗

無。作為觀察者，本包驗證請求但從不改寫其上下文。

#### KV Cache 影響

檢查只觀察已組裝的請求與持久狀態，不修改請求內容，因此提供方緩存復用與底層組合產生的結果完全一致。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明注冊表何時不合適或需要特別運維。它們是當前包約束，不是任務積壓。

- **過濾器在服務生命周期內固定**——`enabled`、`package_allowlist` 與 `package_blocklist` 在啟動時編譯一次；更改它們需要執行 Cordis 插件重新加載。
- **僅實時配套入口會遺漏重載前的操作**——只觀察實時操作的配套入口無法重建自身重新加載前開始的操作；由會話支撐的配套入口從持久事件重建 baseline。
- **請求重建只覆蓋 loop 構建的請求**——`dsh-agent-loop` 配套入口只重建 loop 顯式構建的請求；直接一次性 LLM 調用即使由調用方凍結或附加會話 id，仍不在此約定內。
- **沒有配套入口就沒有檢查**——注冊表自身不攜帶產品檢查；只掛載服務的組合觀察不到任何行為。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
