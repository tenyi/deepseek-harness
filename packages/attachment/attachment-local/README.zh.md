---
description: "DSH_HOME 下附加圖片的本地存儲，供用戶與維護者選擇或排查圖片附件的存放位置。"
kind: "package-reference"
---

# @deepseek-ai/dsh-attachment-local

[English](README.md) | 中文

## 概述

在運行 DSH 的機器上，把圖片與通用文件附件持久存儲到 `DSH_HOME` 下。圖片經過校驗、針對模型請求完成規范化并按路由緩存；通用文件不設準入限制，按字節原樣保存。即使上傳時使用不同顯示名稱，相同字節也只存儲一次；讀取會校驗文件長度與內容，之后收緊限制也不會讓已接納的圖片不可讀。隨附的 `dsh` 組合無需配置即可使用本包。對象僅限本機，并且永遠不會自動刪除。

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

在默認組合中，把圖片或通用文件附加到提示詞或命令，它們會自動保存到本機。自行組合時，掛載這個插件即可獲得持久附件。

### 最小配置

掛載插件，無需任何必填配置。下列默認值規定了可以附加的內容；生成的配置目錄完整列出了所有字段。

```yaml
- name: '@deepseek-ai/dsh-attachment-local'
```

| 字段 | 默認值 | 含義 |
|---|---|---|
| `dshHome` | 自動解析 | 顯式 harness home；省略時依次跟隨 `$DSH_HOME` 與 `~/.dsh` |
| `maxImageBytes` | `20 MiB` | 單張圖片接受的最大編碼源字節數 |
| `maxImagesPerMessage` | `20` | 單條提交消息接受的最大圖片數量 |
| `maxMessageImageBytes` | `200 MiB` | 單條提交消息接受的最大編碼源圖字節總數 |
| `maxImagePixels` | `64,000,000` | 源圖寬度與高度乘積的最大值 |
| `maxImageDimension` | `8192` | 源圖接受的最大寬度或高度 |
| `normalizedImageMaxPixels` | `2048 × 2048` | 已存規范化圖片的總像素預算 |
| `normalizedImageMaxDimension` | `8192` | 應用總像素預算后的最大長邊 |
| `normalizedImageMaxBytes` | `4 MiB` | 編碼字節目標；沒有候選滿足時保留質量階梯中的最小輸出 |
| `imageCompressionConcurrency` | `2` | 并發規范化與請求變換的 FIFO 上限 |

生成的[配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-attachment-local)完整列出了所有受支持的字段及其 JSDoc。

### 圖片存儲在哪里、會保留多久

附加的圖片保存在本機的 `<DSH_HOME>/attachments/v1` 下。已存儲的圖片永遠不會被自動刪除，相同圖片只會存儲一份，之后收緊限制也絕不會讓已保存的圖片不可讀。如果你的圖片需要能從另一臺機器讀取，本包并不合適。

### 附加圖片時會發生什么

附加圖片后，會先檢查源圖限制、媒體類型、尺寸與像素，再完成規范化并保存。系統應用 EXIF 方向、移除元數據與色彩配置、保留透明度，并按總像素預算與長邊上限縮小光柵。帶 alpha 的圖片使用 WebP，不透明圖片使用 JPEG，共享 85/75/60 質量階梯；全部候選都超過字節目標時保留最小輸出。被接受的圖片會重新出現在歷史和后續輪次中，重啟后也不例外；所選模型路由會收到緩存的請求版本，并在其文件系統可映射宿主對象時收到只讀執行世界路徑。

### 可能出什么問題

附加圖片時可能被拒絕：格式不受支持、超出字節、像素或單邊尺寸限制，或者字節與聲明類型不符。之后讀取時，磁盤上被刪除或損壞的圖片會以明確錯誤失敗。每個失敗都帶有穩定錯誤碼，客戶端與協議適配器可以用自己的措辭解釋。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋存儲背后的持久性與校驗設計，以及實現它的寫入與讀取路徑；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計決策

- **持久性靠 fsync 鏈，而非存在性。** 當目錄項從未到達存儲時，僅同步文件無法在崩潰后存活，因此寫入路徑會在引用可能到達會話檢查點前，把每個祖先條目同步到進程已驗證的邊界。
- **一次規范化，按路由投影。** 準入持久保存一份提供方無關的規范化附件；請求投影派生確定性變體而不改寫持久歷史。
- **惰性 alpha 路由編碼。** 帶 alpha 的圖片使用 WebP，不透明圖片使用 JPEG；質量候選按 85/75/60 順序運行，沒有候選滿足編碼字節目標時保留最小輸出。
- **限制是寫入時策略。** 字節、總像素與單邊尺寸限制只約束準入，因此之后收緊它們絕不會讓已接納的歷史不可讀。

### 寫入與讀取路徑

對象存放在 `<DSH_HOME>/attachments/v1/objects/<sha256-prefix>/<sha256>`；相同字節會去重為同一個對象和同一個 `sha256:` 標識符。首次寫入前，進程會把 home 的每個祖先目錄逐級同步到文件系統根目錄，因此絕不會把另一個進程已創建但尚未同步的目錄誤認為安全邊界。隨后，寫入過程把字節暫存到 `v1/tmp`、同步臨時文件、以原子且排他的硬鏈接發布，并同步發布目錄——在 Windows 上，文件系統元數據日志負責目錄項持久性。保存操作完成后，返回的引用已具備持久性。

