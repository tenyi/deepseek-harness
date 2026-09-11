# DeepSeek Harness 桌面端

[English](README.md) | 中文

桌面應用是包裹 dsh Web UI 的 Electron 殼。它不打開監聽端口：內置的上游 Node.js 子進程啟動已安裝的 dsh 項目，帶版本的分幀字節管道在沒有外層 Base64 信封的情況下承載 Fetch 請求與流式響應，Node IPC 承載生命周期控制，`dsh-app://` 則提供與后端版本匹配的客戶端資源。

## 關鍵技術決策

| 決策 | 原因 | 直接結果 |
|---|---|---|
| 發布身份 | 桌面殼 API、Web 客戶端、后端與插件依賴圖作為一個組合完成驗證；獨立版本會產生未經驗證的組合，并讓更新可用性含糊不清。 | Electron 與 `@deepseek-ai/dsh` 始終使用同一精確版本。即使桌面殼代碼不變，升級 dsh 也必須發布新 Desktop 版本。 |
| 運行時 | Electron 的 Node.js 帶有 Electron 補丁、fuse、ABI 與生命周期約束，而系統運行時和包管理器狀態不可控。 | dsh 通過內置的上游 Node.js 運行，所有包操作都使用內置 pnpm。Electron 的 Node.js、系統 Node.js、系統 pnpm 與用戶的包管理器配置都不進入執行路徑。 |
| 包來源 | 即使離線，啟動時安裝核心依賴也會增加開銷。 | `extraResources/dsh` 攜帶完整生產依賴樹；profile 只安裝外部插件。 |
| 共享模塊 | 宿主 API 可能依賴模塊實例身份。 | Desktop 用目錄軟鏈接或 Windows junction 把每個內置第一方包連接到 profile；普通插件依賴保留在本地。 |
| 狀態歸屬 | 共享可執行依賴圖會讓 CLI（命令行界面）與 Desktop 相互改變 dsh、Cordis、插件或原生模塊版本，而兩個桌面進程還可能爭用同一個 profile。 | Electron 在訪問任何 profile 前獲取進程生命周期單實例鎖，并獨占 `$DSH_HOME/profiles/desktop` 及其包管理器狀態。CLI 與 Desktop 共享 `$DSH_HOME` 下受支持的產品數據，但絕不共享可執行包、插件激活、鎖文件或 `node_modules`。 |
| 通信 | 監聽 Web 服務會引入端口歸屬、認證、CORS 與暴露風險；Electron 與上游 Node.js 之間也需要明確的跨進程協議。 | 應用不打開 Web 端口。`dsh-app://` 承載 Web 資源和 Fetch 流量；分幀字節管道以背壓傳輸有界請求與響應分塊，Node IPC 只承載子進程生命周期控制。 |
| 插件變更 | 包安裝和 Host 啟動可能失敗。 | Desktop 停止 Host 后直接修改當前 profile。失敗保留部分修改供用戶修復，不自動回滾 profile。 |
| 更新 | 桌面殼與 dsh 獨立更新會重新產生版本分裂，而桌面殼未變化的數據塊不應強制完整傳輸。 | Electron 殼、匹配的 dsh 運行時、Node.js 與 pnpm 組成一個已簽名更新單元。平臺更新產物可以復用未變化的數據塊，但運行時版本選擇絕不脫離 Desktop 發布。 |

[Electron 打包與更新 Agent Note](../../.agents/notes/implemented/architecture/2026-08-25-electron-desktop-packaging-and-updates.zh.md) 記錄了這些決策背后的理由、替代方案、安全約束和發布驗證要求。

## 安裝歸屬

Electron 擁有 `$DSH_HOME/profiles/desktop`。其 `dependencies` 只包含已安裝外部插件的精確版本；`dsh.profile.bundles` 包含內置 bundle，后接已啟用插件。簽名應用從 `resources/dsh` 提供 dsh、私有 Desktop Host 及其生產依賴。共享包鏈接解析到這些實際目錄。宿主與插件在同一個內置上游 Node 進程中執行，使用正常的 realpath 解析；Desktop 不啟用 `--preserve-symlinks`。CLI 不能啟動或修改此 profile。

