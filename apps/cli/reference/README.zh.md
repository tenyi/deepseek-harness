# `dsh` CLI（命令列介面）行為参考

[English](README.md) | 中文

本参考定義 profile 啟動、web 别名、插件管理和設定 dump 等命令模式。argv 由 [`src/args.ts`](../src/args.ts) 统一解析一次，[`src/bin.ts`](../src/bin.ts) 只會动态导入选中的執行器。

<a id="profile-boot"></a>

## Profile 啟動

`dsh --profile <name>` 啟動位於 `$DSH_HOME/profiles/<name>` 的 profile。生效設定树以空根节点為起点，依次叠加 profile manifest（元資料清單）的 `dsh.profile.bundles` 列表中指定的各组合包 patch、profile 自身的 `cordis.patch.yml`、home 級的 `$DSH_HOME/cordis.patch.yml`（這是各 profile 共享的机器本地偏好，因此优先於逐 profile 設定层），以與按 argv 顺序指定的各個 `--patch <path>` 覆盖层。对同一設定行，后應用的层优先。patch 會替换目标行的整個 `config` 值，而不是深度合并其中的键；patch 也可以插入新行。`dsh.profile.patchReload` 可選擇 `live` patch 檔案监视或 `startup` 單次加载；自定義 profile 省略該值時預設使用 `live`。設定解析、schema 校验、模块解析或插件啟動失败時，系統會報告錯誤并以非零狀態退出。收到 SIGINT 或 SIGTERM 時，挂载的根节点會先 dispose（资源释放）再退出。

组合包名称先从 dsh 安装目录解析，再从 profile 目录解析。因此，內置组合包（`@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app`、`@deepseek-ai/dsh-headless`、`@deepseek-ai/dsh-sdk-app`、`@deepseek-ai/dsh-sdk-minimal`、`@deepseek-ai/dsh-acp-app`）始终来自当前執行的 `dsh` 所属的安装；树外组合包則来自 profile 中由 pnpm 管理的 `node_modules`。patch 行中的裸插件 `name` 會从 profile 目录開始，按照 Node 的模块解析规則逐級向父目录查找，直至由 dsh 维护的安装后备目录 `$DSH_HOME/profiles/node_modules`。普通 Node 安装會為依赖闭包中的每個包放置并修复一個符號連結。pkg 可执行程序則放置真实 ESM 代理，镜像显式 exports 并重新导出虚拟包 URL，因為操作系統符號連結無法進入 pkg 的 `/snapshot` 檔案系統。每次啟動还會把仅由所选外部组合包携带的包經 dsh 自有目录連結到当前 profile 的 `node_modules`；已有 pnpm 条目优先，且每個 profile 独立拥有自己的連結。

`web`、`headless`、`sdk`、`sdk-minimal` 和 `acp` profile 首次使用時會从随附模板自动初始化（`web`：base + web-app，实時應用 patch；`headless`：base + headless，只在啟動時應用 patch；`sdk`：base + sdk-app，只在啟動時應用 patch；`sdk-minimal`：独立组合包，只在啟動時應用 patch；`acp`：base + acp-app，只在啟動時應用 patch）。其他缺失的 profile 會显式報错，并提示執行 `dsh plugin --profile <name> add <package>`。

`dsh --profile <name> --from-default-profile <template>` 會在啟動前，从上述五個随附模板之一初始化新的自定義目标。目标名称不能是随附 profile 名称，并且完整的目标 profile 目录必须不存在。launcher 會以独占方式领取該目录，因此残留檔案和另一個并发建立者都會在不作修改的情况下被拒绝。它把模板当前的组合包列表和 `patchReload` 值复制進一份依赖為空、使用者 patch 為空的新 manifest。它不會讀取 `<template>` 指定的本地同名 profile，不會复制其依赖或 patch，也不會持久化继承字段；模板列表之后的变化不會改写新 profile。复制列表中指名的內置组合包仍从当前 dsh 安装目录解析。初始化成功不會增加 launcher 输出。

