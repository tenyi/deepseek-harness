---
description: "dsh 的瀏覽器 GUI：交互式聊天、模型與設定管理、工作階段歷史，供執行 dsh web 表層的使用者使用。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-web-app

[English](README.md) | 中文

## 概述

執行 `dsh --profile web`，打開提供聊天、模型與設定管理以與工作階段歷史的交互式瀏覽器 GUI。它使用與其他 dsh 表層相同的模型存取、工具與安全預設值。啟動時會打印帶認證資訊的 URL，通常還會在預設瀏覽器中打開；SSH 工作階段和 `--no-open` 會保留該 URL，供你手動打開。你可以更改端口、允許額外主機，并用 `--host 0.0.0.0` 綁定所有網路介面。需要在瀏覽器中交互式工作時選擇本包；一次性的命令列任務應使用 `dsh-headless`。

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

啟動 GUI、打開瀏覽器，然后開始與 agent（智能體）對話。flag 用於微調本次呼叫。

### 啟動 Web GUI

```sh
dsh --profile web
dsh --profile web --no-open --port 8080
```

啟動后你會看到 `dsh web:` 行，其根 URL 攜帶新的行程 token。除非 `--no-open` 或 SSH 工作階段抑制，否則預設瀏覽器會打開該 URL、取得簽名 cookie，再重定向到不含認證參數的根頁面。頁面加載且你可以與 agent 對話，就說明成功了。兩種可預期的失敗：前端未構建時，啟動會以構建提示停止（checkout 中執行 `pnpm run build`）；瀏覽器無法打開時，stderr 會打印不含憑f64ee的診斷，但伺服器會繼續執行——請自行打開已打印的啟動 URL。

### 設定

大多數使用者不需要設定這些；命令列 flag 會提供給下面四個設定——`--host`、`--port` 與 `--trusted-host` 來自本次呼叫，`--no-open` 僅對本次呼叫關閉瀏覽器交接：

| 字段 | 預設值 | 含義 |
|---|---|---|
| `openBrowser` | `true` | 啟動后用預設瀏覽器打開；SSH 啟動會抑制它 |
| `printUrl` | `true` | 啟動時打印 `dsh web:` URL 行 |
| `surfaceContext` | `true` | 給 agent 提供 GUI 定位上下文，并把 `DSH_WEB_URL` 暴露給其 shell 命令 |
| `trustedHosts` | `[]` | 允許從網路存取 GUI 的額外主機 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-web-app)是每個受支援字段與其 JSDoc 的窮盡式真源。

### LAN 存取與可信主機

預設情況下 GUI 只接受本機的連線。綁定所有網路介面的部署也會允許 LAN 內的瀏覽器存取，此時打印的 URL 會附帶一個 LAN 位址；`--trusted-host` 在兩種情況下都能新增額外主機。Host 與 Origin 檢查控制可達性，token 交換則認證每個 Host API 方法與 WebSocket 流。LAN 位址只在啟動時采樣一次，因此之后的網路變化不會被感知——重啟 GUI 以重新公告。

### 透過 SSH 執行

透過 SSH 啟動 `dsh --profile web` 時，URL 行仍會打印，但不會為你打開瀏覽器：本地轉發位址由 SSH 客戶端或編輯器持有。請在自己的機器上打開轉發后的 URL；打印出的 URL 指向遠端宿主機 loopback 端點。

### 按工作階段的 agent 設定

每個瀏覽器工作階段都從隨發行版交付的 preset（預設 `standard`）組合自己的 agent，而不是共享一套行程級工具集。你可以更改預設 preset，或在 `$DSH_HOME/.agent-presets` 下新增自己的 preset。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本組合包是一份 patch 加一個執行時粘合插件。存儲棧與投影快取來自 `dsh-base`；Web 疊加層的 workspace 與 message-feedback 行使用共享的 `storageDomain` 服務。patch 重述 base 刻意省略的表層專屬值，插入僅 Web 使用的宿主行與瀏覽器名錄，然后把 agent 層改由 preset 承載；粘合插件負責 dist 服務、信任采樣、提示詞段落、bash 變量與就緒宣告。

### patch 語義

patch 會替換目標行的整個 `config`，因此每個 Web 行都重述自己擁有的每個鍵：基礎行上的 persona 前綴與后綴模板、`DSH_TOOLS_MODE` PTC mode 開關與 `session-query-sqlite` 值，隨后 `insert` 新增 Web 宿主行、傳輸層與瀏覽器名錄。base 以行程級掛載的按 agent 工具行在這里被禁用，由 preset 名錄接管；每項宿主層與 preset 層歸屬決策的理由以行內注釋寫在 patch 里。

### 就緒宣告

URL 行與瀏覽器交接都是就緒信號：監督方一觀察到該行就發起 RPC，瀏覽器一打開就要求頁面，因此兩者只在 Loader 設定樹結算且 Connection 認證可用后執行——在沒有 Loader 的手工構建樹中則立即執行。啟動中途被釋放的樹不會宣告任何內容。

