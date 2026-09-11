# 實操手冊：添加 workspace 包

[English](adding-a-package.md) | 中文

為新建 `@deepseek-ai/dsh-<name>` 包提供的逐文件清單。本清單以 bash 和適配器這兩個包為模板進行驗證；如果清單與模板有出入，請在此修正。

## 1. 創建包

```
packages/<group>/<pkg>/
  package.json     # copy from packages/core/tools, adjust name/description/deps
  tsconfig.json    # extends ../../../tsconfig.base.json, rootDir src,
                   # outDir lib/types, references: ../../../vendor/cosmokit,
                   # ../../../vendor/cordis (+ ../../../vendor/schemastery if
                   # you use Config, + ../../<group>/<dep> for each dsh dep)
  src/index.ts     # service default export or plugin (name/inject/apply/Config)
  README.md        # service API, events, extension points, design notes,
                   # + gated Model Experience context blocks or short form
                   # + the gated "Known Limitations and Deferred Work" section
                   # (or a whitelist entry in scripts/verify-package-readme-limitations.ts)
```

當已有分組與包的角色匹配時，選擇該分組（`core`、`llm`、`shell`、`compaction`、`subagent`、`todo`、`session`、`client`/`host`、`util` 或 `test-support`）。允許新建分組，但分組只是純容器：沒有 `package.json`，沒有源文件，包仍然恰好位于其下一層。

package.json 不變式（由 `pnpm run constraints` / `scripts/check-workspace-constraints.ts` 強制執行）：`private: true`，`version` 與根 `package.json` 一致，`type: module`，`main: "lib/index.js"`，`types: "lib/types/index.d.ts"`，`exports["."].types: "./lib/types/index.d.ts"`，`exports["."].default: "./lib/index.js"`，`@deepseek-ai/cordis` 同時出現在 peerDependencies 和 devDependencies 中（相同范圍）。每個 dsh 對等依賴（peer dependency）都要在 devDependencies 中鏡像。`@deepseek-ai/schemastery` 放在 `dependencies` 中（它是運行時校驗器），與 agent-loop 保持一致。`files` 列表精確包含 `lib/index.js`、`lib/types/**/*.d.ts` 以及門禁認可的包專用運行時產物；發布 `./invariant` 的包還要包含 `lib/invariant.js`。如果包的運行時 export 指向輸出樹，還要包含 `lib/types/**/*.js`。不要發布 `src`、聲明映射、JS map 或陳舊的根聲明文件。帶有 `bin` 的 CLI 應用包在 `files` 中將 `lib/bin.js` 緊跟在 `lib/index.js` 之后。

包內的相對導入在源碼中使用顯式 `.ts` 后綴（例如 `export * from './types.ts'`）。編譯器在輸出的 JS 中將其重寫為 `.js`，在聲明文件中保留顯式 `.ts` 后綴；標準的 NodeNext/Node16 TypeScript 消費方會將其解析到同目錄的 `.d.ts` 文件。

## 2. 在根配置中注冊

