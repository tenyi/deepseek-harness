---
description: "共享的 Typert Remote 協議：業務包、生成產物、Host Gateway 與 Client API 使用的裝飾器、wire 描述符、編解碼器與提供方約定。"
kind: "package-library"
---

# @deepseek-ai/dsh-typert-protocol

[English](README.md) | 中文

## 概述

借助 `dsh-typert-protocol`，業務包可以向 Remote 客戶端暴露 Host 方法：用 `@Remote`（作用域接收者用 `@RemoteScope`）標記方法，把服務綁定到 wire 命名空間，并通過可合并擴展的協議映射把 Host 對象與作用域 Context 關聯到 wire identity。生成產物、Host Gateway 與 Client API 消費同一套調用描述符、編解碼器與提供方約定，因此一套聲明在每個 face 上保持一致。本包不注冊任何 Cordis 服務，也不運行 TypeScript 分析；它只聲明類型與裝飾器標記。

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

本包供向 Remote 客戶端暴露 Host 能力的業務包與裝配維護者使用。它是一個聲明庫：標記方法、綁定服務，其余交給生成的流水線與 Gateway。

### 暴露 Host 方法

業務包用 `@Remote`（當接收者來自作用域 Context 時用 `@RemoteScope(key)`）標記一個公開實例方法，所屬服務要么繼承 `TypertRemoteService`，要么通過 `bindTypertRemote()` 聲明 `typertRemote` 綁定：

```text
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

export class GoalService extends TypertRemoteService {
  @Remote
  async create(agentId: string, objective: string): Promise<GoalResult> {
    ...
  }
}
```

生成會把方法變為服務命名空間下的 wire 端點；Client 通過 `ctx.remote` 以類型化方法調用它（見 [API Gateway 參考](../../../docs/api-gateway.zh.md)）。方法把 `signal: AbortSignal` 聲明為最后一個參數即可選擇協作式取消——該信號是注入的，絕不會成為 JSON 參數或查找字段。

### 把 Host 對象與 Context 關聯到 wire identity

復雜的 Host 對象不能直接跨 wire 傳輸。業務包通過可合并擴展的 `TypertLookupMap` 與 `TypertContextMap` 聲明關聯。Host Context 適配器擁有穩定 wire 聲明，并把 wire identity 解析為活躍 Context。Client Context 適配器需要雙向映射，因為作用域調用從 Client Context 發起，而轉發的 Host 事件要在 Client 側解析其顯式 wire identity。Host 組合可以覆蓋其同步或異步解析器。因策略原因拒絕解析的解析器會拋出帶有自身錯誤碼的 `RemoteError`，該碼原樣到達調用方。

### 報告與讀取 Remote 失敗

所有 Remote 失敗都由一個類承載：`RemoteError`，攜帶穩定的 `<domain>/<reason>` 碼，以及按該碼定型的 details。本包聲明通用載體碼（`gateway/bad-request`、`gateway/cancelled`、`gateway/internal`），并擁有 `RemoteErrorDetailsMap`——可合并擴展的碼表，其他每個包都在自己的拋出點旁擴展它：

```text
declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    'goal/not-found': { readonly goalId: string }
  }
}
throw new RemoteError('goal/not-found', `goal "${id}" does not exist`, { goalId: id })
```

擁有方在失敗點直接拋出；沒有任何包再寫錯誤類家族或出口映射函數。調用方按 `code` 判別——絕不用 `instanceof`——且 `code` 分支無需 cast 即收窄 `details`，因為 `RemoteFailure` 就是 `RemoteError` 實例按碼判別的 union。需要識別跨模塊或跨 realm 類副本傳來的失敗時，基礎設施調用 `remoteErrorOf(value)`，它讀結構標記而不是原型鏈。

### 在 Client 側接收轉發的 Host 事件

