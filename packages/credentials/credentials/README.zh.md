---
description: "面向用戶與維護者的憑據 seam：在不把機密值寫進配置的前提下解析、描述或存儲憑據——引用值與持久化記錄。"
kind: "package-reference"
---

# @deepseek-ai/dsh-credentials

[English](README.md) | 中文

## 概述

`dsh-credentials` 通過讓 settings 與 `cordis.yml` 引用 `DEEPSEEK_API_KEY` 等密鑰名稱，使機密值留在配置之外。它還存儲持久化的按插件組織的憑據記錄，包括授權 grant 與提供方環境值。輪換后的已存儲密鑰會作用于下一次請求，無需重啟或修改配置。配置界面可以報告密鑰或記錄是否已設置、來自哪里及能否寫入，而不會暴露值。空密鑰值視為不存在，而空記錄仍表示一項有意存儲的憑據。

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

本包是產品中負責存儲與查詢機密值的部分：密鑰只存一次、處處按名引用，并可在任意時刻讀取、檢查或移除。它還保存持久化的憑據記錄，讓插件可以為自身 id 存儲、更新或移除它持有的憑據。產品的默認組合已包含憑據存儲；自定義組合只需加載本地存儲包并給出文件路徑。

### 何時使用

只要配置需要與機密值絕緣，就使用憑據存儲：需要同步、共享或渲染進配置界面的設置文件，或希望在不改配置的情況下輪換密鑰的團隊。當插件必須保存沒有單一環境變量的憑據——登錄流程產生的授權 grant，或提供方環境值——并希望配置界面能列出用戶獲得了哪些授權時，請使用記錄。配置界面能顯示某個密鑰或記錄是否已設置、來自哪里、能否修改——但絕不顯示值本身。如果只需要一個固定的環境變量，直接讀該變量即可，無需存儲。

### 加入你的組合

加載本地存儲包并給出文檔路徑：

```yaml
- name: '@deepseek-ai/dsh-credentials-local'
  config:
    path: /absolute/path/to/.credentials.yaml
```

本地存儲 README 擁有完整配置面；生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-credentials-local)是窮盡式字段清單。

### 存儲、檢查與移除密鑰

```ts
import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'

declare const ctx: Context

const ref = credentialRef('DEEPSEEK_API_KEY')          // POSIX shell identifier, branded
const hit = await ctx.credentials.resolve(ref)         // { value, source } | undefined
const info = await ctx.credentials.describe(ref)       // { configured, source?, writable } — never the value
await ctx.credentials.set(ref, 'sk-…')                 // rejects while a read-only source shadows the ref
await ctx.credentials.unset(ref)                       // no-op when absent; same shadowing rule
```

用 `set` 存儲密鑰、用 `unset` 移除、用 `describe` 檢查狀態、在操作需要時用 `resolve` 讀取當前值。`describe` 報告密鑰是否已設置、來自哪里、能否寫入——它絕不返回值。

### 存儲、更新與移除記錄

插件按 `<scope>/<id>` 尋址每條記錄——自身注冊名加一個自選 id，例如提供方路由鍵——并讀取、修改或移除它所持有的內容：

```ts
import type { Context } from '@deepseek-ai/cordis'
import { credentialKey } from '@deepseek-ai/dsh-credentials'

declare const ctx: Context

const key = credentialKey('llm-pi-ai', 'openai-codex')   // <owner>/<id>, branded
const hit = await ctx.credentials.readRecord(key)        // CredentialRecord | undefined
await ctx.credentials.describeRecord(key)                // { configured, kind?, writable } — never the value
await ctx.credentials.listRecords()                      // [{ key, kind }] — never values
await ctx.credentials.modifyRecord(key, async () => ({ kind: 'grant', payload: { token: '…' } }))
await ctx.credentials.deleteRecord(key)                  // no-op when absent
```

`modifyRecord` 是唯一寫路徑：它讓你的變更函數看到寫入取得獨占那一刻的記錄，返回 `undefined` 則保持原狀。記錄沒有空值規則——一條既無 key 也無環境值的記錄，陳述的是其擁有者確認了 ambient 認證——配置界面還可以枚舉每條記錄，顯示你獲得了哪些授權，并找出已卸載插件留下的記錄。

### 在配置中使用密鑰

settings 分節或 `cordis.yml` 條目按名引用密鑰，而不是包含密鑰本身——例如 LLM（大語言模型）適配器接受 `apiKeyEnv`：

```yaml
apiKeyEnv: DEEPSEEK_API_KEY
```

需要該密鑰的請求使用它當前存儲的值，因此輪換密鑰會作用于緊隨其后的下一次請求——無需重啟，無需改配置。

### 可能出錯的地方

- **啟動環境提供的密鑰無法被覆蓋**——`DEEPSEEK_API_KEY=… dsh`（或 CI 機密、容器 `-e`）在本輪運行中優先，并被報告為只讀；請先在啟動 shell 中清除該變量，再存儲其他值。
- **空值無法存儲**——存儲空字符串會被拒絕；請改為移除密鑰。
- **密鑰值絕不會出現在配置界面或診斷信息中**——界面只顯示密鑰是否已設置、來自哪里、能否修改；值本身留在存儲中。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋本包背后的設計決策，并指出實現它們的代碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

一條準則，四個推論：

