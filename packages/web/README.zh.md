---
description: "web 訪問能力家族的包映射：搜索與抓取服務、其提供方后端，以及消費它們的面向模型工具。"
kind: "package-group"
---

# web/：web 訪問能力家族

[English](README.md) | 中文

## 概述

`web/` 包讓模型通過 `web_search` 與 `web_fetch` 工具搜索公共 web 和抓取 HTTP(S) 頁面。部署可為搜索選擇 Exa、Perplexity 或 DeepSeek，并通過匿名 HTTP(S) 訪問抓取頁面；可用性與資源上限取決于配置的提供方。該家族用于搜索和頁面檢索，不用于交互式瀏覽、內容提取或逐 URL 策略執行。提供方變化時，模型仍能獲得一致的工具行為、取消與錯誤報告。

## 目錄

- [包](#packages)
- [相關文檔](#related-documentation)
- [開發備注](#dev-note)

-----

<a id="packages"></a>
## 包

六個包分別承擔 web 角色；完整詞匯與約定以子系統參考文檔為準。

| 包 | 職責 | ctx 鍵 |
|---|---|---|
| [`web/`](web/README.zh.md) | 搜索與抓取服務：通過可互換的后端搜索與抓取 URL，統一選擇與錯誤策略 | `ctx.web` |
| [`web-search-exa/`](web-search-exa/README.zh.md) | 通過 Exa 搜索 web | 注冊到 `ctx.web` |
| [`web-search-perplexity/`](web-search-perplexity/README.zh.md) | 通過 Perplexity 搜索 web | 注冊到 `ctx.web` |
| [`web-search-deepseek/`](web-search-deepseek/README.zh.md) | 通過 DeepSeek 原生搜索搜索 web | 注冊到 `ctx.web` |
| [`web-fetch-http/`](web-fetch-http/README.zh.md) | 匿名抓取公共 HTTP(S) 頁面 | 注冊到 `ctx.web` |
| [`tool-web/`](tool-web/README.zh.md) | 向模型公開 `web_search` 與 `web_fetch` | 注冊到 `ctx.tools` |

-----

<a id="related-documentation"></a>
## 相關文檔

先從子系統參考文檔了解共享詞匯，再看單一提供方選擇服務背后的設計決策。

- [web 子系統](../../docs/subsystems/web.zh.md)——搜索與抓取的請求和結果、提供方可用性、`WebError` 與公開地址強制規則。
- [web 能力 seam 決策](../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.zh.md)——搜索與抓取為何共用一項提供方選擇服務。

<a id="dev-note"></a>
## 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
