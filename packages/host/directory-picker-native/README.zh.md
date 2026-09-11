---
description: "目錄選擇 seam 的原生 OS 選擇器后端：為坐在 web GUI 宿主屏幕前的操作者每次打開一個平臺選擇器。"
kind: "package-reference"
---

# @deepseek-ai/dsh-host-directory-picker-native

[English](README.md) | 中文

## 概述

坐在宿主屏幕前的操作者通過原生 OS 選擇器選擇工作區目錄：`dsh-host-directory-picker-native` 每次選擇打開一個平臺目錄選擇器，并解析出所選絕對路徑（取消時為 `null`）。macOS 驅動 `osascript`，Linux 使用 Zenity 并以 KDialog 回退，Windows 在 spawn 的子進程中打開現代 `IFileOpenDialog`。只有操作者坐在宿主屏幕前時才可用——遠程部署應組合[瀏覽后端](../directory-picker-browse/README.zh.md)。一行組合配置還會在工作區流程中注冊匹配的瀏覽器側交互，因此同時選擇兩側。

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

當操作者工作在宿主屏幕前，且原生選擇器是合適的交互時，組合此后端。打開目錄選擇器的工作區流程每個打開請求調用一次 `pick(signal)`；返回的 Promise 解析為所選絕對路徑，操作者取消時解析為 `null`。

### 何時選擇

為 macOS、Windows 或桌面 Linux 上的工作站本地操作者選擇此后端。當客戶端無法觸達 OS 選擇器時——遠程瀏覽器、SSH 轉發會話或無人值守宿主——請選擇[瀏覽后端](../directory-picker-browse/README.zh.md)。具體情況不固定時，[自適應選擇器](../directory-picker-auto/README.zh.md)會在啟動時判定。

### 操作者會看到什么

每次調用在宿主屏幕上打開一個原生選擇器并等待操作者；中止調用方的信號會終止選擇器進程，而不是讓它留在屏幕上。Linux 上選擇器需要安裝 Zenity 或 KDialog 之一；兩者都沒有時，`pick` 以包含解決建議的錯誤拒絕，而不會回退為手輸路徑提示。本包的瀏覽器端向工作區流程注冊一個無渲染的流程占用者——每次 `open` 請求驅動 `directoryPicker/pick`，并上報唯一結果（所選路徑、取消或失敗）。

### 可觀察的失敗

取消返回 `null`，不是錯誤。平臺工具缺失、選擇器啟動失敗或選擇操作中止都會導致 Promise 拒絕，界面可呈現相應錯誤；[瀏覽后端](../directory-picker-browse/README.zh.md)仍是原生目錄選擇不可靠時的組合層回退方案。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

### 設計理念

后端是平臺選擇器之上的一層薄服務：`NativeDirectoryPicker` 注冊 `native` 能力，其 `pick` 轉發給 `pickNativeDirectory`，選擇器以子進程運行，因此宿主進程不會因對話框而阻塞。命令邊界（`DirectoryPickerRunner`）與平臺事實可注入；共享的免 shell 子進程運行器位于 [`dsh-native-command`](../../util/native-command/README.zh.md)。

### 平臺機制

平臺工具不經 shell 調用：macOS 使用 `osascript`，Linux 使用 Zenity 并以 KDialog 回退；調用方的中止信號會終止原生進程。Windows 在 spawn 的子進程中打開現代 `IFileOpenDialog`——由 koffi 在子進程主線程上驅動的 COM 會話，采用宿主接受的最佳線程 DPI 感知（優先 per-monitor-v2），中止時向對話框線程投遞 `WM_CLOSE`。在 `Show` 之前，子進程立即通過 `keybd_event` 合成一次 Alt 按鍵，讓對話框即使由后臺宿主進程 spawn 也能激活為前臺窗口。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：持有穩定 `native` 能力的 `NativeDirectoryPicker` 服務 |
| [`src/native-picker.ts`](src/native-picker.ts) | 選擇器分發：平臺選擇、子進程運行、中止接線 |
| [`src/win32-dialog.ts`](src/win32-dialog.ts) 及同族文件 | Windows 經 koffi 的子進程 `IFileOpenDialog`、DPI 處理、`WM_CLOSE` 中止 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當后端約定不夠用時閱讀以下內容：先看 seam 定義，再看替代后端與在兩者之間選擇的那個選擇器。

- [目錄選擇 seam](../directory-picker/README.zh.md)——`native` 能力約定與類型化錯誤詞匯。
- [目錄選擇能力 seam 決策](../../../.agents/notes/archived/architecture/2026-07-28-directory-picker-capability-seam.md)——后端為何在交互形態上彼此不同。
- [瀏覽后端](../directory-picker-browse/README.zh.md)——面向遠程客戶端的應用內替代方案。
- [自適應選擇器](../directory-picker-auto/README.zh.md)——native 與 browse 之間的啟動時判定。
- [免 shell 子進程運行器](../../util/native-command/README.zh.md)——選擇器運行所依賴的共享子進程原語。

-----

<a id="model-experience"></a>
## 模型體驗

無。GUI 宿主的目錄選擇后端不注冊任何面向模型的內容。

#### KV Cache 影響

無；該包既不組裝也不發送提供方請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明原生交互何時不可用或不穩定。它們是當前包約束，不是任務積壓。

- **Linux 依賴桌面工具**——Zenity 與 KDialog 均未安裝時，`pick` 以包含解決建議的錯誤拒絕；它不會回退為手輸路徑提示（組合層面的回退是瀏覽后端）。
- **Windows 沒有機制級回退**——通過打包依賴 koffi 運行的子進程選擇器是唯一原生層級，因此 COM 拒絕或對話框崩潰會直接上報失敗；組合層面的回退仍是瀏覽后端。
- **Windows 前臺授權依賴注入的輸入**——子進程在 `Show` 之前合成一次 Alt 按鍵，對話框才能從后臺宿主取得前臺；在合成輸入被抑制的環境（安全桌面、受限遠程會話、提權前臺窗口）中，對話框仍可能在其他窗口后面打開。該技術僅在 Windows 11 上驗證過。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。每次選擇都是一次無狀態的子進程往返；選擇器的結果僅為返回的路徑。
