# Vendored 包改名

[English](rescope.md) | 中文

Cordis 框架及其基礎庫以源碼形式 vendored 在 [`vendor/`](../vendor/README.md) 下，并以 `@deepseek-ai` scope 發布：每個 harness 包都把框架聲明為 peer dependency，發布 harness 就會連帶發布這一層，用上游名發布等于在 registry 上占用別人的名字。本頁是名字映射表；決策與影響見 [改名 Agent Note](../.agents/notes/archived/process/2026-08-10-vendor-package-rescope.md)，上游 commit 見 [`vendor/README.md`](../vendor/README.md)。

## 名字映射

| 目錄 | 上游名 | 發布名 | 上游版本 | 角色 |
|---|---|---|---|---|
| `vendor/cordis/` | `cordis` | `@deepseek-ai/cordis` | 4.0.0-rc.7 | 框架核心：`Context`、`Service`、`Fiber`、事件 |
| `vendor/cosmokit/` | `cosmokit` | `@deepseek-ai/cosmokit` | 1.8.1 | 框架與 Schemastery 共用的基礎工具 |
| `vendor/schemastery/` | `schemastery` | `@deepseek-ai/schemastery` | 3.18.0 | 配置 schema（`Schema`），每個插件的 `Config` 都基于它 |
| `vendor/loader/` | `@cordisjs/plugin-loader` | `@deepseek-ai/cordis-plugin-loader` | 1.0.0-rc.5 | `cordis.yml` 裝載、插件解析、repository 緩存 |
| `vendor/include/` | `@cordisjs/plugin-include` | `@deepseek-ai/cordis-plugin-include` | 1.0.4 | 配置包含與 patch 疊加 |
| `vendor/group/` | `@cordisjs/plugin-group` | `@deepseek-ai/cordis-plugin-group` | 1.0.0 | 嵌套插件分組 |
| `vendor/timer/` | `@cordisjs/plugin-timer` | `@deepseek-ai/cordis-plugin-timer` | 1.1.2 | `ctx` 上隨 disposal 回收的定時器 |
| `vendor/hmr/` | `@cordisjs/plugin-hmr` | `@deepseek-ai/cordis-plugin-hmr` | 1.0.15 | 插件與配置的熱替換 |
| `vendor/logger-console/` | `@cordisjs/plugin-logger-console` | `@deepseek-ai/cordis-plugin-logger-console` | 1.0.0 | 控制臺日志導出 |

子路徑導出保持原路徑：`@cordisjs/plugin-loader/repository` 變成 `@deepseek-ai/cordis-plugin-loader/repository`。

## 改名不碰什么

- **目錄名與上游源碼版本。** `vendor/hmr/` 仍是 `vendor/hmr/`，清單表記錄的是所釘住源碼快照的上游版本，因此清單讀作一份上游快照；而每個 vendored 包 `package.json` 自身的 `version` 字段是 harness 發布的清單版本，`pnpm run release:vendor` 會提升它，重新 sync 時會恢復成上游版本。
- **依賴 range。** 依賴條目只換鍵、不換范圍：`"cordis": "^4.0.0-rc.7"` 變成 `"@deepseek-ai/cordis": "^4.0.0-rc.7"`；`linkWorkspacePackages` 靠這些保留下來的范圍把它們解析到固定的 workspace。
- **Loader 的 `cordis:` 內建前綴。** `cordis:include`、`cordis:group` 是協議前綴，不是包名。
- **`cordis.yml` 配置文件家族**，包括 `*.cordis.yml`、`*.cordis.snapshot.yml`、`cordis.patch.yml`。
- **名字里帶這個詞的 harness 包**，例如 `@deepseek-ai/dsh-tool-cordis`。
- **上游運行時標識符**，例如 Schemastery 的 `Symbol.for('schemastery')` 及其 `vendor:` 元數據字段。
- **`docs/` 之外的散文。** `vendor/*/README.md`、各包 README 與 Agent Note 保留寫作當時的名字；那里的裸 `cordis` 也可能是 Python SDK 的選項名或某個 agent-preset 的 id。`docs/` 之內，散文與所有 Markdown 圍欄都跟著改。

## 你的代碼要改什么

| 位置 | 改前 | 改后 |
|---|---|---|
| 模塊 import | `import { Context } from 'cordis'` | `import { Context } from '@deepseek-ai/cordis'` |
| 類型事件聲明合并 | `declare module 'cordis'` | `declare module '@deepseek-ai/cordis'` |
| `package.json` 依賴鍵 | `"@cordisjs/plugin-hmr": "^1.0.15"` | `"@deepseek-ai/cordis-plugin-hmr": "^1.0.15"` |
| `cordis.yml` 插件條目 | `name: '@cordisjs/plugin-include'` | `name: '@deepseek-ai/cordis-plugin-include'` |

## 施加、核驗與回退

上面這份映射由 [`scripts/rescope-vendor.ts`](../scripts/rescope-vendor.ts) 承載并執行改名，任何引用都不靠手改：

```sh
pnpm run rescope-vendor            # report what would change
pnpm run rescope-vendor --apply    # rewrite every reference
pnpm run rescope-vendor:check      # assert the post-state; runs in the hygiene gate
pnpm run rescope-vendor --apply --reverse   # return to the upstream names
```

上游 sync 之后重跑它（[流程](../vendor/README.md)），并接上它打印的重生成：`pnpm install` 重生成 lockfile、`pnpm run gen-third-party-notices`、以及對它觸及的雙語對跑 `pnpm run verify-translation-pairing --write`。
