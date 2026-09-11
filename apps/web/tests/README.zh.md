# apps/web 瀏覽器 e2e

[English](README.md) | 中文

這些測試在進程內啟動真實的 web 組合，并用真實 Chromium 通過真實 HTTP 驅動它。該 lane 的運行機制——模式、fixture（測試前置數據）、golden，以及與 `dsh web` 之間刻意保留的組合差異——記錄在 [`scaffold.ts`](scaffold.ts) 和 [瀏覽器 e2e Agent Note](../../../.agents/notes/implemented/testing/2026-07-24-web-gui-browser-e2e-lane.zh.md) 中。

## 完成狀態觀察

依賴狀態的用例使用 Workspace、接納、附件和模型流屏障，區分可見中間狀態與已完成操作。詳情關閉等待框架過渡結束；歸檔驗證為 seed Session 設置顯式標題，并跨重載跟蹤該身份。參見 [CI fixture 同步決策](../../../.agents/notes/implemented/testing/2026-09-08-ci-completion-observations.zh.md)。

## 這些是 Host 面的測試

它們在根 `tsconfig.host.json` 中做類型檢查，而不在 Client aggregate 中，因為它們直接讀取 Host 服務：`ctx.connection`、Host 側 `SessionStore` 與 `ctx.sessionProjectionCache`。運行時驅動瀏覽器并不使一個文件成為 Client 程序的一部分——兩個 face 在相同的鍵上以不同服務合并 Cordis `Context`，因此單個程序無法同時看見兩者。把這些文件挪進 Client aggregate 會讓每一處 Host 服務訪問都無法編譯。

## 不要在此 import `@deepseek-ai/dsh-client-*`

import 一個 Client 包——無論值還是類型——都會把它整個 TypeScript 工程、以及它引用的每個工程拉進 **Host 構建圖**。這已經坑過本 lane 一次：四個 Client 消費方包引用了 `api/remotes` 的 Client face，而該 face 必須等 Host tsdown 生成 `@deepseek-ai/dsh-goal/remote` 之后才能編譯，于是 Host 構建階段變成在等一個由它自己產出的產物。

當某個場景需要 Client 持有的常量或純函數時，改為在此處鏡像一份，并緊挨著一條注釋掉的 import 點明源模塊。這樣漂移會表現為選擇器未命中或鏡像值陳舊——是響亮的失敗，絕不會是靜默通過。`scaffold.ts` 按此規則鏡像 welcome-notice 的 namespace、確認字段、版本和被斷言的中文文案。

有一類 Client import 是長期成立的。`assembled-boot.ts` 驅動 shell 本身，因此它從 `@deepseek-ai/dsh-client-web` import `AppWebEntry`、從 `@deepseek-ai/dsh-client-modules/client` import boot manifest（元數據清單）類型：啟動真實 shell 正是該 harness 的用途，且這兩個包本來就在 Host 圖中。chat 場景則在 `support.ts` 中鏡像 `conversationContextKey`，而不 import 其 Client owner。

沒有任何機制強制這條規則；靠 review 守住它。
