---
description: "原子文件替換與跨進程寫鎖，供絕不允許在磁盤上留下不完整、被符號鏈接劫持或權限過寬內容的包使用。"
kind: "package-library"
---

# @deepseek-ai/dsh-atomic-write

[English](README.md) | 中文

## 概述

使用 `dsh-atomic-write` 替換文件時，不會暴露部分內容，也不會跟隨臨時路徑上的符號鏈接。它的寫鎖會跨進程串行化讀-修改-寫入循環，因此并發寫入方不會用陳舊狀態相互覆蓋。每次替換都會在全新 inode 上使用調用方選擇的權限位，從而安全地收窄現有文件的權限。這個零依賴庫只接受字符串；它不提供 `cordis.yml` 插件，也不保證崩潰持久性，因為它不調用 `fsync`。

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

當文件型存儲必須替換一份已渲染好的字符串、且絕不允許暴露部分寫入、符號鏈接劫持或權限過寬狀態時，使用 `writeFileAtomic`；當多個進程對同一文件執行讀-修改-寫入循環時，使用 `withFileLock`。最小路徑是一次調用，傳入最終內容與替換 inode 的權限位。

### 原子寫入文件

```ts
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'

declare const text: string
await writeFileAtomic('/home/u/.dsh/settings.yaml', text, { mode: 0o600 })
```

父目錄會按需創建，讀取方只會觀察到舊內容或完整的新內容。在 Windows 上，報告為 `EACCES`、`EBUSY` 或 `EPERM` 的瞬時替換干擾會在有界時間內重試；任何剩余失敗都會移除臨時文件，并保持目標文件不變。

### 協調寫入方

對于單靠原子提交無法保證安全的讀-渲染-提交循環，請在操作期間持有寫鎖：

```text
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'

declare const render: (previous: string) => string
declare const readCurrent: () => Promise<string>

await withFileLock('/home/u/.dsh/settings.yaml', async () => {
  const previous = await readCurrent()
  await writeFileAtomic('/home/u/.dsh/settings.yaml', render(previous), { mode: 0o600 })
})
```

只有寫入方會競爭——讀取方從不取鎖——競爭者按指數退避，超時后報錯，而不是無限阻塞。競爭者等待多久由每次調用經 `waitMs` 聲明：默認值只按純文件工作量級選定，因此持鎖方循環若包含一次網絡往返——例如刷新過期 token 的憑據變更——就應聲明更長的值，否則該文件的其他寫入方在這段時間內都會失敗。退避節奏保持固定。競爭者絕不移除已有鎖，因為文件存續時間無法證明其持有者已經停止。

### 需要規劃的失敗

鎖的父目錄必須已經存在，因此 `withFileLock` 會在運行操作之前拒絕無效的父目錄層級。持鎖進程退出時會把鎖文件留在原地；后續寫入方超時失敗，操作者只有在確認沒有寫入方仍持有該鎖后才會移除它。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本包遵循一項職責分離：原子提交負責交換，寫鎖負責跨進程排序。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | `writeFileAtomic` 與 `withFileLock`，即本包的全部接口 |
| — | 不發布運行時不變式伴生入口；這個純文件系統原語不維護事件流或可變運行時數據；其替換約定由單元測試覆蓋。 |

### 寫入路徑

`writeFileAtomic` 先以獨占創建（`wx`）打開一個隨機后綴的同級文件并寫入內容，然后 rename 到目標上。獨占打開拒絕跟隨預先埋在可猜測臨時路徑上的符號鏈接；同目錄兄弟文件保證 rename 落在同一文件系統上；rename 替換的是目標位置的符號鏈接本身，絕不寫穿到該鏈接指向的文件。Windows 重試會保留同一份完整的兄弟文件，并采用有界指數退避，因此協作式寫鎖之外的軟件瞬時占用目標時，不會讓安全替換立即失敗；已歸檔的[重試決策記錄](../../../.agents/notes/archived/bug-fix/2026-08-29-windows-atomic-replace-retry.md)記錄了最初的理由與被拒絕的替代方案。

`withFileLock` 以 `wx` 創建 `<filename>.lock` 同級文件。`EEXIST` 直接表示競爭；只有一次新的 `lstat` 確認鎖路徑存在時，`EPERM` 才表示競爭，從而兼容 Windows 的獨占創建行為，又不掩蓋無關的權限故障。鎖記錄創建者的 PID，由持有者在 `finally` 中移除；競爭按指數退避，在每次調用聲明的 `waitMs` 期限（默認兩秒）過后失敗。

### 交換為何安全

- **全新 inode，調用方聲明的權限位**——臨時文件帶著 `mode` 走完 rename，因此收窄權限過寬的文件沒有 chmod 競態。`mode` 為必填，讓權限決策始終可見于每個調用點。
- **讀取方從不競爭**——rename 提交是原子的，讀取方無需加鎖。
- **競爭者絕不移除鎖**——文件存續時間無法區分已崩潰的所有者與暫停但仍存活的寫入方；恢復是操作者的動作。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當你需要了解使用本原語的存儲或它所屬的工具家族時，閱讀以下頁面。

- [用戶設置文件存儲](../../settings/settings-file/README.zh.md)——每次寫入都通過本包替換的設置文檔。
- [憑據存儲](../../credentials/credentials-local/README.zh.md)——本包加鎖并替換的憑據文件。
- [util 組映射](../README.zh.md)——本包所屬的零依賴工具家族。

-----

<a id="model-experience"></a>
## 模型體驗

無：本包是純文件系統寫入原語，不注冊任何面向模型的內容。

#### KV Cache 影響

此處沒有任何內容進入請求前綴，因此提供方緩存復用不受影響。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本包何時不是合適的工具。它們是當前包約束，不是任務積壓。

- **原子但不保證持久**——不對文件或其所在目錄做 `fsync`，因此崩潰后可能觀察到 rename 被回退。此處的文件型存儲在啟動時重新讀取并重新發布，把持久性留作調用方的策略。
- **僅支持字符串內容**——在有消費方需要之前，不提供 `Buffer` 或流式形態。
- **遺留鎖需要操作者恢復**——持鎖進程退出時可能留下同級鎖文件；后續寫入方超時也不會刪除它。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

一種對文件及其父目錄執行 `fsync`、并在 Windows 上保留僅屬主權限的持久性替換方案仍未實現（在源碼中記錄為 `settings-atomic-durability`）。

</details>
