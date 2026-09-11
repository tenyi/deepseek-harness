---
description: "面向構建或排查實驗性預覽部署的維護者，說明瀏覽器 worker 虛擬文件系統（VFS）鏡像打包。"
kind: "package-library"
---

# `@deepseek-ai/dsh-experimental-webworker-packer`

[English](README.md) | 中文

## 概述

VFS 鏡像打包器：把一份合成 profile 變成瀏覽器 worker 掛載為文件系統的 gzip 壓縮基礎 tar，并把不透明數據目錄變成按序應用的 overlay tar（[實驗組](../README.zh.md)）。不做任何源碼編譯——基礎鏡像攜帶倉庫真實構建產物，預覽部署調試的正是 served 部署交付的字節。打包預覽鏡像或排查鏡像內容時，請閱讀本頁。

## 目錄

- [使用本包](#use-this-package)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

打包器在 [`src/repository.ts`](src/repository.ts) 中擁有內部 `dsh.configTrees` 聲明、校驗和源目錄解析。該字段不屬于公共插件 manifest API。

打包是三層標準棧：

1. **Roster**——合成 profile 的插件行（標準 YAML 解析、Include 方言、`!!js` 原樣保留），加上 CLI（命令行界面）在 `package.json` `dsh.configTrees` 里聲明的每棵配置樹（agent（智能體） presets）的行，按 Node 式依賴閉包物化。外部 peer 邊絕不會綁定到 worker，workspace peer 保留在鏈上。
2. **發布視圖**——每個 workspace 或 vendored 包貢獻其構建后的 npm 切片（`files` 走 picomatch），不帶源碼和 workspace `dist/`。外部包的 `main` 或 `exports` 可能指向 `src/` 或 `dist/`，因此兩處發布 JavaScript 都會保留，只應用通用的測試、map、聲明與歸檔排除規則。
3. **可達性 sweep**——用運行時加載器自己的解析，從全部 workspace 導出面加 worker 裝配種子（`IMAGE_ENTRY_SEEDS`）出發，打包時把每個可達模塊轉換為符合包裝層約定的形式。該轉換會報告名稱可靜態確定的 import、re-export 與動態 import、經 `require` 發起的調用，以及通過 `node:module` 或 `module` 具名導入（含導入別名）在模塊作用域直接發起的 `createRequire(import.meta.url)('pkg')` 調用。頁面資產（`./client` 導出背后的 `lib/client.js`）原樣直發；自家代碼的不可解析請求會讓打包失敗，第三方不可解析請求則允許延后到 require 時明確失敗。

`repository.ts` 擁有倉庫形態輸入（`vendor/`、`packages/`、`native/system/packages/` 與 `apps/` 的 workspace 掃描；經真 CLI dump 路徑合成 profile）；`pack.ts` 一概不擁有，同一庫換參即可打另一棵樹。Native 掃描使 Landlock 入口包成為普通發布視圖依賴，其可執行文件仍由 Worker 平臺實現。CLI 為 `dsh-pack-vfs-image --out <file> [--profile web]`；`apps/web` 的 `build:preview` 在預覽殼構建后運行它。

倉庫適配器還聲明 `webworker-runtime/tests/fixtures/` 下僅用于 preview 的 fixture（測試前置數據） tree。CLI 會把每套具名 fixture 打成一份獨立的確定性 overlay 歸檔，并寫出瀏覽器可讀的 manifest（元數據清單）。Overlay 文件繞過 npm 發布視圖和模塊可達性排除規則，因此點目錄與示例源碼會完整保留；其掛載位置僅限 `home/` 與 `workspace/`。`pack.ts` 把它們視為不透明字節；會話與 Workspace 的解釋仍歸擁有這些格式的運行時包。

-----

<a id="model-experience"></a>
## 模型體驗

無：本包在構建期運行并寫出鏡像文件，其產物本身不進入任何模型請求。

#### KV Cache 影響

無：本包既不組裝也不發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **規則表依賴人工判斷**（`rules.ts`：exclude glob、頁面資產模式、入口種子），由 `tests/` 釘住；worker 需要觸達的新資產類別應加表行，而不是改掃描器。
- **可達性只推斷精確請求形式**——計算得到的 `import` 與 `require` 參數、保存下來的 `createRequire` 結果、經 CommonJS 獲取的 `createRequire`，以及基準不是 `import.meta.url` 的調用只在運行時解析；若目標已被裁掉就會顯式失敗。只能通過這些形式觸達的目標需要顯式鏡像入口種子。
- **vendored 包源碼（`src/*.ts`）被排除**——運行時無人解析它們；未來若有 worker 內源碼巡檢功能需要專門的 include 規則。
- **打包器假定構建產物 `lib/` 是新鮮的**：它從不編譯，工作區構建陳舊就會打包陳舊字節。先跑倉庫構建。


<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。這是沒有生產事件流或可變數據的構建時 pass；無法解析的自有代碼請求與全有或全無的包裝層約定會直接讓 pack 失敗。
