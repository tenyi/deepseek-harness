---
description: "schedule 組地圖：基于會話日志的會話本地持久提醒，供瀏覽本組的用戶與維護者閱讀。"
kind: "package-group"
---

# schedule/ — 僅限會話內的提醒

[English](README.md) | 中文

## 概述

schedule 組讓 agent（智能體）為當前會話創建、列出和取消提醒。提醒可以在延遲后、絕對時間或固定間隔觸發；到期時，它們會作為普通消息進入該會話。提醒在重啟后依然存在，但不會離開會話，也不會發送電子郵件、短信或推送通知。本組的包提供提醒管理與交付。可選的瀏覽器包顯示當前提醒目錄，并標記已知存在活動提醒的會話；這些標識反映緩存狀態，可能落后于運行中的會話。

## 目錄

- [包](#packages)
- [相關文檔](#related-documentation)
- [開發備注](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 職責 | ctx 鍵 |
|---|---|---|
| [`schedule/`](schedule/README.zh.md) | 會話本地提醒：安排、列出并取消活動記錄；發布供 header 目錄與列表行標識讀取的可選只讀 projection；把到期提醒作為會話消息交付 | —（工具只注冊在精確的 agent scope 中） |

-----

<a id="related-documentation"></a>
## 相關文檔

- [僅限會話內的 Schedule 子系統](../../docs/subsystems/schedule.zh.md)——持久記錄、轉換、視圖與交付約定。
- [生成的工具目錄](../../docs/tool-catalog.zh.md#deepseek-aidsh-schedule)——模型接收的 `schedule_create`／`schedule_list`／`schedule_delete` schema。
- [Schedule 用戶指南](../../docs/user/guide/schedule.zh.md)——掛載本包的官方配置路徑。
- [Web Schedule 目錄](../client/ui-schedule/README.zh.md)——活動記錄的可選只讀瀏覽器呈現。

-----

<a id="dev-note"></a>
## 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
