---
description: "瀏覽器安全的 Workspace 路徑輔助函數：拼接相對路徑、縮寫 POSIX 主目錄并生成顯示標題。"
kind: "package-library"
---

# dsh-util-workspace-path

[English](README.md) | 中文

## 概述

供 Workspace 相關客戶端和控制器包共享、可在瀏覽器使用的路徑輔助函數。該包負責拼接 Workspace 相對路徑、縮寫用于展示的 POSIX 主目錄、從 POSIX 或 Windows 路徑提取 Workspace 標題、把路徑拆成目錄部分與末段供展示，并擁有在 Sidebar 與資源模型之間命名工作區文件的 `dsh-resource://file/…` 地址語法。`relativizeToCwd` 在顯示時省略工作區前綴，并保留該目錄以外的路徑。它不提供 Cordis service，也不持有運行時狀態。

## 目錄

- [文件地址](#file-addresses)
- [已知限制與暫緩事項](#known-limitations-and-deferred-work)
- [開發備注](#dev-note)

-----

<a id="file-addresses"></a>
## 文件地址

資源地址 = `dsh-resource://<type>/…`，type（URI 的 host）即資源協議鍵（`file`，或插件在 `ResourceProtocolMap` 中聲明的鍵）；其他 scheme 屬導航協議，另行定義。`dsh-resource://file/session/<sessionId>/<path>` 指定授權 Host 讀取的 Session，以及工作區相對或絕對路徑。前導斜杠保留在路徑中：`/etc/hosts` 對應 `dsh-resource://file/session/s//etc/hosts`，Windows 盤符對應 `dsh-resource://file/session/s/C:/x/y.txt`，UNC 對應 `dsh-resource://file/session/s///server/share/y.txt`。Host 解析路徑并執行訪問檢查。`absolute/<path>` 形式仍可解析，但不攜帶授權 Session，因此 file 提供方不能讀取，Preview 也不認領；兩者均不借用當前或 Tab Session。語法住在 [`src/file-address.ts`](src/file-address.ts)；路徑輔助函數留在 [`src/index.ts`](src/index.ts) 并再導出它。

`sessionFileAddress(sessionId, path)` 將 `\` 歸一為 `/`，去掉前導 `./`，但保留前導 `/` 字符。id 和每個路徑段都做組件編碼，`:` 保持字面。`fileAddressFor(sessionId, cwd, path)` 始終構造 Session 地址：`cwd` 內的路徑轉為相對路徑；其他絕對路徑（包括 `cwd` 未知時）仍作為該 Session 地址內的絕對路徑。`absoluteFileAddress(absolutePath)` 只構造不帶 Session 的形式。`parseFileAddress(address)` 檢查精確的文件地址前綴、忽略查詢與片段后綴、逐段解碼，并為 Session 地址返回 `{ scope, sessionId, path }`，為不帶 Session 的形式返回 `{ scope, path }`。其他 type 或 scheme、未知作用域、缺 id 或路徑，或錯誤轉義都返回 `undefined`。

-----

## 已知限制與暫緩事項

<a id="known-limitations-and-deferred-work"></a>

- **路徑解析僅處理字面值**——它識別 POSIX 絕對路徑、Windows 盤符路徑和 UNC 路徑，拼接相對路徑時保留 Workspace 路徑的分隔符，但不訪問文件系統，也不規范化 `.` 與 `..` 路徑段。
- **主目錄縮寫僅支持 POSIX**——Windows 路徑保持不變，因為可移植瀏覽器無法安全推斷 Windows 主目錄路徑等價關系。


<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。這個工具不持有可變運行時關系。
