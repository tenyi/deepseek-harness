---
description: "dsh profile 與臨時 Python SDK 運行時的共享 Loader 啟動支持：環境層、patch、診斷與配置預覽。"
kind: "package-library"
---

# @deepseek-ai/dsh-app-boot

[English](README.md) | 中文

## 概述

`dsh-app-boot` 是 `dsh` profile（包括 Python 運行時 wheel 包所含的 CLI（命令行界面））背后的共享 Loader 啟動庫。它加載環境層、組合 profile 組合包與 patch、啟動每個插件，再返回運行中的應用，或指出失敗插件與原因。產品應用使用 `dsh` launcher 而不發布單獨 bin；直接配置 helper 只保留給低層嵌入方與測試。你還可以在啟動前預覽生效配置，按 profile 選擇實時或僅啟動時應用 patch，并讓持有終端的應用在致命退出前恢復終端。

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

用此包啟動應用是一個小而顯式的入口：你給它一個配置文件，它運行整個啟動過程。本節說明你能做什么、能得到什么；每個結果背后的 helper 調用記錄在下方可折疊的實現章節中。

### 何時使用

在實現共享 `dsh` launcher 或嵌入其低層啟動 helper 時使用它。產品功能應放入 profile 組合包，而不是新增應用 bin；只向已運行應用添加插件的代碼直接掛載插件即可。

### 啟動應用

你把配置文件交給入口，進程就會啟動整個應用：加載環境層、應用 patch 與 profile、啟動每個插件，并在應用運行后返回。在回放模式下，它會啟動同級的 `cordis.snapshot.yml` 替代文件，使已記錄的會話能夠原樣復現。最小的入口只需兩次調用：

```text
installFailLoud('dsh')
const ctx = await boot('dsh', resolveConfigPath(argv[2], process.env.DSH_SNAPSHOT))
```

有了這個入口，成功就是每個插件都已激活的運行中應用；失敗絕不會悄無聲息——一行帶標簽的信息點名失敗的插件與階段，進程以非零碼退出。錯誤上報前會先拆卸應用上下文，因此不會留下半啟動的殘留。

<a id="profiles"></a>
### Profile

Profile 與組合包的聲明類型從 [`@deepseek-ai/dsh-package-manifest`](../../util/package-manifest/README.zh.md) 導入。App-boot 將 `DshPackageManifest` 適配為包身份可選的 `ProfileManifest`，因為本地 profile 無需發布版本。App-boot 負責 profile 加載、JSON 校驗和解析后的運行時數據。

profile 是同一套 dsh 安裝提供不同應用界面的方式：`web`、`headless`、`acp`、`sdk` 與 `sdk-minimal` 從同一 launcher 啟動不同組合。profile 位于 `$DSH_HOME/profiles/<name>`，由可安裝組合包、自身 `cordis.patch.yml` 與 `patchReload: live | startup` 組成；自定義 profile 省略 reload 策略時保留歷史 `live` 默認值。隨產品交付的 `web` 模板實時重載，其他隨附模板只在啟動時應用 patch。`sdk-minimal` 只列出自身的獨立組合包，其他模板保留 base 加模式的組合包棧。`dsh --profile <name> --from-default-profile <template>` 從一個隨附模板，在新的非內置名稱處創建自定義 profile；`dsh plugin` 則初始化以 base 為基礎的 profile，并管理其中安裝的組合包。缺失組合包或未聲明 patch 的組合包會讓啟動明確失敗。由應用持有的 npm 項目（例如 Electron 保留的 Desktop profile）通過 `loadProfileDirectory` 加載已經初始化的目錄，而不會將它暴露給 CLI profile 查找。

你的機器本地偏好同樣位于 harness home 中：

- **`.env`**——你的普通環境層：調用目錄的文件優先于 harness home 的文件，兩者都低于繼承環境。在文件中設置的進程啟動變量（如 `PATH`、`DSH_*`、`XDG_*`）會被拒絕：請改為導出這些變量。四個代理名（`HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY`、`NO_PROXY`）只從 harness home 的文件接受，絕不從調用目錄的文件接受——后者隨 clone 一起到來。對于只想加載某個目錄 `.env` 的非產品 bin，文件缺失不影響啟動，文件無法加載時輸出一行帶標簽的警告。
- **`cordis.patch.yml`**——你的 tweak 層，應用在所有組合包層之后（先應用逐 profile 的文件，再應用 home 級文件，因此后者優先級更高）：替換某個條目的整個配置（重述你要保留的字段）、插入新條目，或在啟動時插值 `!!js` 表達式。patch 指定的條目不存在時輸出 stderr 警告；空文件或僅含注釋的文件會導致啟動失敗——如需禁用該層，請改用 `[]`。

