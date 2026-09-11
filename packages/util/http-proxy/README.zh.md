---
description: "Harness 的出站 HTTP 代理支持：從啟動環境解析出的一份策略，如何覆蓋到 Node fetch 本來會直連的每一個請求。"
kind: "package-reference"
---

# @deepseek-ai/dsh-http-proxy

[English](README.md) | 中文

## 概述

使用本包可為采用 Node 內置 `fetch` 的 Harness 請求應用一份出站 HTTP 代理策略，包括 LLM（大語言模型）、web 搜索與 HTTP MCP 流量。啟動器只讀取一次標準代理環境變量，普通 `fetch` 調用方無需額外引入或改動。loopback 流量保持直連；不受支持的代理 URL 會被報告，并針對受影響的協議跳過。公共輔助函數可讓調用方路由采用自有代理設置的傳輸、準備子進程環境，或為隔離回放清除代理變量。

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

無需掛載，也無需配置。`dsh` 啟動器會在第一個插件加載之前，為每個 profile 解析并安裝策略，因此導出了 `HTTPS_PROXY` 的用戶在所有位置都會走代理。本包是庫而非插件，因為傳輸策略每個進程只有一個答案：沒有第二個實現可替換，也沒有比進程更窄的作用域可賦予。

### 編寫新的出站調用

普通 `fetch()` 已經走代理，任何最終落到 `globalThis.fetch` 的 SDK 也一樣——MCP HTTP 傳輸與 pi-ai 提供方棧都是如此。自建傳輸的 SDK 則不會走代理，而本倉庫隨附的 SDK 中已有兩個如此。不要對任何 SDK 想當然，去查。

| 你要寫的東西 | 使用 |
|---|---|
| 普通請求，或最終落到 `globalThis.fetch` 的 SDK | 什么都不用——全局 dispatcher 已經在路由它 |
| 需要按“這次請求是否走代理”分支的調用 | `proxyRouteFor(url)` |
| 接受自有代理 URL 的 SDK | `proxyRouteFor(url)`，把 `route.proxy` 傳進去 |
| 由你自己構造環境的 spawn | 把 `proxyEnvironmentForChild()` 應用到該 spawn（`undefined` 表示刪除） |
| 必須連到自帶 fixture（測試前置數據）服務器的 harness | 把 `clearedProxyEnv()` 應用到該 spawn |

`proxyRouteFor` 給出的不只是答案，還有該答案所假定的傳輸：走代理的那一支攜帶著此刻正按該策略路由的 dispatcher。若調用方先讀策略、再自建傳輸，卸載就可能落在兩次讀取之間，把請求發往其分支從未放行的去處。

自建傳輸的 SDK 接觸不到上述任何一條，而本倉庫隨附的 SDK 里有兩個如此。E2B 接受自有代理 URL，現在接收 `route.proxy`。OTLP 遙測導出器通過 `node:http` 投遞，被有意保留為直連——見下方限制一節。

構造 `new Agent(...)` 再作為 `dispatcher` 傳入會覆蓋全局 dispatcher，從而靜默繞開代理。`verify-no-bare-dispatcher` 會在本包之外拒絕該寫法。有一處調用點確實自有傳輸——`web-fetch-http` 會把請求釘在它已校驗過的地址上，而這是進程級 dispatcher 無法承載的單次請求狀態——它在該行用 `proxy-exempt:` 注釋說明。

該門禁看不進 SDK 內部，因此倉庫中每一個出網點都另有一份 `egress.spec.ts`：它驅動該點的真實代碼路徑穿過一個假代理，并斷言代理確實收到了請求——遙測那份則斷言代理什么也沒收到。新增出網點就補一份。它是唯一能雙向發現 SDK 在我們腳下更換傳輸的手段：OTLP 與 E2B 這兩個漏洞正是這樣被發現的，而某次升級若開始靜默地把遙測送去代理，也由它攔下。

### 策略讀取哪些值

