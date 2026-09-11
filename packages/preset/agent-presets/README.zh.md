---
description: "按 preset cordis.yml 文件進行按會話的 agent（智能體）組裝，供選擇、配置或排查 agent preset 的用戶與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-agent-presets

[English](README.md) | 中文

## 概述

使用 `dsh-agent-presets` 為每個會話提供某個 preset 的 `agent.cordis.yml` 所指定的工具、提示詞段落與 skill（技能）。一個進程可以運行使用不同 preset 的會話，同時保持它們的狀態相互隔離。preset 名單合并隨附定義、已配置根目錄與用戶根目錄，會報告 preset 無法啟動的原因，也能通過復制現有 preset 創建本地 preset。部署與用戶都可選擇默認值；只有空會話可以切換 preset。請將每個自行編寫的 preset 視為受信任配置，因為它會授予其所選插件的能力。

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

在需要讓每個 agent 會話從 preset 文件獲得自己的工具、提示詞段落與 skill 的組裝中掛載本包。每個會話都會命名一個 preset——顯式指定或通過配置的默認值——并據此組裝；沒有本包時，會話只能回退到宿主組裝掛載的內容。

隨附 Web 的 `standard`、`ptc` 與 `cordis` preset 包含[顯式文件交付](../../client/ui-deliverables/README.zh.md#explicit-deliveries)。`minimal` preset 保留固定的雙工具訓練配置。

### preset 給會話帶來什么

從 preset 組裝的會話會運行該 preset `agent.cordis.yml` 所列插件：它的工具、提示詞段落與 skill。加入同一 preset 的會話共享一份已安裝的組裝，且各會話的狀態彼此隔離。subagent 會加入其父方的組裝，因此它看到的工具與提示詞段落和創建它的 agent 相同。

可選的 preset 來自三類來源：本包 `presets/` 下隨包交付的 preset、已配置的根目錄，以及你自己放在 `<dshHome>/.agent-presets` 下的 preset。選擇器會展示每個 preset 的顯示名與描述；組裝無法加載的 preset 會連同原因一起列出而不是被隱藏，因此你能看到該修什么或刪什么。

### 最小配置

插件需要一個 `default` preset id，并在 `roots` 中掃描 preset：

```yaml
- name: '@deepseek-ai/dsh-agent-presets'
  config:
    default: standard
    roots:
      - path: ~/company-presets
        trust: system
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `default` | 必填 | 部署 fallback preset id；模式選擇關閉或沒有用戶默認值覆蓋時使用 |
| `roots` | `[]` | 按優先級排列的掃描目錄；每項提供 `path`（開頭的 `~` 會展開）與 `trust`（默認為 `user`） |
| `includeShippedRoot` | `true` | 在全部已配置根目錄之前，前置本包隨附的 preset 作為 `system` 根目錄 |
| `includeUserRoot` | `true` | 在全部已配置根目錄之后追加 `<dshHome>/.agent-presets` 作為 `user` 根目錄 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-agent-presets)是每個受支持字段及其 JSDoc 的窮盡式真源。

隨附根目錄前置在全部已配置根目錄之前，因此即使補丁替換 roster 配置，內置集合仍然可用并贏得重復 id。`includeShippedRoot: false` 會為完全自行提供 preset 的部署移除內置集合。`includeUserRoot: false` 會移除推導出的可寫根目錄；釘住確切 roster 的測試會同時關閉兩個推導根目錄。

### 顯示選擇器并選擇默認 preset

必填的 `default` 配置設定部署默認值。當組裝中存在 settings 提供方時，本插件會注冊 `agent-presets` 命名空間，并以 `{ default: config.default, modeSelectionEnabled: true }` 作為 base，因此既有的新建會話選擇器會保持顯示，除非用戶主動關閉。Host 每次解析默認值都會讀取這兩個字段：`modeSelectionEnabled` 為 `false` 時，未顯式指定 preset 的會話解析為 `config.default`，即使用戶文檔還保留其他 `default` 也會忽略它；該字段為 `true` 時，用戶默認值才可覆蓋部署值：

```yaml
agent-presets:
  modeSelectionEnabled: true
  default: minimal
```

客戶端只需寫入 `modeSelectionEnabled` 即可顯示或隱藏選擇，[Web GUI 設置開關](../../client/ui-agent-preset/README.zh.md)正是這樣做的。選擇器隱藏期間由部署默認值生效；再次開啟時恢復已保存的用戶 `default`，尚未保存時則繼續使用部署默認值。模式選擇保持開啟時，選擇默認模式會寫入用戶覆蓋值，僅供此后創建的會話使用。由于該策略歸 Host 所有，它適用于 Web、CLI、SDK 與 headless 調用方此后創建的全部未顯式指定 preset 的會話；顯式指定的 preset 與任何既有會話均不受影響。

### 創作 preset

創作即復制：創建 preset 會復制某個既有 preset 的整個目錄——組裝、展示元數據、skill 目錄與資產——放進第一個 `user` 根目錄。副本保留來源的描述，但擁有自己的 id 與可選顯示名，因此調用方從不提供組裝文本，一次復制也不會授予名單尚未攜帶的任何能力。創建之后的一切都發生在 preset 自己的文件里。

以下情況會拒絕復制：id 不符合 `[a-z0-9][a-z0-9-]*`（id 會成為目錄名）、id 已被占用（復制從不覆寫）、或來源未知。刪除只移除本地創作的 preset；隨部署提供的 preset 不可刪除。已在被刪除 preset 上運行的會話會繼續運行。

### 切換會話的 preset

會話只有在尚未產出任何內容——沒有消息或工具調用——時才能切換到不同的 preset。此后組裝在會話的生命周期內固定，因為在對話中途調換工具會留下新組裝無法執行的已記錄工具調用。已提交的切換會發出 `tools/change`，因為解析后的工具集在沒有注冊表編輯的情況下發生了變化。切換也會記入會話日志，因此恢復或 fork 的會話會按它運行的組裝重建。

### 失敗與恢復

組裝缺失、無法解析、不是具名插件行列表，或者引用了無法解析的模塊的 preset 會被列為 broken，原因會指名出問題的行；組裝此類 preset 會被提前拒絕，因此會話絕不會以半組裝狀態啟動。能活到會話創建的，是模塊能加載但隨后拒絕的行——拋錯的插件，或等待組裝從未提供的服務的插件——它會讓創建失敗并回滾，且會指名每一個失敗的行，包括組內的行。修復 preset 的文件或刪除它，然后重試。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋名單與常駐掛載背后的設計；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

- **每個 preset 一份常駐組裝。** preset 在進程內只掛載一次，掛到常駐 scope 之下；agent 通過把自己的 scope key 認父到該掛載來加入，因此掛載的注冊與監聽器覆蓋每個已加入的 agent，而不覆蓋兄弟 preset 的。
- **代際以組裝文件為鍵。** 掛載記錄組裝文件的 stamp（mtime 與大小）；發現 stamp 過期的會話會開啟下一個代際，而已加入的會話保持各自運行的那個代際——運行中的會話在文件被修改或刪除后繼續存活。
- **preset 文件是輸入，絕不是持久化目標。** 被掛載的子樹把 `write()` 覆寫為空操作，因此 loader 發起的寫回絕不會重寫共享的 preset 文件。
- **發現過程擁有健康。** 組裝缺失或不可加載的目錄是攜帶原因的 broken 名單行，而不是被跳過——被跳過的目錄仍占著它的 id，而任何界面都沒有可刪的東西。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 服務入口：`Config` schema、settings 命名空間、名單 API、常駐掛載協調 |
| [`src/discovery.ts`](src/discovery.ts) | 文件系統發現：根目錄掃描、健康檢查、id 校驗、排序 |
| [`src/composition-inventory.ts`](src/composition-inventory.ts) | 面向插件清單表面的壓平組合行：文件讀取（求值 disabled 門）與掛載讀取（攜帶 fiber 狀態） |
| [`src/preset.ts`](src/preset.ts) | 詞匯體系：preset id 規則、`AgentPreset` 與 `PresetRoot`、錯誤類型 |
| [`src/mount.ts`](src/mount.ts) | 子樹掛載、宿主 base-URL 處理、掛載審計、`write()` 抑制 |
| [`src/authoring.ts`](src/authoring.ts) | 本地創作 preset 的復制/刪除/讀取、權限收緊 |
| [`src/metadata.ts`](src/metadata.ts) | `preset.yml` 展示元數據 |
| [`src/session.ts`](src/session.ts) | `agent-preset/selected` 事件與 `agentPreset` Session 投影 |
| [`src/types.ts`](src/types.ts) | client-safe 的協議載荷與 cordis 事件聲明 |
| [`src/invariant.ts`](src/invariant.ts) | 不變式伴生插件：掛載后的服務泄漏復查、未加入 agent 的失敗 |

### 常駐掛載

`ensureStanding` 為每個 preset id 保留一個進行中的 promise（single-flight），因此兩個競爭首次使用同一 preset 的 agent 共享一份組裝。已結算的失敗會被移除，以便后續會話重試文件已被修復的 preset。掛載運行在 roster 服務自己的未追蹤上下文中——從被追蹤上下文派生的子樹會經調用方的 shadow fiber 解析服務——因此它比任何 agent 都活得久，只隨整棵樹卸載。`serviceForAgent` 讀取某 agent 對其 preset 掛在 `isolate` realm 之后（組外不可見）的某個服務實例。

### 組合清單

`compositionInventory()` 向插件清單表面提供每個預設的壓平行及其名單身份（id、trust、顯示名、默認標記）：已有存活 standing mount 的預設由其最新世代的 Loader 條目作答——匹配限定在本運行時自己的 root 內，同進程里的第二個 Cordis 運行時不會替它作答；即使文件事后損壞也照常作答，因為掛載才是會話實際運行的組合，broken 裁決只適用于無人組合的預設——開機以來從未被組合的預設由其組合文件作答，`!!js` disabled 門用 Loader 上下文求值，使兩種答案反映同一臺宿主。讀取從不掛載預設——列出所有組合的設置頁不會激活其中任何一個。求值器拒絕的門保持 `'conditional'`；在發現的健康裁決與行讀取之間變得不可讀的文件，會攜帶競態原因報告為 broken，而不是被靜默丟棄。`./display` 子路徑導出 `presetDisplayText` 映射，把隨附 preset id 映射到各自的字典文案鍵；它沒有任何 import，瀏覽器包直接內聯，也是「哪個內置 id 對應哪份文案」的唯一歸屬地。

### 掛載審計

直接掛載的子樹不會出現在 `ctx.loader.entries()` 中，因此沒有啟動審計能覆蓋它；`mountPreset` 自行證明結果可用，并拒絕三種形態：無 scope 的目標（preset 的工具會注冊成全局的）、仍在等待組裝從未提供的服務的行、以及把服務發布進根 realm 的行（進程級全局，第二個發布同名服務的 preset 會相撞）。不變式伴生插件在每次服務通知時復查最后一條規則，因為從定時器或異步續體發布的行會繞過一次性審計。

### 創作機制

復制會解引用符號鏈接以保證自包含，把目錄樹收緊為僅屬主可用（文件 `0o600` 并保留屬主執行位，目錄 `0o700`），并在首次復制時創建根目錄。復制出的 `preset.yml` 會被重寫：保留來源的描述供作者編輯，丟棄其名稱與 roster `order`，從而讓名單始終能區分副本與來源。刪除拒絕隨部署提供的 preset，并清除指向剛刪除 preset 的用戶默認值。

### 會話記錄

創建 header 記錄會話啟動時使用的 preset；`agentPreset` Session 投影記錄會話運行時使用的 preset。切換在替換提交后追加 `agent-preset/selected` 事件，因為 preset 決定模型看到的工具 schema 與提示詞段落。服務把這項已提交事實重新發為不帶 scope 的 cordis 事件 `agent-preset/selected(sessionId, agentPreset)`。重建消費該投影；投影從創建 header 開始并應用最新選擇，絕不單獨折疊日志。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面；它們從組裝模型逐步進入掛載所依賴的 scope 與提示詞機制，以及決策證據。

- [persona 包](../persona/README.zh.md)——preset 掛載的可組裝行，讓會話擁有自己的人設。
- [Scope 子系統](../../../docs/subsystems/scope.zh.md)——scope key 與 agent 加入所經由的父鏈。
- [系統提示詞子系統](../../../docs/subsystems/system-prompt.zh.md)——preset 提示詞段落如何注冊與組裝。
- [會話包映射](../../session/README.zh.md)——preset 切換所追加的持久會話記錄。
- [生成的配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-agent-presets)——每個受支持配置字段及其源聲明。
- [按會話組裝 agent preset 的 Agent Note](../../../.agents/notes/implemented/architecture/2026-08-03-per-session-agent-presets.zh.md)——設計理由與備選方案。

-----

<a id="model-experience"></a>
## 模型體驗

間接地，經由 preset 常駐組裝安裝的插件：這些插件擁有該 preset 向加入它的 agent 呈現的每個工具 schema、提示詞段落與 skill。

#### KV Cache 影響

在一個 agent 的整個生命周期內保持前綴穩定：組裝只裝入一次，發生在 agent 發布之前、因而也在它的首個請求之前，且在 agent 運行期間不再重新讀取。為新會話選擇不同的 preset，只會為該會話建立不同的前綴，無法讓任何已在運行的會話失去緩存復用。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明名單何時不合適，或何時需要特別的運維注意。它們是當前包約束，不是通用組裝對比或任務積壓。

- **位于可寫根目錄之外的 preset 可被發現卻無法刪除**——`remove()` 拒絕任何不在第一個 `user` 根目錄下的 preset，因此一個既配置了自有可寫根、又保留 `includeUserRoot` 的部署，會列出并掛載 harness home 下的 preset，卻對每次刪除回答「它不在可寫 preset 根目錄之下」。只想要自有 preset 的部署應設置 `includeUserRoot: false`。
- **會話一旦產出任何內容便無法更換 preset**——切換會把空白會話的父作用域重鏈到另一個常駐掛載，且僅限空白會話：在對話中途調換工具會抽走模型已調用的工具。
- **代際只以組裝文件為鍵**——stamp 檢查只察覺 `agent.cordis.yml` 的變化，察覺不到旁邊 skill 文件或資產的編輯；那些編輯要等組裝文件本身變動或進程重啟才達到新會話。
- **被替代的代際永不回收**——已加入的會話保持其運行所在的代際，而名單沒有加入計數可以判斷最后一個何時離開，因此整棵子樹一直掛到進程結束。代價按代際計而非按會話計，但并非為零：`dsh-skill-filesystem` 默認監聽自己的根目錄，因此每一輪「編輯后建會話」都會新增一套活的 watcher。
- **副本從不被實際掛載以校驗**——它與來源逐字節相同，因此磁盤上已壞的來源會產出與來源同樣損壞的副本；發現過程的健康檢查會在下一次讀取名單時把兩行都標出來，而不是把失敗推遲到會話啟動。
- **健康問的是「裝沒裝」，不是「能不能 import」**——發現過程證明組裝能以加載器方言解析、由具名行組成，且對于每個能證明會啟動的行，其引用的包存在于 harness 基址以上，或引用的文件確實存在；它從不 import 任何一個，因此入口文件缺失的包、在 apply 時拋錯的插件、以及永遠等待某個服務的插件，都仍在第一個會話處失敗。`disabled` 是加載器唯一會插值的條目字段，因此該字段帶表達式的行不予檢查，而不是僅憑文件作出判斷。
- **副本是會漂移的快照**——升級部署不會更新隨附 preset 的副本，本層也沒有表達「standard 加一處改動」的 patch 語義；隨附集合自己也接受同樣的代價——`cordis` 與 `code` 都復制了 `standard` 的完整組裝并在此基礎上編輯——換來整份組裝在一個文件里可讀。
- **根目錄掃描不做監聽**——每次讀取都實際訪問文件系統，這讓名單保持新鮮，但每次 `list()` 會對每個根目錄產生一次 `readdir`。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文：開放設計問題與尚未決定的探索方向。它明確不具權威性——已交付的行為、限制與既定理由以上文、包代碼和相關 Agent Note 為準。

#### 未來：回收被替代的代際

回收被替代的常駐掛載，需要給 `StandingMount` 加上已加入 agent 的計數，在 `mount`/`composeFrom`/`recompose` 中遞增、在 agent 的 scope key 消亡時遞減——即 `ensureStanding` 處的 `TODO`。子樹并非惰性：`dsh-skill-filesystem` 監聽自己的根目錄，因此未回收的代際會讓一套活的 watcher 一直存活到進程結束。

</details>
