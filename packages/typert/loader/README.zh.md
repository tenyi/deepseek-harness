---
description: "生成的 Typert 產物所用的 Loader 集成：已掛載的包如何自動把宿主側反射與 schema 貢獻給運行時注冊表。"
kind: "package-reference"
---

# @deepseek-ai/dsh-typert-loader

[English](README.md) | 中文

## 概述

掛載 `dsh-typert-loader` 后，Loader 組合中每個掛載的包都會自動把其生成的 Typert 反射與 schema 貢獻給運行時注冊表——并在包或本插件卸載時自動撤銷。沒有該導出的包會被跳過，因此在任何 Loader 組合中掛載它都是安全的。顯式 `packages` 用于覆蓋嵌套在另一 Loader 配置項之下的插件，這些插件的 fiber 不攜帶可解析的包說明符。它是僅支持 Node 的插件，需要配置樹解析錨點才能解析包。

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

在加載發布生成 Typert 產物的包的 Host Loader 組合中掛載本插件。注冊表本身來自 `dsh-typert-registry`；本插件只負責發現與注冊。

### 最小配置

加載注冊表與 loader；loader 默認發現每一個 Loader 配置項：

```yaml
- name: '@deepseek-ai/dsh-typert-registry'
- name: '@deepseek-ai/dsh-typert-loader'
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `packages` | `[]` | 為嵌套在另一 Loader 配置項下的插件額外注冊的包產物；每個包都必須能從配置樹解析，并導出 `./typert` |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-typert-loader)是所有受支持字段的完整真源。

### 注冊什么

每個符合條件的 Loader 配置項都會把其生成的宿主側反射與 schema 貢獻給運行時注冊表。注冊跟隨配置項生命周期：配置項或本插件卸載時撤銷；在配置項或本插件任一方卸載后才結束的導入操作會被丟棄。

### 可觀察行為與失敗

沒有該導出的包會被靜默跳過。解析結論與已導入的 manifest（元數據清單）會在整個進程生命周期內緩存，因此新增 `./typert` 導出后必須重啟。已掛載配置項對應的產物格式錯誤時，激活會明確報錯；之后才發生的失敗按包記錄日志，不會阻止無關包完成注冊。無法從配置樹解析、或缺少該導出的顯式 `packages` 條目會明確報錯并指名該包。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋 loader 如何掃描、校驗與注冊；可觀察行為已在[使用本包](#use-this-package)中說明。

### 設計理念

本插件是一個增量掃描器，與 client-modules 的 Node 側實現對稱：每次 Cordis `internal/plugin` 事件都會把該 fiber 的配置項名稱標記為臟，微任務 flush 會針對實時 Loader 配置項逐一調和每個臟名稱；激活階段用所有當前配置項填充同一臟集合。

### Manifest 校驗

`validateTypertManifest()` 是模塊／文件邊界：manifest 從構建產物進入類型化注冊表，因此每個字段都會被檢查。manifest 必須指名導出它的包、攜帶 `host` face、持有 zod v4 schema 實例，并保持服務、事件、對象、成員、類型與文檔記錄格式正確；調用描述符必須使用嚴格編解碼器。每次失敗都會指名包與缺陷。

### 緩存與歸屬

結論（可解析說明符、是否導出）與已導入的 manifest 按包名緩存且永不過期。注冊按配置項名稱鍵控，并通過 `ctx.typert.register()` 返回的同一資源釋放函數撤銷；進行中的任務按配置項跟蹤，因此遲到的導入不可能在其所有者消失后注冊貢獻。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`Config`、掃描器、manifest 校驗、注冊裝配邏輯 |
| — | 不發布運行時不變式伴生入口；Loader 配置項的生命周期直接持有每個對應的注冊表資源釋放函數，集成測試會觀察注冊與移除。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面；這些頁面從 loader 開始，依次介紹它注冊的內容及其生成方。

- [Typert 注冊表](../registry/README.zh.md)——本插件所供給的服務。
- [Typert 生成器](../generator/README.zh.md)——產生 loader 所導入產物的包。
- [生成配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-typert-loader)——`packages` 字段聲明及其 JSDoc。
- [Typert 組地圖](../README.zh.md)——完整的類型反射流水線。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為 loader 集成只注冊生成的產物；任何模型可見投影均由消費方負責。

#### KV Cache 影響

無直接影響；注冊變更只有通過讀取注冊表的消費方才會影響請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明 loader 不會發現或注冊什么；它們是當前包約束，不是任務積壓。

- **僅宿主側**——發現機制只會導入宿主側 `./typert` 產物；在為客戶端運行時添加等價的發現機制之前，需要先有獨立的組合所有者。
- **嵌套插件需要顯式條目**——Loader 配置項會被自動發現，但嵌套在另一配置項之下、或完全不經 Loader 加載的插件，需要顯式加入 `packages`，或由其所有者直接調用 `ctx.typert.register()`。
- **緩存結論永不過期**——進程中途新增 `./typert` 導出的包需要重啟后 loader 才會注冊它。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
