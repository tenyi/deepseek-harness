---
description: "dsh app bin 的應用自有命令行：應用從啟動器剩余參數中解析自己的 flag、--help 與退出行為。"
kind: "package-library"
---

# @deepseek-ai/dsh-cmdline

[English](README.md) | 中文

## 概述

`dsh-cmdline` 讓應用從啟動器 flag 之后原樣留下的參數中解析自己的 flag、`--help` 與錯誤。解析值可以覆蓋配置默認值，而無需改寫配置。應用還可以通過啟動器的關停路徑請求進程退出。適用于擁有自有命令行界面的應用 bin。它不增加提示詞、schema 或模型可見內容。

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

你的應用在啟動時讀取本次調用的內層參數，任意數量的插件都可以使用它們。常用路徑是：啟動插件讀取參數、解析它們，再發布解析后的值；其他行由這些值配置自身。

### 啟動器提供的值

啟動器向你的應用提供三樣東西：

- `ctx.cmdlineArgs`——本次調用的內層參數。讀取它返回一份不可變快照，且絕不會消費或修改它們：`dsh --profile tui --resume abc` 給你的應用 `['--resume', 'abc']`。
- `ctx.appExit`——在整棵樹關閉后請求進程退出的方式，接到啟動器的關停控制器上。
- `ctx.appReady`——成功啟動信號，只在 Loader 樹與啟動器自有設置成功后提交。

沒有參數的啟動會看到空列表——這是誠實的答案，而不是缺失的值。

`exitOnStdinEnd(ctx, label)` 把已成功啟動的 stdio 應用 EOF 綁定到 `ctx.appExit(0)`。它絕不讀取或恢復 stdin，因此協議傳輸會收到掛載前已緩沖的字節；啟動拒絕優先于競態 EOF，所屬 fiber 會移除兩個待處理的監聽器。

### 解析你的 flag

你自帶自己的 commander program：聲明你的 flag 與 action，本包會針對內層參數運行它。校驗只發生在你的 action 中，并由它發布你的行所需的任何值。插件的 Loader 行不攜帶特殊標記：

```yaml
- id: web-startup
  name: '@deepseek-ai/dsh-web-app/startup'
```

由解析值配置的行注入發布的服務，并在其配置中直接讀取它：

```yaml
- id: webserver
  name: '@deepseek-ai/dsh-host-webserver'
  inject: [webStartup]
  config:
    host: !!js ctx.webStartup.host ?? '127.0.0.1'
    port: !!js ctx.webStartup.port ?? 3080
```

結果：即使配置寫的是 3080，`dsh --profile web --port 8080` 也會讓服務器監聽 8080 端口，因為 flag 優先。`--help` 打印你的應用幫助并以 0 退出、不啟動任何內容；被拒絕的值（例如非數字端口）打印你的錯誤并以非零碼退出，任何依賴解析值的行都不會啟動。

### flag 如何勝過配置值

寫在 `!!js` 表達式旁的值是后備：flag 存在時 flag 優先，否則使用寫下的值。配置求值在啟動時、你的解析器運行之后執行一次，因此 flag 絕不會被之后的配置重載悄悄重置。

### 多個插件讀取同一份參數

任意數量的插件都可以讀取同一份參數——讀取絕不會消費它們——每個插件都能解析自己需要的部分并發布各自的值。啟動器不會決定誰是命令行的所有者：沒有讀取方的應用會忽略自己的參數。

本倉庫之外構建的應用行為一致：即使它們自帶 commander 副本，其 `--help` 也會打印并退出，而不是崩潰。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋上述結果如何實現，并指出實現它們的代碼位置；這里的內容面向開發者，使用本包并不需要。

### 設計說明

- **啟動器事實，而非配置。** `cmdlineArgs` 與 `appExit` 在樹掛載前提供到宿主上下文上；它們不是 Loader 行，因此沒有任何組合持有或覆蓋它們。
- **按位置切分。** 啟動器不認識任何應用行：自身 flag 之后的第一個 token 就是應用參數的起點，因此 flag 家族、`--help` 文本與解析錯誤都由應用自己持有。
- **結構化錯誤識別。** `isCommanderError` 讀取 commander 的錯誤碼前綴，而不是用 `instanceof`，因為樹外插件會帶來自己的一份 commander 副本，其 `CommanderError` 身份不同；`configureExitAndOutput` 會遍歷每個子命令，因為 commander 只在注冊時復制退出與輸出設置。
- **可注入的輸出流。** `internals` 持有輸出流，使測試無需觸碰進程即可捕獲 commander 的文本。

### 解析約定

解析流程由兩部分負責：`provideCmdline` 凍結宿主參數，并在任何配置樹條目掛載前提供 `cmdlineArgs` 與 `appExit`；`parseCmdline` 針對不可變參數運行你的 commander program，把每個命令的 help、version 與錯誤輸出都接到啟動器上。被拒絕的值、`--help` 或 `--version` 會打印 commander 文本并請求 `ctx.appExit`，且不發布任何內容，因此依賴行絕不會激活；Loader 會把每行的 `!!js` 插值推遲到該行聲明的注入全部激活之后。各導出的約定在代碼中，不在本 README——見 [`src/index.ts`](src/index.ts)。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | `CmdlineArgs`/`AppExit` 類型、`provideCmdline`、`parseCmdline`、commander 退出／輸出路由 |
| — | 不發布運行時不變式配套條目；`cmdlineArgs` 是不可變的啟動器事實，任意數量的普通插件都可以讀取它。應用自有提供方與消費方使用普通 Cordis 服務注入；Loader 結算已會報告缺失的依賴。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從交接機制逐步進入消費它的應用。

- [dsh-app-boot](../app-boot/README.zh.md)——提供這些啟動器值的啟動序列。
- [dsh-web-app 組合包](../../bundle/web-app/README.zh.md)——通過此包持有 Web flag 家族的應用。
- [dsh-headless 組合包](../../bundle/headless/README.zh.md)——從命令行讀取任務的一次性 runner。

-----

<a id="model-experience"></a>
## 模型體驗

無。本包在任何會話存在之前解析進程自身的命令行；所有模型可見的影響都由配置行產生。

#### KV Cache 影響

無；本包既不組裝也不發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明應用自有命令行在何時不合適，或何時需要特別注意。它們是當前包約束，不是任務積壓。

- **啟動器的 flag 必須寫在應用參數之前**——切分按位置進行：啟動器不認識的第一個 token 就是內層參數的起點，因此寫在某個應用 flag 之后的 `--patch` 屬于應用。啟動器的解析器會消耗掉一個 `--`，因此需要以字面量 `--` 傳給應用的參數必須寫成 `-- --`。
- **應用自有服務沒有靜態聲明的提供方**——消費方行通過普通注入點名它；缺少提供方的組合包會在結算時失敗，由待處理條目點名該服務，而不是在加載時失敗。
- **用戶 patch 若整體替換某行的 `config`，會連同其中的表達式一起丟掉**——flag 勝過的是表達式旁寫著的那個值，而不是用戶用字面量替換掉表達式之后的結果；保留表達式才能保留 flag 的優先級。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文：開放設計問題與尚未決定的探索方向。它明確不具權威性——已交付的行為、限制與既定理由以上文、包代碼和相關 Agent Note 為準。

#### 待定：解析器表面

`parseCmdline` 是 commander 適配器，而不是命令行框架：help、version 與錯誤輸出遵循 commander 的格式，退出／輸出路由也假定 commander 的控制流模型。改用其他解析器需要它自己的路由與錯誤處理；`cmdlineArgs` 服務約定中沒有任何內容依賴 commander。

</details>
