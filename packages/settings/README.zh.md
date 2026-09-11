---
description: "用戶設置能力族的包映射：解析各 namespace 配置的 ctx.settings 服務，以及存儲它的 YAML/JSON 文件提供方。"
kind: "package-group"
---

# settings/：用戶可編輯配置

[English](README.md) | 中文

## 概述

`settings/` 組讓插件配置變為用戶可編輯：插件用一個 schema 注冊具名 namespace，用戶在一份文檔里覆蓋值，無需改動 `cordis.yml`。用戶覆蓋優先于部署自身的配置與 schema 默認值，變更實時生效。兩個包覆蓋該能力：`settings/` 提供設置服務，`settings-file/` 把所有 namespace 存進一個用戶可編輯的 YAML 或 JSON 文檔。設置是可選的：沒有掛載提供方時，配置保持組合原樣。

## 目錄

- [包](#packages)
- [相關文檔](#related-documentation)
- [開發備注](#dev-note)

-----

<a id="packages"></a>
## 包

兩個包覆蓋該能力；完整約定由各子級 README 負責，窮盡式服務接口面由子系統參考負責。

| 包 | 角色 | ctx 鍵 |
|---|---|---|
| [`settings/`](settings/README.zh.md) | 設置服務：注冊 namespace 并讀取或修改其值 | `ctx.settings` |
| [`settings-file/`](settings-file/README.zh.md) | 把設置存進一個本地 YAML/JSON 文件并實時發布外部修改 | 注冊 `ctx.settings` |

-----

<a id="related-documentation"></a>
## 相關文檔

先從子系統參考了解共享詞匯，再看本家族遵循的能力 seam 拆分。

- [設置子系統參考](../../docs/subsystems/settings.zh.md)——namespace、分層解析、descriptor、變更提交與生成的 Cordis 接口。
- [能力 seam](../../docs/capability-seams.zh.md)——本家族遵循的 Service Definition / Service Provider / Consumer 拆分。

<a id="dev-note"></a>
## 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