帶 `patchReload: live` 的 profile 會監視兩份用戶 patch 文件：有效編輯無需重啟即可重新組合，被拒絕的編輯則讓最后一個可用應用繼續運行。`startup` profile 既不安裝這些監視器，也不安裝 launcher 的僅監視 HMR（熱模塊替換）回退。

插入條目的插件名可以是絕對文件系統路徑、文件 URL 或包標識符。patch 加載會把 `insert` 條目及其嵌套分組中的絕對路徑以及相對于 patch 文件的 `./` 或 `../` 路徑轉換為文件 URL；對已有條目名稱的斷言及替換用的 `config` 值保持原樣。

### 預覽生效配置

啟動前，你可以打印應用將掛載的確切配置：dump 會以 `!!js` 表達式原樣展示組合后的條目列表，并按注釋分組標明每個源文件及其 patch 層，輸出是一份可加載的 YAML 文檔。未匹配到任何行的 patch 會連同其層標簽一起報告；配置缺失、無法解析或字段無效都會使 dump 失敗。

### 啟動失敗時你會看到什么

啟動失敗是一行帶標簽的信息加非零退出碼——絕不是靜默卡死或原始堆棧轉儲。信息會點名失敗的插件；拋錯的插件保留原始錯誤，從未啟動的條目會連同它等待的服務一起報告。

如果你的應用持有終端，它可以在進程退出前把終端交還，你的 shell 絕不會殘留在 raw 模式。交還過程有界：卡住的清理只會延遲致命退出，而不會取消它。

### 告訴 agent（智能體）harness 所在位置

當你的應用啟動模型驅動的 agent 時，你可以告訴 agent DSH 實現代碼 checkout 的位置：它得知該路徑，也知道不得據此推斷工作目錄——它應使用 `pwd`。這條指示在系統提示詞靠前位置出現一次。沒有系統提示詞服務的應用會跳過；開發環境中，重新加載系統提示詞后它會消失，直至下次啟動。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋上述結果如何實現，并指出實現它們的代碼位置；這里的內容面向開發者，使用本包并不需要。

### 設計說明

- **與渠道無關的庫。** 此包不包含 loader 鉤子，也不提供開發模式接口；[`dsh` 應用](../../../apps/cli/README.zh.md) 持有自己的 Node 源碼啟動鉤子，并在啟動序列中使用這些 helper，構建后的消費方則使用普通 Node 包解析。
- **兩個 Loader builtin。** `mountRootInclude` 把 `cordis:include` 與 `cordis:group` 注冊為 Loader builtin：group 行能把一個提供方與它的消費方放進同一個 `isolate` realm，而位于本工作區之外的 agent preset 無法按名稱解析 `@deepseek-ai/cordis-plugin-group`。兩者都通過宿主的模塊管線加載，而非被包含樹自身的說明符解析。
- **Profile 模塊后備機制。** 裸插件 specifier 由 Loader 從配置目錄解析。普通 Node 會為安裝依賴閉包中的每個包維護一個符號鏈接。打包可執行文件無法讓操作系統符號鏈接進入 pkg 的 `/snapshot` 樹，因此會按 Node ESM 條件讀取已安裝包的 export map，并寫入重新導出虛擬模塊 URL 的真實代理包。缺失 export 保持不可用，錯誤 export map 會讓啟動失敗，跨進程 writer lock 則會在不暴露部分代理的情況下替換陳舊條目。所選外部組合包若不在安裝閉包中，則會獲得 profile 本地的 `.dsh-module-fallback` 鏈接；已有 pnpm 條目優先，后續閉包發現會排除投影鏈接，清理也只刪除 dsh 自有鏈接。
- **單一 rejection 檢查點。** `assertEntriesActivated` 把折入啟動診斷的確切原因保持到下一個進程級 rejection 檢查點可見，使 `installFailLoud` 能合并 Loader 的重復通知，而所有無關的未處理 rejection 仍然致命。
- **兩階段失敗標簽。** `boot()` 區分 `host preparation failed`（`prepare` 在任何配置樹條目掛載前拋出）與 `plugin tree failed to load`（此后的一切失敗），并追加最深層插件錯誤的堆棧，使啟動診斷保留原始激活錯誤，而不只是包裝鏈。

