# 實操手冊：添加一個 vendored 包

[English](adding-a-vendored-package.md) | 中文

當 harness 需要引入另一個上游 Cordis 包（如 `@cordisjs/plugin-http`）時，應將其作為固定版本的源碼 **vendor** 到 `vendor/` 下，而非作為 NPM 依賴添加。[vendor/README.md](../../vendor/README.md) 說明其原因并介紹如何*更新*已有的 vendored 包；本指南是添加**新** vendored 包的逐文件清單。（已對照現有 vendored 集合驗證；如有偏差，請在此修正。）

## 1. 復制源碼

```
vendor/<dir>/
  package.json     # from upstream; rescope the name, keep exports/type (publishable release member, no private flag)
  tsconfig.json    # extends ../../tsconfig.base.json (see configuration below)
  src/             # the upstream src/ verbatim
  README.md LICENSE # if upstream ships them
```

`tsconfig.json` 與其他 vendored 包保持一致：`rootDir: src`、`outDir: lib/types`、上游代碼所需的嚴格性放寬項，以及對所導入的每個其他 vendored 包的 `references` 條目：

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src", "outDir": "lib/types",
    "noUncheckedIndexedAccess": false, "exactOptionalPropertyTypes": false,
    "noImplicitOverride": false, "noUnusedLocals": false, "noUnusedParameters": false
  },
  "include": ["src"],
  "references": [{ "path": "../cordis" }, { "path": "../cosmokit" }]
}
```

`package.json` 的不變式：改寫 `name` 的 scope（[映射](../rescope.zh.md)），保留上游的 `exports`/`type`；聲明元數據指向 `lib/types`；發布 `.d.ts` 與 `.d.ts.map` 聲明輸出；在 `peerDependencies` 中列出其 Cordis 依賴（與上游 manifest（元數據清單）一致）。vendored 包是可發布的 release member，因此不得設置 `private: true`，且必須設置 `publishConfig.access: public`；`version` 字段跟隨 harness 發布序列（見 [vendor/README.md](../../vendor/README.md)）。傳遞性上游依賴本身也必須被 vendor 或已存在于倉庫中——vendor 一個包往往意味著 vendor 其整條依賴樹（如 `@cordisjs/plugin-http` 會拉入 `@cordisjs/fetch-file`）。

vendored TypeScript 源碼中的本地相對導入/導出在復制后使用顯式 `.ts` 后綴。這是倉庫本地構建與上游的差異：`rewriteRelativeImportExtensions` 輸出 `.js` 運行時導入，而聲明文件保留顯式 `.ts` 后綴，使 NodeNext/Node16 的 TypeScript 消費方能夠解析。

## 2. 在根配置中注冊

| 文件 | 修改內容 |
|---|---|
| `tsconfig.base.json` | 在 `paths` 中添加 `"<npm-name>": ["./vendor/<dir>/src"]` |
| `tsconfig.host.json` | 在 `references` 中添加 `{ "path": "./vendor/<dir>" }`（置于 `packages/*` 條目之前；vendored 代碼只經 host 聚合進圖） |
| `vendor/README.md` | 添加一行 manifest 表格行（dir、npm name、version、upstream repo、commit SHA）并記錄所有本地修改 |
| `scripts/publint-all.ts` | 僅當該 vendored 包本身從此倉庫發布時才需要（vendored 依賴通常不發布——跳過） |

以下由 glob 自動覆蓋，無需手動編輯：根 `package.json` 的 workspaces（`vendor/*`）、`tsdown.config.ts`、`vitest.config.ts`、`.oxlintrc.json`。只有當構建配置與根默認值不同時（雙 ESM/CJS 或多入口——參見 `vendor/schemastery` 和 `vendor/logger-console`），才需要單獨的 `vendor/<dir>/tsdown.config.ts`；其入口應讀取 `lib/types` 下輸出的 JS。

## 3. 注意 manifest 守衛

`scripts/check-vendor-manifest.sh`（pre-commit 鉤子）會在 `vendor/*/src` 下有暫存改動但 `vendor/README.md` 未一起暫存時失敗。請將 manifest 更新與源碼一起暫存，以通過提交檢查。

## 4. 驗證

```sh
pnpm install        # registers the workspace
pnpm run typecheck
pnpm run build && pnpm run constraints
```

請運行[測試政策](../testing.zh.md)所選擇的行為檢查。源碼 `paths` 映射只在 `tsconfig.base.json` 存在一份，服務所有圖。重要的隔離邊界是 project-reference 圖：vendored 源碼必須通過其自身的 `vendor/<dir>/tsconfig.json` 被引用，而非被拉入某個聚合項目啟用嚴格檢查的 TypeScript 程序中（[布局](../development.zh.md#typescript-project-layout)）。