profile 已經存在時，`--from-default-profile` 會被拒绝，且不會修改或啟動它；去掉該選項即可使用它。残留的目标目录同樣會被原樣保留，此時必须改用另一個 profile 名称。未知模板或随附目标名称會在建立目标之前失败；未知模板的诊断會列出有效模板。初始化在组合包解析和應用啟動之前提交，因此后續失败仍會把新 profile 留在磁盘上，重试時需要去掉建立選項。`--dump-config` 和 `--dump-default-config` 接受該選項：它们初始化目标并打印所要求的設定树，但不啟動應用。

```sh
dsh --profile rescue --from-default-profile web
dsh --profile rescue
```

### 應用參數

啟動器自身的 flag 必须写在最前面，并在遇到第一個無法識别的 token 時結束；从該 token 開始的所有內容都會透過 `ctx.cmdlineArgs` 原樣交給已啟動的 profile，注入該 profile 的任意應用插件都可以解析這些內容（[`dsh-cmdline`](../../../packages/boot/cmdline/README.zh.md)）。因此，`dsh --profile rescue --from-default-profile web --no-open` 會先初始化，再把 `--no-open` 交給 Web；`dsh --profile web --port 8080` 會将 `--port` 交給 web 應用；`dsh --profile web --help` 只打印該應用的帮助資訊，不啟動應用；`dsh --help` 没有可供交付參數的 profile，因此會打印啟動器自身的帮助資訊。`-V`/`--version` 位於應用參數边界之前時，會打印啟動器的版本。

每套组合只會挂载一次。普通插件注入 `cmdlineArgs`，解析所属應用的參數，并将解析結果作為服務提供。每個从 flag 取值的設定行都會注入該服務；Loader 會等到服務激活后，再对該行的設定求值（`port: !!js ctx.webStartup.port ?? 3080`），因此 flag 的优先級高於設定行中写明的值。要维持這一优先級，設定行必须保留該表达式；如果使用者 patch 用字面量替换整個 `config`，也會随之移除執行時讀取。帮助參數和被拒绝的參數都會要求退出：參數被拒绝時以非零狀態退出，顯示帮助時以 0 退出；依赖該提供方服務的設定行不會激活。在 `patchReload: live` profile 中，编辑 patch 檔案會根f64ee仍在執行的服務重新计算表达式，因此不會重置当前正在使用的端口。

啟動器的 flag 必须写在應用參數之前，且啟動器的解析器會消耗掉一個 `--`：必须以字面量 `--` 送达應用的參數需要写成 `-- --`。如果應用的第一個參數恰好等於 `web` 或 `plugin`，會選擇对應的子命令。`ctx.cmdlineArgs.get()` 是共享的不可变讀取：多個插件可以解析同一份快照，没有讀取方的 profile 則會忽略自己的應用參數。

随附的應用接受以下命令列參數：

| Profile | 參數 |
|---|---|
| `web` | `--host`、`--port`、可重复的 `--trusted-host`、`--no-open` |
| `headless` | 任務文本，作為位置參數 |
| `sdk` | 無選項；stdio 携带 JSON-RPC 通訊協定 |
| `sdk-minimal` | 無選項；stdio 携带相同的 JSON-RPC 通訊協定 |
| `acp` | 無選項；stdio 携带 ACP（Agent Client Protocol） |

一次性任務（`dsh --profile headless "run the tests"`）透過核心註冊表建立一個全新的持久化 Agent（智能體），提交任務、等待完全停稳并对工作階段执行 flush，再从其持久化事件区间中推导最后一個非空 assistant 文本與最终 `turn/end` 原因。它在 `dsh: reasoning:` 标题下将非空的提供方推理（reasoning）增量流式寫入 stderr，只在 stdout 打印最终文本，并在原因為 `completed` 時以 0 退出，否則以 1 退出；没有推理內容的成功回應會保持 stderr 為空。没有任務的呼叫是該應用的用法錯誤。随附 headless profile 不挂载浏覽器 Connection、HTTP 伺服器、Web 執行時或浏覽器客户端，也不會打開监听端口。

可在不啟動的情况下檢查组合出的設定树：