準入允許每條消息最多 20 張圖片與 200 MiB 源字節；單個源圖最多 20 MiB、6400 萬像素與單邊 8192 像素。系統應用方向、移除元數據與色彩配置，并把規范化結果限制在 2048×2048 總像素預算、8192 像素長邊和 4 MiB 編碼字節目標內，因此，即使寬高比極端，圖片也會保留短邊分辨率。已經滿足限制的干凈、單幀、8-bit sRGB/sRGBA PNG、JPEG 或 WebP 會逐字節直通；GIF、動畫、元數據、方向、16-bit PNG 與不兼容色彩空間會觸發轉換。

請求版本位于由 `dshCachePath` 解析的 `<DSH_HOME>/cache/attachments/request-images/`；顯式 `dshHome` 設置同時適用于緩存與持久存儲。在兩次請求之間清空此緩存會保留持久附件，后續讀取會重新生成請求版本。`readImageRequest` 在不放大的前提下縮放到路由像素預算，再通過相同的 alpha 路由與質量階梯應用獨立編碼字節目標。緩存身份包含附件 id、變換版本、預算與固定編碼參數；緩存字節會先通過文件頭探測格式、8-bit sRGB/sRGBA、尺寸與 alpha 信息，不匹配時重新生成。并發調用方共享一次變換與緩存寫入，且只在沒有等待方時由取消停止共享工作。`imageHostPath` 派生規范化對象的宿主路徑，掛載的文件系統可以把該路徑映射進執行世界，而不會寫入持久歷史。

通用文件字節的唯一規范對象位于 `<DSH_HOME>/attachments/v1/file-objects/<digest-prefix>/<digest>`。每條引用路徑 `<DSH_HOME>/attachments/v1/files/<digest-prefix>/<digest>/<name>` 都是只讀硬鏈接，所以名稱不同但字節相同的文件不會重復占用磁盤。`readFileStream` 以有界分塊讀取引用路徑，并在消費方成功結束前校驗完整摘要與記錄的字節數。對象缺失、被改寫或截斷時，消費方會失敗，不會得到字節已經變化的完整導出。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`LocalAttachmentStore`、`Config` schema、默認值 |
| [`src/store.ts`](src/store.ts) | 內容尋址寫入與校驗讀取：暫存、硬鏈接發布、fsync 鏈、摘要校驗 |
| [`src/file-store.ts`](src/file-store.ts) | 原樣文件的流式寫入、校驗式流式讀取與安全存儲文件名 |
| [`src/normalization.ts`](src/normalization.ts) + [`src/encoding.ts`](src/encoding.ts) | 提供方無關的規范化與有界格式／質量候選 |
| [`src/request-image.ts`](src/request-image.ts) | 路由專用請求變換、緩存身份與 singleflight |
| [`src/image.ts`](src/image.ts) | 完整光柵解碼與元數據校驗 |
| — | 不發布運行時不變式伴生入口；不可變寫入與校驗讀取在后端邊界直接強制。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

完整的服務約定與載荷類型請看子系統參考；這份存儲所支撐的能力請看 seam 包。

- [附件子系統參考](../../../docs/subsystems/attachment.zh.md)——服務約定、載荷類型與 `ctx.attachments` 的 Cordis 接口面。
- [附件 seam 包](../attachment/README.zh.md)——本存儲支撐的圖片附件能力。
- [生成配置目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-attachment-local)——每個受支持配置字段及其源聲明。
- [Home 路徑解析](../../util/home-paths/README.zh.md)——`DSH_HOME` 如何從顯式配置、環境變量與用戶主目錄解析。

-----

<a id="model-experience"></a>
## 模型體驗

本包通過請求描述符間接影響模型。執行文件系統可以映射宿主對象時，模型會隨請求字節看到每張圖片的身份、尺寸、媒體類型、只讀進程路徑、可寫副本擴展名與規范化警告。通用文件會投影為指出文件身份與只讀進程路徑的文本句柄；無法映射時，句柄會說明當前執行環境不能讀取該文件。

#### KV Cache 影響

規范化和請求投影都是確定性的。附件和路由策略不變時，之后各輪會復用相同的緩存請求字節；執行世界路徑映射可以改變描述符文本，而不會改變這些字節或其 `variantId`。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制描述了這份存儲能做什么、不能做什么；它們是當前包約束。

- **圖片會永久保留**——已存儲的圖片永遠不會被自動刪除，也沒有任何機制回收未被引用的對象。
- **僅限本機**——圖片存放在運行 harness 的機器上；其他主機無法讀取。
- **動態 GIF 變為靜態**——規范化只保留第一幀；動畫不屬于第一版圖片約定。
- **編碼器輸出帶版本**——已安裝的 Sharp/libvips 構建會固定規范化結果與請求字節；編碼器或變換版本升級會讓未來變體產生新地址，已有對象繼續有效。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

本開發備注是維護者的工作上下文：尚未決定的探索方向與開放問題。它明確不具權威性——已交付的行為與限制以上文和包代碼為準。

#### 未來：保留與遠程存儲

保留與垃圾回收被推遲，因為恢復和 fork 后的會話可能共享不可變對象；服務于遠程運行時或共享存儲的后端則需要自己的持久性證明。兩個方向都尚未決定；本地存儲當前在 `DSH_HOME` 下保留所有對象。

</details>
