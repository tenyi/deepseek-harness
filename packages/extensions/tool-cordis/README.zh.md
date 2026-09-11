---
description: "面向 agent（智能體）與維護者的 Cordis 運行時工具說明，用于選擇、組合或排查動態包工作流。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-cordis

[English](README.md) | 中文

## 概述

`dsh-tool-cordis` 讓模型檢查實時 Cordis 運行時，并創建、運行、停止、更新或移除包含 host 代碼、瀏覽器代碼或兩者的臨時動態包。包版本不可變，因此包失敗后，模型可以添加新版本并更新當前運行的版本。定義只存在于進程內存中，DSH 重啟即消失；本包不寫倉庫文件、不安裝依賴，也不改 `cordis.yml`。它還會把這套工作流教給模型。請與 `@deepseek-ai/dsh-cordis-host-runner` 一同組合，后者提供沙箱與運行往返。

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

當某個會話應當能臨時擴展它自己的運行時——例如一個對當前工作有用、但不應成為倉庫插件的模型編寫的工具、服務或瀏覽器 UI——掛載本插件。請與 host runner 一同組合；沒有 runner，這些工具永遠不會激活，而且任何已發布的組合包都不會掛載這套工具集（web profile 已掛載 host runner 與瀏覽器側組件），所以要顯式地添加工具行。

### 最小組合

```yaml
- name: '@deepseek-ai/dsh-cordis-host-runner'
  config:
    vmTimeoutMs: 5000
- name: '@deepseek-ai/dsh-tool-cordis'
```

CLI 示例 [`apps/cli/config/examples/cordis/cordis.yml`](../../../apps/cli/config/examples/cordis/cordis.yml) 同時組合了這兩者。帶瀏覽器半的包還額外需要客戶端組合里的瀏覽器 runner 與 UI 包；純 host 包則兩者都不需要。

### 工具能做什么

三個檢查工具只讀；四個生命周期工具定義并管理包。所有結果都是渲染成文本的 JSON。

- `cordis_inspect_list`——列出 Inspect Provider（host 與 client）及其查詢方法。
- `cordis_inspect_query`——執行一次提供方查詢：精確的服務方法、事件模式、builtin 簽名、工具 schema、主題 token 或實時 slot 樹。
- `cordis_inspect_self`——本會話的動態插件：版本指針、最近一次運行，以及（對某個精確包而言）源碼與運行時診斷。
- `cordis_define`——登記一個包：新插件（`plugin.kind: "new"`，配 3–6 個字母的 `idPrefix`），或既有插件的新版本（`plugin.kind: "existing"`，配其 `pluginId`）。它只校驗參數與語法；不運行任何東西，也不請求審批。
- `cordis_run`——激活一個包（首次激活或重啟用 `mode: "run"`，切換版本用 `mode: "update"`）。帶瀏覽器半的包可能先返回 `awaiting-approval`，直到有人允許；工具從不等待最終結果。
- `cordis_stop`——停止當前運行并取消任何待審批請求，保留插件與全部包版本。
- `cordis_undefine`——停止并徹底移除一個插件及其全部包。

### 典型工作流

先檢查、再定義、后運行：`cordis_inspect_query` 讀取包要用的服務或 slot 的精確約定，`cordis_define` 記錄源碼（會話里會出現一張 define 卡片，指向存放運行控件的面板），`cordis_run` 激活它。當用戶輸入 `@pluginId` 時，本包注入一條上下文消息，釘住所引用的插件、其基準包與更新路徑。技術性失敗之后，用 `cordis_inspect_self` 讀取診斷，向同一插件追加修正版，再更新到該版本。

### 需要規劃的邊界

定義以會話為界、以進程為本：包只在定義它的會話里可見可控，可跨后續輪次保持活躍，運行時也可能影響同一進程中的其他會話。停止、移除、卸載工具集或重啟 DSH 都會清除它。沙箱隔離全局變量，但不是安全邊界——對待動態包要像對待 bash 訪問一樣，加載本插件時也要像授予 bash 工具那樣慎重。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋工具背后的設計；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

工具集基于一項職責分離原則：工具是在 runner 服務之上面向模型的輕量層。檢查數據來自生成的目錄與實時服務存儲的交集；定義與生命周期操作委托給 `ctx.dynamicCordisRunner`，它擁有注冊表、vm 沙箱與瀏覽器往返。工具層負責面向模型作出判斷：只展示可調用的方法、只列出 host 側可訪問的鍵，并且每次拒絕都會提供可指導模型采取行動的錯誤信息。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：工具注冊、系統提示詞章節、`@pluginId` 上下文注入 |
| [`src/inspect.ts`](src/inspect.ts) | 報告渲染：把生成的 API 目錄與實時服務存儲相交 |
| [`src/api-catalog.ts`](src/api-catalog.ts) | 工作區 Cordis 聲明的生成投影（由 `pnpm run gen-cordis-api` 重新生成，`verify-cordis-api` 守其新鮮度） |
| [`src/prompt.ts`](src/prompt.ts) | `tool:cordis` 系統提示詞章節 |
| [`src/providers.ts`](src/providers.ts) | 第一方 host Inspect Provider：Service、Event、Builtin、Tool |
| [`src/present.ts`](src/present.ts) | 可安全回放的通用卡片渲染意圖 |

### 一次調用的流程