### LAN 信任采樣

`resolveLanTrust` 在啟動時只采樣一次網路：loopback 綁定（`127.0.0.1`）不派生任何 LAN 位址，綁定所有網卡則會加入每個非 internal IPv4 字面量。派生字面量加上顯式的 `--trusted-host` 權威標識組成 `/api` 瀏覽器信任柵欄，打印的 LAN URL 始終與該柵欄一致。

### 源碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | `web-app` 粘合插件：dist 解析、LAN 信任采樣、提示詞段落、bash 變量、URL 行、瀏覽器交接 |
| [`src/startup.ts`](src/startup.ts) | `web-startup` 提供方：`--host`、`--port`、`--trusted-host`、`--no-open`、`--help` |
| [`cordis.patch.yml`](cordis.patch.yml) | Web patch：重述的基礎值、Web 宿主行、瀏覽器名錄、由 preset 承載的 agent 層 |
| — | 不發布執行時不變式伴生入口；每項貢獻（frontend-static 子插件、提示詞段落、bashEnv 註冊）都會隨 fiber 由註冊表釋放，且每個所屬註冊表的包負責該關系的不變式；本包不持有需要審計的可變狀態。 |
| [`tests/web-app.spec.ts`](tests/web-app.spec.ts) | dist 解析、回退席位、提示詞段落、就緒宣告 |
| [`tests/startup.spec.ts`](tests/startup.spec.ts) | 在真實 Loader 樹上的命令列解析 |
| [`tests/trusted-hosts.spec.ts`](tests/trusted-hosts.spec.ts) | LAN 信任采樣 |
| [`tests/browser-open.spec.ts`](tests/browser-open.spec.ts) | 頁面可達后的預設瀏覽器交接 |

### 不變式歸屬

不發布不變式伴生入口，因為每項貢獻——frontend-static 子插件、提示詞段落與 bash 變量註冊——都會隨 fiber 由註冊表釋放，且每個所屬註冊表的包負責該關系的不變式。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當你想深入了解共享核心、瀏覽器重載流水線或已構建的前端時，閱讀以下頁面。

- [組合包索引](../README.zh.md)——基於同一核心構建的表層。
- [dsh-base](../base/README.zh.md)——GUI 執行其上的共享核心。
- [dsh-client-hmr](../../client/hmr/README.zh.md)——開發期間客戶端插件變更如何重載。
- [frontend-static](../../host/frontend-static/README.zh.md)——已構建的前端如何被服務。
- [生成設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-web-app)——每個受支援設定字段與其源聲明。

-----

<a id="model-experience"></a>
## 模型體驗

### Harness 源碼與 Web 表層上下文

#### 模型看到什麼

當 `surfaceContext` 為 true 時，`harness:source` 段落標明磁盤上的 Harness 實現，但不會聲稱它就是工作目錄；全局段落 `app:web-surface`（first-party 順序 10100，位於可復用指令之后）則向模型說明 GUI：規范的本地 URL、「this page」指代什麼、更新約定（重載接收端始終開啟；無刷新重載還需要 `pnpm run dev:web` watcher），以與不要啟動替代伺服器的指令。`DSH_WEB_URL` 還會連同描述出現在受管 bash 環境中，每次呼叫時從執行中的伺服器解析。當它為 false 時，這兩個段落和該變量都不會註冊。

#### Token 影響

每個工作階段一行源碼說明和一段提示詞，外加兩行受管環境變量；每個行程內保持恒定。

#### KV Cache 影響

源碼與 Web 段落位於第一方可復用指令之后。工具與設定一致時，不同 checkout 路徑或本地端口不會改變前置前綴；不保證提供方復用快取。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制告訴你在不常見的環境下會遇到什麼——源碼 checkout、SSH 工作階段或嚴格網路。它們是當前包約束，不是通用的瀏覽器對比或任務積壓。

- **前端必須已構建**——源碼 checkout 需要先執行 `pnpm run build`；dist 缺失時啟動會以構建提示停止，且沒有從源碼直接服務的回退路徑。
- **LAN 位址只在啟動時采樣一次**——啟動后的網卡變化不會重新公告；打印的 LAN URL 始終與采樣結果一致。
- **只能觀察到交接的啟動**——GUI 只報告瀏覽器被要求打開，而不是它確實打開了；之后的瀏覽器退出永遠不會上報，打印的 URL 是你的手動回退路徑。
- **SSH 工作階段保留 URL 但跳過瀏覽器交接**——打印的 URL 指向遠端宿主機 loopback 端點；SSH 客戶端或編輯器必須暴露并打開本地轉發位址。
- **`BROWSER` 覆蓋只能來自環境**——被發現的 `.env` 不能設定 `BROWSER`；只有繼承值能為自動交接選擇可執行檔案。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
