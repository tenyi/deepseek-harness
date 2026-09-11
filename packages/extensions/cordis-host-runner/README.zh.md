---
description: "動態 Cordis 包的 host 半說明，供選擇、組合或排查注冊表、沙箱與運行往返的 agent（智能體）與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-cordis-host-runner

[English](README.md) | 中文

## 概述

`dsh-cordis-host-runner` 讓動態包在本進程中可運行：模型用 `cordis_define` 記錄的定義留在這里，host 半在 `node:vm` 沙箱中運行，帶瀏覽器半的包會等待人在頁面上批準或拒絕，模型也可以在這里檢查實時運行時及其定義。面向模型的工具在 `@deepseek-ai/dsh-tool-cordis` 中，瀏覽器半經 `@deepseek-ai/dsh-cordis-client-runner` 裝載。定義只存在于進程內存中，因此 DSH 重啟即清空，也不會向磁盤寫任何東西。唯一的配置字段 `vmTimeoutMs` 限制同步沙箱求值的時長。

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

在任何一個應當支持動態包的組合中掛載本插件——它支撐模型的 `cordis_*` 工具，而帶瀏覽器半的包還需要在客戶端組合中額外掛載 client runner 與 UI 包。常用路徑是顯式的：加載本包，按需設置 `vmTimeoutMs`，其余交給工具與瀏覽器。

### 最小配置

