# `@deepseek-ai/dsh`

[English](README.md) | 中文

`dsh` 是唯一受支持的 Node 應用啟動器；profile 由多個插件組合包 patch 層按順序疊加而成，其上再應用用戶自己的覆蓋配置。SDK 與 ACP（Agent Client Protocol）都是 profile，而不是獨立的公開可執行命令。Python 運行時 wheel 包中也包含同一個命令；SDK 默認使用 `sdk`，極簡示例選擇 `sdk-minimal`。[`src/args.ts`](src/args.ts) 負責命令語法，[`src/bin.ts`](src/bin.ts) 只加載選中的運行器。無效命令、來自其他模式的選項、配置錯誤和啟動失敗都會以非零狀態退出。

## 入口模式

| 命令 | 用途 |
|---|---|
| `dsh --profile <name>` | 啟動位于 `$DSH_HOME/profiles/<name>` 的指定 profile。 |
| `dsh --profile <name> --from-default-profile <template>` | 從隨附模板創建新的自定義 profile，然后啟動它。 |
| `dsh --profile acp` | 通過 ACP stdio 為自動化客戶端提供服務，直至斷開連接。 |
| `dsh --profile headless "job"` | 運行一個全新的持久化會話，打印最終答案并退出。 |
| `dsh --profile sdk` | 通過 JSON-RPC stdio 為 SDK 客戶端提供服務，直至關閉或斷開連接。 |
| `dsh --profile sdk-minimal` | 以獨立極簡 agent（智能體）配置樹為 SDK 客戶端提供服務。 |
| `dsh web` | `--profile web` 的別名。 |
| `dsh plugin --profile <name> <pnpm args>` | 通過在 profile 目錄中轉發給 pnpm 來管理該 profile 的插件。 |

運行命令時所在的目錄將作為默認 workspace 根目錄。`web`、`headless`、`sdk`、`sdk-minimal` 和 `acp` profile 在首次使用時會從隨附模板自動初始化。使用 `--from-default-profile` 可以基于這些模板之一，在尚未使用的非內置名稱處創建其他 profile；通過 `dsh plugin` 則可以初始化一個以 base 為基礎的 profile。`desktop` 名稱保留給 Electron 持有的 profile，因此 CLI（命令行界面）會拒絕針對它的啟動、配置 dump 和插件管理請求。

## 應用參數

啟動器只解析自身的 flag，并將其后的所有內容交給已啟動的 profile；注入該 profile 的任意應用插件都可以解析這份共享的不可變快照（[`dsh-cmdline`](../../packages/boot/cmdline/README.zh.md)）。啟動器無法識別的第一個 token 標志著應用參數的開始：

```sh
dsh --profile web --port 8080       # --port belongs to the web app
dsh --profile tui --resume <id>     # example, assuming the tui profile is installed; --resume belongs to the terminal app
dsh --profile headless "run the tests"
dsh --profile web --help            # the web app's flags, not the launcher's
dsh --help                          # the launcher's own help
```

<a id="profiles"></a>
## Profile

profile 目錄包含一個 `package.json`，其中記錄樹外插件依賴，以及 profile manifest（元數據清單）`dsh.profile`、其中按順序排列的 `bundles` 列表與 `patchReload` 生命周期；還包含一個 `cordis.patch.yml`，其中保存用戶自己的 patch 層。`patchReload: live` 監視 profile 與 home 級 patch 文件，`startup` 則只應用一次。

配置樹以空根為起點，依次疊加以下配置層：
- `dsh.profile.bundles` 中各組合包的 patch
- profile 自身的 `cordis.patch.yml`，然后是 home 級的 `$DSH_HOME/cordis.patch.yml`
- `--patch` 指定的覆蓋層

`dsh.profile.bundles` 中列出的組合包先從 dsh 安裝目錄解析（`@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app`、`@deepseek-ai/dsh-headless`、`@deepseek-ai/dsh-sdk-app`、`@deepseek-ai/dsh-sdk-minimal`、`@deepseek-ai/dsh-acp-app`），再從 profile 自身的 `node_modules` 解析；pnpm 會將樹外插件安裝到該目錄。

使用 `--dump-default-config` 和 `--dump-config` 可在不啟動的情況下檢查組合后的配置樹。

層的確切優先級、flag、關閉行為、部署默認值和源碼執行方式，以 [CLI 行為參考](reference/README.zh.md)為準。

## 可選覆蓋層

`config/examples/` 交付 GitHub 評審 webhook、會話內 Schedule、記憶 MCP 服務器與運行時 Cordis 工具的可選覆蓋層。它們絕不屬于默認 profile；設置與安全說明由[用戶指南](../../docs/user/guide/index.zh.md)和[開發實戰指南](../../docs/user/develop/practice/index.zh.md)負責。

## 開發

生產運行需要已構建的包與前端產物。請在倉庫根目錄單獨運行 `pnpm run build`，然后使用 `pnpm dsh <args...>` 運行 TypeScript 入口并轉發所有參數；模塊解析約定以[源碼執行參考](reference/README.zh.md#source-execution)為準。