```sh
dsh --profile web --dump-default-config
dsh --profile web --patch ./extra.yml --dump-config
```

`--dump-default-config` 只打印组合包各层；`--dump-config` 额外加上 profile 的 `cordis.patch.yml`、home 級的 `$DSH_HOME/cordis.patch.yml` 和 `--patch` overlay。两者都會打印注释，标明每行由哪個檔案提供，以與哪些 overlay 修改過它；`!!js` 表达式保持未求值，插入行中的相对插件名以各自 patch 檔案所在目录解析，找不到目标的 patch 會報告到 stderr。dump 操作會初始化缺失的 profile 檔案，但不會准备 `$DSH_HOME/profiles/node_modules` 下的執行時模块 fallback。它不會執行應用的命令列參數提供方，因此展示的是解析任何應用參數之前的组合設定树；如果呼叫中包含應用參數，dump 會拒绝該呼叫。

## 插件管理

`dsh plugin --profile <name> <args...>` 在 profile 缺失時先初始化它（有随附模板的用模板，其他名称只装 `@deepseek-ai/dsh-base`），然后以 profile 目录為工作目录，把 `<args...>` 转发給 `pnpm`：`add`、`remove`、`why`、`update` 與其他所有 pnpm 子命令都照常可用；pnpm 必须在 PATH 上。相对路径 spec（`.`、`../plugin` 與其 `file:`/`link:` 形式）會先锚定到呼叫目录，因此在插件 checkout 中执行 `add .` 安装的是該 checkout，而不是 profile。每次成功執行后，系統都會根f64ee当前安装狀態更新 `dsh.profile.bundles`：如果某项依赖解析到的包在 manifest 中声明了 `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`，該依赖就會加入設定层栈；如果某项依赖在 `update` 后获得該声明，也會随即激活。没有组合包声明的依赖仍作為普通依赖保留，并顯示一次性警告；已移除的依赖則从設定层栈中刪除。

Codex 與 Claude Code subagent 提供方是两個彼此独立的可选组合包。可以只新增一個包、在同一命令中新增两個包，或独立移除任一包：

```sh
dsh plugin --profile <name> add @deepseek-ai/dsh-subagent-codex
dsh plugin --profile <name> add @deepseek-ai/dsh-subagent-claude-code
dsh plugin --profile <name> add @deepseek-ai/dsh-subagent-codex @deepseek-ai/dsh-subagent-claude-code
dsh plugin --profile <name> remove @deepseek-ai/dsh-subagent-codex
dsh plugin --profile <name> remove @deepseek-ai/dsh-subagent-claude-code
```

pnpm 操作成功后會改变磁盘上的 Profile manifest 與组合包列表；正在執行的 Profile 會保留本次啟動時的组合包集合。新增、移除或更新组合包后须重启該 Profile。這個啟動边界只适用於组合包成員变化，Profile 或 home 中普通 `cordis.patch.yml` 的编辑透過熱重载生效。下一次啟動時，每個已安装组合包只註冊自己的休眠 Host 提供方；还须在复制出的 Preset 中單独启用对應工具行，新 Agent 才能看到該工具。[Codex provider README](../../../packages/subagent/subagent-codex/README.zh.md) 與 [Claude Code provider README](../../../packages/subagent/subagent-claude-code/README.zh.md) 负责可执行檔案、身份驗證、载荷與失败细节；[base 组合包参考](../../../packages/bundle/base/README.zh.md) 负责預設依赖闭包。

```sh
dsh plugin --profile tui add github:deepseek-harness/turtle-ui
dsh plugin --profile tui remove turtle-ui
dsh --profile tui
```

随源码发布的 Git 托管插件會在安装期间透過 `prepare` 脚本构建，而 pnpm ≥10 預設會阻止該脚本，直到使用方明确允许。首次執行 `add` 會失败，并顯示 pnpm 的 `allowBuilds` 提示；dsh 还會提示應修改該 profile 的 `pnpm-workspace.yaml`。将输出的键复制到該檔案后，重新執行命令即可。安装已經构建好的 tarball 或本地 checkout 時，無需加入 `allowBuilds`。

