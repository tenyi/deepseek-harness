---
description: "共享工具家族的包映射：原子文件寫入、品牌化 id、雙端隊列、JSON 值、harness 主目錄路徑、啟動環境、原生命令、輸出保留、時區與超時。"
kind: "package-group"
---

# util/：共享工具

[English](README.md) | 中文

## 概述

`util/` 組為能力包提供共享的機制原語，避免重復實現。它涵蓋原子寫入、品牌化 id、雙端隊列、無損 JSON 值、UUID、Harness home 路徑、啟動環境、出站代理策略、原生命令、輸出保留、時區規范化和超時處理。這里的每個根入口都是庫：它不注冊產品服務或事件，業務語義仍由消費它的能力負責。

## 目錄

- [包](#packages)
- [相關文檔](#related-documentation)
- [開發備注](#dev-note)

-----

<a id="packages"></a>
## 包

每個包提供一個原語；打開對應包頁面了解如何使用。

| 包 | 職責 |
|---|---|
| [`brand/`](brand/README.zh.md) | 提供名義字符串類型及其無狀態構造函數 |
| [`package-manifest/`](package-manifest/README.zh.md) | 包 manifest（元數據清單）的共享 TypeScript 聲明 |
| [`crypto/`](crypto/README.zh.md) | 基于跨運行時 `crypto.getRandomValues` 原語生成 RFC 9562 v4 UUID |
| [`deque/`](deque/README.zh.md) | 提供攤銷常數時間的隊列操作和有界空閑存儲 |
| [`chunked-list/`](chunked-list/README.zh.md) | 通過有界追加復制和檢查點校驗保留不可變列表版本 |
| [`values/`](values/README.zh.md) | 校驗、創建快照、比較和凍結無損 JSON 兼容值 |
| [`home-paths/`](home-paths/README.zh.md) | 解析統一的 Harness 主目錄并拼接共享的用戶數據路徑 |
| [`http-proxy/`](http-proxy/README.zh.md) | 解析出唯一的出站代理策略，并為 `fetch`、SDK agent（智能體）與 spawn 的子進程安裝它 |
| [`launch-environment/`](launch-environment/README.zh.md) | 凍結的啟動環境，記住每個值來自哪一層 |
| [`atomic-write/`](atomic-write/README.zh.md) | 原子文件替換與跨進程寫鎖 |
| [`native-command/`](native-command/README.zh.md) | 直接運行宿主原生命令，絕不拼 shell 字符串 |
| [`workspace-path/`](workspace-path/README.zh.md) | 提供瀏覽器安全的 Workspace 路徑與顯示輔助函數 |
| [`output-retention/`](output-retention/README.zh.md) | 限制面向模型的輸出并報告精確的省略元數據 |
| [`time/`](time/README.zh.md) | 校驗并規范化調用方所報的 IANA 時區 |
| [`timeout/`](timeout/README.zh.md) | 截止時間運算、信號融合與超時和取消分類 |

-----

<a id="related-documentation"></a>
## 相關文檔

- [根包映射](../README.zh.md)——`util/` 在所有包組中的位置。
- [生成配置目錄](../../docs/config-catalog.zh.md)——本組所屬的庫包索引。
- [添加包實操手冊](../../docs/cookbook/adding-a-package.zh.md)——新的共享原語如何落入本組。

<a id="dev-note"></a>
## 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
