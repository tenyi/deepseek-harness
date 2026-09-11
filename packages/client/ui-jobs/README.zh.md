---
description: "Web 后臺任務界面：列出本會話可見任務的會話頭部動作；供后臺任務體驗的用戶與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-jobs

[English](README.md) | 中文

## 概述

本包渲染 Web GUI 的后臺任務界面：一個會話頭部動作，打開后以彈層列出本會話可見的任務。它經運行時提供的 `jobsBySession` 鏡像讀取宿主計算的注冊表狀態，自身不發任何 RPC。觸發器只在會話至少有一個任務時出現，角標計數運行中與停止中的任務；終態行保持可見并弱化，直到注冊表把它們丟棄。模型對同一批任務的視角屬于 `dsh-tool-jobs`；本包是給人類看的只讀投影。

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

與運行時一起掛載本插件；只要會話至少有一個任務，任務動作就會出現在會話頭部。點擊打開彈層：活躍行在前按開始時間升序，隨后終態行按結束時間降序，每行顯示生產者 kind、標簽、狀態，以及一個活躍時每秒跳動、完成后凍結的已耗時。

### 關閉與邊界

Escape 關閉列表并把焦點交還觸發器，在其外部按下指針同理。列表展示的是「一個會話通過協議視圖能看到什么」，因此別的會話擁有的任務在這里永不出現；進程重啟會清空列表，而 transcript（文本記錄）里啟動這些任務的 `run_in_background` 卡片仍在。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本包向 `conversation.session.header.actions` 貢獻一個條目（`JobListAction`），數據完全來自會話控制器綁定從 `session/jobs` 幀折疊出的 `jobsBySession` 列表鏡像——不發 RPC，除彈層開合外不持有任何狀態。角標計數 `running` 加 `stopping`，為零時省略。行序為活躍行在前按 `startedAt` 升序、終態行按 `finishedAt` 降序，毫秒并列按啟動順序打破；缺少 `finishedAt` 的終態行讀作零而不是負數，超過一小時的耗時停留在小時單位。終態行保持可見，因為失敗任務的 `detail` 是其失敗唯一可讀之處。行為由 [Web 后臺任務展示 Agent Note](../../../.agents/notes/implemented/feature/2026-08-08-web-background-job-display.zh.md) 規定。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當任務界面本身無法滿足需要時，請閱讀以下頁面。它們從瀏覽器列表進入注冊表與面向模型的工具。

- [dsh-tool-jobs](../../jobs/tool-jobs/README.zh.md)——同一注冊表之上的面向模型任務工具。
- [會話控制器](../../api/session-controller/README.zh.md)——折疊出本包讀取的 `jobsBySession` 鏡像。
- [ui-subagent](../ui-subagent/README.zh.md)——subagent 目錄，運行中的一次性后臺 subagent 也會出現在那里。
- [Web 客戶端架構](../../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.zh.md)——瀏覽器插件行如何加載并注冊 slot。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為本包為人類渲染宿主計算出的注冊表狀態，不觸及提示詞、消息、schema、流或工具結果。

#### KV Cache 影響

無；本包從不組裝或發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制界定了當前任務列表。它們是當前包約束，不是通用任務管理對比或任務積壓。

- **行是只讀的**——任務的流式輸出與人類發起的取消是各自獨立的階段。取消還額外欠一個 seam 沒有回答的、面向模型的決策：`kill()` 會把終態投遞標為已上報，所以照當前契約寫出來的中斷會讓模型一直以為它的任務還在跑。
- **列表不等于注冊表自己的集合**——它展示的是一個會話通過協議視圖能看到什么，因此別的會話擁有的任務在這里永不出現；進程重啟會清空列表，而 transcript 里啟動這些任務的 `run_in_background` 卡片仍在。無主任務（沒有活體 `Agent` 時啟動的）反過來會進入每個會話的列表，與 `list(caller)` 對每個調用方的報告一致。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。本包只是將 `jobsBySession` 鏡像以只讀方式投影為一個會話頭部 slot 條目，不發出 Cordis 事件，也不持有跨插件可變狀態；其唯一的 slot 注冊通過 HMR（熱模塊替換）安全性規范驗證了資源釋放行為。
