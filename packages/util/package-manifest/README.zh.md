---
description: "包身份、運行時要求和 DSH 插件元數據的共享 TypeScript 聲明。"
kind: "package-library"
---

# @deepseek-ai/dsh-package-manifest

[English](README.md) | 中文

## 概述

使用 `DshPackageManifest` 描述包元數據、`DshManifest` 描述 `dsh` 下的公共字段，以及 `DshClientManifest` 等成員類型描述單個領域。各讀取方負責 JSON 解析、校驗和默認值解析。

## 目錄

- [使用本包](#use-this-package)
- [理解實現](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與后續工作](#known-limitations-and-deferred-work)
- [開發備注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

從包根導入類型。僅檢查自己的源碼時使用開發依賴；若發布的聲明文件引用這些類型，則使用生產依賴。

```ts
import type { DshClientManifest, DshPackageManifest } from '@deepseek-ai/dsh-package-manifest'

const client: DshClientManifest = { platform: 'web' }
const manifest: DshPackageManifest = {
  name: 'example-dsh-plugin',
  version: '1.0.0',
  engines: { node: '>=24', dsh: '0.1.5-alpha.1' },
  dsh: {
    manifestVersion: 1,
    bundle: { patch: './cordis.patch.yml' },
    client,
  },
}
```

`DshPackageManifest` 描述 DSH 使用的 package.json 字段，其中 `name` 和 `version` 必填；它不是完整的 npm schema（模式）。本地 profile 讀取方使用 `Partial<DshPackageManifest>`，因為 profile 無需發布版本。`DshManifest` 僅描述 `dsh` 下的公共作者字段。TypeScript 檢查示例并刪除 `import type`；這些接口不解析 JSON，也不寫入文件。

以下元數據字段均可選。省略時，格式版本或兼容的宿主版本保持未聲明狀態；讀取方不推斷默認值。

| 字段 | 含義 |
|---|---|
| `dsh.manifestVersion` | manifest（元數據清單）格式標識；聲明的格式為 `1`，獨立于 npm 包版本和 Session 格式版本。 |
| `engines.dsh` | 作者聲明的兼容 DSH 版本，使用 SemVer 范圍，也可填寫精確的預發布版本。此字段與 `engines.node`、`engines.npm` 并列；engines 對象可省略 `dsh`。 |

公共組合聲明定義在 [`src/types.ts`](src/types.ts) 中。內部 `configTrees`、`sessionFormatMigration` 和生成的 `moduleFallback` 元數據分別由鏡像打包器、目錄生成器和啟動器讀取方擁有；公共類型不暴露這些字段。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

包根僅重新導出 [`src/types.ts`](src/types.ts) 中的聲明。本包不發布運行時不變量伴隨模塊，因為它沒有運行時狀態或可獨立觀察的關系。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [Profile 啟動器](../../boot/app-boot/README.zh.md#profiles)——manifest 加載與組合。
- [公共包元數據](../../../.agents/notes/implemented/architecture/2026-09-10-public-package-manifest.zh.md)——字段位置與讀取方歸屬。

<a id="model-experience"></a>
## 模型體驗

無，因為本包僅導出類型。

#### KV Cache 影響

類型聲明不增加模型輸入，因此不影響提供方的緩存復用。

## 已知限制與后續工作

<a id="known-limitations-and-deferred-work"></a>

- **僅提供靜態類型。** 消費方讀取并校驗所需的 JSON 字段，再將共享聲明適配為運行時數據。本包不提供解析器、getter helper、文件檢查或默認值。
- **兼容性僅作聲明。** 當前安裝器和加載器不強制檢查 `dsh.manifestVersion` 或 `engines.dsh`；聲明范圍不會拒絕不兼容的宿主，也不會校驗 SemVer 語法。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