```yaml
- name: '@deepseek-ai/dsh-cordis-host-runner'
  config:
    vmTimeoutMs: 5000
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `vmTimeoutMs` | `5000` | host 半在 vm 中同步執行的那部分被中止求值前可運行的毫秒數 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-cordis-host-runner)是每個受支持字段的窮盡式真源。

### run 會做什么

定義由 `cordis_define` 記錄、由 `cordis_run` 激活。只有 host 半的包直接在本進程中激活：它的代碼在沙箱中運行。帶瀏覽器半的包變成一次請求：它一直等到有人在一個頁面上允許或拒絕，或提問的輪次被取消；作答頁面隨后先裝載 host 半、再裝載瀏覽器半。`mode: "run"` 啟動當前包或重啟它，`mode: "update"` 切換到另一個包版本。`cordis_stop` 結束一次存活運行——移除該包的 handler 與任何已裝載的瀏覽器 UI——同時保留可再次運行的定義；`cordis_undefine` 停止并忘掉它。

### 定義的去向

定義以會話為界、以進程為本：包只對定義它的會話可見，其他會話讀取時視其為不存在，DSH 重啟后一切都消失。會話日志保留一次 define 調用的參數——包括它提交的代碼——以及回執；解析出的定義只存于內存注冊表。瀏覽器半只能經一次運行到達頁面，因此刷新后的頁面手上什么都沒有，直到有人再次運行該包。

### 信任立場

沙箱隔離全局變量，但不是安全邊界：Node 全局變量不存在，或重定向到 Cordis 服務（`ctx.fs`、`ctx.web`、`ctx.bash` 與定時器 helper），host 半收到的是不含框架內部機制的 façade，但它聲明的服務仍會觸達存活運行時。對待動態包要像對待 bash 訪問一樣，參見[自引用工具集 Agent Note](../../../.agents/notes/implemented/feature/2026-07-08-self-referential-cordis-toolset.zh.md)。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋 runner 背后的設計；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

runner 基于兩項職責劃分。**注冊表與沙箱是同一個服務。** `DynamicCordisRunnerService` 擁有定義注冊表、vm 沙箱、host 半 fiber 生命周期與 invoke handler 表，因此一個定義的整個生命周期只有一個 owner。**版本是不可變的包。** 插件持有 `define` 之后永不變化的包；`currentPackageId` 與 `nextPackageId` 指向運行中與目標版本，`mode: "run"` 與 `"update"` 編碼目標是否等于當前版本。瀏覽器往返之所以存在，是因為瀏覽器半只能由頁面執行：服務 emit 請求并掛起，由頁面的結論結算，調用方的 `AbortSignal` 是唯一的另一條出路。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 服務入口：`Config`、注冊表接線、生命周期動詞、steering（中途引導）消息 |
| [`src/registry.ts`](src/registry.ts) | 定義存儲：插件與包標識、運行嘗試、審批請求 |
| [`src/sandbox.ts`](src/sandbox.ts) | `node:vm` 求值：全局變量、Node API 陷阱、define 時語法預檢 |
| [`src/guard.ts`](src/guard.ts) | 注冊邊界：schema 規范化、沙箱 `ctx` façade、插件形態檢查 |
| [`src/lifecycle.ts`](src/lifecycle.ts) | 在 `cordis-dynamic` fiber 組下啟動 host 半 |
| [`src/inspect-registry.ts`](src/inspect-registry.ts) | `ctx.cordisInspect` 注冊表：host 提供方加鏡像的 client manifest（元數據清單） |
| [`src/types.ts`](src/types.ts) | `dynamicCordisRunner` remote namespace 與轉發事件共享的 client 安全載荷形態 |

### 一次 run 的流程

`define` 對元數據做首尾去空白與必填校驗，用編譯預檢每一半的語法（不執行任何代碼），鑄出插件與包標識，并把定義登記在發起調用的會話名下。`run` 對照 `currentPackageId` 與 `nextPackageId` 解析目標：純 host 包在沙箱中求值并立即提交，帶瀏覽器半的包則建立一次審批請求、emit `cordis/request-run` 并掛起。作答頁面依次走 `runHostHalf`、`getClientCode` 與 `resolveRequestRun`；命名存活 revision 的成功會提交激活、設置 `currentPackageId`，`cordis/request-run-resolved` 讓其他每個頁面撤下待作答入口。`stop` 回退存活下發——handler disposer、fiber dispose（資源釋放）與 `cordis/dynamic-retract` 廣播——并讓定義保持可運行。四條轉發事件（`cordis/request-run`、`cordis/request-run-resolved`、`cordis/dynamic-package`、`cordis/dynamic-retract`）聲明在 client 安全的 `./types` 子路徑上，并由 `@deepseek-ai/dsh-api-remotes` 的白名單準許投遞——正是這一點讓瀏覽器能經 `ctx.remote.$on` 收到它們。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從 runner 逐步進入調用它的工具、應答它的瀏覽器半與生成的表面。

- [工具包](../tool-cordis/README.zh.md)——調用本服務的模型側工具。
- [Client runner](../cordis-client-runner/README.zh.md)——應答運行請求并裝載瀏覽器半代碼的瀏覽器半。
- [UI 包](../ui-cordis/README.zh.md)——用戶批準并操作運行的面板。
- [生成的配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-cordis-host-runner)——每個受支持配置字段。
- [extensions 子系統](../../../docs/subsystems/extensions.zh.md)——生成的 `ctx.cordisInspect` 與 `ctx.dynamicCordisRunner` API 及 `cordis/*` 事件。
- [自引用 Cordis 工具集 Agent Note](../../../.agents/notes/implemented/feature/2026-07-08-self-referential-cordis-toolset.zh.md)——沙箱語義、生命周期與組合的理由。

-----

<a id="model-experience"></a>
## 模型體驗

### 轉達給所屬會話的運行結果、拒絕與診斷

#### 模型看到的內容

沒有直接可見的內容：本包不注冊任何工具，也不注入提示詞。當一次 run 結算時，它會向所屬會話發送 steering——成功時點名當前包并指示繼續，用戶拒絕時指示不要再次請求同一激活，技術性失敗則給出原因、版本指針與「檢查—修正—更新」路徑。它還會通過 steering 轉達結算后的渲染失敗（slot、條目是否已被移除）、host guard 拒絕與 host handler 失敗。面板上的停止與移除手勢會注入一條 user 角色消息，說明用戶做了什么。`run` 或 `stop` 的拒絕還會經調用它的工具結果到達模型。

#### Token 影響

有條件且隨數據而定：消息只在事件發生時到達，每條都攜帶一段有界的說明；沒有固定的每請求成本。

#### KV Cache 影響

本包自身沒有。注冊工具的 host 半會改變下一次請求的工具視圖，從第一個變化的 schema token 起使前綴復用失效；運行或停止一個不注冊任何工具的包對前綴不產生影響。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明 runner 何時需要特別小心。它們是當前包約束，不是任務積壓。

- **run 成功不等于 UI 渲染成功**——只要作答頁面已裝載瀏覽器半，`run` 就會返回；React 是隨后才渲染的，因此拋異常的組件不可能出現在 run 回執里。該失敗經 steering 與 `cordis_inspect_self` 診斷浮現。
- **帶瀏覽器半的包在沒有頁面連接的地方掛起**——headless 與 ACP（Agent Client Protocol）部署會把 run 一直掛到提問的輪次被取消；純 host 包不受影響。
- **掛起的 run 請求沒有超時**——它一直等人，直到提問的輪次被取消，因此無人值守的自動化用不了帶瀏覽器半的包。
- **`vmTimeoutMs` 只約束同步求值**——async 的 host 半函數體會逃出該上限，這與工具集基于協作的信任立場一致。
- **陳舊成功的拒絕會讓請求繼續掛起**——作答頁面點名的 revision 已被注冊表越過時，該結論會被拒絕（`accepted: false`），請求保持可作答，直到另一個頁面作答或調用方取消；瀏覽器半不讀這個 ack。
- **運行播報不攜帶服務聲明**——瀏覽器半聲明的 `inject` 是從它在頁面里返回的插件上讀出的，因此 `cordis/request-run` 只攜帶元數據，絕無代碼或服務清單。
- **`zod` 是生成的 Typert 契約面的運行時依賴，不是 `src` 的依賴**——`./typert` 與 `./remote` 解析到未打包的 `lib` 文件，其中帶有裸的 `import { z } from 'zod'`，所以即使 `src` 里沒有任何代碼 import zod，本包也要聲明它。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。definition registry 位于進程內存中且沒有可觀察的事件流；它唯一負責的關系是運行中的 definition 擁有已結算的 host-half fiber 及其 handler table，該關系在單個等待完成的操作中建立和解除，因此由包測試直接斷言。
