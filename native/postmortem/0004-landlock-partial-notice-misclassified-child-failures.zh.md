# 事故復盤（postmortem） 0004：Landlock 部分強制執行通知導致子進程失敗被誤歸類

[English](0004-landlock-partial-notice-misclassified-child-failures.md) | 中文

Status: resolved

## 摘要

在 Landlock ABI 較舊的內核上，launcher 會在執行每個子進程前打印一條無害的部分強制執行通知。harness 把共享的 `landlock-run:` 前綴與任意非零子進程退出組合起來，判定為 launcher 失敗，因此 ripgrep 在沒有匹配項時以 1 退出等普通結果會呈現為 `SANDBOX_UNAVAILABLE`；當時仍由 bash 支撐的文件系統搜索還會用 `SEARCH_FAILED` 遮蔽這個結構化錯誤。過于寬泛的簽名規則，以及缺少較舊 ABI 下部分強制執行的組合測試覆蓋，讓該缺陷得以流入。runner 分類現在會先精確排除信息性行，再要求由退出狀態門控的致命證據，并由一個組裝后的無密鑰場景固定仍然存在的 bash 路徑。文件系統搜索通過 subprocess seam 運行打包的 ripgrep，不經過沙箱化 bash。

## 概述

原生 launcher 約定區分兩類 stderr 行。內核只能部分強制執行時，會精確打印 `landlock-run: partial enforcement (older Landlock ABI)`，然后繼續執行子進程。launcher 失敗則打印另一行 `landlock-run:` 診斷，在不執行子進程的情況下以 125 退出。

harness 用一個不區分大小寫的 `landlock-run: ` 子串表示這兩種情況。消費方只要發現非零退出同時攜帶該子串，就會歸類為 runner 失敗。因此，子進程的退出狀態被錯誤地關聯到 launcher 的信息性行：`false`、ripgrep 無匹配時的退出碼 1、無效 pattern 的退出碼 2，乃至由子進程自行選擇的退出碼 125，都可能在約束與執行均成功的情況下被錯誤歸因為沙箱故障。

事故發生時，文件系統搜索又造成第二處歸因錯誤。當時由 bash 支撐的 `runRipgrep()` 會捕獲 bash 執行器除中止外拋出的所有錯誤，并將其替換為關于 cwd 或 shell 啟動的通用 `SEARCH_FAILED`，其中也包括沙箱執行器產生的結構化 `SandboxUnavailableError`。

## 影響

在 Landlock ABI 只能部分強制執行的主機上，合法的非零子進程結果可能表現為沙箱基礎設施故障。`glob` 和 `grep` 尤其容易暴露該問題，因為 ripgrep 把退出碼 1 用作成功的空搜索。當文件系統搜索中確實發生沙箱故障時，調用方也會丟失其 `SANDBOX_UNAVAILABLE` 錯誤碼，轉而收到錯誤的啟動診斷。

該缺陷沒有削弱約束，也沒有讓命令在無約束狀態下運行。其安全影響在于可用性與診斷完整性：有效的受限結果會被拒絕或錯誤標記。

## 時間線

- 原生 launcher 約定規定：launcher 失敗使用退出碼 125，每次此類失敗都會打印一行致命的 `landlock-run:` 診斷；成功執行子進程時則打印精確的部分強制執行通知。
- 沙箱提供方把該約定簡化為 `runnerFailureSignatures: ['landlock-run: ']`；bash 消費方將此前綴與任意非零退出組合，并報告 stderr 的第一行。
- 單元測試覆蓋了無診斷的成功、拒絕診斷和致命 runner 前綴。真實 runner 測試在沒有可用內核時會自行跳過，也沒有強制構造「部分強制執行通知后跟非零子進程退出」的情況。
- 一個最小 POSIX 包裝腳本會打印該通知并 `exec` 其負載；它通過 `false` 與 ripgrep 無匹配場景復現了故障。
- 結構化規則、前臺與后臺共享的分類邏輯和組裝后的回放覆蓋共同彌補了仍然存在的沙箱歸因缺口。文件系統搜索通過 `ctx.subprocess` 運行打包的 ripgrep；本修復讓該路徑繼續位于沙箱化 bash 之外。

## 根因

公開的沙箱結果類型只能表達一組子字符串。它無法表示 Landlock 失敗必須使用退出碼 125、證據必須出現在一行致命診斷內，或同一前綴下有一行精確文本屬于信息性通知。消費方的布爾判定邏輯因此把來自不同進程且互不相關的事實組合在一起；即便致命證據位于后續行，它仍選用 stderr 的第一行作為詳細信息。

測試矩陣與這種表示方式一致。模擬提供方要么不輸出 runner 行，要么輸出含義明確的致命前綴，從不在由子進程控制的非零退出前輸出無害 runner 行。真實 Landlock 覆蓋依賴主機 ABI，因此使用完整 ABI 的主機無法覆蓋該通知。在事故發生時的搜索實現中，文件系統搜索測試模擬了原始 spawn 錯誤，卻沒有覆蓋真實沙箱化 bash 組合拋出的結構化錯誤。

stderr 仍是帶內歸因通道。受限子進程可以故意復現 runner 的門控致命診斷行與退出狀態，造成可用性或診斷誤歸因。更嚴格的多項證據合取可以避免本次事故中的意外沖突，但無法驗證寫入者身份；帶外狀態協議仍屬于獨立的加固工作，而非沙箱繞過修復。

## 已添加的防護措施

- [`RunnerFailureRule`](../subsystems/sandbox.zh.md#wrapped-argv-and-classification-dialects) 攜帶可選的允許退出碼、不區分大小寫的逐行致命簽名，以及按不區分大小寫的整行精確匹配排除的信息性行。
- [`dsh-sandbox-local`](../../packages/sandbox/sandbox-local/) 把 Landlock 映射為退出碼 125 加一行非通知的 `landlock-run:` 診斷，而 bwrap、Seatbelt 和自定義 runner 仍僅依據簽名。
- [`dsh-bash-sandbox`](../../packages/shell/bash-sandbox/) 直接 spawn 提供方 argv，因此啟動前遭拒時使用 spawn 錯誤通道，而非本地化的 shell 診斷。已結算的前臺與后臺執行共用一個返回證據的分類器；致命證據優先于拒絕，前臺錯誤會報告匹配到的致命行，同時保持捕獲的 stderr 不變。
- [`dsh-tool-fs-search`](../../packages/fs/tool-fs-search/) 通過 `ctx.subprocess` 運行打包的 ripgrep，并繼續位于沙箱化 bash seam 之外。
- 原生邊界回歸用例位于 [`partial-landlock.spec.ts`](../../packages/shell/bash-sandbox/tests/partial-landlock.spec.ts)，包括信息性通知、致命證據和前臺／后臺分類。
- 組裝后的產品路徑由 [`partial-landlock` 快照組合](../../snapshots/session/partial-landlock-child-failure/cordis.snapshot.yml)固定，獨立于文件系統搜索的實現選擇。

## 教訓

- 進程歸因需要多項獨立證據同時成立；共享前綴不是協議。
- 信息性診斷與致命診斷可以共享同一命名空間，因此排除規則必須精確且范圍狹窄，同時對未知的致命行保持失敗關閉。
- 適配器必須保留下層 seam 所擁有的結構化失敗，而不能用自身最接近的通用類別將其替換。
- 平臺相關行為需要在原生邊界放置確定性的模擬實現，并覆蓋一條組裝后的產品路徑；會自行跳過的真實內核測試無法獨自固定該回歸。