- **配置只攜帶引用，絕不攜帶機密。** settings 分節或 `cordis.yml` 條目點名一個憑據；引用背后的值存放在提供方處。設置文檔可以放心同步、放心渲染，`describe()` 無需持有值就能回答，輪換機密不觸碰任何配置文件。
- **消費方按操作解析。** 解析是一次按調用讀取，無跨操作緩存；這次讀取正是熱更新機制。
- **空的存儲值等于不存在。** `resolve` 跳過它，`describe` 報告未配置——空白永遠不會偽裝成已配置的機密。
- **記錄是持久化的，存在即事實。** 記錄按 `<scope>/<id>` 存儲并跨重啟保留；空值規則不適用，因此一條既無 key 也無環境值的 `api-key` 記錄是有意陳述，而不是空白。
- **監聽器失敗受到隔離。** `notifyUpdated` 扇出 `credentials/reference-updated`，保證每個監聽器都會運行；同步拋出與異步拒絕都會被記錄，不改變已提交操作的結果，`INVARIANT` 編碼的失敗除外——它們在所有監聽器運行完畢后重新拋出。

### credentials/reference-updated 事件

`credentials/reference-updated (ref)` 在提供方管理的來源發生已提交變更后觸發——`set`、`unset` 或在存儲中觀察到的外部編輯。進程環境變量的變化不可觀測，永不觸發。消費方不需要該事件（它們按操作重新解析）；它服務于配置界面刷新「已配置」徽標。

`credentials/record-updated (key)` 在存儲記錄發生已提交變更后觸發——一次確實寫入的 `modifyRecord`、一次確實移除的 `deleteRecord`，或在存儲中觀察到的外部編輯。它保持獨立事件，因為兩個鍵文法互斥：一個監聽器若在同一事件上同時收到兩個空間，將無法分辨主體屬于哪一邊。

### 記錄寫入與讀取路徑

`modifyRecord` 是唯一寫路徑，因為正確的寫入依賴當前值：刷新 token 是「讀—決定—替換」，變更函數看到的是寫入取得獨占那一刻的記錄——返回 `undefined` 則保持原狀。獨占在支持它的底層存儲上跨進程成立，這正是防止兩個進程同時輪換一個 refresh token、丟掉先寫那一個的機制。讀取與引用一側對稱，但絕不分層：沒有任何東西能遮蔽記錄，`grant` 的 payload 會原樣返回給其擁有者，因為只有擁有它的插件能解釋它。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | Service Definition：`credentialRef`/`credentialKey` 品牌、`ResolvedCredential`/`CredentialRecordInfo`、覆蓋兩個鍵空間的抽象提供方、帶失敗隔離的扇出 |
| [`src/types.ts`](src/types.ts) | 客戶端安全類型面：`CredentialRef` 與 `CredentialKey` 品牌、存儲記錄聯合類型、`CredentialInfo` 引用視圖、`credentials/reference-updated` 與 `credentials/record-updated` 事件聲明 |
| [`src/invariant.ts`](src/invariant.ts) | 不變式伴生插件：`credentials/reference-updated` 只在憑據服務存活時觸發 |

### 客戶端安全類型

`./types` 子路徑出口把事件聲明與其點名的 `CredentialRef`、`CredentialKey` 品牌、存儲記錄聯合類型，以及配置界面讀取的 `CredentialInfo` 引用視圖放在一起，包根繼續 re-export 它們。于是 Host 編譯面之外的消費方讀到的正是 Host 發射的那一份簽名，而不必再寫一遍。

### 生命周期

服務是提供方注冊的 Cordis `Service`：釋放掛載 fiber 會移除 `ctx.credentials`。不變式伴生插件檢查 `credentials/reference-updated` 絕不在服務未存活時觸發——釋放后仍有發射意味著提供方把工作泄漏到了 teardown 完全停穩之后。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從共享子系統詞匯逐步進入隨附存儲與能力架構。

- [憑據子系統參考](../../../docs/subsystems/credentials.zh.md)——`CredentialRef`/`CredentialKey`、按操作解析、對 UI 安全的信息、提供方層與生成的 Cordis 接口面。
- [本地憑據存儲](../credentials-local/README.zh.md)——默認本機存儲：密鑰與記錄存放在哪里、環境層如何排序。
- [能力 seam](../../../docs/capability-seams.zh.md)——本包遵循的 Service Definition / Service Provider / Consumer 拆分。

-----

<a id="model-experience"></a>
## 模型體驗

經由消費方適配器間接生效：適配器解析每個憑據引用，并擁有值所授權的全部模型可見用途。

#### KV Cache 影響

無直接失效；解析出的值絕不進入請求前綴。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本包何時不合適或需要特別注意。它們是當前包約束，不是任務積壓。

- **引用不提供枚舉**——seam 只回答被問到的引用；配置界面從 settings schema 得知引用集合，對這一半做 `list()` 沒有當前消費方。記錄則可以枚舉，因為沒有可用于發現記錄的 schema。
- **引用限定為環境變量形狀**——單一扁平的 POSIX 標識符命名空間，因為引用同時就是它借以解析的環境變量名。記錄使用更豐富的 `<owner>/<id>` 尋址。
- **進程環境變化不可見**——無法為啟動 shell 中改變的變量發出通知；界面只能在自身導航時重新讀取 `describe()`。
- **記錄的擁有者就是它的 scope，而沒有任何環節核驗該 scope 是否已掛載**——seam 存下被交予的內容，并報告它存了什么；識別遺留記錄需要調用方將 `listRecords()` 的結果與擁有該 scope 的注冊表關聯起來，seam 自身沒有可供核對的注冊表。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文：開放問題與尚未決定的探索方向。它明確不具權威性——已交付的行為與限制以上文和包代碼為準。

該 seam 的接口為 keyring、輔助命令與 KMS 后端提供方預留了擴展空間；遠端設置提供方永遠不必攜帶機密。目前沒有任何一種隨附，也沒有當前消費方需要它們。

</details>
