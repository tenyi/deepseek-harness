---
description: "可選的按步驟時鐘上下文，包含當前時間、瀏覽器時區與經過時長，供啟用或調優本插件的用戶與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-time-context

[English](README.md) | 中文

## 概述

`dsh-time-context` 給模型一只時鐘：在符合條件的步驟上，它追加一條持久、帶來源的讀數，包含當前時間、附加到當前開放請求的瀏覽器時區，以及自前一條模型可見消息以來的經過時長。它幫助模型按用戶的瀏覽器時區解釋未明確限定時區的日期與時間；時區來源混雜或缺失時，它告訴模型去詢問。本插件需主動啟用：默認組合不啟用它，Schedule Web overlay 會掛載它。正的 `refreshIntervalMs` 會減少讀數累積的頻率；省略或設為 `0` 時，每個符合條件的步驟都會注入。

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

當模型需要按用戶所在時區解釋未限定的日期與時間，且請求本地瀏覽器時區可用或已配置的回退值可接受時，掛載此插件。每次注入都是持久歷史中額外的一條 user 角色消息；當按步驟讀數超出對話需要時，用 `refreshIntervalMs` 調度。

### 模型能得到什么

每條注入讀數包含三行：帶數字偏移與 IANA 時區、形如 ISO 的時間戳，該請求的瀏覽器時區策略，以及以緊湊整秒單位表示的經過時長。第 1 步從最新一條先前模型可見消息起測量；后續步驟從同一輪次中前一個 time-context 事件起測量。缺少基線時報告 `unavailable`，掛鐘時間倒退時把經過時長鉗制為零。

### 配置

最小掛載無需任何配置。正的 `refreshIntervalMs` 會抑制距最近一次注入不足該毫秒數的注入；省略或設為 `0` 時，每個信號尚未中止且將進入步驟的合格 pre-step 都會注入。

```yaml
- name: '@deepseek-ai/dsh-time-context'
  config:
    timeZone: Asia/Shanghai
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `timeZone` | 進程時區 | 當前開放輪次沒有唯一瀏覽器時區時的顯示回退時區 |
| `refreshIntervalMs` | `0`（每個合格步驟） | 同一會話中兩次持久注入之間的最小毫秒數 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-time-context)是每個受支持字段及其 JSDoc 的窮盡式真源。

### 選擇時區

當當前開放輪次只包含一個經 Host 校驗的瀏覽器時區時，時間戳按該請求本地時區格式化。瀏覽器來源信息缺失或混雜時，配置的 `timeZone` 格式化顯示；省略它則在插件加載時解析一次 Node 進程時區，每個顯式回退值都經 `Intl.DateTimeFormat` 校驗。解析后的指令告訴模型按所選時區解釋未限定的日期與時間；來源信息混雜或不可用時，則要求用戶澄清。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋插件的設計；可觀察行為見[使用本包](#use-this-package)。

### 設計理念

插件前置注冊一個 `agent/pre-step` 監聽器，先委托下游，需要注入且下游決策進入步驟時追加一條帶來源的 `UserMessage`。每個讀數都使用確切的快照來源 `{ kind: 'plugin', plugin: 'time-context', form: 'snapshot', sections: [{ name: 'time-context', text }] }`，不變式配套模塊會校驗該形狀，根據原始 `user-rpc` 消息重新派生當前輪次的瀏覽器策略，并檢查時間戳時區與經過時長基線。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：pre-step 監聽器、到期調度、讀數組合 |
| [`src/request-zone.ts`](src/request-zone.ts) | 從開放輪次 `user-rpc` 來源派生瀏覽器時區策略 |
| [`src/timestamp.ts`](src/timestamp.ts) | `Intl.DateTimeFormat` 創建與時間戳格式化 |
| [`src/invariant.ts`](src/invariant.ts) | 快照約定的不變式配套模塊 |

### 主要流程

需要注入時，插件采樣掛鐘時間，從開放輪次的 `user-rpc` 消息派生瀏覽器時區策略，解析顯示時區（請求本地或回退），并渲染三行讀數。正數間隔調度會掃描原始持久會話事件，查找最新一條歸因于插件的消息——包括被壓縮（compaction）遮蔽的讀數——因此調度無需進程本地緩存也能在恢復后存續。讀數記錄的是已進入的步驟，不是已完成或已傳輸的請求；后續準備失敗時，該讀數可能留在歷史中。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

包級約定不夠用時閱讀以下頁面。它們從設計決策進入掛載本插件的組合與窮盡式配置。

- [Schedule 用戶指南](../../../docs/user/guide/schedule.zh.md)——掛載本插件的官方配置路徑。
- [context 組地圖](../README.zh.md)——相鄰的請求上下文包。
- [生成的配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-time-context)——每個受支持配置字段及其源聲明。

-----

<a id="model-experience"></a>
## 模型體驗

### 準備期時間上下文

#### 模型看到的內容

每條注入消息包含三行。`<timestamp>` 是帶數字偏移和 IANA 時區、形如 ISO 的時間戳；持續時間使用緊湊的整秒單位。

##### 第一步

```markdown
Time sampled while preparing turn <turn>, step 1: <timestamp>
Browser time zone for this request: <iana-zone-or-mixed-or-unavailable-policy>.
Elapsed since the preceding model-visible message: <duration-or-unavailable>.
```

##### 后續步驟

```markdown
Time sampled while preparing turn <turn>, step <step>: <timestamp>
Browser time zone for this request: <iana-zone-or-mixed-or-unavailable-policy>.
Elapsed since the preceding step context: <duration-or-unavailable>.
```

#### Token 影響

每個讀數都會累積，直到壓縮將其遮蔽。正數間隔會減少新增讀數；省略或設為 `0` 時，每次合格的準備嘗試都會添加一條。

#### KV Cache 影響

僅追加；新可見內容位于可復用請求前綴之后，不會使現有 KV Cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明時鐘上下文何時不合適。它們是當前包約束。

- **僅限提示詞來源信息**：瀏覽器時區上下文用于指導自然語言解釋，但不會悄然填入另一工具所要求的時區字段。
- **混合輪次會詢問**：如果同一個開放輪次包含來自不同瀏覽器時區的提示詞，模型會收到要求澄清的指令，而不會猜測哪個時區擁有未限定的時間。
- **回退值不代表用戶權威**：瀏覽器來源信息缺失或混雜時，配置或進程時區用于格式化時鐘，但面向模型的策略仍要求澄清。
- **整秒顯示**：時間戳與持續時間省略亞秒精度，盡管持久事件時間保留毫秒。
- **壓縮之間的歷史成本**：省略或設為 `0` 時，每次合格嘗試都會保留一條讀數；正數間隔可以降低但無法消除該成本，也可能使后續請求缺少新鮮的瀏覽器時區指導。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
