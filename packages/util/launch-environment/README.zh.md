---
description: "本次運行環境的不可變快照，記住每個值來自哪一層；供必須以不信任壓平 process.env 的方式解析面向用戶值的包使用。"
kind: "package-library"
---

# @deepseek-ai/dsh-launch-environment

[English](README.md) | 中文

## 概述

使用 `@deepseek-ai/dsh-launch-environment` 解析啟動時的環境值，無需信任壓平的 `process.env`。它會凍結繼承的進程值、調用目錄的 `.env` 和 Harness 主目錄的 `.env`，再按固定可信順序返回勝出的值及其來源。調用方可以在敏感查找中排除某些層；無論之后順序如何變化，被省略的層都不可達。快照不可變，但每一層仍會被復制到 `process.env`，因此它不隔離子進程。請把它作為庫導入；不能從 `cordis.yml` 掛載它。

## 目錄

- [使用本包](#use-this-package)
- [理解實現](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

當各層并非同等可信時，通過快照而非 `process.env` 解析面向用戶的值——例如調用方絕不能從項目目錄取得的憑據覆蓋值。

### 解析一個值

```ts
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'

declare const ctx: import('@deepseek-ai/cordis').Context
const endpoint = launchEnvironmentOf(ctx).get('DEEPSEEK_BASE_URL')?.value
```

`get(name)` 按可信度從高到低搜索所有層。`getFrom(name, sources)` 只搜索指定的層，不改變這一可信順序——絕不能接受某一層的調用方不把它列進去，因此后續任何重新排序都無法讓它回來。

`launchedThroughSsh(snapshot)` 僅在繼承的進程層中存在非空 `SSH_CONNECTION` 或 `SSH_TTY` 時返回 true。Web 瀏覽器喚起、自適應目錄選擇器與 Open In 共用此判斷；項目與用戶 `.env` 中的值不作為 SSH 會話的依據。

### 各層的優先級

| 層 | 它是什么 |
|---|---|
| 繼承的進程環境 | 啟動 shell、CI 任務或容器傳入的內容——本次運行的明確意圖 |
| `<invocation cwd>/.env` | harness 被啟動于其中的項目；產品信任它配置自己的 agent（智能體） |
| `$DSH_HOME/.env` | 用戶自己的機器級默認值 |

變量名按平臺自身的規則匹配：POSIX 上精確匹配，Windows 上不區分大小寫。在 Windows 上做大小寫敏感的查找會選錯層——shell 里的 `deepseek_api_key` 與項目 `.env` 里的 `DEEPSEEK_API_KEY` 對操作系統而言是同一個變量。

### 沒有啟動器引導這棵樹時

當產品 CLI（命令行界面）引導了這棵樹時，`launchEnvironmentOf(ctx)` 返回啟動器的快照；否則返回只含繼承環境的那一層。該回退并不削弱規則：SDK 宿主或裸 `cordis.yml` 從未發現過任何文件，因此它擁有的一切就是它被啟動時的環境。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

快照建立在一個分離之上：啟動器決定存在哪些文件，快照決定值如何排序。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | `createLaunchEnvironmentSnapshot`、`launchEnvironmentOf` 與 `ctx.launchEnvironment` 槽位 |
| — | 不發布運行時不變式伴生入口；快照在任何 fiber 啟動前即已凍結，并且本包不擁有任何事件流或可變運行時數據；單元測試會強制檢查其查找與拒絕規則。 |

### 快照如何保持凍結

`createLaunchEnvironmentSnapshot` 在構造時復制每一層的值，因此之后對源對象的修改無法改變快照。無論構造順序如何，查找都按規范信任順序進行；在 Windows 上，名字在存儲前折疊為大寫，因此大小寫變體無法拆分優先級。

### 省略意味著什么

`getFrom` 按規范順序過濾，絕不按調用方列表的順序。省略一層就是拒絕：該值在該調用中不可達，這正是調用方在某個決策絕不能被某層影響時使用的機制。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當你需要構建快照的啟動器或通過快照解析的消費方時，閱讀以下頁面。

- [boot 包](../../boot/app-boot/README.zh.md)——在任何配置項掛載之前填充 `ctx.launchEnvironment` 的啟動器。
- [憑據存儲](../../credentials/credentials-local/README.zh.md)——針對快照各層解析已存儲的憑據。
- [DeepSeek 提供方](../../llm/llm-deepseek/README.zh.md)——通過啟動環境讀取提供方配置。

-----

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明快照何時不是安全邊界。它們是當前包約束，不是任務積壓。

- **快照不是子進程邊界**——每一層同樣會被物化進 `process.env`，因此項目里的普通變量會按 [`dsh-subprocess`](../../subprocess/subprocess/README.zh.md) 的清洗規則抵達子進程；產品啟動器的 [`.env` 約定](../../boot/app-boot/README.zh.md) 會在物化之前拒絕 bootstrap 變量。
- **沒有按工作區劃分的層**——項目層是調用目錄，在啟動時固定；之后在 Web UI 中選擇的工作區不貢獻任何內容，這是刻意的，因為跟隨它等于讓模型自己的工作區在會話中途改變 harness 環境。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
