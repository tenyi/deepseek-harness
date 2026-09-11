---
description: "Web GUI Host 側的包映射：HTTP 與 SPA 服務器、工作區目錄選擇實現、open-in-app 啟動路由和插件清單投影。"
kind: "package-group"
---

# host/ — Web GUI 宿主側

[English](README.md) | 中文

## 概述

`host/` 組提供 Web GUI 的普通 HTTP 服務器、服務已構建 Web 殼的 SPA dist 服務器、帶原生／瀏覽／自適應組合包的工作區目錄選擇 seam、open-in-app 的應用探測與啟動路由，以及只讀的插件清單投影。這八個包都是產品包；瀏覽器傳輸位于 [`client/`](../client/README.zh.md)，組合應用是 [`apps/cli`](../../apps/cli/README.zh.md)，它啟動 [`dsh-base` 組合包](../bundle/base/cordis.patch.yml) 來提供 `apps/web/` 下的 Web 應用。選擇器后端可在共享 seam 后互相替換。

## 目錄

- [包](#packages)
- [相關文檔](#related-documentation)
- [開發備注](#dev-note)

-----

<a id="packages"></a>
## 包

八個包分別承擔 Host 角色；各包的 README 擁有自己的約定與配置。

| 包 | 職責 | ctx 鍵 |
|---|---|---|
| [`webserver/`](webserver/README.zh.md) | 瀏覽器 HTTP 服務器：具名路由、upgrade、index 轉換與回退席位 | `ctx.webServer` |
| [`frontend-static/`](frontend-static/README.zh.md) | 占據 webserver 回退席位的 SPA dist 服務器 | 消費 `ctx.webServer` |
| [`directory-picker/`](directory-picker/README.zh.md) | 工作區目錄選擇 seam：能力約定與錯誤詞匯 | `ctx.directoryPicker` |
| [`directory-picker-native/`](directory-picker-native/README.zh.md) | 面向宿主屏幕前操作者的原生 OS 選擇器后端 | 注冊 `ctx.directoryPicker` |
| [`directory-picker-browse/`](directory-picker-browse/README.zh.md) | 應用內目錄瀏覽器后端，也服務于遠程客戶端 | 注冊 `ctx.directoryPicker` |
| [`directory-picker-auto/`](directory-picker-auto/README.zh.md) | 在啟動時掛載匹配后端的宿主自適應選擇器 | 掛載一個后端 |
| [`open-in-app/`](open-in-app/README.zh.md) | 在已安裝應用中打開 workspace 目錄的應用探測、圖標與啟動路由 | 消費 `ctx.webServer` |
| [`plugin-inventory/`](plugin-inventory/README.zh.md) | 當前 Loader 條目的只讀投影 | Remote `pluginInventory/list` |

-----

<a id="related-documentation"></a>
## 相關文檔

先從傳輸與工作區記錄的子系統參考讀起，再看 Web Client 背后的分層決策。

- [HTTP 服務器子系統](../../docs/subsystems/web-server.zh.md)——webserver 的路由、匹配順序與配置。
- [工作區子系統](../../docs/subsystems/workspace.zh.md)——目錄選擇器所喂給的工作區記錄。
- [Web 配置樹啟動與傳輸分層](../../.agents/notes/implemented/architecture/2026-07-24-web-config-tree-boot-and-transport-layering.zh.md)——Web 傳輸各層的所有權。

<a id="dev-note"></a>
## 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
