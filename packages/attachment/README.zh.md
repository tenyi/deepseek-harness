---
description: "持久圖片附件能力族的包映射：你可以用圖片附件做什么，以及你的圖片存放在哪里。"
kind: "package-group"
---

# attachment/：持久附件能力族

[English](README.md) | 中文

## 概述

`attachment/` 組提供持久圖片附件：把圖片附加到提示詞和命令，harness 會把它保存到你的機器上，重新顯示在對話歷史中，并在后續輪次發送給模型。隨附的 `dsh` 組合無需任何設置即可支持這一點。該能力與它的存儲拆分為兩個包，見下文。已存儲的圖片在重啟后依然存在且永遠不會被自動刪除，并且只支持光柵圖片格式。

## 目錄

- [包](#packages)
- [相關文檔](#related-documentation)
- [開發備注](#dev-note)

-----

<a id="packages"></a>
## 包

這兩個包提供持久圖片附件；每個 README 描述其各自部分可以做什么。

| 包 | 角色 | ctx 鍵 |
|---|---|---|
| [`attachment/`](attachment/README.zh.md) | 可用于提示詞與命令、會持久保存并回到歷史中的圖片附件 | `ctx.attachments` |
| [`attachment-local/`](attachment-local/README.zh.md) | 把附加圖片存儲在本機 `DSH_HOME` 下 | 注冊到 `ctx.attachments` |

-----

<a id="related-documentation"></a>
## 相關文檔

先從子系統參考了解服務約定，再看能力 seam 表與本地后端的配置面。

- [附件子系統參考](../../docs/subsystems/attachment.zh.md)——服務約定、載荷類型與 `ctx.attachments` 的 Cordis 接口面。
- [能力 seam](../../docs/capability-seams.zh.md)——本家族遵循的 Service Definition / Service Provider / Consumer 拆分。
- [生成配置目錄](../../docs/config-catalog.zh.md#deepseek-aidsh-attachment-local)——本地后端的每個受支持字段。

<a id="dev-note"></a>
## 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
