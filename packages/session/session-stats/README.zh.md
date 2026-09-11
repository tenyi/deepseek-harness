---
description: "面向客戶端與維護者的全日志會話計數與墻鐘時間說明，用于選擇、組合或排查 sessionStats 投影單元。"
kind: "package-reference"
---

# @deepseek-ai/dsh-session-stats

[English](README.md) | 中文

## 概述

本包通過公開的 `sessionStats` 值，為客戶端提供全會話輪次與步驟計數，以及 LLM、工具、首 token 和解碼墻鐘時間。這些數字來自完整的持久日志，因此分頁與壓縮不會改變它們。當客戶端必須在重新加載或縮減歷史記錄后顯示一致的會話統計時，請使用本包。全會話統計不可用時，客戶端可改用窗口口徑計數。

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

當客戶端需要顯示不受分頁與壓縮影響的全會話數字時，在會話存儲與投影注冊表旁掛載此插件。只有存在注冊表時單元才會注冊。

### 組合

```yaml
- name: '@deepseek-ai/dsh-session'
- name: '@deepseek-ai/dsh-session-projection'
- name: '@deepseek-ai/dsh-session-stats'
```

### 各字段含義

| 字段 | 含義 |
|---|---|
| `turns` | 含至少一個已關閉步的不同輪次；被拒絕或空輪不計 |
| `steps` | 已關閉的步——完成、失敗、取消與 max-tokens 的步全部計入 |
| `llmMs` | 組裝出消息的步的模型墻鐘時間之和 |
| `toolMs` | 匹配的 `tool/call` → `tool/result` 墻鐘時間之和 |
| `ttftMs` / `ttftSteps` | 首 token 延遲之和及其承載步數 |
| `decodeMs` / `decodeTokens` | 上報用量的步的解碼墻鐘時間與提供方輸出 token 之和 |

每個字段在首個貢獻事件之前均為 0；已裝配的注冊表恒提供該鍵，因此客戶端讀取值本身，而非鍵的存在性。客戶端通過投影 seam 的快照與變更流渲染全日志數字；參考消費者是 Web 聊天統計條，其窗口折疊以相同字段名充當無單元時的回退。

### 失敗與恢復

沒有投影注冊表時單元是惰性的：`inject` 使 fiber 保持掛起，不注冊任何內容，因此其他裝配缺少 `sessionStats` 鍵。卸載插件會移除該鍵，因為注冊是掛載 fiber 上的 effect。被崩潰打斷的步在會話重新加載后計入，屆時崩潰恢復補寫合成的 `step/end`。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋數字背后的折疊；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

該單元是對已提交會話事件的純折疊：`step/end` 是被計數的步事件，因為 agent loop 對每個進入的步在 `finally` 中恰好追加一條，因此完成、失敗、取消與 max-tokens 的步都會落地一條。若改按已組裝的 assistant 消息計數，則會多算 max-tokens 的 usage 宿主消息（空內容、被排除在 surface 之外），并少算被取消的步（在消息組裝前已中止）。墻鐘折疊逐字段對齊客戶端窗口折疊。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`inject`、在掛載 fiber 上注冊單元 |
| [`src/projection.ts`](src/projection.ts) | 折疊：狀態形狀、逐事件轉換、wire 視圖 |
| [`src/types.ts`](src/types.ts) | `sessionStats` 投影鍵聲明與字段類型的唯一歸屬 |

### 數據模型

折疊狀態保存八個總計外加進行中的邊界：`lastTurn`（最近一次被計數 `step/end` 的輪次）、`openStep`（打開步的邊界事實，由其 `assistant/message` 關閉）與 `pendingCalls`（按 callId 記錄的工具分發時間）。wire 視圖是嚴格子集——八個總計——因此持久緩存的狀態 schema 以邊界字段擴展視圖 schema。

### 折疊規則

- 不相關事件返回同一狀態引用；注冊表的 `Object.is` 門禁保持變更流安靜。
- 首 token 延遲記錄首個非空 delta chunk，并在步內 `llm/retry` 后保留。
- 解碼時間與 token 只在同時攜帶首 token 與有效提供方用量報告的步上累加；與窗口折疊守衛節點用量一樣忽略畸形用量。
- 工具時間按 callId 配對 `tool/call` → `tool/result`；未解決的調用在 `turn/end` 時丟棄，因為結果總在其輪內落地，而撞上 `Object` 原型名的 callId 讀作未匹配。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當單元約定不夠用時閱讀以下頁面。它們從驅動單元的注冊表逐步進入相鄰的會話包。

- [會話投影子系統](../../../docs/subsystems/session-projection.zh.md)——驅動單元并提供快照與變更流值的注冊表。
- [會話投影注冊表包](../session-projection/README.zh.md)——單元注冊所依據的注冊表約定。
- [會話包映射](../README.zh.md)——相鄰的持久化、投影、標題與遙測包。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為 sessionStats 單元把已寫入日志的步邊界折疊成面向客戶端的讀模型，不注冊任何面向模型的內容。

#### KV Cache 影響

無；本包從不組裝或發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明數字描述什么、單元何時缺失。它們是當前包約束。

- **步數統計的是已發生的工作，而非可見輸出**——在產生任何可見內容前就失敗的步仍以 `step/end` 關閉并計入；被崩潰打斷的步在會話重新加載后計入，屆時崩潰恢復補寫合成的 `step/end`。
- **被取消的步計數但不計時**——沒有組裝出 assistant 消息，其部分流式時間不進入任何墻鐘數字；反之 max-tokens 的 usage 宿主消息貢獻 surface 上看不到的模型時間。
- **計數是日志口徑，不是 surface 口徑**——消息后來被壓縮掉的步仍然計入；數字描述整個會話，而非當前模型可見 surface。
- **僅在組合了投影注冊表時掛載**——其他裝配不提供 `sessionStats` 鍵，其消費者回退到窗口口徑計數。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。本包只擁有一個純投影折疊區，其 wire payload 在每次快照和變更流發射時都由投影注冊表進行 schema 校驗。該折疊區依賴的事件關系（每個已進入步驟恰有一個 `step/end`、宿主分配的輪次編號單調遞增，以及分片和工具事件攜帶各自的步驟坐標與調用 id）由 dsh-agent-loop 與 Session surface 擁有并在運行時檢查，而不由本包擁有。
