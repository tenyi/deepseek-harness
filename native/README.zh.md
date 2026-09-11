# native/

[English](README.md) | 中文

與 DeepSeek Harness 一同維護的原生源碼和公開包。[`system/` workspace](system/README.zh.md) 負責 Landlock 啟動器、POSIX flock 綁定、平臺包和[發布流程](system/docs/release.md)。

## Workspace 與發布邊界

`system/` 及其包屬于倉庫根 pnpm workspace，并共用根鎖文件。開發和 CI 中的 harness 消費方直接使用當前 workspace 的入口包，因此啟動器約定變更與消費方更新可以在同一個改動中落地并一起測試。

主倉庫的 `Node Addon System` 工作流為每個受支持架構構建并測試。`Node Addon System Release` 匯集這些原生產物，打包并驗證 npm tarball，隨后可選擇以同一個原生包版本發布。入口包繼續將平臺包聲明為 npm 可選依賴，因此 npm 仍然只會安裝與用戶操作系統和 CPU 匹配的包。
