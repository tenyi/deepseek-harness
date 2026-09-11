---
description: "宿主原生命令與路徑打開工具，提供無 shell 執行、取消、桌面探測與 WSL 路徑交接。"
kind: "package-library"
---

# @deepseek-ai/dsh-native-command

[English](README.md) | 中文

## 概述

`dsh-native-command` 無需 shell 即可運行 Host 可執行文件，并通過桌面打開 Host 文件系統路徑。命令運行器捕獲 utf8 輸出、傳播取消，并隱藏 Windows 瞬時控制臺。路徑打開器支持默認應用與文本編輯器意圖、瀏覽器可渲染文檔、WSL 轉換與桌面可用性檢查。它是庫而非插件：沒有 `ctx`、無狀態、不發事件。

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

當宿主側集成需要執行一條原生命令、并需要它的輸出或失敗信息（或兩者兼要）、且絕不能涉及 shell 時，使用本運行器。

### 運行一條命令

```ts
import { runNativeCommand } from '@deepseek-ai/dsh-native-command'

declare const script: string
declare const signal: AbortSignal
const { stdout, stderr } = await runNativeCommand('osascript', ['-e', script], signal)
```

退出碼為 0 時，調用解析為捕獲到的 stdout 與 stderr。任何失敗都會以錯誤拒絕，錯誤附帶退出 `code` 與兩路已捕獲輸出，因此調用方無需重跑命令即可區分工具缺失（`ENOENT`）、取消（`ABORT_ERR`）與真實的命令失敗。

### 注入命令邊界

`NativeCommandRunner` 類型是宿主集成的可注入命令邊界：在集成需要一個可測試邊界的位置傳入該函數（或其包裝層），測試即可替換為假運行器。

### 打開 Host 路徑

`openNativePath(path, signal)` 將路徑交給默認應用；平臺能夠確定默認瀏覽器時，HTML 與 SVG 會優先交給該瀏覽器。`openNativeTextFile(path, signal)` 選擇文本編輯器意圖；macOS 使用 `open -t`。WSL 路徑先通過 `wslpath -w` 轉換，再交給 Windows 桌面。`canOpenNativePath()` 報告當前 Host 是否可能具備桌面目標。

`revealNativePath(path, signal)` 在 Finder 或文件資源管理器中選中文件，包含 WSL 路徑轉換；在桌面 Linux 上通過 `xdg-open` 打開上層目錄。`nativeFileManager()` 標識該操作，供 UI 根據 Host 選擇文案；桌面是否可用仍由獨立的 `canOpenNativePath()` 檢查決定。調用方必須先授權絕對文件路徑，再執行操作。平臺分派由注入運行器的測試覆蓋；原生桌面驗證由對應平臺負責。 Explorer 接收獨立參數中的編碼文件 URI。退出碼 1 按已轉交請求處理；取消、找不到可執行文件和其他退出碼仍然報錯。該確認不能證明桌面窗口已選中文件。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

命令運行器是 Node `execFile` 的薄包裝。路徑打開器根據平臺與環境事實選擇一條無 shell 命令，而調用方繼續負責決定允許打開哪個路徑。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 命令運行器與路徑打開器的公共導出 |
| [`src/runner.ts`](src/runner.ts) | 無 shell 的 `execFile` 適配器 |
| [`src/path-opener.ts`](src/path-opener.ts) | 桌面探測、打開意圖、瀏覽器偏好與 WSL 轉換 |
| — | 不發布運行時不變式伴生入口；每次運行都是一次無狀態的子進程往返，不擁有事件流或可變運行時數據；相關行為由單元測試保障。 |

### execFile 給了運行器什么

`execFile` 以 argv 數組直接 spawn 可執行文件——沒有 shell 字符串，參數不經 shell 解釋。`signal` 選項在調用方中止觸發時終止子進程；`windowsHide` 在 Windows 上抑制瞬時控制臺窗口。遇到非零退出或 spawn 錯誤時，回調把 `code`、`stdout`、`stderr` 掛到被拒絕的錯誤上，并保留原始錯誤作為 `cause`。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當你需要消費方或本工具刻意不屬于的通用子進程能力時，閱讀以下頁面。

- [原生目錄選擇器](../../host/directory-picker-native/README.zh.md)——本運行器執行的 OS 選擇器命令。
- [Session Controller](../../api/session-controller/README.zh.md)——打開前解析 Session 相對 workspace 路徑。
- [Settings Controller](../../api/settings-controller/README.zh.md)——選擇 settings 文檔與 agent-preset 目錄。
- [子進程能力](../../subprocess/subprocess/README.zh.md)——通用子進程 seam，本包并非其組成部分。

-----

<a id="model-experience"></a>
## 模型體驗

無：宿主側工具不注冊任何面向模型的內容。

#### KV Cache 影響

此處沒有任何內容進入請求前綴；本包既不組裝也不發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本運行器何時不是合適的工具。它們是當前包約束，不是任務積壓。

- **不做輸出限量**——兩路流在內存中無界緩沖；當前每個調用方只運行輸出為一個路徑或一行錯誤的小型原生工具。把它指向輸出量可觀的命令之前，先接入 `dsh-output-retention` 限量。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
