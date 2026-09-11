# 安排會話內提醒

[English](schedule.md) | 中文

此 overlay 讓一個 `dsh web` 進程顯式啟用 Schedule 提醒，同時不改變交付的默認 Web 組合：

```sh
dsh web --patch apps/cli/config/examples/schedule/cordis.yml
```

當前 overlay 支持使用正整數 `after_seconds`、絕對時間 `at` 目標，或至少 300 秒的固定速率 `every_seconds` 間隔創建提醒。模型通過 `schedule_create`、`schedule_list` 和 `schedule_delete` 管理它們；每個結果都會把交付標為 `session-local`。

啟用此 overlay 后，成功打開且存在活動提醒的 Session 會在對話 header 中顯示只讀目錄。目錄列出完整 prompt、等待中或已逾期狀態、單次或精確重復周期、瀏覽器本地目標時間與相對時間。側邊欄還會在 grouped、flat 與 search 行當前可用的 projection 值非空時，于標題后顯示不可交互的鬧鐘。這些界面不會創建、編輯、刪除或確認提醒；cold Session 的緩存鬧鐘允許短暫漏顯或殘留。

瀏覽器會為每條提示詞附加其 IANA 時區。Time-context 會告訴模型，把未明確限定時區的日期和時間解釋為該請求的瀏覽器時區。此假設僅用于自然語言解釋：`schedule_create.at` 必須是帶 `Z` 或數值偏移量且嚴格符合 RFC 3339 的日期時間，或是帶顯式 `UTC` 或 IANA Area/Location 時區的 `{ date, time, time_zone }`。Schedule 不保留或推斷 Session 默認時區。夏令時缺口會被拒絕，重疊時段選擇第一個時刻；成功創建的記錄只保留所得的 UTC 目標。

每條提醒由原 Session 日志擁有。live 根 Agent 會等待到完全 idle，再在該對話中排入一個普通 follow-up 輪次。它絕不會中途引導當前工作，也不會添加獨立回執或提醒卡片。關閉進程或讓 Session 保持 cold 會停止內存 timer，但不會刪除記錄；重新打開同一個 Session 會恢復等待并交付逾期提醒。查看 cold 歷史不會激活提醒，fork 也不會繼承父 Session 的提醒。

Every 提醒始終與其創建時刻對齊。如果提醒逾期，只會呈現最新一個到期發生時點，下一個目標仍保留在原固定速率序列上。同一次 idle 決策中逾期的所有不同 Every 記錄會合并為一個 follow-up，每條記錄各有一個發生時點；錯過的間隔不會形成積壓。已到期的一次性提醒會在該批次之前運行。不支持日歷表達式和 Cron 表達式。

創建和實際刪除操作只有在 Session persistence 確認對應事件前綴后才會確認成功。Schedule 不提供瀏覽器、操作系統、郵件、短信或其他外部通知。持久 dispatch 會記錄 follow-up 已經入隊；它不確認模型成功或用戶已收到提醒。
