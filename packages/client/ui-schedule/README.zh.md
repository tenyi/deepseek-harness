---
description: "說明活動 Schedule 提醒的只讀 Web 目錄，供用戶選擇該界面，也供維護者了解其 projection、時間與無障礙行為。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-schedule

[English](README.md) | 中文

## 概述

本包在 Web 會話頭部渲染當前會話活動 Schedule 提醒的只讀目錄。它讀取完整的 `schedule` projection，不發 RPC，也不執行 mutation。瀏覽器派生狀態、本地時間、相對時間與排序，不把這些呈現值加入持久狀態。隨附 Web bundle 默認禁用該插件，只有顯式 Schedule overlay 才會同時啟用 Host Schedule 服務與此客戶端 row。

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

在需要顯示提醒的 Web 會話啟動前啟用 Schedule overlay：

```sh
dsh web --patch apps/cli/config/examples/schedule/cordis.yml
```

隨附 Web graph 已通過 disabled 的 `ui-schedule` row 解析 `@deepseek-ai/dsh-client-ui-schedule`；overlay 會把該 row 與 `@deepseek-ai/dsh-schedule` 一起啟用。只有會話已成功打開且 projection 至少包含一條活動記錄時，觸發器才會出現。打開目錄后，逾期行在前，未來行再按目標時間排序；完全并列時保留 projection 的創建順序。

### 閱讀和關閉目錄

每一行顯示可完整換行的提示詞、獨立的「等待中」或「已逾期」狀態、本地化的「單次」或重復間隔可整除的最大完整單位、瀏覽器本地目標時間，以及按瀏覽器時鐘派生的相對時間。間隔絕不舍入，三項元數據會按行換行，不會裁剪合法的大數值。通過 portal 掛到 body 的彈層目標寬度為 336px；空間足夠時與觸發按鈕左邊緣對齊，觸發器靠近視口右側時向左避讓并保留 16px 視口邊距，最大寬度為視口寬度減 32px。彈層會在需要時縱向滾動，且不顯示 Schedule id、原始 UTC 值、詳情或操作控件。

只有原生觸發按鈕進入 Tab 順序。Enter 與 Space 使用按鈕的正常激活行為；焦點仍在觸發器或目錄內時，Escape 會關閉彈層并把焦點交還觸發器；在外部按下指針也會關閉。若 live 更新移除最后一條記錄，組件會關閉并卸載，但不會把焦點移到另一個會話頭部動作。會話打開失敗時，即使存在暫定的緩存 projection，也會隱藏觸發器。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

瀏覽器插件以順序 10 向 `conversation.session.header.actions` 貢獻 `schedule-catalog`，位于靜態 agent（智能體）與 subagent 上下文之后、后臺任務之前。它通過標準會話鉤子讀取 `openState`，通過 `useProjection('schedule')` 讀取完整值；彈層開合是它唯一的本地交互狀態。組件把目錄 portal 到 `document.body`，并將觸發器與面板 ref 交給 `useAnchoredPosition`；該 hook 在測量已渲染面板后發布 fixed 坐標，使面板位于觸發器下方 5px、鉗制在 16px 視口邊距內，并在 resize、捕獲階段 scroll 與面板 resize 時重新測量。目錄 ref 也讓 portal 內的指針按下繼續屬于既有 dismissal 邊界之內。瀏覽器格式化使用查看方的 locale、時區與時鐘，持久 Schedule 記錄保持不變。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | 瀏覽器入口：注冊 locale 并貢獻會話頭部 slot |
| [`src/client/ScheduleCatalogAction.tsx`](src/client/ScheduleCatalogAction.tsx) | 可見性、排序、格式化、彈層與鍵盤行為 |
| [`src/client/locales.ts`](src/client/locales.ts) | 中英文目錄文案 |
| [`src/index.ts`](src/index.ts) | 空的 Host apply，使 Loader 可以尋址該可選瀏覽器功能 |
| — | 不發布運行時不變量伴生入口；這個只讀客戶端目錄不擁有可變的跨插件狀態。 |

[持久 Web Schedule Agent Note](../../../.agents/notes/implemented/feature/2026-08-05-durable-web-schedule.zh.md) 擁有活動 projection 與 opt-in 呈現邊界；本包擁有目錄的時間與無障礙行為。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當目錄本身不夠用時閱讀以下頁面。它們從瀏覽器呈現逐步進入持久 Schedule 狀態與共享 projection 傳輸。

- [Schedule 包](../../schedule/schedule/README.zh.md)——創建、列出、取消并交付這里顯示的提醒。
- [Schedule 子系統](../../../docs/subsystems/schedule.zh.md)——持久記錄、轉換與交付語義。
- [會話投影子系統](../../../docs/subsystems/session-projection.zh.md)——本包讀取的完整值傳輸。
- [客戶端包映射](../README.zh.md)——相鄰的瀏覽器 UI 包。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為本包只為人類渲染已經完成的客戶端 projection，從不改變提示詞、消息、schema、流或工具結果。

#### KV Cache 影響

無；本包從不組裝或發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制界定當前 Schedule 目錄。它們是當前包約束，不是提醒服務對比或任務積壓。

- **僅含活動記錄**——終結性的 delete 與 dispatch 轉換會移除對應行；普通 transcript（文本記錄）仍是唯一的提醒交付歷史。
- **瀏覽器派生時間**——本地時間與相對時間標簽使用查看方瀏覽器當前的 locale、時區與時鐘。它們是呈現值，不是持久 Schedule 事實。
- **只讀界面**——創建與刪除提醒仍由 Schedule 工具負責；目錄沒有 mutation、Retry、acknowledgement、Toast 或交付回執語義。
- **要求會話打開成功**——打開失敗時，即使存在暫定緩存值也會隱藏，因為嚴格會話回放仍是權威。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