## Web 别名

`dsh web` 是 `--profile web` 的硬编码别名；写在它之后的 flag 属於 web 應用，由组合包中的普通提供方解析。`--host` 和 `--port` 覆盖承载它们的那些行的组合取值，可重复的 `--trusted-host` 透過 `ctx.webRuntime.trustedHosts` 提供本次呼叫的 authority（部署表达式會拼接自己的 authority），`--no-open` 則只对本次呼叫關閉預設浏覽器交接。客户端插件 HMR（熱模块替换）接收器始终挂载，在單独執行的 `pnpm run dev:web` watcher 重建客户端 bundle 之前保持空闲。

```sh
dsh web
dsh web --no-open
dsh web --patch ./extra.cordis.yml
dsh web --dump-config
dsh web --help
```

生产 Web 執行器需要已构建的包和前端产物（`pnpm run build`）。預設服務位址是 `http://127.0.0.1:3080`；本机啟動時，只在完整 Loader 設定树结算后才用預設浏覽器打開該规范宿主机 URL。继承的 `SSH_CONNECTION` 或 `SSH_TTY` 非空時會跳過浏覽器交接，因為本地转发位址由 SSH 客户端或编辑器持有；宿主机 URL 仍會打印。`--host 0.0.0.0` 會绑定所有網路介面以便 LAN 存取——此時 `/api` 信任栅栏也會接受采樣到的 LAN IP 字面量，未認证的浏覽器仍只能存取 GUI；以具名主机存取还需额外新增 `--trusted-host` 条目。本机交接前會打印英文提示 `dsh web: opening the default browser; pass --no-open to disable`；若操作系統交接失败，stderr 诊断會說明原因、給出 URL 供手动存取，伺服器仍继續執行。`--trusted-host` 可新增 `/api` 浏覽器信任围栏接受的具名 authority。

行程關閉時，插件树最多有 5 秒完成 dispose。首次收到 `SIGINT` 或 `SIGTERM` 時會開始优雅排空：`SIGTERM` 是监督行程发出的常规停止要求，在所有執行模式下都以 0 退出；`SIGINT` 則報告 130。第二次收到信號時會立即强制退出。如果一次性執行在正常結束時已經卡在 dispose 阶段，第一次按下 `Ctrl+C` 就會直接升級為强制退出，而不會被忽略。

基於 base 的模式都将執行命令時所在的目录作為預設 workspace 根目录，以 65,536 字节渲染预算加载适用的 `AGENTS.md` 或 `CLAUDE.md` 指令，并使用內存 SQLite 工作階段內容索引。独立的 `sdk-minimal` profile 把執行命令時所在的目录作為沙箱策略根目录，但刻意省略檔案系統工具、指令发現與 SQLite。`patchReload: live` profile 會监视 profile 與 home 两個 `cordis.patch.yml` 設定层的有效变更，并以事務方式重新應用；`startup` profile 則只應用一次。一次性執行模式透過有界關閉流程退出，該流程會 dispose 所有实時监视器。

基於 base 的 profile 中，新工作階段預設使用 `workspace-write` 權限预设。Bash 和檔案系統修改仅限於工作階段 workspace 與平台临時根目录；讀取和網路存取不受限制，行程可見性則取决於所选沙箱后端——bwrap 在私有 PID 命名空间中執行命令并隐藏宿主行程，Landlock 與 Seatbelt 保持宿主行程可見性不变。`DSH_PERMISSION_MODE` 更改行程后备值。General settings 中存储的權限影响后續 Web 工作階段，不改变已打開的工作階段。独立的 `sdk-minimal` 設定树則固定為 `danger-full-access`，且不挂载 approval 或權限 settings 服務。

`DSH_TOOLS_MODE` 為行程選擇 `native`、`ptc` 或 `both`；其他值會导致啟動失败。随附的 `minimal` agent preset 會保留該部署的呈現方式，将完整系統提示词固定為 `You are a helpful software engineer assistant.`，并且仅组合按平台選擇的持久 shell。建立 Web 工作階段時请選擇极简模式；該 agent 不包含任何其他提示词段落或面向模型的插件，而共享的浏覽器、workspace、持久化、沙箱與權限宿主保持不变。

