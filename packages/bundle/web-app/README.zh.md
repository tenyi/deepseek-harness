---
description: "dsh 的浏覽器 GUI：交互式聊天、模型與設定管理、工作階段历史，供執行 dsh web 表层的使用者使用。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-web-app

[English](README.md) | 中文

## 概述

執行 `dsh --profile web`，打開提供聊天、模型與設定管理以與工作階段历史的交互式浏覽器 GUI。它使用與其他 dsh 表层相同的模型存取、工具與安全預設值。啟動時會打印带認证資訊的 URL，通常还會在預設浏覽器中打開；SSH 工作階段和 `--no-open` 會保留該 URL，供你手动打開。你可以更改端口、允许额外主机，并用 `--host 0.0.0.0` 绑定所有網路介面。需要在浏覽器中交互式工作時選擇本包；一次性的命令列任務應使用 `dsh-headless`。

## 目录

- [使用本包](#use-this-package)
- [理解實現](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體验](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

啟動 GUI、打開浏覽器，然后開始與 agent（智能體）对話。flag 用於微调本次呼叫。

### 啟動 Web GUI

```sh
dsh --profile web
dsh --profile web --no-open --port 8080
```

啟動后你會看到 `dsh web:` 行，其根 URL 携带新的行程 token。除非 `--no-open` 或 SSH 工作階段抑制，否則預設浏覽器會打開該 URL、取得签名 cookie，再重定向到不含認证參數的根页面。页面加载且你可以與 agent 对話，就說明成功了。两种可预期的失败：前端未构建時，啟動會以构建提示停止（checkout 中執行 `pnpm run build`）；浏覽器無法打開時，stderr 會打印不含凭f64ee的诊断，但伺服器會继續執行——请自行打開已打印的啟動 URL。

### 設定

大多数使用者不需要設定這些；命令列 flag 會提供給下面四個設定——`--host`、`--port` 與 `--trusted-host` 来自本次呼叫，`--no-open` 仅对本次呼叫關閉浏覽器交接：

| 字段 | 預設值 | 含义 |
|---|---|---|
| `openBrowser` | `true` | 啟動后用預設浏覽器打開；SSH 啟動會抑制它 |
| `printUrl` | `true` | 啟動時打印 `dsh web:` URL 行 |
| `surfaceContext` | `true` | 給 agent 提供 GUI 定位上下文，并把 `DSH_WEB_URL` 暴露給其 shell 命令 |
| `trustedHosts` | `[]` | 允许从網路存取 GUI 的额外主机 |

生成的[設定目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-web-app)是每個受支援字段與其 JSDoc 的穷尽式真源。

### LAN 存取與可信主机

預設情况下 GUI 只接受本机的連線。绑定所有網路介面的部署也會允许 LAN 內的浏覽器存取，此時打印的 URL 會附带一個 LAN 位址；`--trusted-host` 在两种情况下都能新增额外主机。Host 與 Origin 檢查控制可达性，token 交换則認证每個 Host API 方法與 WebSocket 流。LAN 位址只在啟動時采樣一次，因此之后的網路变化不會被感知——重启 GUI 以重新公告。

### 透過 SSH 執行

透過 SSH 啟動 `dsh --profile web` 時，URL 行仍會打印，但不會為你打開浏覽器：本地转发位址由 SSH 客户端或编辑器持有。请在自己的机器上打開转发后的 URL；打印出的 URL 指向远端宿主机 loopback 端点。

### 按工作階段的 agent 設定

每個浏覽器工作階段都从随发行版交付的 preset（預設 `standard`）组合自己的 agent，而不是共享一套行程級工具集。你可以更改預設 preset，或在 `$DSH_HOME/.agent-presets` 下新增自己的 preset。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現细节——点击展開</summary>

本组合包是一份 patch 加一個執行時粘合插件。存储栈與投影快取来自 `dsh-base`；Web 叠加层的 workspace 與 message-feedback 行使用共享的 `storageDomain` 服務。patch 重述 base 刻意省略的表层专属值，插入仅 Web 使用的宿主行與浏覽器名录，然后把 agent 层改由 preset 承载；粘合插件负责 dist 服務、信任采樣、提示词段落、bash 变量與就绪宣告。

### patch 語义

patch 會替换目标行的整個 `config`，因此每個 Web 行都重述自己拥有的每個键：基础行上的 persona 前缀與后缀模板、`DSH_TOOLS_MODE` PTC mode 開關與 `session-query-sqlite` 值，随后 `insert` 新增 Web 宿主行、传输层與浏覽器名录。base 以行程級挂载的按 agent 工具行在這里被禁用，由 preset 名录接管；每项宿主层與 preset 层归属决策的理由以行內注释写在 patch 里。

### 就绪宣告

URL 行與浏覽器交接都是就绪信號：监督方一观察到該行就发起 RPC，浏覽器一打開就要求页面，因此两者只在 Loader 設定树结算且 Connection 認证可用后執行——在没有 Loader 的手工构建树中則立即執行。啟動中途被释放的树不會宣告任何內容。

### LAN 信任采樣

`resolveLanTrust` 在啟動時只采樣一次網路：loopback 绑定（`127.0.0.1`）不派生任何 LAN 位址，绑定所有网卡則會加入每個非 internal IPv4 字面量。派生字面量加上显式的 `--trusted-host` 权威标識组成 `/api` 浏覽器信任栅栏，打印的 LAN URL 始终與該栅栏一致。

### 源码地图

| 檔案 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | `web-app` 粘合插件：dist 解析、LAN 信任采樣、提示词段落、bash 变量、URL 行、浏覽器交接 |
| [`src/startup.ts`](src/startup.ts) | `web-startup` 提供方：`--host`、`--port`、`--trusted-host`、`--no-open`、`--help` |
| [`cordis.patch.yml`](cordis.patch.yml) | Web patch：重述的基础值、Web 宿主行、浏覽器名录、由 preset 承载的 agent 层 |
| — | 不发布執行時不变式伴生入口；每项贡献（frontend-static 子插件、提示词段落、bashEnv 註冊）都會随 fiber 由註冊表释放，且每個所属註冊表的包负责該關系的不变式；本包不持有需要审计的可变狀態。 |
| [`tests/web-app.spec.ts`](tests/web-app.spec.ts) | dist 解析、回退席位、提示词段落、就绪宣告 |
| [`tests/startup.spec.ts`](tests/startup.spec.ts) | 在真实 Loader 树上的命令列解析 |
| [`tests/trusted-hosts.spec.ts`](tests/trusted-hosts.spec.ts) | LAN 信任采樣 |
| [`tests/browser-open.spec.ts`](tests/browser-open.spec.ts) | 页面可达后的預設浏覽器交接 |

### 不变式归属

不发布不变式伴生入口，因為每项贡献——frontend-static 子插件、提示词段落與 bash 变量註冊——都會随 fiber 由註冊表释放，且每個所属註冊表的包负责該關系的不变式。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

当你想深入了解共享核心、浏覽器重载流水线或已构建的前端時，阅读以下页面。

- [组合包索引](../README.zh.md)——基於同一核心构建的表层。
- [dsh-base](../base/README.zh.md)——GUI 執行其上的共享核心。
- [dsh-client-hmr](../../client/hmr/README.zh.md)——開发期间客户端插件变更如何重载。
- [frontend-static](../../host/frontend-static/README.zh.md)——已构建的前端如何被服務。
- [生成設定目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-web-app)——每個受支援設定字段與其源声明。

-----

<a id="model-experience"></a>
## 模型體验

### Harness 源码與 Web 表层上下文

#### 模型看到什麼

当 `surfaceContext` 為 true 時，`harness:source` 段落标明磁盘上的 Harness 實現，但不會声称它就是工作目录；全局段落 `app:web-surface`（first-party 顺序 10100，位於可复用指令之后）則向模型說明 GUI：规范的本地 URL、「this page」指代什麼、更新約定（重载接收端始终開启；無刷新重载还需要 `pnpm run dev:web` watcher），以與不要啟動替代伺服器的指令。`DSH_WEB_URL` 还會连同描述出現在受管 bash 環境中，每次呼叫時从執行中的伺服器解析。当它為 false 時，這两個段落和該变量都不會註冊。

#### Token 影响

每個工作階段一行源码說明和一段提示词，外加两行受管環境变量；每個行程內保持恒定。

#### KV Cache 影响

源码與 Web 段落位於第一方可复用指令之后。工具與設定一致時，不同 checkout 路径或本地端口不會改变前置前缀；不保证提供方复用快取。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制告诉你在不常見的環境下會遇到什麼——源码 checkout、SSH 工作階段或严格網路。它们是当前包約束，不是通用的浏覽器对比或任務积压。

- **前端必须已构建**——源码 checkout 需要先執行 `pnpm run build`；dist 缺失時啟動會以构建提示停止，且没有从源码直接服務的回退路径。
- **LAN 位址只在啟動時采樣一次**——啟動后的网卡变化不會重新公告；打印的 LAN URL 始终與采樣結果一致。
- **只能观察到交接的啟動**——GUI 只報告浏覽器被要求打開，而不是它确实打開了；之后的浏覽器退出永远不會上報，打印的 URL 是你的手动回退路径。
- **SSH 工作階段保留 URL 但跳過浏覽器交接**——打印的 URL 指向远端宿主机 loopback 端点；SSH 客户端或编辑器必须暴露并打開本地转发位址。
- **`BROWSER` 覆盖只能来自環境**——被发現的 `.env` 不能設定 `BROWSER`；只有继承值能為自动交接選擇可执行檔案。

<a id="dev-note"></a>
### 開发备注

<details>
<summary>维护者的工作上下文——点击展開</summary>

無。

</details>
