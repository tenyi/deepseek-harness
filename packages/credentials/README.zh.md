---
description: "憑據能力族的包映射：憑據引用 seam、環境與文件提供方、授權 flow 注冊表，以及引用如何讓機密值留在配置之外。"
kind: "package-group"
---

# credentials/：憑據與授權

[English](README.md) | 中文

## 概述

`credentials/` 組讓配置引用機密的名字，而不嵌入機密值。使用 `credentials/` 存儲、查詢和移除憑據；使用 `credentials-local/` 將憑據私密地存儲在本機，并支持按次運行的環境覆蓋；當需要向人詢問以獲取憑據時，使用 `authorization/`。輪換后的存儲值會作用于下一次模型請求，而 `DEEPSEEK_API_KEY=… dsh` 在該次運行中優先。配置文件只包含憑據名稱；本地機密值只有同一 OS 用戶可讀。

## 目錄

- [包](#packages)
- [相關文檔](#related-documentation)
- [開發備注](#dev-note)

-----

<a id="packages"></a>
## 包

三個包共同提供憑據功能：一個在運行時存儲、查詢與移除機密，而配置只寫名字；第二個是默認的本機存儲；第三個讓插件獲取必須向人請求的憑據。它們的 README 覆蓋日常使用；全部約定以子系統參考為準。

| 包 | 角色 | ctx 鍵 |
|---|---|---|
| [`credentials/`](credentials/README.zh.md) | 在運行時存儲、查詢與移除機密，而配置只寫名字 | `ctx.credentials` |
| [`credentials-local/`](credentials-local/README.zh.md) | 默認本機存儲：一個私有 YAML 文件，環境覆蓋優先 | 注冊 `ctx.credentials` |
| [`authorization/`](authorization/README.zh.md) | 由插件擁有、通過詢問人來取得憑據的 flow | `ctx.authorization` |

-----

<a id="related-documentation"></a>
## 相關文檔

先從子系統參考了解共享詞匯，再看能力 seam 表與本地存儲的配置面。

- [憑據子系統參考](../../docs/subsystems/credentials.zh.md)——`CredentialRef` 與 `CredentialKey`、按操作解析、可安全用于 UI 的 `CredentialInfo`、授權 flow 與生成的 Cordis 接口面。
- [能力 seam](../../docs/capability-seams.zh.md)——本家族遵循的 Service Definition / Service Provider / Consumer 拆分。
- [生成配置目錄](../../docs/config-catalog.zh.md#deepseek-aidsh-credentials-local)——本地存儲的每個受支持字段。

<a id="dev-note"></a>
## 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