## 共享部署行為

基础组合包挂载原生 DeepSeek 适配器、settings 與凭f64ee提供方、稳定的 `web_search` 和 `web_fetch`、仅限公网的 HTTP fetch 提供方，需主动開启的 DeepSeek 工作階段日志上传，以與面向所有使用者的反馈門控 OTel 上传。提供方凭f64ee依次从继承環境、`$DSH_HOME/.credentials.yaml`、呼叫目录的 `.env` 和 `$DSH_HOME/.env` 解析；受管文档从不物化進 `process.env`，而两個 `.env` 檔案都是普通啟動環境层。搜索使用 `DEEPSEEK_API_KEY` 并接受 `DEEPSEEK_SEARCH_BASE_URL`。已启用的抓取呼叫會在所有 sandbox 與审批模式下执行，無需逐次确認；提供方會在連線前拒绝非公開目的位址。Web app 會禁用 base 工具設定项，再透過 `cordis`、`ptc` 與 `standard` agent preset 暴露相同工具。

反馈记录在工作階段日志中，不會啟動模型工作。開启 [DeepSeek 工作階段日志贡献器](../../../packages/session/session-log-deepseek/README.zh.md)后，后續 DeepSeek 要求會傳送尚未确認接收的完整日志后缀，包括經已設定网關傳送的要求。[OTel 工作階段上传](../../../packages/session/session-telemetry-otel/README.zh.md)适用於所有使用者和提供方，包括 `deepseek-official`，無需要求头。基础設定預設使用 `FEEDBACK_ONLY`：新的自身文本反馈、消息评分、编辑與撤回會释放截至該事件的完整规范日志前缀，包含存储的上下文；后續记录等待下一次显式反馈。继承的父級反馈不构成 fork 的授权。要求、恢复、挂载和 HMR 不触发捕获。SDK 批處理可完成已授权上传，無需進一步交互或模型工作。`DSH_TELEMETRY_MODE=DISABLED` 禁止 OTel 投递；`FULL` 被拒绝，任何非空的 `DSH_TELEMETRY_DISABLED` 都會禁用其設定行。`DSH_TELEMETRY_OTLP_URL` 選擇采集端。交接尽力而為，不代表采集端接受；不提供持久化 outbox 或重试保证。這些 OTel 設定不會開启或關閉 DeepSeek 贡献。两条路径都不改变模型输入，但导出可能包含消息文本、工具參數和結果，以與工作区路径。

透過 `dsh plugin --profile <name> add <package-or-git-spec>` 安装外部插件组合包。安装的包拥有其依赖，并贡献其声明的 `cordis.patch.yml` 层。CLI 还随附 `@deepseek-ai/dsh-mcp-client` 作為供 patch 层使用的依赖，但預設不启用 MCP 伺服器，因為每条伺服器命令都是 agent 沙箱之外的受信任可执行代碼。

<a id="source-execution"></a>
## 源码执行

请在仓库根目录中，於全新 checkout 之后與产物需要更新時單独執行 `pnpm run build`，然后使用 `pnpm dsh <args...>`。`package.json` 中的脚本不會构建，而是透過 `node --import tsx/esm` 啟動 `apps/cli/src/bin.ts`，并转发所有參數。Typert Host 产物缺失時，profile 啟動會因不含构建指引的模块解析錯誤而失败。這些 Host 产物存在后，如果前端或 Client plugin 组合包缺失，啟動會失败并提示執行 `pnpm run build`。啟動器不會檢查产物是否為最新，因此已有的陈旧组合包可能继續執行旧版浏覽器代碼，直至重新构建。該行程會继承啟動環境，且 `runProfile` 會在任何 entry 挂载之前从該快照解析出站代理，因此 `HTTP_PROXY`／`HTTPS_PROXY`（以與写在 `.env` 层中的代理）無需任何额外開關即可生效。安装形式會直接啟動构建后的 `apps/cli/lib/bin.js`，不會重新构建仓库。