檢查調用查詢 `ctx.cordisInspect`：host 提供方在本地執行，client 提供方等待第一個有效的頁面應答。define 用與沙箱相同的包裝器編譯每一半來做語法預檢，因此無法解析的代碼在拿到 id 之前就被拒絕。run 委托給 runner：純 host 包在進程內激活，帶瀏覽器半的包掛起在 `cordis/request-run` 往返上；工具返回 runner 的回執（`awaiting-approval`、`starting` 或 `running`）。當用戶寫下 `@pluginId` 時，一個 `agent/pre-step` 處理器讀取引用，并注入一條 user 角色的上下文消息，點明基準包與必須的后續步驟。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從共享工具集逐步進入 runner 內部、生成 schema 與子系統接口。

- [Host runner](../cordis-host-runner/README.zh.md)——這些工具委托的注冊表、沙箱與運行往返。
- [Client runner](../cordis-client-runner/README.zh.md)——應答運行請求并裝載瀏覽器半代碼的瀏覽器半。
- [UI 包](../ui-cordis/README.zh.md)——用戶操作定義所用的面板與工具卡片。
- [生成的工具目錄](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-cordis)——模型收到的確切 schema。
- [extensions 子系統](../../../docs/subsystems/extensions.zh.md)——生成的 `ctx.cordisInspect` 與 `ctx.dynamicCordisRunner` API。
- [自引用 Cordis 工具集 Agent Note](../../../.agents/notes/implemented/feature/2026-07-08-self-referential-cordis-toolset.zh.md)——設計居所：沙箱語義、動態包生命周期與組合。

-----

<a id="model-experience"></a>
## 模型體驗

### 工具 schema

#### 模型看到的內容

該插件可見時，會話模型會看到生成的 [`cordis_inspect_list`、`cordis_inspect_query`、`cordis_inspect_self`、`cordis_define`、`cordis_run`、`cordis_stop` 和 `cordis_undefine` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-cordis)。

#### Token 影響

該工具視圖中的每次請求承擔固定 schema 成本。

#### KV Cache 影響

只要該工具視圖不變，前綴就保持穩定。隱藏這些定義的 scope 或插件生命周期變更，可能使從第一個變化的 schema token 起的復用失效。

### 系統提示詞章節

#### 模型看到的內容

本包注冊一個系統提示詞章節（`tool:cordis`，order 115），教模型何時以及如何使用動態包工作流、推薦的工具順序與必須避免的高頻錯誤；完整文本在 [`src/prompt.ts`](src/prompt.ts) 中。章節開頭如下：

##### 章節開頭

```markdown
# Dynamic Cordis Plugins

Dynamic Cordis plugins temporarily extend the current DSH process. A Plugin uses apply(ctx) to consume Services, listen to Events, provide Services, register model Tools, or register browser UI in Slots.
```

#### Token 影響

該插件可見時，章節渲染出的文本會在每次請求中重復。

#### KV Cache 影響

只要章節文本與順序不變，前綴就保持穩定；編輯提示詞或改變其順序可能使從第一個變化 token 起的復用失效。

### 工具調用歷史與結果

#### 模型看到的內容

檢查輸出是渲染成文本的 JSON：`cordis_inspect_list` 返回提供方目錄，`cordis_inspect_query` 返回查詢數據，`cordis_inspect_self` 返回插件、版本與包摘要，并在指定精確包時給出源碼與診斷。define 返回該包已定義但尚未運行，并給出用于運行的 id。run 返回 `awaiting-approval`、`starting` 或 `running`，附運行 id 與版本指針。stop 與 undefine 各返回一行確認信息。每一次拒絕都是攜帶 runner 教學文本的工具錯誤，提交的程序保留在 assistant 工具調用歷史中。

#### Token 影響

檢查輸出與提交的包代碼取決于數據，并在壓縮（compaction）前重復發送；生命周期確認文本很短。

#### KV Cache 影響

僅追加；新可見內容位于可復用請求前綴之后，不會使現有 KV Cache 條目失效。

### cordis_run 之后的后續請求

#### 模型看到的內容

運行中的包可能注冊工具、提示詞貢獻或監聽器，改變其目標 scope 的后續請求；`cordis_stop` 與 `cordis_undefine` 會在完全停穩后移除這些貢獻。當用戶輸入 `@pluginId` 時，注入的引用上下文還會增加一條 user 角色的消息，點明基準包與后續步驟。

#### Token 影響

間接 token 影響等于運行中包的貢獻，且只在其進程內生命周期內持續。

#### KV Cache 影響

運行或停止提示詞／工具貢獻會改變后續請求前綴，并可能使從第一個變化的貢獻起的復用失效；運行集合不變時，前綴保持穩定。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明工具集何時不合適或需要特別小心。它們是當前包約束，不是任務積壓。

- **沙箱只用于約束誠實代碼，并非安全邊界**——可以觸及沙箱全局變量上的 host realm helper，因此包代碼可以觸達 Node；加載本插件時，應當像授予 bash 工具一樣慎重。
- **只支持純 JavaScript**——動態包代碼不做任何轉換：沒有 TypeScript、JSX 或 import，沙箱還不提供 `require`、`setTimeout`、`fetch` 等 Node 全局變量，把文件、網絡與進程工作重定向到 Cordis 服務。
- **vm 與審批邊界屬于 runner**——見它的[已知限制](../cordis-host-runner/README.zh.md#known-limitations-and-deferred-work)；async 的 host 半主體可逃出 `vmTimeoutMs`。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。這個面向模型的適配器沒有獨立 lifecycle stream；執行關系由它調用的能力 seam 負責。