本地啟動頁提供啟動狀態和可用恢復操作；加載后的 dsh 渲染進程僅接收桌面協議標記。獨立插件窗口接收結構化的列表、安裝、刪除、更新和更新檢查操作；兩個渲染進程都無法訪問文件系統、原始 Electron IPC、shell 或任意 pnpm 參數。

Electron 根據應用 locale 選擇類型化的英文或中文桌面殼文案，并以英文作為 fallback。菜單、原生對話框、啟動頁與插件管理渲染進程使用同一 locale 數據；倉庫的 Client UI i18n gate 會檢查這些桌面源文件。

### 運行時與插件激活

簽名資源中的 `resources/dsh/desktop-runtime.json` 綁定 shell 版本、內置 Node 版本、平臺、架構、共享包版本和最終文件清單。啟動讀取元數據，并檢查共享包記錄。發布 schema、shell 版本、目標兼容性和文件完整性在打包時驗證。首次啟動不會把核心包復制到 profile 存儲或通過 pnpm 安裝核心包。

1. 主窗口在 profile 準備或后端啟動前顯示本地加載頁。新 profile 創建清單和共享包鏈接，保留無關文件，然后啟動一次實際后端。未變化的啟動復用 profile，不掃描已安裝插件的清單。
2. 兼容的應用升級在當前 profile 中刷新共享鏈接，并檢查已啟用插件的 peer 要求。插件文件、配置、版本和鎖文件留在原處；不運行 pnpm。
3. 內置 Node 版本、平臺或架構變化時，禁用腳本重新安裝鎖定的插件依賴圖，驗證并鏈接宿主包，然后運行已批準的待執行構建并再次驗證。
4. 插件添加、更新和刪除使用內置 pnpm 及 Desktop 獨有的包管理器狀態。保留的宿主包必須聲明為 peer；共享包的嵌套副本和別名會被驗證拒絕。普通插件依賴必須解析到 profile 內部。
5. 插件變更在直接修改當前 profile 前停止后端。準備成功后啟動 Host。包操作或 Host 啟動失敗會保留已修改文件并報告錯誤。未完成的包操作保留標記，使下次啟動重試鎖定依賴的安裝和待執行構建。Desktop 不創建 staging 目錄、激活日志或回滾副本。

加載頁不依賴 Host。錯誤頁提供重啟和重裝指導。只有已打包應用的資源支持 profile 恢復時，才提供禁用插件和重置 Desktop；開發模式和早期初始化失敗只提供重啟。應用菜單仍提供插件管理器入口。每次后端啟動前都會檢查運行時標識；插件修改不自動回滾。

重置刪除 `$DSH_HOME/profiles/desktop` 中除所持事務鎖外的所有條目，然后初始化內置 profile。它刪除 Desktop 配置和已安裝第三方包，不保留備份。共享任務、設置和 Harness-home `.env` 保持不變。殼資源和 preload 失敗時使用獨立文檔顯示可用恢復操作和診斷；其控件不依賴 preload。

包事務獨占持有 `$DSH_HOME/profiles/desktop/lock`，直到 pnpm 進程退出。重置保留目錄及其鎖，直到初始化和 Host 啟動完成。共享鏈接在 macOS/Linux 使用目錄軟鏈接，在 Windows 使用 junction；清理只移除鏈接，不刪除其目標。共享包使用文件系統的規范路徑識別，因此 Windows 路徑大小寫變化不會單獨觸發 profile 激活。原生構建遵循 profile 中經過審查的 `allowBuilds` 列表；新安裝的包如果需要構建但未在列表中獲準，事務會失敗。

## 開發

