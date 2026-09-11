---
description: "DeepSeek Harness 主目錄與用戶數據路徑的共享解析，供需要統一根目錄、波浪號展開與穩定監聽路徑的包使用。"
kind: "package-library"
---

# @deepseek-ai/dsh-home-paths

[English](README.md) | 中文

## 概述

`@deepseek-ai/dsh-home-paths` 讓包作者能夠解析統一的 DeepSeek Harness 數據根目錄，并由它派生子路徑。顯式路徑優先于 `$DSH_HOME`，后者優先于 `~/.dsh`；空白環境變量會被忽略。其公開輔助函數可以在不暴露機器絕對路徑的情況下顯示根目錄，僅展開單獨或當前用戶的波浪號形式，并規范化最終路徑段尚不存在的監聽目標。請把它作為庫依賴直接使用，不要通過 `cordis.yml` 加載。

## 目錄

- [使用本包](#use-this-package)
- [理解實現](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

當包必須與 harness 的其他部分就用戶數據存放位置達成一致時使用這些輔助函數：先解析一次主目錄，再從中派生所有子路徑。

### 解析主目錄

```ts
import { resolveDshHome, dshHomePath, dshCachePath } from '@deepseek-ai/dsh-home-paths'

const home = resolveDshHome()                // configured path, else $DSH_HOME, else ~/.dsh
const settings = dshHomePath('settings')     // join one child onto the resolved home
const cache = dshCachePath('models')         // $DSH_HOME/cache/models, default ~/.dsh/cache/models
```

顯式配置的路徑優先級最高，然后是 `$DSH_HOME`，最后是默認的 `~/.dsh`。空或僅含空白的 `$DSH_HOME` 視為未設置，因此空白的覆蓋值絕不會把主目錄解析到當前工作目錄。

`dshCachePath(...segments)` 從解析出的主目錄下的 `cache` 目錄派生路徑。不傳路徑段時返回緩存目錄本身。傳入首個選項對象 `dshCachePath({ dshHome: home }, ...segments)` 可使用顯式配置的主目錄，遵循相同的優先級與波浪號展開規則。它返回絕對路徑，不會創建目錄。

### 展示主目錄

面向用戶的路徑請以符號形式渲染根目錄，而不是機器路徑：默認主目錄顯示為 `~/.dsh`，任何已配置的主目錄顯示為 `$DSH_HOME`。展示形式絕不會泄露機器的絕對路徑。

### 展開用戶路徑

`expandHomePath` 針對操作系統主目錄展開開頭的 `~`、`~/` 或 `~\`，其余內容原樣保留——非波浪號路徑以及 `~alice/...` 等指定用戶的形式不做任何改動。

### 規范化監聽路徑

`canonicalizeWatchPath` 為原生文件系統 watcher 提供目標路徑的一種規范化寫法：先通過 `realpath` 解析層級最深的現有祖先，再拼回缺失的后綴，因此文件或目錄在創建之前就可以被監聽。這可以防止 Windows 把普通文件祖先當作普通缺失處理，也防止 8.3 短名別名與原生 watcher 后端發出的長路徑混用。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本包建立在一個原則上：harness 的所有用戶數據都位于同一個根目錄下，其他每個輔助函數都由該決策派生。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 主目錄解析、路徑拼接、展示、波浪號展開與監聽路徑規范化 |
| — | 不發布運行時不變式伴生入口；這個純工具包不持有事件流或可變運行時數據；其解析規則和值代數由單元測試保障。 |

### 解析規則

`resolveDshHome` 先讀顯式覆蓋值，然后讀 `$DSH_HOME`，最后回退到操作系統主目錄拼接 `.dsh`。選中的值經過波浪號展開并規范化為絕對路徑；`dshHomePath` 用 Node 的平臺路徑規則拼接子路徑段。`dshHomeDisplay` 把解析出的路徑與默認根目錄比較并返回符號標簽，因此已配置的主目錄絕不泄露其絕對路徑。

### 規范化機制

`canonicalizeWatchPath` 從目標向上逐級查找，直到找到現有祖先，用 `realpath` 解析它、證明它是可枚舉目錄，再拼回缺失的后綴。除路徑不存在以外的錯誤都會傳播；缺失后綴的祖先若不是目錄則被拒絕。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當你需要啟動器或依賴統一主目錄根的消費方時，閱讀以下頁面。

- [boot 包](../../boot/app-boot/README.zh.md)——在任何插件掛載之前解析主目錄的啟動器。
- [shell 環境](../../shell/shell-env/README.zh.md)——`DSH_HOME` 如何到達模型 shell 調用。
- [匿名用戶 id](../../identity/anonymous-user-id/README.zh.md)——位于解析后主目錄下的存儲身份文件。

-----

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明這些輔助函數何時不是合適的工具。它們是當前包約束，不是任務積壓。

- **展開范圍刻意保持狹窄**——只有單獨的 `~`、`~/...` 和 `~\...` 使用當前操作系統主目錄；`~alice/...` 等指定用戶的形式、環境變量與 shell 表達式保持不變。
- **規范化只讀不改**——`canonicalizeWatchPath` 執行 `realpath` 探測并傳播除路徑不存在以外的錯誤；調用方仍負責目錄創建、權限，以及對結果路徑應用信任策略。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
