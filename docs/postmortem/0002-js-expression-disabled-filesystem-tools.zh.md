# 事故復盤（postmortem） 0002：文件系統快照工具被永久禁用

[English](0002-js-expression-disabled-filesystem-tools.md) | 中文

狀態：已解決

## 摘要

ACP（Agent Client Protocol）示例試圖通過 `disabled: !!js ...` 有條件地啟用文件系統插件，但 Cordis 僅在插件 `config` 內部對 JavaScript 表達式求值。原始的表達式對象為 truthy，因此文件系統棧始終處于禁用狀態。快照刷新隨后將 `UNKNOWN_TOOL` 結果接受為新的預期輸出。修復方案改用顯式的文件系統 overlay，并增加了靜態配置守衛和快照結果守衛。

## 概述

默認的 ACP 組合有意只啟用 bash，因為其沙箱無法約束進程內的文件系統提供方。文件系統快照場景仍然需要 `read`、`write` 和 `edit`，因此這些插件被放在默認的 `cordis.yml` 中，并附帶一個 `disabled` 表達式，意圖僅在全權限啟動和快照模式下啟用它們。

Cordis Include 將每個 `!!js` 標量解析為一個表達式對象。Loader 遞歸地對插件的 `config` 進行插值，但直接讀取 `disabled` 等配置項元數據。因此每個文件系統配置項看到的都是一個 truthy 對象，在所有模式下均保持禁用。

## 影響

七個文件系統場景和一個混合工作區編輯場景調用了注冊表中不存在的工具。其結構化會話日志攜帶 `ToolNotFoundError`（code 為 `UNKNOWN_TOOL`），stdout 渲染出通用的失敗工具卡片。快照套件通過了，因為結構化會話日志和 stdout 渲染出的通用失敗工具卡片均與刷新后的 fixture（測試前置數據）匹配；它證明的是回歸的確定性回放，而非文件系統行為的正確性。

實際運行的受限默認模式并未獲得意外的文件系統訪問權限。草率地直接修復插值反而會帶來這一風險：權限預設在運行時更新 bash 沙箱和審批狀態，但無法掛載、卸載或約束文件系統棧。

## 時間線

- PR（Pull Request） #261 整合了 ACP 組合并刷新了文件系統快照，同時引入了條件式文件系統配置項。
- 所有單元測試、覆蓋率、快照、文檔、構建和 hygiene 檢查均通過。
- 對刷新后的文件系統預期輸出的評審發現了通用的失敗卡片和結構化的 `UNKNOWN_TOOL` 結果。
- 一次真實的 Loader 啟動確認：每個 `disabled` 值仍為表達式對象，每個文件系統 fiber 均未創建。

## 根因

實現時假設 `!!js` 適用于整個 Loader 配置項。實際只有 `entry.options.config` 使用它：`Entry._resolveConfig()` 對該字段進行插值，而 `Entry.disabled` 直接測試 `entry.options.disabled`，不經過插值。YAML 標簽在語法上合法，因此加載過程不產生任何診斷信息。

快照框架將任何確定性的 transcript（文本記錄）視為有效行為。Header pin 驗證了組合后的工具 schema，但文件系統場景共享來自默認組合的 pin，因此未獨立證明其所需工具已注冊。刷新在任何語義斷言拒絕缺失工具之前，就已重寫了預期的 stdout 和會話日志。

## 已添加的防護措施

- 文件系統場景啟動 `fs.cordis.yml`：一個顯式的固定全權限 overlay，配有對應的回放配置和獨立的 request-header 類。
- [`AGENTS.md`](../../AGENTS.md) 與 [Cordis 入門](../cordis-primer.zh.md#loader-configuration)明確說明 `!!js` 在插件 `config` 與配置項 `disabled` 內有效；其他配置項元數據保持字面量，因此條件式組合使用 overlay。
- `verify-cordis-config` 解析倉庫中的 Cordis YAML，拒絕 Loader 配置項元數據中的表達式節點（包括 include patch 和插入的配置項）。
- `dsh-session-snapshot` 在全新運行和已提交的會話 fixture 中拒絕結構化的 `UNKNOWN_TOOL` 結果，防止其被提交為預期輸出。

## 教訓

- 語法上被接受的配置值不一定在該位置被求值；應記錄并驗證具體對哪些字段進行插值。
- 快照刷新是 fixture 的生產過程，不是正確性審查。諸如已注冊工具缺失這類語義上不可能的結果，需要獨立于預期輸出的斷言。
- 權限控制只應描述其實際管轄的能力。組合時的文件系統訪問無法安全地跟隨運行時的 bash-only 預設。