| 文件 | 變更 |
|---|---|
| `tsconfig.base.json` | 已有分組無需編輯；新分組需為 `@deepseek-ai/dsh-*` 通配符添加 `./packages/<group>/*/src` 候選路徑 |
| `tsconfig.host.json`（Host 包）或 `tsconfig.client.json`（Client 包） | 在 `references` 中添加 `{ "path": "./packages/<group>/<pkg>" }`——普通包恰好屬于一個 aggregate，絕不兩個都加。`api/remotes` 因 Host 生成約定與 Client 消費約定之間存在順序依賴而使用倉庫專屬拆分，新增包不得仿照（[布局](../development.zh.md#typescript-project-layout)） |

`packages/client/*` 包改為 extends `tsconfig.base.client.json`（而非 `tsconfig.base.json`）；client 插件包還需在 package.json 聲明 `dsh.client`、導出 `./client`、調用共享 tsdown preset（`packages/client/tsdown.client.ts`）——client 側見 [packages/client/AGENTS.md](../../packages/client/AGENTS.md)。

以下內容由 glob 或包 manifest（元數據清單）發現機制自動覆蓋，無需手動編輯：根 `package.json` workspaces、`scripts/publint-all.ts`、`tsdown.config.ts`、`.oxlintrc.json`、`scripts/check-workspace-constraints.ts`。

## 3. 確定包拓撲

對于可替換的能力，當 Service Definition／Service Provider／Consumer 角色需要獨立演進時，將它們拆分到不同包中（見 docs/architecture.md § "Capability seams"——shell 三組件是模板）。單一用途的插件保持為一個包。

### 使用符合實際的角色名稱

名稱必須描述當前穩定職責。不要用首個實現、可能的未來擴展或 Cordis 基類命名。接口包使用能力名稱。實現包加上能夠區分實現的機制、協議、環境或廠商限定詞。只有同主機執行屬于約定時，才使用 `local`。

一個 engine、runtime、policy、controller、resolver、store 或當前配置使用單數 `ctx` key。registry 或擁有多個具名成員的服務使用復數 key。類的角色與 key 的單復數必須一致。不得讓不兼容的 host 與 client 聲明復用同一個 Cordis `Context` key。即使二者使用獨立的運行時 context，TypeScript 聲明合并仍會同時看到兩種類型。如果自然復數已經屬于另一個端面，就增加職責后綴。

| 詞 | 適用條件 | 不適用條件 |
|---|---|---|
| `Controller` | 接受命令或用戶意圖，并改變一項既有領域狀態或展示狀態。 | 執行任意工作、擁有一組 provider，或只把值轉換為展示形式。 |
| `Store` | 擁有一組數據，主要提供該數據的 CRUD、snapshot 或 subscription 操作。 | 校驗狀態機、裁決權限、分派工作或擁有 provider 優先級。類中有 map 不等于 store。 |
| `Directory` | 暴露供發現或選擇的條目及其元數據。 | producer 向其中注冊任意實現，或調用方通過它執行工作。 |
| `Presenter` | 將領域值或工具參數純轉換為渲染意圖。 | 執行 I/O、訂閱、修改狀態或擁有生命周期。 |
| `Registry` | 擁有一組動態具名注冊，以及查詢、重復項或優先級規則、生命周期和釋放。 | 主要約定是分派、執行、取消、策略或編排。 |
| `Runtime` | 運行實時工作，并跨調用擁有分派、取消、provider 協調或操作生命周期。 | 只存儲記錄、返回目錄、解析一個值或保存配置。 |
| `Resolver` | 根據輸入計算或定位一個答案，但不擁有該答案的生命周期。 | 擁有可變集合或長時間運行的執行過程。 |
| `Binder` | 把一個已聲明接口綁定到調用方的 context 或生命周期，并返回綁定值。 | 把該值作為集合持有、控制其領域狀態，或只轉換數據。 |
| `Engine` | 實現領域算法或有狀態執行模型。 | 只選擇 provider 或跨協議邊界轉發請求。 |
| `Policy` | 決定允許、選擇、限制或觀察什么。 | 執行該決定所允許的機制。 |
| `Executor` | 在一項能力中運行一個明確請求或已解析 spec。 | 擁有廣泛應用生命周期或 provider 目錄。 |
| `Gateway` | 適配進程、網絡、RPC 或 API 邊界。 | 只注冊同進程服務或存儲元數據。 |
| `Provider` | 提供一項能力定義的一個實現。存在多個實現時，加上機制或廠商限定詞。 | 表示能力定義、provider registry 或消費方 runtime。 |
| `Backend` | 在已定義接口之后實現可替換的底層持久化、傳輸或執行。 | 表示面向用戶的服務或一個已返回的實時資源引用。 |
| `Handle` | 引用一個實時資源，并控制或觀察該資源。 | 創建并管理完整資源池。 |
| `Config` | 擁有一個已解析配置值，或一項邊界嚴格的配置記錄及其更新約定。 | 存儲通用集合、執行工作或暴露無關設置。 |
| `Service` | 擁有一項無法用以上更精確角色誠實描述的內聚領域服務。 | 只因為類繼承 Cordis `Service` 而使用該名稱。 |

只對受支持的 Python 與 TypeScript SDK 所使用的 JSON-RPC 客戶端／服務器協議使用 `SDK`。DeepSeek Harness 本身是 agent harness，不是 SDK 項目。產品拼寫統一使用 `Typert`，不得使用 `TypeRT` 或 `typeRT`。

<a id="4-write-the-package-readme"></a>

## 4. 編寫包 README

將包特有的服務 API、配置、事件、擴展點和設計說明放在前面。根據 [dsh-doc 元數據參考](../../.agents/skills/dsh-doc/references/metadata-links-i18n.md#the-kind-system)中的四種 kind 標簽——組、參考、庫或 bundle——選擇 frontmatter 的 `kind`，使其匹配包在倉庫中的位置與入口形態；每個 kind 恰好對應一個 README 模板。limitations 部分記錄持久的消費方缺口和本包擁有的非顯而易見的維護者約束；日常清理事項留在源碼 TODO 或 Agent Note 中。間接的 Model Experience 語句可以點名暴露本包貢獻的消費方，但不重述該消費方的實現。包 README 以如下規范序列結尾：

````markdown
## Model Experience

### Request context and condition

#### What the model sees

The exact data-dependent fields, an anchored generated-catalog link, or an introduction to the verbatim literal below.

##### Verbatim text for this field, when needed

```markdown
Stable system-prompt prose of any length, or another long non-generated literal, copied exactly from source.
```

#### Token effect

Fixed, conditional, retained, replaced, capped, or zero-direct token effect.

#### KV Cache effect

Append-only, prefix-stable, replacing, or independent behavior, including the exact conditions that may invalidate reuse.

## Known Limitations and Deferred Work

- **Consumer-visible gap** — exact missing operation or case, its consequence, and any maintainer constraint.
````

根據實現填寫 Model Experience。每個直接、條件、上限、生命周期或輔助的模型上下文條目使用一個 H3，包含上述三個有序 H4 字段，每個字段下有一個正文段落。引用包擁有的穩定文本：系統提示詞放在引出它的字段下，用帶標題的 H5 加 `markdown` 圍欄表示，通常歸入 `What the model sees`；其他短文本以命名占位符內聯，其他長文本使用相同的嵌套形式。僅概述數據依賴或提供方擁有的文本。工具 schema 條目鏈接到生成的[工具目錄](../tool-catalog.zh.md)中對應的錨定章節，僅說明該處缺失的差異。當作用域可以隱藏 prompt 或 schema 其中之一而不影響另一個時，將二者分開。填寫 `KV Cache effect` 時，應區分僅追加增長、穩定重復的前綴、替換既有請求 token 和獨立模型請求，并列出會使緩存復用失效、且由本包擁有的變化。“不使緩存失效”僅表示本包保留了已有的可復用前綴；緩存是否可用以及何時淘汰不屬于本包約定。[行文標準](../../.agents/skills/dsh-prose-standard/SKILL.md)約束完整性與歸屬；驗證器強制執行所需章節結構。

沒有上下文效果或僅有消費方擁有路徑的包使用 [`SENTENCE_MODEL_EXPERIENCE`](../../scripts/verify-package-readme-model-experience.ts) 中經過審計的 `None, as ` 或 `Indirectly, through ` 語句，隨后添加 `KV Cache effect` H4 和一個非空正文段落；與模型無關的通用包可以改為加入 `NO_MODEL_EXPERIENCE_SECTION`。兩種情況都不要展開為對另一個包工作的描述。limitations [allowlist](../../scripts/verify-package-readme-limitations.ts) 獨立管理。[Model Experience Agent Note](../../.agents/notes/implemented/process/2026-07-12-package-model-experience-contract.zh.md) 記錄了設計動機。

## 5. 驗證

```sh
pnpm install        # registers the workspace
pnpm run doc-sync
pnpm run constraints && pnpm run typecheck && pnpm run lint
pnpm run build && pnpm run hygiene
```

請遵循[倉庫測試政策](../testing.zh.md)，執行新包所需的行為專項檢查并達到相應覆蓋率。