`dev:desktop` 會構建當前 Host、客戶端 bundle、Web 前端和 Electron 殼，把已構建的 CLI 包、私有 Desktop Host 包及其 workspace 依賴投影為一次性桌面 npm 項目，然后直接啟動 Electron；這條路徑不下載安裝包內的 Node.js，也不從 npm 解析 dsh：

```sh
pnpm run dev:desktop
```

開發 Harness 狀態默認寫入 `apps/desktop/.desktop-build/development/home`，一次性 npm 項目位于 `apps/desktop/.desktop-build/development/project`，Electron 瀏覽器數據則位于 `apps/desktop/.desktop-build/development/electron-user-data`。因此，會話、設置、憑據、包鏈接和瀏覽器數據都不會進入用戶正常使用的 Harness home；顯式 `DSH_HOME` 只會替換開發 Harness home。Renderer DevTools 默認自動打開，Main、Renderer 和 dsh Host 調試端口依次為 9229、9222 和 9230。`DSH_DESKTOP_MAIN_INSPECT_PORT`、`DSH_DESKTOP_RENDERER_DEBUG_PORT` 與 `DSH_DESKTOP_HOST_INSPECT_PORT` 可以替換這些端口，`DSH_DESKTOP_OPEN_DEVTOOLS=0` 則保持 Renderer 調試窗口關閉。

顯式構建完成后，`start:desktop` 會重新生成一次性項目，并跳過構建直接啟動已有產物：

```sh
pnpm run start:desktop
```

Workspace 開發使用調用命令的 Node.js 運行當前 CLI 與私有 Desktop Host 包，并禁用桌面包修改；只有該模式明確鏈接的一次性 profile 可以從自身目錄外解析 bundle。需要驗證內置 Node.js、內置 pnpm、內置 dsh 資源、插件安裝和修復時，應運行未封裝安裝器的應用目錄。

## 打包

正常打包只需執行一條完整命令。該命令會先準備發布資源，再生成宿主平臺的安裝包與更新元數據。所有目標都要求通過 `DSH_DESKTOP_APP_ID` 提供反向域名形式的應用 ID。macOS 目標還要求通過 `DSH_DESKTOP_MACOS_SIGNING_IDENTITY` 提供 electron-builder 證書限定名，通過 `DSH_DESKTOP_MACOS_TEAM_ID` 提供對應的 10 字符 Apple Team ID，并提供一套完整的 notarytool 憑據方案。App Store Connect API Key 方式使用以下變量：

```sh
export DSH_DESKTOP_APP_ID='<reverse-DNS application ID>'
export DSH_DESKTOP_MACOS_SIGNING_IDENTITY='<certificate name without the Developer ID Application prefix>'
export DSH_DESKTOP_MACOS_TEAM_ID='<10-character Apple Team ID>'
export APPLE_API_KEY='<absolute path to the .p8 file>'
export APPLE_API_KEY_ID='<App Store Connect API Key ID>'
export APPLE_API_ISSUER='<App Store Connect issuer UUID>'
```

無需提前執行 `prepare:desktop`：

```sh
pnpm run package:desktop
```

發布自動化使用固定目標命令，確保運行時準備、dsh 準備與 electron-builder 接收相同的平臺和架構：

```sh
pnpm run package:desktop:mac:arm64
pnpm run package:desktop:mac:x64
pnpm run package:desktop:win:x64
```

macOS arm64 命令要求 Apple Silicon。macOS x64 命令可以在 Intel macOS 或帶 Rosetta 的 Apple Silicon 上運行。Windows x64 命令要求 Windows x64。Linux 不是受支持的 Desktop 發布目標。

每個目標都在 `apps/desktop/.desktop-build/targets/<target>/` 下持有自己的打包輸入、已準備運行時、包集合、dsh 依賴樹、pnpm 準備狀態、未打包應用、更新元數據和最終產物。Node.js 歸檔緩存繼續由 `.desktop-build/downloads` 共享，因為每個歸檔文件名都包含版本、平臺和架構，并且在解包前經過驗證。目標構建絕不讀取其他目標的可變準備狀態。

