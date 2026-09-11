---
description: "面向實現或排查 Windows ACL 沙箱與普通子進程 Job runner 的維護者，說明底層 Win32 進程原語。"
kind: "package-library"
---

# @deepseek-ai/dsh-win32-process

[English](README.md) | 中文

## 概述

供 Windows ACL 沙箱與普通子進程 Job runner 消費的底層 Win32 進程庫。它唯一擁有倉庫中可復用 process、stdio 與 Job Object 操作的 Koffi 綁定表；它不是 Cordis 服務，也不決定沙箱策略或公共 child 行為。維護任一原生進程路徑或檢查句柄生命周期限制時，請閱讀本頁。

## 目錄

- [行為](#behavior)
- [頭文件驗證](#header-verification)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備注](#dev-note)

-----

<a id="behavior"></a>
## 行為

- **唯一可復用 ABI owner** — `abi.ts` 擁有兩條 process 路徑消費的 Win32 常量與 x64 布局值。`ffi.ts` 懶加載 `kernel32.dll` 與 `advapi32.dll`，核驗 `STARTUPINFOW` 和 `PROCESS_INFORMATION`，提供帶類型的操作與錯誤格式化，并讓沙箱策略通過同一組已加載庫綁定剩余 API。
- **restricted-token 創建** — `RestrictedProcessSpawnOptions` 要求沙箱的 primary token，并使用 `CreateProcessAsUserW`。pipe 與 inherited-stdio 路徑共用命令行引號處理、cwd、restricted-token null 環境策略、返回值檢查與句柄清理。
- **管道進程原語** — `spawnPipedProcess()` 創建匿名 stdin/stdout/stderr 管道，立即關閉 stdin，并返回兩個讀取端；調用方負責等待進程與排空管道。任一局部失敗都會關閉該操作已經擁有的句柄，并在各自 Win32 生命周期結束后釋放每個 Koffi 輸出槽與結構體分配。
- **繼承 stdio 的 Job 原語** — `spawnInheritedJobProcess()` 創建一個 kill-on-close Job，臨時把當前 stdio 句柄設為可繼承，以 suspended 狀態創建 restricted child，把它分配給 Job，再恢復初始線程。目標代碼不會在 Job 分配前運行；受控的分配或恢復失敗會終止 suspended child，或在釋放全部已擁有句柄前關閉已分配的 Job。
- **ordinary Job runner 原語** — `CurrentTokenProcessSpawnOptions` 要求已解析的 `applicationName`、完整 target 環境，以及三個專用于 target stdin、stdout 與 stderr 的 runner CRT 描述符。`spawnCurrentTokenJobProcess()` 通過 Node 導出的 `uv_get_osfhandle()` 把這些描述符映射為 OS 句柄，拒絕無效結果，臨時把句柄設為可繼承，并通過 `STARTF_USESTDHANDLES` 傳入。它使用 `CREATE_UNICODE_ENVIRONMENT` 傳入排序后的 UTF-16LE 環境塊，再以 suspended 狀態通過 `CreateProcessW` 創建 target、把它分配給 unnamed kill-on-close Job，并只在分配后恢復。原始命令行 argv 項保持不變，runner 也可以關閉自己的 carrier 描述符，而不觸碰 Node 自身的標準流。
- **ordinary 結算操作** — `pollProcessExit()` 單獨發布 direct exit，`isJobEmpty()` 則讀取 `QueryInformationJobObject(JobObjectBasicAccountingInformation)`，直到 `ActiveProcesses` 歸零。帶檢查的 Job 終止與句柄關閉使 runner 保持唯一 native owner。
- **顯式結算歸屬** — `waitForProcessExit()` 等待并關閉沙箱 process 句柄；ordinary runner 的 process polling、Job accounting 與 checked Job termination/closure 是獨立操作。`drainPipe()` 在排空期間復用一個 native count slot，釋放該分配并關閉管道讀取句柄。每個調用方擁有自己的 result 組合與返回句柄。

Windows ACL 沙箱在這些原語上增加 SID、DACL、grant、workspace 與公共 child 策略。

<a id="header-verification"></a>
## 頭文件驗證

process、stdio 與 Job 的常量以及選定結構體的大小和偏移由 [`verify/abi-probe.cpp`](verify/abi-probe.cpp) 對照 MinGW Windows 頭文件檢查：

```sh
g++ -std=c++20 -municode -O2 -o abi-probe.exe verify/abi-probe.cpp && ./abi-probe.exe
```

Koffi 的 `STARTUPINFOW` 與 `PROCESS_INFORMATION` 定義還會在模塊加載時斷言各自的 64 位大小。該探針還固定指針與句柄寬度、Unicode 環境標志，以及用于判斷完全停穩的基礎 Job accounting record 大小與 `ActiveProcesses` 偏移；其余已記錄偏移和常量也由該探針提供證據。

<a id="model-experience"></a>
## 模型體驗

### 進程原語

#### 模型看到什么

沒有直接內容。本包向沙箱與 ordinary runner 提供 `Win32ProcessBindings`、`CurrentTokenProcessBindings` 與進程原語；兩者擁有全部模型可見工具、輸出與診斷，本包不貢獻提示詞或工具 schema。

#### Token 影響

沒有直接影響。消費方決定進程輸出是否進入工具結果或后續模型請求。

#### KV Cache 影響

本包不貢獻穩定請求前綴，因此不會使模型 KV Cache 失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **僅在 Windows 原生加載** — 導入通用類型可跨平臺進行，但解析綁定表會加載 Windows DLL，并在其他宿主失敗。跨平臺測試注入綁定表，不加載原生 API。
- **沒有公共進程服務** — 本包刻意不把原語包裝成 Cordis 或 Node 流。消費方必須擁有自己的策略、異步調度、輸出上限、取消與最終句柄關閉。
- **restricted-token null 環境** — `CreateProcessAsUserW` 沙箱原語傳入 null 環境塊，并先通過 `SetEnvironmentVariableW` 建立改動，因為經 Koffi 傳入顯式環境塊會以 `ERROR_INVALID_PARAMETER` 失敗。ordinary `CreateProcessW` runner 則要求完整 target 環境，并傳入排序、雙 NUL 結尾的 UTF-16LE 塊，其中包括 `=X:` 驅動器條目，而不修改自身環境。
- **沒有 standalone process API** — 本包只暴露當前沙箱與 ordinary-runner 消費方所需的操作，不擁有 Node 流、公共句柄、輸出策略、取消或 durable state。
- **創建到分配之間的中斷** — 目標以 suspended 狀態啟動，不能在 Job 分配前執行，但 runner 若在進程創建到分配之間的極窄區間被外力終止，可能留下 suspended target。本包不聲明原子 Job 附加保證。
- **header 證據限定架構** — 已提交的 ABI probe 與布局常量覆蓋倉庫當前 64 位 Windows 目標。支持新的指針寬度或不兼容 Windows ABI 前，必須先更新 probe。


<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。操作只持有調用內的原生句柄。