### Helper 行為

每個導出各負責啟動的一個階段：配置解析與快照回放、分層環境加載、明確報錯的保護機制、激活審計、patch 解析、根 include 掛載、配置 dump 渲染、活動 patch 監視、profile 組合，以及 harness 源碼段落。各導出的約定在代碼中，不在本 README——見 [`src/index.ts`](src/index.ts) 與 [`src/profile.ts`](src/profile.ts)。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 啟動 helper：配置解析、環境加載、會明確報錯的保護機制、激活審計、patch 解析、配置 dump、harness 源碼段落 |
| [`src/profile.ts`](src/profile.ts) | profile 發現、初始化、組合包解析、模塊后備機制 |
| — | 不發布運行時不變式伴生入口；邊界與回放測試覆蓋其協議映射。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從共享啟動機制逐步進入組合模型及其背后的決策證據。

- [Cordis 入門](../../../docs/cordis-primer.zh.md)——Loader、`!!js` 配置表達式，以及 include/group 語義。
- [dsh 應用](../../../apps/cli/README.zh.md)——消費這些 helper 的 `dsh` bin。
- [dsh-cmdline](../cmdline/README.zh.md)——各 bin 使用的啟動器到應用命令行交接。
- [Profile 組合包](../../bundle/README.zh.md)——組合進 `dsh --profile` 的可安裝 patch 層。
- [dsh-home-paths](../../util/home-paths/README.zh.md)——harness home 解析器（`resolveDshHome`）。
- [配置來源歸屬](../../../.agents/notes/implemented/architecture/2026-08-04-configuration-source-ownership.zh.md)——被發現的文件為何不得決定 bootstrap 行為。
- [Profile 插件組合包](../../../.agents/notes/implemented/architecture/2026-08-05-profile-plugin-bundles.zh.md)——profile 與組合包組合設計。
- [用戶 patch HMR 測試](../../../.agents/notes/implemented/testing/2026-09-09-user-patch-hmr-test-delivery.zh.md)——事務行為與原生文件系統投遞的驗證歸屬。

-----

<a id="model-experience"></a>
## 模型體驗

模型通過此包加載的插件樹間接受影響——只有該樹貢獻模型上下文；唯一貢獻模型可見文本的導出 `addHarnessSourceSection`，也只有在消費方啟動后調用它時才會產生影響。

#### KV Cache 影響

啟動本身不改變請求前綴。`addHarnessSourceSection` 將源碼路徑放在第一方可復用指令之后，因此工具與配置一致時，不同 checkout 不會改變前置字節。不保證提供方復用緩存。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明此啟動庫在何時不合適，或何時需要特別注意。它們是當前包約束，不是任務積壓。

- **裸包 specifier 依賴 Loader 內部機制**——生產 bin 需要 Loader 的可選原生輔助組件；沒有該輔助組件的進程內調用方必須使用可解析的相對／file specifier，或提供自己的模塊解析鉤子。
- **快照回放替換僅識別特定 basename**——只有以 `cordis.yml` 或 `cordis.yaml` 結尾的配置會映射到同級 `cordis.snapshot.yml`；自定義配置名稱需要調用方自行選擇。
- **環境發現以啟動為界**——`loadLayeredEnv` 只讀取一次調用目錄與 harness home 中的 `.env`；它不搜索父目錄，也不跟隨之后選擇的 workspace。`loadEnv` 仍是非產品 bin 使用的單目錄 helper。
- **用戶 patch 會替換匹配到的整個配置**——按 id 定位的 patch 不做深度合并，因此 profile 覆蓋必須重述需要保留的組合包字段。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文：開放設計問題與尚未決定的探索方向。它明確不具權威性——已交付的行為、限制與既定理由以上文、包代碼和相關 Agent Note 為準。

#### 待定：配置 dump 穩定性

`renderConfigDump` 的輸出是一份可加載的 YAML 文檔，其 `# ==` 來源注釋與 `!!js` 原樣渲染服務于 `--dump-config` 診斷。任何內容都不承諾跨包版本的字節穩定性；在程序化消費該輸出之前，請決定 dump 是否成為序列化約定。

</details>