### 運行時文件篩選

生產包首先經過 npm 發布規則和依賴安裝。[桌面文件規則](scripts/runtime-file-policy.ts)隨后在簽名和完整性封存之前過濾不可變的 `resources/dsh/node_modules` 副本。它排除 TypeScript 聲明、明確屬于 JavaScript/CSS/TypeScript 的 source map、TypeScript 構建緩存、Domino 測試目錄、指定的原生編譯產物，以及其他平臺的 node-pty 預構建文件。它保留運行時 JavaScript、原生模塊及其 DLL/EXE 輔助程序、WASM、未知資源、許可證和聲明。規則不會修改 npm tarball、內置包管理器或用戶安裝的插件文件。

打包應用運行編譯后的 JavaScript 和預生成的 Typert 元數據，不編譯 TypeScript 插件。源碼級調試導航和編輯器聲明仍可從開發包中獲取。[復制規則測試](tests/runtime-file-policy.spec.ts)覆蓋排除項和保留資源；`prepare:dsh` 在 Host smoke 和最終清單驗證之前，使用內置 Node 執行[產物 smoke](tests/fixtures/runtime-payload-smoke.mjs)。

Windows 發布驗收還需在 Desktop 構建后手動運行[原生清理和替換檢查](scripts/smoke-windows.ps1)。將 `$Electron` 設為已準備的 Electron 可執行文件，將 `$Makensis`、`$SevenZip` 和 `$PluginDir` 分別設為鎖定版本構建器的 NSIS 編譯器、7-Zip 可執行文件和 x86-unicode NSIS 插件目錄。從倉庫根目錄運行以下命令。它驗證 Electron junction 清理、安裝器臨時目錄清理和兩種文件占用替換方式；不屬于單元測試通道。

```powershell
pwsh -NoProfile -File apps/desktop/scripts/smoke-windows.ps1 -Electron $Electron -Makensis $Makensis -SevenZip $SevenZip -PluginDir $PluginDir
```

### 上傳更新

`DSH_DESKTOP_AUTO_UPDATE_ENV` 同時選擇打包時寫入的更新 URL 與后續 COS 上傳目標，可取 `test` 或 `production`；未設置時使用 `test`。測試打包必須通過 `DOWNLOAD_TEST_ORIGIN` 提供 HTTPS origin，生產 origin 仍為 `https://download.deepseek.com`。上傳還必須通過 `DOWNLOAD_TEST_COS_BUCKET` 或 `DOWNLOAD_PROD_COS_BUCKET` 提供所選環境的 COS bucket。目標路徑為 `_/harness/desktop/stable/<target>/`，其中 `target` 為 `mac-arm64`、`mac-x64` 或 `win-x64`。

更新目標與上傳憑據都與所選環境對應：

| 環境 | 公開 origin | COS bucket | COS 憑據 |
|---|---|---|---|
| `test` 或未設置 | `DOWNLOAD_TEST_ORIGIN` | `DOWNLOAD_TEST_COS_BUCKET` | `DOWNLOAD_TEST_COS_SECRET_ID`、`DOWNLOAD_TEST_COS_SECRET_KEY` |
| `production` | `https://download.deepseek.com` | `DOWNLOAD_PROD_COS_BUCKET` | `DOWNLOAD_PROD_COS_SECRET_ID`、`DOWNLOAD_PROD_COS_SECRET_KEY` |

同一目標必須在同一環境下完成打包與上傳。例如，默認測試環境使用：

```sh
export DOWNLOAD_TEST_ORIGIN='https://desktop-updates.example.com'
pnpm run package:desktop:mac:arm64

export DOWNLOAD_TEST_COS_BUCKET='<test COS bucket>'
export DOWNLOAD_TEST_COS_SECRET_ID='<test COS SecretId>'
export DOWNLOAD_TEST_COS_SECRET_KEY='<test COS SecretKey>'
pnpm run upload:mac:arm64
```

