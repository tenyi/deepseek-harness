---
description: "存儲組地圖：通過具名后端與類型化領域數據形式持久化非會話數據，供瀏覽本組的用戶與維護者閱讀。"
kind: "package-group"
---

# packages/storage

[English](README.md) | 中文

## 概述

存儲組跨重啟保留非會話應用數據，包括工作區記錄和會話伴隨數據。需要人類可讀文件時選擇 `storage-json`，需要在單個數據庫中定點更新時選擇 `storage-sqlite`；`storage-domain` 增加經過 schema 校驗的類型化記錄和變更通知，而 `storage` 選擇已配置的后端。這些包是可選項且只面向宿主側：它們不會向模型暴露工具、提示詞內容或會話事件。當應用狀態必須在進程結束后繼續存在時使用本組；組合沒有此類數據時可以省略本組。

## 目錄

- [包](#packages)
- [相關文檔](#related-documentation)
- [開發備注](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 職責 | ctx 鍵 |
|---|---|---|
| [`storage`](storage/README.zh.md) | 把已注冊后端與已掛載的數據形式設施連接起來 | `ctx.storage` |
| [`storage-json`](storage-json/README.zh.md) | 把每個單元存為一個人類可讀的 JSON 文件 | 注冊后端 `json` |
| [`storage-sqlite`](storage-sqlite/README.zh.md) | 把單元作為 JSON 文檔存進一個 SQLite 數據庫 | 注冊后端 `sqlite` |
| [`storage-domain`](storage-domain/README.zh.md) | 在已路由后端之上提供經過 schema 校驗、發出變更事件的 KV 領域 | `ctx.storageDomain` |

-----

<a id="related-documentation"></a>
## 相關文檔

- [存儲子系統](../../docs/subsystems/storage.zh.md)——權威約定：后端約定、領域聲明、變更事件與生成的 API。
- [領域 KV 存儲 Agent Note](../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.zh.md)——本家族的設計、workspace 消費方與被推遲的會話后端遷移。
- [Workspace 子系統](../../docs/subsystems/workspace.zh.md)——領域數據形式的第一個消費方。

-----

<a id="dev-note"></a>
## 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

設計 Agent Note 仍標記為 proposed，而本家族已經發布；其范圍外事項表就是遷移階段（`log` 分面、會話后端復用、跨進程變更推送）的延期工作清單。決策落地后，請把結論提升為 implemented 筆記。

</details>
