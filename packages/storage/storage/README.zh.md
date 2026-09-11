---
description: "存儲樞紐（ctx.storage）：面向選擇、掛載或排查具名存儲后端與數據形式設施的組合方與維護者。"
kind: "package-reference"
---

# @deepseek-ai/dsh-storage

[English](README.md) | 中文

## 概述

使用 `dsh-storage` 持久保存類型化應用數據，而不將其加入會話歷史。將它與受支持的存儲介質和領域配置一同掛載后，調用方即可通過公共 `ctx.storageDomain` API 訪問記錄。工作區記錄、會話伴隨數據或其他必須在重啟后保留且不應成為會話事件的應用狀態適合使用它。它僅供宿主代碼使用，對模型沒有可見影響；無需此類數據的組合可以省略它。

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

使用本包為組合提供持久的非會話存儲：把它與后端和數據形式包一起掛載，宿主包即可通過 `ctx.storageDomain` 讀寫經過校驗的記錄。樞紐自身不增加任何可觀察行為——它是讓整個家族運轉起來的交匯點——以下內容就是組合從它得到的一切。

### 何時使用

當組合中任何包需要持久化會話事件日志以外的數據——工作區記錄、會話伴隨數據——時就掛載樞紐。領域數據形式與兩個內置后端都依賴它，因此組合的存儲行是 `storage` 加一個后端加 `storage-domain`。沒有任何此類數據的組合可以省略整個組；agent loop（智能體循環）永遠不需要它。

### 最小組合

```yaml
- name: '@deepseek-ai/dsh-storage'
- name: '@deepseek-ai/dsh-storage-json'
  config:
    root: /var/lib/dsh/data
- name: '@deepseek-ai/dsh-storage-domain'
  config:
    backend: json
```

這些行加載后，`json` 后端注冊自身、`domain` 數據形式掛載；諸如 `dsh-workspace` 之類的消費方隨后在已路由后端上打開自己的領域，并通過 `ctx.storageDomain` 讀寫記錄。多個后端可以并排保持掛載；哪個后端服務哪個領域由領域數據形式的配置決定，絕非樞紐的全局選擇。

### 你能得到什么

- 已掛載的后端按名稱解析，因此同時掛載兩個內置后端的組合可以把每個領域按配置路由到任一種介質。
- 已掛載的數據形式解析為 `ctx.storage.<form>`；領域數據形式還直接以 `ctx.storageDomain` 對外服務。
- 錯誤配置會以穩定的 `StorageError` 代碼明確報錯，而不是靜默推遲：未知的后端名稱、在其所有者掛載前讀取數據形式、或重復注冊都會拋出異常。

### 失敗與恢復

- `backend-not-found`——領域數據形式路由到未掛載的后端；請添加后端包。數據形式會等待所有已配置后端注冊，因此行序不會造成失敗。
- `form-not-mounted`——消費方在 `dsh-storage-domain` 加載前讀取 `ctx.storage.domain`；請把領域行放在消費方之前。
- `duplicate-backend`／`duplicate-mount`——同一名稱或形式注冊了兩次；這是組合錯誤，會明確報錯。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

樞紐是一張純注冊表，擁有兩個面，設計目標是后端與數據形式可以獨立替換，而樞紐無需了解它們的內部實現。

### 設計理念

- **后端擁有介質，數據形式擁有語義。** 樞紐從不執行 IO；它只持有名稱 → 后端表和形式名 → 設施表。后端包注冊其介質所有者，數據形式包掛載其設施，雙方都不需要對方的細節。
- **多個后端并排共存。** 哪個后端服務哪個消費方由消費方自身的配置決定（領域數據形式的路由表），絕非樞紐全局的二選一。
- **注冊與掛載都是 effect。** `register()` 與 `mount()` 返回資源釋放函數；釋放只移除該次注冊的貢獻，且不會關閉后端——由所屬插件在注銷后關閉。
- **激活不會與注冊競爭。** 每個后端插件還會發布一個僅用于生命周期的服務鍵（`storage.backend.<name>`）；數據形式提供方注入這些鍵，因此領域數據形式只在所有已配置后端注冊后激活，而調用方仍通過樞紐按名稱解析后端。

### 后端約定

[`src/backend.ts`](src/backend.ts) 是后端實現者的規范性約定，由 `tests/contract.ts` 中的共享一致性套件逐條款檢查。一個后端只擁有一種介質，并暴露可選的數據形狀分面；`kv` 是唯一的分面，打開單元即可獲得一個帶版本、全局單例的 schema 句柄，其每次調用均具備原子性，并在完成時保證持久化。單元名與表名必須匹配 `UNIT_NAME_RE`；記錄鍵是任意字符串，絕不進入文件路徑。單元不對并發寫入做串行化——順序由調用方負責——介質上記錄的版本與描述符不同時拒絕 `version-mismatch`（不做遷移）。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`Storage` 服務、數據形式掛載、`StorageForms` 表 |
| [`src/registry.ts`](src/registry.ts) | `BackendRegistry`：名稱 → 后端表、注冊資源釋放函數 |
| [`src/backend.ts`](src/backend.ts) | 后端約定：分面、單元、`UNIT_NAME_RE` |
| [`src/error.ts`](src/error.ts) | 樞紐與每個后端共享的 `StorageError` 代碼 |
| — | 不發布運行時不變式伴生入口；樞紐是純注冊表（名稱 → 后端、形式 → 設施），其一致性完全由調用點強制保障（重復項或缺失項會同步明確報錯）；它既沒有事件流，也沒有可變介質可供交叉檢查。 |
| [`tests/contract.ts`](tests/contract.ts) | 針對每個后端運行的共享一致性套件 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當樞紐視角不夠用時閱讀以下頁面：子系統參考是權威約定，Agent Note 記錄了家族設計與延期工作。

- [存儲子系統](../../../docs/subsystems/storage.zh.md)——后端約定、領域語義、變更事件與生成的 API。
- [存儲包映射](../README.zh.md)——家族的各包及其在倉庫中的位置。
- [領域 KV 存儲 Agent Note](../../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.zh.md)——樞紐、領域數據形式與會話后端遷移背后的設計。

-----

<a id="model-experience"></a>
## 模型體驗

### 后端與形式注冊

#### 模型看到什么

無。`ctx.storage` 是宿主側注冊表：樞紐不注冊工具、不注入提示詞，也不寫入會話事件，因此任何請求字段都不會攜帶本包的數據。

#### Token 影響

每次請求都不會直接增加 token。

#### KV Cache 影響

與實時請求相互獨立：樞紐絕不觸碰請求前綴，因此無法使提供方緩存復用失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制定義了樞紐不能做什么。它們是當前包約束，不是任務積壓。

- **`kv` 是唯一的數據形狀**——后端只實現一個分面；面向會話事件日志的 `log` 分面被推遲到會話后端遷移（[Agent Note](../../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.zh.md)）。
- **數據形式按需解析**——在領域插件掛載前讀取 `ctx.storage.domain` 會拋出 `form-not-mounted`；組裝會按相應順序排列插件，而不是靜默推遲。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