生產發布需在打包前設置 `DSH_DESKTOP_AUTO_UPDATE_ENV=production`，再在執行 `upload:mac:arm64`、`upload:mac:x64` 或 `upload:win:x64` 前提供 `DOWNLOAD_PROD_COS_BUCKET` 與生產憑據對。打包不要求 COS bucket 或憑據。它會明確禁止 electron-builder 發布，從其子進程中刪除全部四個 COS 憑據字段，并且只有在 electron-builder 以及全部簽名或公證鉤子成功后才寫入目標完成記錄。上傳會先要求該記錄與所選環境、目標、公開 URL 和當前 dsh 版本一致，再要求根 dsh 版本、Desktop 版本、頻道元數據版本、產物名稱、大小與 SHA-512 全部一致，之后才讀取所選 COS 憑據對。它只上傳該目標不可變且帶版本的產物，最后以 `no-cache` 上傳根據版本得出的頻道元數據，并且不會刪除歷史對象。穩定版本使用 `latest-mac.yml` 或 `latest.yml`；`alpha` 等預發布版本則使用 `alpha-mac.yml` 或 `alpha.yml`，與 electron-builder 生成的文件名一致。

macOS 配置使用必填發布環境，不會接受鑰匙串中最先發現的證書。空值、格式錯誤的 Team ID、包含 electron-builder 不支持的 `Developer ID Application:` 前綴的簽名身份，以及不完整的公證憑據都會被拒絕。macOS 打包要求已配置的身份及其私鑰可用。運行時準備會把該身份、安全時間戳與 hardened runtime 應用到每個內嵌 Mach-O 文件；應用簽名完成后，深度嚴格檢查會拒絕其他葉證書 Authority 或 Team ID，驗證通過才生成發布產物。macOS 固定目標安裝包命令為已簽名應用創建獨立副本，并發執行兩條產物流。一路先公證 App 并釘票，再生成 ZIP 及其更新元數據。另一路把已簽名 App 副本封裝進簽名 DMG，再公證 DMG、釘票并驗證；其中的 App 不單獨附加票據。只有兩路均成功結束，產物才會移入最終目錄并寫入發布完成記錄。僅生成目錄的命令同樣需要公證憑據，并等待 Apple 公證和 App 釘票完成。[并行公證決策](../../.agents/notes/implemented/process/2026-09-09-parallel-macos-notarization.zh.md)負責副本隔離與容器票據語義。私鑰可以來自登錄鑰匙串或 electron-builder 的標準 `CSC_LINK` 輸入；環境中的 `CSC_NAME` 與證書發現順序都不能選擇發布所有者。公證憑據也可以使用 electron-builder 支持的完整 Apple ID 或鑰匙串 profile 方式。手動執行 `pnpm --dir apps/desktop run verify:mac-signature -- <path-to-app>` 重復應用檢查時，也必須提供兩個 macOS 身份變量。

macOS 簽名遍歷真實文件，不跟隨 Framework 的軟鏈接別名。PAK 資源保留全部隨附語言，由外層 Framework 或應用簽名記錄完整性，不逐個簽名。[發布策略](../../.agents/notes/implemented/architecture/2026-08-25-electron-desktop-packaging-and-updates.zh.md)負責依賴補丁和驗證要求。

可通過公司代理加速向 Apple 公證服務上傳。代理配置參見公司內部文檔。

### 未簽名 Windows 測試安裝包

在 Windows x64 上，使用完整的未簽名打包命令進行本地安裝測試：

```sh
pnpm run package:desktop:win:x64:unsigned
```

