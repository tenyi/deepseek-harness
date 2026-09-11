---
description: "Web GUI 的 agent（智能體） preset 界面：選擇器可見性與默認設置、新建會話 chip、會話標題標簽與 preset 名單管理分區；供 agent 組裝的用戶與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-agent-preset

[English](README.md) | 中文

## 概述

使用本包可以為新的 Web GUI 會話選擇 agent preset、在會話標題中查看當前 preset，并在設置中管理可用 preset。Agent 模式選擇器默認顯示；設置可以隱藏它，而不會改變運行中或歷史會話。preset 在會話創建時即固定，因此更改選擇或默認值只影響此后創建的會話。如果部署未提供任何 preset，這些控件保持隱藏，每個會話都使用宿主組裝。

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

與設置和對話包一起掛載本插件；管理分區隨后顯示一個默認開啟的可見性開關。關閉期間，新建會話 chip 不出現，宿主會依據部署默認值（隨附 Web bundle 中為 `standard`）組裝未指名會話。開啟時會恢復已保存的用戶默認值；尚未保存時則使用部署默認值；該默認值會同時帶到當前空白任務上。chip 中的選擇本身只為下一個空白會話暫存一次。再次關閉選擇器會以同樣方式把當前空白任務帶回部署默認值，并丟棄尚未使用的暫存選擇；已開始及歷史會話的標簽、組裝與已記錄歷史均保持不變。

### 管理名單

設置分區把名單呈現為卡片：復制對話框是創建 preset 的唯一入口——瀏覽器不編輯任何組裝文本——每張自定義卡片都保留一個打開 preset 自身文件的位置動作。可見性開關只決定已保存的用戶默認值是否生效：宿主在隱藏期間使用部署默認值，再次顯示選擇器時恢復已保存的默認值。選擇器開啟期間，選擇健康且非默認的卡片會為后續會話寫入新的用戶默認值；如果當前新任務頁已經復用一個空白會話，這次在設置中的明確選擇也會通過既有選擇鏈路把同一 preset 帶到這個精確的空白會話。已開始及歷史會話保持不變。保存期間開關會被禁用；寫入失敗時，界面保留先前的偏好并顯示錯誤。隱藏選擇器會禁用默認值選擇與 Creator 啟動，但名單查看、復制、位置和刪除仍然可用。刪除會移除 preset 目錄，而已據其組裝的會話繼續運行。隨附 preset 在只讀查看器中打開，不提供位置或刪除。名單行攜帶 `broken` 時渲染為標記卡片，其主體與復制均被禁用，因為損壞 preset 的副本只是另一個損壞 preset；損壞的自定義行保留位置與刪除動作，以便修復文件、清掉幽靈目錄。卡片正面仍顯示 preset 自己的描述——在選擇器里，一個包說明符不足以讓人采取行動——宿主給出的原因作為工具提示附在徽標上，另有一個視覺隱藏的 alert 將該原因傳達給輔助技術，而被禁用的卡片主體無法做到這一點。

### 對話式入口

名單攜帶自指的 `cordis` preset 時，其虛線添加卡在選擇器開啟前保持禁用。開啟后，它會暫存 `cordis` 并啟動新會話——分區關閉設置面板，新建會話 chip 自己的應用器負責組裝工作區流程產出的空白會話。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

設置分區通過現有的 `settings.update` 寫入宿主的 `agent-presets` 命名空間。可見性開關只設置 `modeSelectionEnabled`；僅當選擇器顯示時，設為默認動作才會寫入 `default`。兩種寫入之后，都由宿主名單給出當前生效的默認值，再由 chip controller 的 `agentPresets/select` 鏈路把它帶到同一個仍為空白的會話；這些界面只使用這一條會話修改 API。展示選項與宿主的生效可見性來自 `agentPresets/list`——名單本身已標記宿主當前生效的默認值并攜帶 `modeSelectionEnabled`，因此非 loopback 的只讀客戶端無需內省 settings schema 也能保持一致。設置分區首次加載時查詢 `settings.canOpenAgentPresetDirectory()`，并把結果與名單合并；查詢失敗只會移除原生打開動作。新建會話 chip 僅在 `modeSelectionEnabled` 為 `true` 時渲染；隱藏它會丟棄待處理的暫存選擇及本地菜單或失敗橫幅狀態，而標題標簽保持注冊并讀取每個會話已記錄的 preset。暫存值在會話到達時應用（既覆蓋工作區連接新建的會話，也覆蓋它復用的空白會話），被拒絕時丟棄。系統會通過 composer 列上方的瞬時橫幅提示拒絕結果，因為 chip 的標簽此時已經恢復原值，而被宿主拒絕掛載的 preset 正是發現過程報告為健康的那一種——它的名單卡片上沒有任何原因可供回頭查看。只有用戶剛做出的選擇會觸發提示；會話成為當前會話時觸發的應用器不會。[`dsh-client-connection`](../connection/README.zh.md) 使用同一瀏覽器會話認證 `agentPresets/read`、`agentPresets/copy`、`settings/openAgentPresetDirectory`、`agentPresets/deletePreset`、`agentPresets/list` 及其他所有宿主 API 方法。組裝仍會指明一個會話所運行的插件，因此讀取屬于偵察，而復制、刪除與設置模塊擁有的目錄打開操作負責管理名單并驅動宿主桌面。分區在自身操作、`settings/document-updated` 與 `connection/reset` 時重讀，因為組裝文件在瀏覽器之外編輯，協議鏈路不會通知文件變動。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當 preset 界面無法滿足需求時，請閱讀以下頁面。它們從瀏覽器界面延伸至 preset 領域與組裝模型。

- [dsh-agent-presets](../../preset/agent-presets/README.zh.md)——這些界面讀取并管理的宿主名單與組裝。
- [ui-conversation](../ui-conversation/README.zh.md)——聲明 chip 與標簽填充的首屏與會話頭部槽位。
- [ui-settings](../ui-settings/README.zh.md)——承載名單分區的設置外殼。
- [客戶端包映射](../README.zh.md)——相鄰的瀏覽器 UI 包。

-----

<a id="model-experience"></a>
## 模型體驗

間接影響，經由此后會話據以組裝的 preset；它所選擇的 preset 擁有所有面向模型的效果。

#### KV Cache 影響

沒有直接的失效影響。更改選擇器可見性或默認值不會改變運行中會話的組裝或前綴，也不會改變歷史會話已記錄的 preset；此后創建的會話依據它自己的組裝建立自己的前綴。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制界定了當前 preset 界面。它們是當前包約束，不是通用組裝對比或任務積壓。

- **沒有元數據的 preset 按 id 列出**——展示文本是可選的，未取名的副本刻意回退到目錄名，而不是與其來源呈現得一模一樣。解析本身使用 [`dsh-agent-presets/display`](../../preset/agent-presets/README.zh.md) 共享的 `presetDisplayText` 解析邏輯，設置的插件列表把它內聯在本插件的字典之上，按當前語言顯示隨附 preset 的名稱，同時不翻譯用戶自建的元數據。
- **展示的路徑是文本，不是鏈接**——宿主沒有桌面打開器時，卡片顯示目錄供手工復制；瀏覽器自身無法打開宿主文件系統上的位置。
- **組裝編輯對頁面不可見**——文件在瀏覽器之外編輯，協議鏈路不廣播文件變動，因此名單只在自身操作、`settings/document-updated` 與 `connection/reset` 時重讀，而非每次磁盤編輯。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。這是瀏覽器側界面插件，Node 側不擁有事件流或可變運行時數據；名單與設置寫入屬于宿主約定。
