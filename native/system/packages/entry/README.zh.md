---
description: "預編譯 Landlock 啟動器與異步 POSIX flock 的 JavaScript 入口。"
kind: "package-library"
---
# @deepseek-ai/node-addon-system

[English](README.md) | 中文

`./landlock-run` 入口導出 Landlock 啟動器路徑、強制執行探測、授權參數和協議常量。獨立的 `./flock` 入口導出 `tryLockExclusive(fd): Promise<void>`；導入任一入口都不會加載 `system.node`。包不提供根導出。

鎖操作異步嘗試 `LOCK_EX | LOCK_NB`。在完成前保持調用方擁有的描述符打開；競爭以 `EAGAIN`/`EWOULDBLOCK` 拒絕，其他系統調用失敗也會拒絕，錯誤攜帶 code、值為正數的 errno 和 `syscall: 'flock'`。原生調用準備階段的錯誤也會拒絕同一個 promise。關閉指向該打開文件描述的最后一個描述符即釋放鎖。綁定不打開、復制、關閉或顯式解鎖描述符。

可選操作系統/CPU 平臺包攜帶二進制。Linux 包含 `bin/landlock-run` 和分別用于兩種 libc 的 `bin/glibc/system.node` / `bin/musl/system.node`；macOS 包含 `bin/system.node`。flock 綁定缺失或無法加載時，鎖獲取請求會被拒絕，不在安裝時編譯。Landlock 仍是遵循既有失敗關閉協議的獨立可執行文件；不支持的內核或平臺探測結果為不可用。

兩個 C 源文件隨包分發以供審計。參見工作區[架構](../../docs/architecture.md)、[支持矩陣](../../docs/support-matrix.md)和 [CLI 約定](../../docs/cli-contract.md)。