該命令要求設置 `DSH_DESKTOP_APP_ID` 并具備常規構建依賴，包括編譯原生模塊所需的 Python 和 Visual C++ 構建工具。Python 不在 `PATH` 中時，將 `PYTHON` 設置為其可執行文件路徑。命令將安裝包寫入 `.desktop-build/targets/win-x64/unsigned-artifacts/`，省略自動更新配置，清除簽名憑據，且不生成發布完成記錄。它不需要 EV 憑據或更新源地址。簽名打包和上傳命令仍遵循正式發布要求。

### Windows EV 簽名

Windows 打包將 7-Zip 過濾器固定為 `BCJ`，以兼容內置的 NSIS 解碼器。這樣可以保留 x64 安裝包中由依賴攜帶的 ARM64 二進制文件；自動 ARM64 過濾會生成該解碼器無法解壓的條目。

NSIS 在安裝階段清理臨時解壓目錄，完成后才顯示完成頁或自動啟動應用。已安裝的生產依賴保持為普通文件；啟動時不會再次解壓。安裝仍會寫入完整的應用目錄樹。

Windows 發布打包要求 `DSH_DESKTOP_WINDOWS_CER_FILE` 標識公開的 GlobalSign EV 葉證書，要求 `DSH_DESKTOP_WINDOWS_SIGNTOOL` 標識與 SafeNet 兼容的 SignTool 可執行文件，要求 `DSH_DESKTOP_WINDOWS_KEY_CONTAINER` 標識匹配的私鑰容器，并要求 `DSH_DESKTOP_WINDOWS_TOKEN_PIN` 包含 SafeNet Token Password。證書文件保留在源碼倉庫之外，匹配的私鑰仍位于 USB Token。運行固定 Windows 目標前設置這四個輸入：

```powershell
$env:DSH_DESKTOP_WINDOWS_CER_FILE = 'C:\path\to\server.cer'
$env:DSH_DESKTOP_WINDOWS_SIGNTOOL = 'C:\path\to\the\validated\signtool.exe'
$env:DSH_DESKTOP_WINDOWS_KEY_CONTAINER = '<SafeNet private-key container name>'
$env:DSH_DESKTOP_WINDOWS_TOKEN_PIN = '<SafeNet Token Password>'
pnpm run package:desktop:win:x64
```

打包前插入并解鎖 Token。electron-builder 鉤子把每個產物交給采用 CRLF 的 `scripts/windows-sign.cmd`；該 CMD 只調用一次已配置的 SignTool，并指定 `/f`、SafeNet `/kc "[{{PIN}}]=容器"`、`/csp "eToken Base Cryptographic Provider"`、SHA-256 文件摘要和 DigiCert SHA-256 RFC 3161 時間戳。鉤子不會改用 electron-builder 內置的 SignTool，也不會重試失敗的簽名請求。SignTool、證書、容器、PIN、Token 或簽名不可用時，Windows 發布打包會失敗，不會生成未簽名產物。

PIN 不能包含 `]`、引號或換行，因為這些字符用于分隔 SafeNet `/kc` 值或對應的 CMD 參數。CMD 會禁用延遲展開，因此包含 `!` 的 PIN 可以原樣到達 SafeNet。打包流程不會把任何 `DSH_DESKTOP_WINDOWS_*` 字段傳給構建與 運行時準備子進程；它只向 electron-builder 提供四個配置輸入，在其他字段已經清理的環境中只向簽名 CMD 提供經過校驗的簽名字段，在 SignTool 啟動前清除這些字段，并遮蓋 SignTool 診斷。SafeNet 仍要求 PIN 出現在 SignTool 進程命令行中。只能在連接了物理 Token 的受控 self-hosted Windows runner 上把它注入為臨時 secret；絕不能提交該值、把它寫進 `.env`，或持久保存為 Windows 用戶或系統環境變量。

使用對應的 `:dir` 命令可以生成可直接運行的應用目錄，而不是安裝包，例如：

```sh
pnpm run package:desktop:dir
pnpm run package:desktop:mac:arm64:dir
```

