---
description: "循環衛生 guard 家族的包映射：建議性重復工具提醒與單次工具調用超時策略，供選擇或組合 guard 的用戶與維護者閱讀。"
kind: "package-group"
---

# guard/：循環衛生 guard 家族

[English](README.md) | 中文

## 概述

`guard/` 組通過監視兩種常見失敗模式來保持 agent loop（智能體循環）高效。`repeat-tool-reminder` 會在模型重復完全相同的工具調用時提醒它改變方法或結束任務，讓卡住的循環不再浪費時間和 token。`timeout-policy` 為聲明了限時的工具調用設置時間上限，讓掛起的調用向模型返回清晰的超時錯誤，而不是拖住整個會話。兩者都在 `dsh` 基礎組合包中默認啟用；組合可以調優或移除它們。

## 目錄

- [包](#packages)
- [相關文檔](#related-documentation)
- [開發備注](#dev-note)

-----

<a id="packages"></a>
## 包

兩個小插件分別覆蓋兩種模式；下文每個 README 都說明何時保留、調優或移除它。

| 包 | 提供什么 |
|---|---|
| [`repeat-tool-reminder/`](repeat-tool-reminder/README.zh.md) | 在模型重復完全相同的工具調用時提醒它，使其改變方法或結束任務 |
| [`timeout-policy/`](timeout-policy/README.zh.md) | 為聲明了限時的工具調用設置超時，讓模型得到清晰錯誤而不是無限等待 |

-----

<a id="related-documentation"></a>
## 相關文檔

先從工具子系統參考了解工具調用流水線，再看重復提醒的配置與策略背后的超時庫決策。

- [工具子系統參考](../../docs/subsystems/tools.zh.md)——兩個 guard 都依賴的工具調用流水線與決策。
- [生成配置目錄](../../docs/config-catalog.zh.md#deepseek-aidsh-repeat-tool-reminder)——重復調用提醒的每個受支持字段。
- [超時截止時間庫 Agent Note](../../.agents/notes/implemented/architecture/2026-07-06-timeout-deadline-library.zh.md)——`timeout-policy` 所執行的時序／終止拆分。

<a id="dev-note"></a>
## 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
