---
description: "目錄選擇 seam 的自適應選擇器：在啟動時判定一次 web GUI 宿主的處境，并掛載匹配的原生或瀏覽后端。"
kind: "package-reference"
---

# @deepseek-ai/dsh-host-directory-picker-auto

[English](README.md) | 中文

## 概述

`dsh-host-directory-picker-auto` 為每次啟動選出正確的目錄選擇交互：它在啟動時一次性判定宿主處境，并把匹配的后端——[原生](../directory-picker-native/README.zh.md)或[瀏覽](../directory-picker-browse/README.zh.md)——連同其 browser 半側一起，作為真實的 Loader 條目掛進內存根樹。判定是一次純函數的啟動時采樣：`native` 要求僅回環綁定、非 SSH 啟動與可服務的顯示會話；任何含糊情形都判定為處處可用的 `browse`。固定某種交互就是直接組合那個后端。掛載的能力在服務生命周期內保持穩定，符合 seam 的要求。

## 目錄

- [使用本包](#use-this-package)
- [理解實現](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

當同一份組合必須服務處境不同的宿主時，用本插件代替具體的后端：本地工作站會話里原生選擇器可用，遠程或無頭會話里只有應用內瀏覽器可用。選擇器在啟動時檢查一次宿主，并掛載匹配的交互。

### 選擇是如何作出的

`native` 要求「操作者看得到宿主屏幕、且原生后端能服務它」的全部信號：僅回環的綁定（從注入的 `webServer` 讀取；全網卡綁定會接入任何 OS 選擇器都觸及不到的遠程瀏覽器）；非 SSH 啟動（共用的 [launch-environment](../../util/launch-environment/README.zh.md) 判斷忽略項目與用戶 `.env` 中的值，只檢查繼承的非空 `SSH_CONNECTION`／`SSH_TTY`）；以及可服務的顯示會話——darwin 與 win32 上視為存在；linux 上要求 `DISPLAY`／`WAYLAND_DISPLAY`，外加 `PATH` 上有 zenity 或 kdialog 二進制；其余任何平臺上都不成立。任何含糊情形都判定為處處可用的 `browse`。

### 你會得到什么

判定出的交互以普通 Loader 條目的形式到達：后端注冊 `ctx.directoryPicker`，其 browser 半側被 client 模塊表發現的方式與配置行完全相同，因此 seam 的「一行同時換兩面」不變式依然成立。卸載該選擇器會移除該條目，連同兩面一起卸載。采樣每次啟動恰好發生一次，因此掛載的能力在服務生命周期內保持穩定。

### 固定某種交互

固定交互在這里不是配置字段：直接組合 `-native` 或 `-browse` 行來替代本行——那才是 seam 文檔化的切換點。同時掛載選擇器**和**某個后端行會明確報錯（重復的 `directoryPicker` 服務、`single` 類 slot 中的重復 client 流程）。

### 可觀察的失敗

錯誤的 `native` 選擇會退化為后端既有的可重試失敗對話框，而不是壞掉的組合；對探查無法證明其處境的部署，直接組合 `-browse` 即選擇安全的交互。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

### 設計理念

選擇器是一次純決策加一次掛載：`resolveDirectoryPickerBackend` 在啟動時采樣宿主事實并返回一個后端類型，`apply` 把匹配的后端與界面包作為真實 Loader 條目掛進內存根樹——絕不持久化到配置文件，因為根樹的 `write()` 是 no-op。該 effect 的 disposer 會移除兩個條目并匯合其 fiber 的拆除，因此卸載只在所掛載交互的兩面完全停穩后返回。

### 判定表

| 條件 | 后端 |
|---|---|
| 綁定宿主不是 `127.0.0.1` | `browse` |
| 存在 `SSH_CONNECTION` 或 `SSH_TTY` | `browse` |
| darwin 或 win32 | `native` |
| linux 且帶選擇器二進制與顯示 | `native` |
| 其他任何情況 | `browse` |

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`BACKEND_PACKAGES`／`SURFACE_PACKAGES` 映射、`apply` 掛載與卸載 |
| [`src/resolve.ts`](src/resolve.ts) | `resolveDirectoryPickerBackend`——純函數的啟動時決策 |
| [`src/probe.ts`](src/probe.ts) | 宿主探查：`hasLinuxChooserBinary`、`canExecute` |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當選擇器的約定不夠用時閱讀以下內容：先看 seam 定義，再看它掛載的兩個后端。

- [目錄選擇 seam](../directory-picker/README.zh.md)——選擇器所組合的能力約定。
- [目錄選擇能力 seam 決策](../../../.agents/notes/archived/architecture/2026-07-28-directory-picker-capability-seam.md)——后端為何在交互形態上彼此不同。
- [原生后端](../directory-picker-native/README.zh.md)——為本地操作者掛載的交互。
- [瀏覽后端](../directory-picker-browse/README.zh.md)——在其他任何地方掛載的交互。

-----

<a id="model-experience"></a>
## 模型體驗

無。GUI 宿主的目錄選擇選擇器只掛載一個后端行，不注冊任何面向模型的內容。

#### KV Cache 影響

無；該包既不組裝也不發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明啟動時采樣何時會誤判宿主。它們是當前包約束，不是任務積壓。

- **探測是從啟動上下文推斷操作者位置，而任何啟動側信號都無法證明這一點**——從 SSH 啟動中脫離的 tmux 會話會丟失 `SSH_*` 標記；Aqua 會話之外的 Darwin 進程仍被算作有顯示；在工作站本地啟動、之后經 `ssh -L` 訪問時，請求會從 `127.0.0.1` 到達，系統會判定 `native`，并把選擇器彈在無人值守的工作站上。錯誤的 `native` 選擇會退化為后端既有的可重試失敗對話框，而對這類部署，直接組合 `-browse` 即選擇安全的交互。
- **Linux 選擇器探查只讀 `PATH`**——以其他途徑可用的 zenity／kdialog（shell 別名、未裝在 PATH 上）仍判定為 `browse`；把任一二進制裝到 `PATH` 上，下次啟動即恢復 `native` 資格。
- **僅在啟動時判定**——一次判定服務本次啟動的所有客戶端；按連接自適應（同一臺服務器，本地瀏覽器用 native、遠程瀏覽器用 browse）需要按客戶端的能力對象以及 seam 未攜帶的協議通告，等到出現同時服務兩種形態的部署再做。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。唯一 effect 是由插件 fiber 持有的 boot-time Loader-entry mount，存儲是權威來源。