`http_proxy`、`https_proxy`、`no_proxy` 與 `all_proxy`，小寫優先、大寫兜底，空值視為未設置。`ALL_PROXY` 為兩種協議兜底，HTTPS 最后回退到 HTTP 代理——其中第一條 Node 與 undici 都不會自行推導。取值來自啟動器的快照：先看導出的環境變量，再看 `$DSH_HOME/.env`。項目自己的 `.env` 不能攜帶這些名字——那個文件隨 clone 一起到來，啟動器寧可拒絕啟動，也不讓一個倉庫決定 Harness 把流量發往何處。

loopback 始終被繞過——`localhost`、整個 `127.0.0.0/8` 段、`::1`、`0.0.0.0`，以及它們的 IPv4 映射寫法。否則 Harness 自己的 Web UI、Connection 傳輸以及每一個本地測試服務器都會經由代理并形成回環。發布出去的繞過列表只包含讀取環境的消費者能匹配的四個字面量條目；`proxyForUrl` 自行識別整個網段，因為列表條目無法表達一個范圍。

### 失敗處理

本包無法使用的代理值——SOCKS 或 PAC URL、無法解析的字符串、不受支持的協議——會被報告并跳過，該 scheme 轉為直連。該變量可能是用戶為其他工具導出的，不應因此阻止 agent（智能體）啟動。

-----

<a id="understand-the-implementation"></a>
## 理解實現

### 設計理念

**一次解析，一個匹配器。** `proxyForUrl()` 與已安裝的 dispatcher 絕不能對同一個 URL 給出不同答案，否則 `dsh-web-fetch-http` 會把 dispatcher 本打算隧道轉發的連接固定到某個地址上。因此該 dispatcher 是一個 `Agent`，其按 origin 調用的 `factory` 自身調用 `proxyForUrl()`，不存在可能與第一個解析器產生漂移的第二個解析器。undici 的 `EnvHttpProxyAgent` 在此無法勝任：沒有 `HTTPS_PROXY` 時它讓 `https:` 復用 HTTP 代理，于是本包在拒絕用戶為該 scheme 指定的 URL 后本應保持直連的 scheme 仍會被隧道轉發。

**子進程繼承用戶自己的值，以及用戶未設置部分的解析結果。** 用戶以任一大小寫指定過的 scheme，會以他們書寫的形式原樣傳給子進程，因此用戶為 `curl` 設置的 SOCKS 代理絕不會被替換成為其他 scheme 指定的 HTTP 代理。兩種大小寫都未指定的 scheme 則攜帶解析值，否則子進程的路由會與父進程分歧：Node 的 `NODE_USE_ENV_PROXY` 不讀 `ALL_PROXY`。繞過列表始終采用解析結果——它只會追加 loopback 條目，用戶寫下的內容不會丟失。讓父子進程只有一個路由答案的代價是：`curl` 也會看到本包由 HTTP 代理推導出的 `https:` 代理。有一處例外是為了保護子進程自身：當子進程收到的某個值是本包拒絕過的——比如為 `curl` 保留的 SOCKS URL——就不再設置 `NODE_USE_ENV_PROXY`，因為 Node 在該標志下會在運行程序之前先解析 `HTTP_PROXY` 與 `HTTPS_PROXY`，遇到這類值直接退出。此時子 Node 直連（本進程已為該協議如此報告），而不是根本起不來。

### 源碼地圖

| 文件 | 承載 |
|---|---|
| `src/policy.ts` | 解析與繞過匹配；診斷只點名變量，從不帶出它的值。不引入任何傳輸實現，因此在沒有 undici 的環境中仍可加載。 |
| `src/install.ts` | 全局 dispatcher、生效策略記錄、路由與子進程環境。動態引入 undici。 |
| `src/index.ts` | 本包的對外接口：四個函數與一個類型。 |

### 繞過匹配

一個條目寫的是主機名，它連同其下所有子域名一起匹配：`NO_PROXY=example.com` 也會放行 `api.example.com`。前綴 `.` 或 `*.` 可以寫，含義相同。條目可帶 `:port`，`*` 則放行全部。帶方括號與裸寫的 IPv6 字面量都能匹配——裸寫的 `::1` **不會**被讀成主機 `:` 端口 `1`，而 undici 自帶的匹配器正是這樣出錯的，這也是解析結果中同時攜帶 `::1` 與 `[::1]` 的原因。CIDR 不參與匹配：操作系統的繞過列表常含 `10.0.0.0/8`，必須改寫成后綴形式。

