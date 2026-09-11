---
description: "面向無密鑰示例冒煙測試的共享子進程與直接 agent（智能體） harness，供測試作者啟動真實 Loader 組合。"
kind: "package-library"
---

# @deepseek-ai/dsh-loader-smoke

[English](README.md) | 中文

## 概述

使用 `dsh-loader-smoke` 可從應用 fixture（測試前置數據）的真實可執行文件及其 `cordis.yml` 啟動應用，并在隔離的臨時目錄中捕獲輸出和完成清理。`runFixtureTurn` 通過已配置的根 agent 驅動一項任務，并返回最終 assistant 文本與 token 用量。測試可以選擇零構建的源碼執行或已構建包執行，使本地和 CI 冒煙測試分別采用對應環境預期的消費路徑。這個支持層庫面向測試作者，不用于產品集成。

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

本包以已安裝消費方的方式啟動應用 fixture，并讓測試觀察結果：選擇源模式或構建模式，從隔離 cwd 用其配置啟動可執行文件，然后要么等待干凈退出，要么讓一項任務通過根 agent。

### 啟動應用 fixture

`runLoaderSmoke` 接受可執行文件與配置路徑、可選的完整可執行文件參數、環境覆蓋、標準輸入、運行前準備與清理前檢查。它負責隔離工作目錄、DSH 主目錄、診斷、截止時間、終止、EOF 與清理；進程以零狀態退出后返回兩個流，失敗時則拒絕并附帶兩個流：

```text
const result = await runLoaderSmoke({
  label: 'acp-agent',
  tempDirPrefix: 'acp-smoke-',
  binScript: '/abs/path/to/src/bin.ts',
  configPath: '/abs/path/to/cordis.yml',
  tsconfigPath: '/abs/path/to/tsconfig.json',
})
```

當場景固定一個設計好的失敗面——即一次性輪次以錯誤結果結束——時設置 `expectedExitCode`；以任何其他方式退出（包括成功退出）都會使冒煙測試失敗。

### 測試交付 profile

Profile 集成 driver 使用僅限倉庫內部的 `tests/fixtures/production-profile.ts` helper。它通過 `loadProfile` 加載指定的已交付 profile 及其組合包 patch，協調處理 profile 的模塊回退，然后把組合包 patch 與測試 `*.patch.yml` 文件依次交給 `boot` 掛載的根 `cordis:include`。這些 patch 應只包含測試提供方或模型、隔離持久化路徑及被測對象專用變更。只需要 agent loop（智能體循環）而不測試 profile 集成的包級單元測試改為在本地掛載 `dsh-agent-loop-testkit`。

### 驅動 fixture 輪次

`runFixtureTurn(ctx, options)` 讓一項任務通過恰好一個已配置的根 agent：它等待任務進入持久收件箱，把規范事件轉發給你的觀察器，刷寫會話，并返回最終 assistant 文本與累計用量。示例本地的 driver 繼續負責配置、渲染與斷言。

### 源模式或構建模式

`resolveExampleLaunch` 選擇示例可執行文件從哪個產物啟動。`src` 模式在 tsx 下運行可執行文件并設置 `TSX_TSCONFIG_PATH`，使工作區導入通過 tsconfig `paths` 映射解析——這是零構建開發路徑。`lib` 模式在普通 Node 下運行構建后的 `lib/` 可執行文件，使裸包插件通過真實包 `exports` 解析，與已安裝消費方的解析方式完全一致。模式來自顯式值或 `DSH_EXAMPLE_MODE`（CI 設置 `lib`，開發時保持未設置）；其他任何值都會明確報錯。

### 可能出什么問題

- **進程永不退出**——冒煙測試強制執行截止時間，并在失敗信息中報告捕獲的流；會 spawn 自身進程樹的故障 fixture 可能比冒煙測試存活更久，需要外部清理。
- **構建模式需要事先構建**——選擇 `DSH_EXAMPLE_MODE=lib` 前先運行 `pnpm run build`；擁有該配置的包 manifest（元數據清單）還必須聲明配置中點名的每個包。
- **捕獲輸出受 execa 默認 100 MB `maxBuffer` 約束**——失控子進程在該上限處被終止，而不是在冒煙測試自選的預算處。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋 harness 的設計；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計

harness 建立在一個分離之上：冒煙測試在隔離世界中的子進程里運行，測試進程只觀察與斷言。`runLoaderSmoke` 創建臨時 cwd、在那里準備世界狀態、以隔離的 DSH 主目錄（臨時 cwd 下的 `DSH_HOME`、`DSH_AGENTS_HOME`）spawn 解析出的可執行文件、立即關閉 stdin，并在截止時間內等待干凈退出，然后在每種結果下都執行檢查與清理。`runFixtureTurn` 留在進程內運行：它查找組合中的唯一根 agent，從持久收件箱收到任務起持續跟蹤，直至整個 agent 完全停穩；隨后匯總每步用量，并在返回前刷寫會話。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 模式解析器、`runLoaderSmoke` 子進程 harness、選項與結果類型 |
| [`src/agent-turn.ts`](src/agent-turn.ts) | `runFixtureTurn` 直接 agent driver 與結果信封 |
| — | 不發布運行時不變量伴生入口；該測試支持包不負責維護生產事件流或可變數據；消費它的測試套件會檢驗該 harness。 |
| [`tests/fixtures/production-profile.ts`](tests/fixtures/production-profile.ts) | 僅限倉庫內部、供集成 fixture 使用的交付 profile 組裝 helper |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從 harness 逐步進入它啟動的組合以及它所服務的 fixture。

- [llm-replay](../llm-replay/README.zh.md)——冒煙測試組合為在沒有提供方密鑰的情況下運行而掛載的無密鑰模型 fixture。
- [Agent 包](../../core/agent/README.zh.md)——`runFixtureTurn` 驅動的根 agent。
- [測試策略](../../../docs/testing.zh.md)——無密鑰快照與冒煙層級。
- [test-support 組地圖](../README.zh.md)——兄弟 harness 與支持包。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為測試 harness 僅提交調用方測試的普通用戶任務，并將提示詞與工具組裝交由已加載的樹負責。

#### KV Cache 影響

除已加載樹本身的影響外，無其他影響；該 helper 既不更改請求前綴，也不跨運行保留狀態。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明何時需要對該 harness 特別小心。它們是當前包約束，不是任務積壓。

- **構建模式需要事先構建**——擁有該配置的包 manifest 還必須聲明配置中點名的每個包。
- **捕獲的 stdout 與 stderr 僅受 execa 默認 100 MB `maxBuffer` 約束**——失控子進程在該上限處被終止，而不是在冒煙測試自選的預算處。
- **超時只終止直接子進程**——有故障的 fixture spawn 的進程樹可能比冒煙測試存活更久，需要外部清理。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
