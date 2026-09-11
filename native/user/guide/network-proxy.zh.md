# 在網絡代理后面運行 DSH

[English](network-proxy.md) | 中文

DSH 會把自身的出站請求——模型調用、web 搜索、頁面抓取、走 HTTP 的 MCP 服務器——都經由標準代理環境變量所指定的代理發出。它在啟動時讀取這些變量，不需要其他配置。有幾條路徑出于設計或運行時限制保持直連，下文"哪些保持直連"一節列出了它們。

## 導出環境變量

```sh
export HTTPS_PROXY=http://127.0.0.1:7890
export HTTP_PROXY=http://127.0.0.1:7890
```

把這兩行寫進 shell 配置，這樣每次調用 `dsh` 都會繼承它們；也可以寫進 `$DSH_HOME/.env`（默認 `~/.dsh/.env`），和 API key 放在一起；導出的環境變量始終優先于該文件。項目自己的 `.env` 不能設置它們：它隨 `git clone` 一起到來，DSH 寧可拒絕啟動，也不讓一個倉庫決定你的流量去向。

需要憑據的代理把憑據寫在 URL 里：`http://user:password@proxy.example:8080`。DSH 絕不會回顯這個 URL：診斷只點名被拒絕的變量，因此用戶名和密碼都不會出現在任何地方。

## 為什么瀏覽器走代理、終端卻不走

這是最常見的意外，而且并非 DSH 特有。**根本不存在一個所有軟件都遵循的"系統代理"**——實際上有三套互不相干的機制：

| 機制 | 誰會遵循 |
|---|---|
| 操作系統的代理設置 | Safari、絕大多數 macOS 原生應用、Chrome 與 Edge |
| `HTTP_PROXY` / `HTTPS_PROXY` 環境變量 | `curl`、`git`、`npm`、`pip` 以及 DSH |
| TUN 模式（虛擬網卡） | 所有程序，且對應用透明 |

Clash 這類代理軟件里的"系統代理"開關只寫第一套。瀏覽器會讀到它，命令行工具則永遠看不到。這就是為什么導出環境變量是一個獨立步驟，也是為什么打開 TUN 模式后兩者都能工作、且完全不需要變量。

DSH 不讀取操作系統的代理設置。請導出環境變量，或使用 TUN 模式。

## 指定哪些目標保持直連

`NO_PROXY` 列出需要直連的主機：

```sh
export NO_PROXY=internal.example.com,.corp.example.com,registry.local
```

一個條目寫的是主機名，它連同其下所有子域名一起匹配：`NO_PROXY=example.com` 也會讓 `api.example.com` 直連。前綴 `.` 或 `*.` 可以寫，含義相同。條目可帶 `:port`，`*` 則放行全部。

**CIDR 網段不生效。** 操作系統的繞過列表常含 `10.0.0.0/8` 或 `192.168.0.0/16` 這類條目；把它們復制進 `NO_PROXY` 不會有任何效果。請改用主機名或域名后綴。

不需要列出 `localhost` 或 `127.0.0.1`。DSH 始終繞過 loopback，否則它自己的 Web UI 與本地服務器都會經由代理并形成回環。

## 值得知道的限制

**不支持 SOCKS 代理。** `socks5://` 形式的值會在啟動時被報告并跳過，指定它的那個 scheme 轉為直連——把 `HTTPS_PROXY=socks5://…` 與一個可用的 `HTTP_PROXY` 一起設置時，`https:` 會保持直連，而不會去借用 HTTP 代理。請把變量指向代理軟件的 HTTP 端口——多數軟件兩者都提供，且 HTTP 端口通常就在相鄰的端口號上。

**只設 `ALL_PROXY` 也夠用。** DSH 會用它為兩種協議兜底，盡管 Node 與 curl 在這一點上并不一致。顯式設置 `HTTPS_PROXY` 仍然更清楚。

**做 TLS 攔截的企業代理需要它的證書。** 如果代理已經可達但請求仍報證書錯誤，請在啟動前把 Node 指向你所在組織的 CA 包：

```sh
export NODE_EXTRA_CA_CERTS=/path/to/corporate-ca.pem
```

Node 只在進程啟動時讀取該變量，所以要在運行 `dsh` 之前導出。

**DSH 替你運行的工具遵循同一個代理。** bash 工具里的命令、`git`、`gh`，以及作為子進程啟動的 MCP 服務器都會繼承這些變量。子進程若本身是 Node 程序，則需 Node 22.21 或更高版本才會遵循；更舊的 Node 會直連。如果你的某個代理變量是 DSH 拒絕的值——比如 SOCKS URL——基于 Node 的工具同樣直連而不是起不來，`curl` 與 `git` 則仍會讀取那個值。

**代理 URL 里的密碼同樣會到達這些工具。** `HTTPS_PROXY=http://alice:s3cret@proxy.example:8080` 就是一個普通環境變量，因此 DSH 運行的每一條命令——包括模型編寫的那些——都能讀到它，而打印環境的命令會把密碼寫進被保留的輸出。這與該變量在你 shell 里對其他一切程序的行為一致。若這一點重要，請為代理提供一個無需憑據的入口，或改用 URL 之外的方式認證。

## 哪些保持直連

并非 DSH 發出的每個請求都會走代理：

- **本機上的一切。** loopback 始終直連：`localhost`、整個 `127.0.0.0/8` 段、`::1` 與 `0.0.0.0`。代理無法有意義地訪問一個只在本地監聽的服務。
- **模型編寫的代碼。** workflow 與 code-runtime worker 從不接收代理配置，因此模型編寫的腳本讀不到可能攜帶密碼的代理 URL。這類腳本只有自行配置才能聯網。
- **使用情況遙測。** OTLP 導出器用的是 Node 自帶的 HTTP 客戶端，而不是代理所配置的那個，因此遙測直連；在禁止直連出網的環境里它只會失敗。DSH 的任何功能都不依賴它。設 `DSH_TELEMETRY_MODE=DISABLED` 可完全關閉。
- **`web_fetch` 訪問字面量私網地址。** 形如 `http://10.0.0.5/` 的 URL 會被拒絕而非交給代理，與未配置代理時得到的拒絕相同。

## 驗證是否生效

讓 agent 抓取一個頁面，同時觀察代理軟件的連接日志：

```sh
dsh --profile headless "fetch https://example.com and tell me the page title"
```

如果請求沒有出現在那里，確認變量確實進入了 DSH 自己的環境：

```sh
env | grep -i proxy
```