需要檢查或診斷為宿主目標準備的資源而不調用 electron-builder 時，可以讓同一流水線在準備完成后停止：

```sh
pnpm run prepare:desktop
```

這條診斷命令是另一種停止位置，并非兩條命令構建流程的前半段。之后執行 `package:desktop*` 時仍會重新完成正式構建與準備，避免使用陳舊的 dsh 包、運行時文件或 dsh 內容。

每條打包命令都會構建倉庫，打包以 dsh 和私有 Desktop Host 為根的第一方生產依賴閉包，并準備目標專用的 Node 與 pnpm 可執行文件。`prepare:dsh` 在構建時安裝一次生產依賴圖，把物化包復制到 `extraResources/dsh`，移除包管理器元數據，并生成包含共享包版本和最終文件哈希的 `desktop-runtime.json`。在 macOS 上，它先簽名并驗證原生文件，再生成清單；electron-builder 不對已簽名的此目錄重復進行嵌套簽名。資源映射明確包含默認根目錄過濾器會忽略的 `dsh/node_modules`；復制后的清單在簽名前及簽名后分別驗證。簽名安裝包、公證、已安裝應用升級和各目標原生模塊的驗收需要發布環境。

未壓縮產物包含 Electron、物化后的 dsh 生產依賴樹、上游 Node.js 與 pnpm，以及殼應用。安裝包大小與文件系統占用不同；發布驗收需要測量兩者，以及 profile 插件存儲和首次啟動耗時。此布局用更多應用內文件換取消除用戶機器上的核心包安裝過程。

## 更新

打包應用會在主窗口打開十秒后檢查目標專用的發布流；本地化的 **檢查更新…** 菜單項會手動觸發同一檢查。發現可用版本時，應用打開一個原生確認彈窗。用戶確認后，應用等待正在進行的檢查完成，下載并驗證已簽名的 Desktop 發布、停止 dsh 子進程，并把安裝與重啟交給 electron-updater。下次啟動在顯示本地加載頁的同時校準版本綁定的運行時。

簽名打包為 `DSH_DESKTOP_AUTO_UPDATE_ENV` 選擇的部署生成 generic-provider 頻道元數據。NSIS 差分包與 macOS ZIP 目標讓 electron-updater 可以復用未變化的數據塊；供手動安裝的 DMG 經過公證，但不生成 blockmap，因為它不是 macOS updater 的載荷。運行時與桌面殼仍屬于同一個簽名 Desktop 發布。macOS 簽名與公證憑據使用 electron-builder 的標準環境變量；Windows EV 簽名使用上文所述的公開證書、已驗證 SignTool、SafeNet 容器和 runner PIN。必填 Desktop 發布環境選擇構建所驗證的應用身份與平臺簽名身份。

## 底層開發覆蓋項

未打包的 Electron 進程使用應用目錄下的 `.desktop-build/development/project` 作為開發項目。`DSH_DESKTOP_NODE_BINARY`、`DSH_DESKTOP_PNPM_ENTRY` 和 `DSH_DESKTOP_DSH_DIR` 用于選擇明確的運行時資源。打包應用會忽略這些變量，從 `process.resourcesPath` 解析簽名資源，并使用受管 Desktop profile。

## 已知限制

- Desktop 禁用 Web 的「在本地應用中打開…」操作，因為其 Host 插件依賴 HTTP 路由，而 Desktop 不提供 `webServer`。
- 發布簽名、公證、更新托管和跨上一版本的已安裝產物驗證需要生產發布環境。
- 依賴包含 lifecycle script 的桌面插件，只有其包名進入桌面項目經過評審的 `allowBuilds` 策略后才能安裝。
- 桌面殼與 CLI dsh 共享 `$DSH_HOME` 下的會話、設置、憑據、工作區和存儲，但可執行包、插件激活、鎖文件與包管理器狀態彼此隔離。
