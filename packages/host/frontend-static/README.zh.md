---
description: "Web 殼的 SPA dist 服務器：占據 webserver 回退席位，以遍歷拒絕與 SPA index 回退服務已構建的前端。"
kind: "package-reference"
---

# @deepseek-ai/dsh-host-frontend-static

[English](README.md) | 中文

## 概述

從配置的發布目錄向瀏覽器提供已構建的 Web 殼。根路徑與配置的 index 路徑渲染包含啟動信息的 index；已有資產直接提供，而缺失或非文件路徑返回 404、路徑遍歷返回 403、不支持的方法返回 405。訪問 index 需要有效的進程 token 或瀏覽器 cookie，但靜態資產仍可公開訪問。同一時間只能有一個實例處理未匹配的路由；第二個實例啟動失敗，卸載活動實例后，未匹配的請求返回 404。

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

在服務已構建 Web 殼的瀏覽器宿主中組合本插件：它占據 webserver 的回退席位，并應答所有未被具名路由命中的請求。它只需要一個配置值——已構建前端的 `index.html` 位于何處。

### 最小配置

```yaml
- name: '@deepseek-ai/dsh-host-frontend-static'
  config:
    distIndex: /absolute/path/to/dist/index.html
```

`distIndex` 是組合應用的組裝事實：[`dsh-web-app`](../../bundle/web-app/README.zh.md) 通過前端包的 exports 解析它并掛載本插件；部署絕不硬編碼它。

### 服務器實施的約束

請求從 dist 根目錄（包含 `distIndex` 的目錄）提供。dist 根目錄與配置的 index 路徑以 HTTP 200 渲染 `index.html`；任何其他已有文件按自身 MIME 類型直接提供，未知擴展名按 `application/octet-stream` 提供。解析到根目錄之外的路徑以 403 拒絕，因此精心構造的路徑無法讀取 dist 之上的文件。dist 根目錄內不存在或不是文件的目標——文件缺失、目錄或配置的 index 缺失——返回空 404。沒有匹配具名路由的非 GET／HEAD 請求返回 405。每個成功的 index 響應都經 webserver 的 `renderIndex` 渲染，因此啟動 manifest（元數據清單）會通過 `/` 與配置的 index 路徑送達頁面。

根路徑與配置的 index 響應會在讀取 HTML 前調用 `ctx.connection.authorizeIndex`。有效進程 token 會得到 303 重定向與持久瀏覽器 cookie；已有有效 cookie 時直接提供 index；其他 index 請求得到 Connection 所有的 401 響應。非 index 文件仍是公開靜態資源。Token、cookie、過期時間與簽名記錄語義都歸 Connection 所有。

### 可觀察的失敗

遍歷返回 403 而不是錯誤頁。dist 根目錄內不存在或不是文件的目標返回空 404，因此失效鏈接或拼錯的 pathname 是顯式失敗，而不是靜默的 SPA 回退。第二次占據席位會拋錯，而席位無人占據時 webserver 返回 404——本插件的 fiber 被 dispose（資源釋放）后，瀏覽器看到的就是該響應。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

### 設計理念

本包是圍繞 `serveStatic` 的一個函數插件：`apply` 從 `distIndex` 解析出 dist 根目錄，構建一個對原始 `index.html` 運行 `ctx.webServer.renderIndex` 的 `renderIndex` 閉包，并在 effect 作用域下注冊回退 handler。按 webserver 的約定，席位只有單一所有者——第二次注冊會拋錯——且受 effect 作用域約束，因此 dispose fiber 即釋放席位。

### 遍歷柵欄

`serveStatic` 規范化請求的 pathname 并拼接到 dist 根目錄，然后要求目標就是根目錄本身或保持在它之下。檢查使用 `sep` 而非 `/`，因為 `resolve()` 在 Windows 上輸出反斜杠路徑，此時 `/` 后綴會把每個合法子路徑都當作遍歷拒絕。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | `serveStatic` 與 `apply`：回退占據、遍歷拒絕、index 渲染、MIME 表 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當服務約定不夠用時閱讀以下內容：先看席位所有者的約定，再看解析 dist 的組合與子系統參考。

- [Webserver](../webserver/README.zh.md)——本插件占據的回退席位與它運行的 index 轉換器。
- [dsh-web-app 組合包](../../bundle/web-app/README.zh.md)——解析 `distIndex` 并掛載本插件的應用。
- [HTTP 服務器子系統](../../../docs/subsystems/web-server.zh.md)——回退席位如何融入路由表。
- [生成配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-host-frontend-static)——每個受支持配置字段及其源聲明。

-----

<a id="model-experience"></a>
## 模型體驗

無。該 SPA dist 服務器只應答瀏覽器資產請求，不注冊任何面向模型的內容。

#### KV Cache 影響

無；該包既不組裝也不發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明某個資產類別何時尚未被覆蓋。它們是當前包約束，不是任務積壓。

- **初始 MIME 表很精簡**：它覆蓋 Vite 輸出的資產集合及實際交付的 PWA manifest；其他擴展名在相應資產類別發布前都會回退到 `application/octet-stream`。
- **Pathname 路由是顯式聲明**——當前客戶端從根目錄或配置的 index 路徑進入，沒有 History API pathname 路由。新增一條需要顯式服務器規則與真實組合覆蓋，而不是對每次未命中做寬泛回退。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。唯一受本包所有的關系是單個回退席位，但無法從 teardown 流中探測它：`internal/plugin` 在正在釋放的 fiber 執行 effect disposer 前觸發，因此通知發出時合法所有者仍占據席位，任何占位探測都會把每次正確釋放誤報為失敗；這不同于 webserver companion 對保留路徑的探測，后者不會與存活注冊沖突。席位的注冊／釋放對稱性由本包真實組合的 HMR（熱模塊替換）安全測試覆蓋。