Host 裝配以轉發給消費方的 Cordis 事件擴展 `TypertRemoteEventSelection`，從而收窄 `ctx.remote.$on` 的鍵集。`TypertForwardableEvent` 接受無作用域且返回 `void` 的通知，以及最后一個 `next()` 回調返回事件結果類型的異步作用域 waterfall（瀑布式事件）。`TypertClientEventListener` 從同一條 `Events` 成員派生 Client listener，并保留 signal、可選和只讀字段、數組、回調與結果類型。`TypertClientRemote` 只公開 `$mount()` 與 `$on()`；事件傳輸仍由 Gateway 私有持有。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋聲明如何保持與編譯器無關，以及每個約定在哪里執行；編程模型已在[使用本包](#use-this-package)中說明。

### 設計理念

本包把嚴格反射留在編譯器中：裝飾器初始化器把最小標記保存在 Service 原型上的帶版本描述符中。描述符使用穩定的字符串屬性名，因此協議包的另一個已安裝副本也能讀取同一組標記。完整的參數、結果、查找與 schema 反射是 Typert 構建流水線的職責，通過 `InvocationDescriptor` 交付。

### Remote 標記

`@Remote` 與 `@RemoteScope` 調度一個初始化器，把方法名、可選導出名與調用模式追加到原型描述符；`remoteMethods(service)` 校驗其版本，并返回與已存描述符分離、按聲明順序排列的快照，供 Gateway 的源碼模式回退讀取。標記要求名稱為字符串的公開、非靜態實例方法，同一方法上的沖突標記會被拒絕。

### 協議映射與描述符

可合并擴展的協議映射在類型系統中保留靜態關聯，運行時提供方則向 `ctx.typert` 注冊解析；映射的名稱與形狀見 [`src/types.ts`](src/types.ts)。`InvocationDescriptor` 是注冊表、Gateway 與 Client Remote 共同消費的共享運行時形式，涵蓋直接與 Context 接收者、JSON 與查找參數、作用域投影、取消與結果編解碼器。

### Wire 標識文法

每個命名空間、方法、查找與 Context 段都必須滿足 `isTypertRemoteSegment()`，生成的名字才能原樣跨共享 RPC 載體傳輸。嚴格編解碼器攜帶生成的 schema；`src-json` 編解碼器標識約束更弱的源碼啟動路徑。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 裝飾器、Gateway 綁定、`remoteMethods`、段校驗 |
| [`src/remote-error.ts`](src/remote-error.ts) | `RemoteError` 與結構式識別函數 `remoteErrorOf` |
| [`src/types.ts`](src/types.ts) | 協議映射、`RemoteErrorDetailsMap`、`RemoteResult`、`InvocationDescriptor`、編解碼器、提供方約定、注冊表接口、`TypertClientRemote` |
| — | 不發布運行時不變量伴生入口；decorator 只保留私有不可變聲明，binding 也是凍結值，沒有可供交叉核對的獨立事件流。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面；它們從聲明逐步進入運行時與調用路徑。

- [API Gateway 參考](../../../docs/api-gateway.zh.md)——聲明如何成為實際的 Host 到 Client 調用。
- [Typert 子系統參考](../../../docs/subsystems/typert.zh.md)——從協議與 Gateway 類型記錄的字面公共約定。
- [Typert 注冊表](../registry/README.zh.md)——描述符與提供方在運行時存放的位置。
- [Typert 生成器](../generator/README.zh.md)——生成消費方聲明與描述符的包。
- [Remote 調用 Agent Note](../../../.agents/notes/implemented/architecture/2026-08-02-typert-remote-method-calls.zh.md)——Remote 調用背后的架構與傳輸決策。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為與編譯器無關的 Remote 協議聲明不注冊任何面向模型的內容。

#### KV Cache 影響

無直接影響；聲明的約定只有在裝配將其放入請求時才會觸及請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明聲明能表示什么；它們是當前包約束，不是任務積壓。

- **裝飾器標記是最小化的**——標記只包含方法名與直接調用或 Context 調用模式；參數、結果、查找與 schema 反射需要 Typert 構建流水線。
- **Remote 簽名受限**——裝飾器只接受具有字符串名稱的公開、非靜態實例方法，源碼模式執行無法表示重載、解構、默認參數或剩余參數簽名。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
