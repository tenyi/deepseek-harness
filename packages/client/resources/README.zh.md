---
description: "客戶端資源模型：按協議注冊的提供方把 URL 地址解析為實時值，任何 slot 組件都通過 useResource 標準鉤子讀取。"
kind: "package-reference"
---
# @deepseek-ai/dsh-client-resources

[English](README.md) | 中文

## 概述

當組件只知道實時數據的 URL 地址，而數據由另一個客戶端包擁有時，請使用客戶端資源；例如 tab 記錄、鏈接或提及。資源地址使用 `dsh-resource://<type>/…`；需要作用域的協議把作用域編進路徑。組件通過公開的 `useResource` 鉤子接收當前值與后續更新。不支持的協議與非資源 scheme（例如 `sidebar://guide`）不指向任何資源。

## 目錄

- [使用本包](#use-this-package)
  - [讀取資源](#read-a-resource)
  - [提供協議](#provide-a-protocol)
  - [釘住資源](#hold-a-resource-open)
- [理解實現](#understand-the-implementation)
  - [生命周期](#lifecycle)
  - [失敗](#failures)
- [模型體驗](#model-experience)
- [已知限制與暫緩事項](#known-limitations-and-deferred-work)
- [開發備注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

掛載無需任何配置：插件提供 `ctx.resources`，并通過 `ctx.slots.provideRoot` 貢獻 `resource` 根 keyed 鉤子，因此每個 slot 組件不論作用域都能收到它。

<a id="read-a-resource"></a>
### 讀取資源

每個 slot 組件都在 props 上收到 `useResource`。`useResource<P>(address)` 以類型參數命名協議，返回 `{ status, value, failure }`：地址協議沒有提供方（或地址不是 `dsh-resource://` URL）時為 `none`，提供方尚未產出值時為 `loading`，`live` 攜帶最新一個 `ok` 幀的值，`failed` 表示最新一幀報告了失敗，失敗放在最后一個值旁。通過鉤子訂閱就是釘住資源的方式；另一個持有者讓資源保持存活時，新掛載的組件立刻讀到最新值。

<a id="provide-a-protocol"></a>
### 提供協議

協議所屬的客戶端包在 `ResourceProtocolMap` 聲明其值類型，并以自有 effect 注冊一個提供方。`open` 產出 `RemoteResult` 幀：先是當前內容，之后每次變化一幀，失敗以 `ok: false` 幀而非拋錯表達；必須在 `signal` 中止時停止：

```ts ignore-check
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface ResourceProtocolMap { note: NoteView }
}

export const inject = ['resources']

export function apply(ctx) {
  ctx.effect(() => ctx.resources.register<'note'>({
    protocol: 'note',
    async *open(address, { signal }) {
      yield await readNote(address, signal)
      for await (const change of followNote(address, signal)) yield change
    },
  }), 'my-notes: note resource provider')
}
```

一個協議恰有一個提供方；第二次注冊會拋錯。提供方注冊時若其協議的地址已被持有，則立即開流；提供方 dispose（資源釋放）時結束這些流并讓它們回到 `none`。

<a id="hold-a-resource-open"></a>
### 釘住資源

`ctx.resources.pin(address, signal)` 在不訂閱的情況下讓資源保持打開，直到 `signal` 中止。右側 Sidebar 在 tab 記錄的存續期內釘住每個已打開 tab 的地址，因此切換 tab 卸載正文不會關閉其流，切回時讀到最新值。`ctx.resources.source(address)` 是鉤子背后的裸 observable，供 React 之外的調用方使用。

<a id="understand-the-implementation"></a>
## 理解實現

<a id="lifecycle"></a>
### 生命周期

每個地址一條記錄，持有一個快照存儲、一個持有者計數（鉤子訂閱者加 pin）與運行中流的 `AbortController`。第一個持有者打開提供方的流；之后的持有者共享它；最后一個持有者釋放時中止流并把快照重置為空閑（有提供方為 `loading`，沒有為 `none`）。記錄在頁面存續期內保留，使 `source()` 在 React 從渲染到訂閱的窗口期以及 StrictMode 重掛載期間保持引用穩定。

<a id="failures"></a>
### 失敗

失敗是幀而非拋錯：提供方產出 `{ ok: false, error }`，資源變為 `failed` 并把該錯誤放在最后一個值旁；下一個 `ok` 幀將其清除。自行結束的流保持其最后狀態。在中止流的那次釋放之后到達的幀都被丟棄，并歸還迭代器。提供方流內的拋錯是編程錯誤，不會被捕獲。

<a id="model-experience"></a>
## 模型體驗

無，因為本包在瀏覽器插件之間搬運值，不注冊任何面向模型的內容。

#### KV Cache 影響

無；資源流不會組裝模型請求。

## 已知限制與暫緩事項

<a id="known-limitations-and-deferred-work"></a>

- **記錄在頁面存續期內保留**——地址的記錄在最后一個持有者離開后仍留在注冊表中，只丟棄其狀態。內存隨讀取過的不同地址數增長，而非隨讀取次數增長。
- **中止合規由提供方負責**——注冊表會丟棄已釋放的流仍產出的幀，但忽略 `signal` 的提供方會一直工作到它的下一幀。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。提供方歸屬與持有者計數只有注冊表這一個擁有者，沒有可供比對的獨立運行時來源；注冊的 dispose 與打開/關閉生命周期由行為測試斷言。
