---
description: "dsh Web 客戶端的模型設置與產品引導插件：提供方行、API 密鑰管理、模型列表與 DeepSeek 首次運行彈窗。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-models

[English](README.md) | 中文

## 概述

`dsh-client-ui-settings-models` 是 dsh Web 客戶端的 Models 設置頁面：用戶可以配置 API 密鑰（以只寫方式存入 profile 的憑據引用之下）、編輯每個提供方的模型列表，并手工聲明自定義 pi-ai 路由；頁面以提供方行展示，一次只展開一張編輯卡片。該頁面把提供方目錄、設置文檔與憑據描述合并為一個共享快照，因此行的狀態在三個方面始終一致。它還會帶首次運行的用戶走兩個有序彈窗——版本化內測聲明，以及按條件顯示的官方 DeepSeek 憑據步驟。

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

從設置導航打開 Models 頁面，即可看到每個已配置的提供方都有一行。其配置鍵未在任何位置配置的整分節提供方會渲染為其展開的設置卡片而非一行，但僅限首次運行姿態，且僅持續到用戶關閉該卡片為止。每一類卡片各自持有自己的展開狀態，因此關掉其中一張絕不會丟棄另一張里的草稿。

存在已存儲目錄錯誤的提供方仍顯示診斷以及編輯、刪除入口。添加操作只面向已注冊的 settings 命名空間，因此不可用的命名空間不會留下無法打開編輯器的按鈕。保存被拒絕時，編輯器保持打開并展示 Host 診斷。

### API 密鑰

編輯卡片上的主字段是單獨一個 **API 密鑰**輸入框——頁面從不詢問環境變量名。鍵入的密鑰經 `credentials.set` 以**只寫**方式存入 profile 的引用之下，profile 沒有引用時便派生 `<ROUTE>_API_KEY`，pi-ai profile 會把這次派生記錄為 `apiKeyEnv`，因此 `settings.yaml` 從不攜帶密鑰值。為新的 pi-ai 提供方留空密鑰會保存一個不帶引用的 profile，從而保留提供方原生認證（例如 Bedrock 憑據鏈或 Vertex ADC）。只有確認引用的憑據已配置時，行才會以綠色實心點標示 API 密鑰狀態；只有確認具名引用缺失時，才會以紅色實心點標示。「應用」成功后會發出本地無障礙狀態消息，且絕不回顯任何機密內容。

### 編輯提供方

收起的「自定義設置」折疊區承載精選的額外字段：兩個家族都有 `baseURL`（deepseek 的占位符顯示公共端點）、各適配器自己的模型目錄，以及適配器未提供的 pi-ai 路由的**顯示名稱**與 **API 協議**。Profile `headers` 仍是 `settings.yaml` 或 Cordis 配置中的部署配置，Models 頁面不提供編輯器。Provider ID 保持固定：它是 settings 的鍵、其他每個 namespace 與每一條已記錄會話引用的名字，也是頁面讀不回、因而搬不走的憑據引用詞干。推理等級刻意不在可編輯字段之列：它是按模型的能力，提供方級的控件只可能被設成某些模型會拒絕的值。每個 DeepSeek 行編輯 `id`、可選顯示 `name` 與可選 `contextWindow`/`maxTokens`；該精選集之外的現有字段在編輯后仍會保留。

### 新增與刪除提供方

「新增」流程是一張承載休眠目錄提供方選擇框的卡片——裸掛載的 `llm-pi-ai` 在任何路由存在之前就能提供其完整的已安裝 catalog。**添加自定義提供方**聲明一條 pi-ai 不提供的路由；創建卡片會索要唯一的 **Provider ID**、端點、協議與至少一個可唯一識別的模型，因為沒有東西能為它們兜底。端點必須是可解析的 HTTP 或 HTTPS URL；localhost、IPv4 與 IPv6 字面地址以及自定義端口仍然有效。語法錯誤會在字段處阻止詢問與創建，請求失敗則繼續作為獨立的提供方錯誤顯示。**獲取可用模型**通過 `llm/discoverModels` Remote 查詢表單顯示的端點，因此新增提供方一次即可完成，而非先保存再返回；回復打開的是可搜索選擇器而非直接寫入，只有點擊**添加所選**才會寫入。每個選中候選會在提供方公布相應信息時，把 id、顯示名、上下文窗口與最大輸出 token 數復制進可編輯行；已經存在的行保留用戶調整過的值。搜索會匹配模型 id 與可選顯示名稱，且不會清除隱藏項的勾選狀態。**全選**會加入可見結果，而**取消全選**會清空全部勾選，以免意外采用隱藏結果。只有用戶層單獨攜帶某行時，該行才可刪除（刪除會恢復組合基線），其確認對話框會指名該提供方。

### 首次運行彈窗

版本化聲明步驟完成后，DeepSeek 步驟從同一份合并快照投影首次運行就緒狀態。用戶已經能夠到達的**任何**提供方都會直接結束該步驟、不做渲染；只有沒有任何提供方的用戶才會被詢問官方 DeepSeek 密鑰。「稍后配置」只完成這次協調器遍歷；適配器缺失、路由不活動、合并失敗、只讀部署或能力不可用時，該步驟不渲染即完成——Models 仍是診斷界面。

### 擴展 slot