-----

<a id="further-exploration"></a>
## 進一步探索

- [網絡代理指南](../../../docs/user/guide/network-proxy.zh.md)——需要導出什么，以及為什么瀏覽器走代理而終端不走。
- [`dsh-web-fetch-http`](../../web/web-fetch-http/README.zh.md)——唯一一個安全規則會因代理而改變的消費方。

-----

<a id="model-experience"></a>
## 模型體驗

無。本包只承擔傳輸策略：它改變字節如何抵達網絡，不注冊任何提示詞、schema 或結果文本。

#### KV Cache 影響

不會直接失效：本包不貢獻任何請求 token，也從不改變請求前綴，因此提供方緩存復用不受影響。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制界定了本包不適用的場景，屬于當前的包級約束。

- **不支持 SOCKS、PAC 或操作系統代理探測**——只接受來自環境的 `http(s)://` 代理 URL。不會讀取 macOS 或 Windows 的系統代理設置，因此僅在代理軟件里撥了開關的用戶仍須導出環境變量；SOCKS URL 會被報告，且該協議保持直連，不會借用另一協議的代理。
- **不支持自定義證書頒發機構**——做 TLS 攔截的企業代理需要在啟動前為進程設置 `NODE_EXTRA_CA_CERTS`，本包既不設置也不校驗它。
- **spawn 出的子進程只在足夠新的運行時上遵循策略，且僅當它繼承的每個值都是 Node 接受的**——它通過 Node 的 `NODE_USE_ENV_PROXY` 讀取已發布的環境（22.21+、24+），而 engines 范圍允許 22.19 與 22.20，在這兩個版本上這樣的子進程保持直連。若用戶環境里還有 SOCKS 或其他被拒的代理，所有子 Node 都保持直連：不設置該標志，子進程才起得來。子進程還會按 Node 自己的 `NO_PROXY` 規則匹配繞過條目，其分隔符與 IPv4 區間處理與本包不同。本進程內不依賴任何 Node 版本：每一次進程內請求都會落到全局 dispatcher。
- **遙測按設計直連**——OTLP 導出器通過 `node:http` 投遞，全局 dispatcher 觸及不到。要讓它走代理，要么依賴 `http.Agent` 的 `proxyEnv`，而該選項晚于本項目支持的最低 Node 版本；要么改用 SDK 的 `fetch` 傳輸，但它沒有壓縮能力，而隨附配置啟用了 gzip。遙測是唯一一條丟失后不會讓用戶付出任何代價的通道，因此維持原狀；`DSH_TELEMETRY_MODE=DISABLED` 可關閉它。
- **執行由模型編寫的代碼的 worker 完全不獲得代理**——`code-runtime` worker 與 `workflow` worker 都不接收代理配置，它們自身的請求直連。代理 URL 可能攜帶 `user:password`，而兩者運行的都是模型寫的腳本。
- **防回歸門禁只看源碼，看不到依賴內部**——`verify-no-bare-dispatcher` 解析 `packages/*/*/src` 與 `apps/*/src`；測試、腳本以及第三方 SDK 的內部都在其之外。這正是每個出網點還各配一份 `egress.spec.ts` 的原因。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>面向維護者的工作上下文——點擊展開</summary>

userland undici 能觸及 Node 內置的 `fetch`，依賴的是兩者都會寫入 legacy 的 `Symbol.for('undici.globalDispatcher.1')` 槽位。那是跨版本的隱式耦合，不是約定——參見 [corepack#834](https://github.com/nodejs/corepack/issues/834) 中它失效的實例。`tests/install.spec.ts` 斷言真實請求會抵達一個 loopback 代理，因此破壞該耦合的版本升級會在那里失敗，而不是流到線上。

</details>

**運行時不變式：** 不發布伴生入口。本包唯一的可變狀態——生效中的策略——由單元測試對照它所安裝的 dispatcher 斷言：測試會對該注冊執行 dispose（資源釋放）并觀察一個真實的 loopback 代理。