本分區為倉庫外分發的插件聲明兩個席位，類型定義在 [`src/client/slot-contract.ts`](src/client/slot-contract.ts) 并從 `./client` 導出。`settings.models.provider-card`（keyed）渲染在每張展示目錄行的卡片內部——已保存行的卡片、其首次運行 setup 形態、以及「添加提供方」草稿卡——以 `entryKey = settingsNs` 分發，owner props 攜帶該行的 `ConfigurableProviderView`、其 configured 狀態與已確認的 api-key 憑據狀態，因此以某適配器家族的 namespace 注冊一次即可收到該家族的全部卡片，含手工聲明的路由；手工聲明的草稿卡尚無目錄行，保存之前不分發。`settings.models.footer`（list）渲染在行列表與新增控件之后。注冊方通過 `ctx.slots.inject` 激活，并以 type-only import 引入本包 `/client` 入口；沒有注冊方時兩個席位均不渲染任何內容。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

頁面只持有脫敏后的描述符，從不持有完整設置分區：因此每次編輯都以 `settings.mutate` 路徑操作落到已存分區上——每個改動字段一次 set、每個清除字段一次 unset、刪除提供方行則一次 unset。

### 校驗

鍵入的 API 密鑰按其自身字段判定：去除首尾空白后必須非空，且每個字符都必須是可打印 ASCII（`[\x21-\x7E]`），這正是 HTTP 頭值能夠攜帶的字符集——與 `@deepseek-ai/dsh-llm` 中的 `normalizeApiKey` 互為鏡像，此處復刻是因為源平面拆分禁止導入它。與粘貼的 `NAME=value` 環境行一致或包裹在匹配引號內的值，會作為同樣的格式失敗被拒絕。空 id、重復 id、空顯式名稱以及不可讀、非正數或小數的容量都會在任何寫入之前失敗。DeepSeek 的 `models` 是一個按值整體替換的數組：編輯器先顯示繼承的有效行，直到第一次模型編輯把完整數組物化進用戶層，重置則取消該覆蓋。

### 并發與憑據

每次 settings 寫入都攜帶卡片當前的 `revision`，因此來自另一個標簽頁或外部 `settings.yaml` 編輯的并發寫入會以 `settings/conflict` 被拒絕。settings 提交后，卡片會在存儲憑據前采納返回的脫敏用戶子樹與 revision，因此失敗的憑據階段只重試該階段。刪除只會在 profile 指名本頁派生的 `<ROUTE>_API_KEY` 目標時移除已配置且可寫的憑據，然后 unset 該 profile；兩個操作都冪等。加載完成后，頁面訂閱轉發的 `settings/document-updated`、`credentials/reference-updated` 與 `llm/adapters-updated` 屬主事件，以及本地 `connection/reset`，因此外部編輯無需輪詢即可收斂。

### 引導協調器

聲明步驟在 `src/client/locales.ts` 中持有精確文案，并在 `src/onboarding-copy.ts` 中持有確認版本；回環時它通過既有 settings API 比較并寫入 `ui-onboarding.welcomeNoticeVersion`，且只有顯式點擊「繼續」才會記錄當前版本。非回環瀏覽器無法使用這個僅限宿主的 namespace，因此確認只保留在進程內，刷新后聲明會再次出現。DeepSeek 步驟在共享引導模態框內以僅憑據模式渲染既有 `ProviderEditor`；`credentials.set` 仍是唯一的機密寫入，且不改變任何提供方設置。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

以下頁面覆蓋設置底座、本頁所合并的 seam 與設計依據。

- [ui-settings](../ui-settings/README.zh.md)——本頁所依賴 scope 與 schema 服務所在的領域底座。
- [settings](../../settings/README.zh.md)——持久化用戶設置 seam 及其文件提供方。
- [credentials](../../credentials/README.zh.md)——本頁寫入密鑰所經的憑據引用 seam。
- [llm](../../llm/README.zh.md)——本頁所配置提供方所在的適配器注冊表。
- [Web 配置平面](../../../.agents/notes/archived/architecture/2026-07-30-web-config-plane.md)——手寫編輯器的設計依據。

-----

<a id="model-experience"></a>
## 模型體驗

無。該包是瀏覽器端 UI 插件層，不注冊任何面向模型的內容。

#### KV Cache 影響

無；該包既不組裝也不發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制定義編輯器的字段覆蓋范圍與本頁的觸達范圍；它們是當前包約束，不是設置路線圖。

- **卡片上只有 API 密鑰與精選折疊字段可編輯**：手寫編輯器以 schema 通用字段覆蓋換取了 mockup 布局。重試策略、超時、DeepSeek 模型說明及其他進階字段仍留在 `settings.yaml` 中；編輯器未展示的現有模型字段會予以保留。
- **憑據清理范圍刻意保持狹窄**：刪除一行時，僅當其引用與頁面派生的 `<ROUTE>_API_KEY` 目標完全一致，才會清除已配置且可寫的憑據。自定義引用、環境憑據與無法識別的目標會保留，因為該行無法證明自己擁有它們。
- **只有 pi-ai 路由可以手工聲明**：自定義提供方卡片寫入 `llm-pi-ai`——唯一一個其 profile 描述整個提供方的 namespace。`llm-deepseek` 路由是組合面的事實，不是本頁能創建的東西。
- **詢問覆蓋 OpenAI 兼容與 Anthropic Messages 端點**：OpenAI 協議接受標準 `data` 數組或富信息 `models` 對象，Anthropic 則使用原生模型列表路由；其余協議會報告自己無法被詢問，其模型需手工填寫。
- **未聲明的存活路由無處渲染**：未附帶可配置提供方聲明即注冊的路由沒有 settings 地址；它在各選擇器中仍然可見，但不會出現在本頁的行里。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。這是只貢獻 nav entry 的 section 插件，渲染固定空 content column，不發出 Cordis 事件，也不持有跨插件可變關系。
