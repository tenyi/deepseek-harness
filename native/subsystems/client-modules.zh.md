# Client 模塊

[English](client-modules.md) | 中文

Web 插件表：[dsh-client-modules](../../packages/client/modules) 中 client 模塊系統的 Node 半，以 `ctx.clientModules`（`ClientModuleRegistry`）形式提供。它掃描宿主 Loader 的 entry，找出聲明了 `dsh.client` 的包，組合出 `window.__DSH_BOOT__` entry 圖，在 `/plugins` 下提供帶版本的單資源或多資源 combo 腳本，并以啟動協議行回應每次 index 注入收集——這是同一個服務的四個面。它是 Web GUI 棧的一項可選能力，不屬于 agent loop（智能體循環）主干，并且是 [dsh-host-webserver](../../packages/host/webserver) 的消費方：[web-server.md](web-server.zh.md) 所述的載體提供本服務注冊的前綴路由與其回應的 `webserver/index-inject` 事件。同一個包的瀏覽器半（`ctx.modules`，即拉取并物化這些 bundle 的 lazy CJS 模塊表）屬于內核機件，記錄在[包 README](../../packages/client/modules/README.zh.md)中，不在本頁。

源碼：[`packages/client/modules/src/client/manifest.ts`](../../packages/client/modules/src/client/manifest.ts)

## wire

圖是 Node 半與瀏覽器半之間協議層的唯一真源。宿主從掃描到的包組合出 `WebBootEntry` 行與 `WebBootBatch` 描述，隨后在 Vite entry 之前向結構化 index 注入表貢獻 registration facade、application preload、bootstrap 腳本與圖全局量。`global` 行渲染為 `globalThis["__DSH_BOOT__"]`，其中 `<` 已轉義，插件可控的字符串因此無法逃出 script 元素。沒有有效 manifest 的頁面無法啟動：瀏覽器解析器會拒絕畸形 row 或批次、未知成員，以及未恰好歸屬一個初始 combo 描述的 entry。

```ts type-equiv
/**
 * One composed client entry pushed by the host (a graph row). Wire
 * single source: the host node half (package root) produces this same shape.
 * `immediately` marks stage-one prefetch. `inject` names package rows whose
 * factories must arrive before this row materializes, while Cordis separately
 * uses the same package edges to compose entries. `external` carries exact
 * non-inject module requests (see {@link WebBootGraph.entries}).
 */
interface WebBootEntry {
  /** Entry name == package name. */
  id: string
  /** Revisioned single-resource combo endpoint used by HMR. */
  url: string
  /** Opaque plugin-artifact revision used for HMR cache busting. */
  rev: string
  /** Package-name dependency edges used for factory arrival and plugin composition. */
  inject?: string[]
  /** Stage-one prefetch mark: load the script for factory registration during module-face boot. */
  immediately?: boolean
  /** Non-baseline module specifiers this row requests; omitted when it requests none. */
  external?: string[]
}
```

```ts type-equiv
/** Initial scheduling phase for one content-addressed combo script. */
type WebBootBatchPhase = 'bootstrap' | 'application'
```

```ts type-equiv
/** One initial combo script; a scheduling phase may span several descriptors. */
interface WebBootBatch {
  /** Parser-blocking bootstrap or preloaded application scheduling. */
  phase: WebBootBatchPhase
  /** Content-addressed combo script endpoint. */
  url: string
  /** Revision over the combined plugin script bytes and indexed source map. */
  rev: string
  /** Graph entry ids whose factories the script registers, in execution order. */
  entries: string[]
}
```

```ts type-equiv
/** The composed client entry graph the host injects as `window.__DSH_BOOT__`. */
interface WebBootGraph {
  /** Consistency anchor over the whole graph (content + bundle hashes). */
  rev: string
  /**
   * Composed entries in module-graph order — a dynamic package row precedes
   * rows whose `external` requests that package. Cordis activation order is
   * unrelated and remains owned by fiber service waiting.
   */
  entries: WebBootEntry[]
  /** Initial combo descriptors; every entry belongs to exactly one descriptor. */
  batches: WebBootBatch[]
}
```

每個初始 row 的 `rev` 都是不透明的進程 nonce 加序號，因此組合圖時不會哈希每個插件產物。HMR 觀察到變化后，該 row 的 revision 才改為新 bundle 及其可用 sourcemap 的哈希。初始描述把 row 劃入 bootstrap 與 application 兩個調度階段，每個階段都可以包含多條描述。URL 只含有序 package 資源列表與 revision，階段名不會進入路由。圖組合保持 row 順序，并在 map 形式 URL 超過 3 KiB 前貪心切分。啟動 combo revision 對合并后的插件腳本字節與 indexed sourcemap 求哈希，圖 revision 則對 row 與描述一并求哈希。`immediately` 標記第一階段的 registration barrier；同一 combo 中的 row 共享腳本傳輸，不同 combo 則獨立加載。

## 掃描

包加入這張表的方式，是在自己的 package.json 中聲明 `dsh.client`（`platform: 'web'`、可選的 `inject` 邊、可選的 `immediately`），并在 `exports["./client"]` 導出構建好的 bundle。每個 live row 都從自己的 Loader specifier 與所屬 tree `baseUrl` 解析；若 `loader.internal.resolveSync` 可用，則使用 Host face import 所用的同一個實現。最近歸屬的 package manifest 提供瀏覽器模塊 id，因此相對 source 與 built overlay 仍保留包身份。若不同的 active Loader source 解析到同一包名，組合會失敗；一個來源卸載后，仍存活的來源無需重啟 fiber 即可提供該 row。

掃描是單包增量的；不存在全量重掃代碼路徑。fiber 構造或 dispose（資源釋放）時的每次 cordis `internal/plugin` 發射都把該 fiber 的 entry 名標臟，一次微任務 flush 把每個臟名與實時 loader entry 對賬。激活趟以全部當前 entry 灌入同一個臟集合并同步 flush，因此初掃與穩態共享一條實現——但失敗姿態相反。激活時，已加載 entry 中的畸形聲明或缺失 bundle 會聚合為一個大聲的 `AggregateError`，列出每個損壞的包：該 fiber 進入 FAILED，由啟動的大聲失敗 sweep 上報。穩態下，損壞的包只記錄一條警告，且不得殃及其他包。

包元數據——包括「非 client 包」這一否定結論——按 Loader specifier 與所屬 tree base URL 緩存至重啟。同一來源的 fiber 重啟會原樣復用其 row 與 rev；bundle 內容變更只經 `rebuilt()` 到達圖。

## bundle 路由與 index 注入

`GET`／`HEAD /plugins/??<package-a>/client.js,<package-b>/client.js&rev=<rev>` 提供精確生成的 combo 腳本；單資源請求采用同一形式，也是 HMR 路徑。其絕對 `sourceMappingURL` 平行改寫每個資源后綴，得到 `/plugins/??<package-a>/client.js.map,<package-b>/client.js.map&rev=<rev>`。即使只有一個資源，map 仍采用 Indexed Source Map v3。組件有自帶 map 時直接用于對應 section；沒有時則獲得 identity section，其 `sourcesContent` 是構建后 bundle，source 名取打包后的 `sourceURL` 或插件路由。每條啟動請求 URL 按 UTF-8 字節計算都不超過 3 KiB；切分按更長的 map 形式計算。所有 application URL 都會預加載，所有 bootstrap URL 都會在圖全局量與 Vite entry 之前執行。所有已發布響應都使用長期 immutable 緩存。未知或被修改的資源列表、缺少 revision 及陳舊 revision 都返回 404，絕不提供其他字節，也不會讓 SPA fallback 把 HTML 當作 JavaScript 返回；其他方法返回 405。注入行在每次 index 渲染時攜帶當前圖，因此重新加載總是基于實時組合啟動。

## 服務

```ts type-equiv
/** Filesystem baseline captured before a client artifact snapshot is read. */
interface ClientArtifactBaseline {
  /** Absolute path of the client bundle. */
  readonly path: string
  /** Bundle modification time in milliseconds. */
  readonly mtimeMs: number
  /** Bundle size in bytes. */
  readonly size: number
}
```

`ClientModuleRegistry`（`ctx.clientModules`，定義于 [`packages/client/modules/src/index.ts`](../../packages/client/modules/src/index.ts)）暴露讀取面與重建面；簽名見生成的[服務目錄](#ctxclientmodules--clientmoduleregistry)。`graph()` 返回當前組合出的圖（兩次變更之間是同一個穩定對象），`clientPath(id)` 返回 bundle 的絕對路徑，`artifactBaseline(id)` 返回讀取當前快照前捕獲的 bundle stat 值。`rebuilt(id)` 是變化后的 bundle 內容到達圖的唯一入口：它把 bundle 與當前 source map 一起重新哈希，只有 rev 真正變化才會重新組合圖并發出通知。`onRebuilt` 按發生變化的 bundle 逐個觸發并攜帶新 rev；`onGraphChanged` 在任何一次重新組合了圖的 flush 之后觸發（行的增刪，或 rebuilt 帶來的 rev 變化），并采用拉取模型——監聽器自行重讀 `graph()`。兩條通知路徑都會兜住監聽器異常，因此一個拋錯的訂閱者既不能讓后續訂閱者被跳過，也不能殺死觸發這次 flush 的一方。

開發環境下，[dsh-client-hmr](../../packages/client/hmr/README.zh.md) 是注冊表的監視驅動：它的 Node 半從 module host 讀文件前記錄的基線出發，對圖中每一行的 bundle 做 stat 輪詢，只為變化或標臟的 row 調用 `rebuilt(id)`，經 `onGraphChanged` 重新同步監視集合，并通過 SSE（Server-Sent Events）把 rev 變化廣播給瀏覽器半。僅 source map 變化不會觸發重載；bundle 變化時，當前 map 會一起進入快照。生產環境的圖完全不含 HMR（熱模塊替換）行；module host 自身從不監視文件。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxclientmodules--clientmoduleregistry"></a>

### `ctx.clientModules` — `ClientModuleRegistry`

The web plugin table service: incremental `dsh.client` scan + wire composition + bundle route + index injection rows. Construction runs the activation scan synchronously — a malformed declaration or missing bundle among the already-loaded entries aggregates into one loud throw (FAILED fiber; the boot activation audit reports it).

```ts cordis-catalog
/**
 * Current composed entry graph (stable object between changes).
 * @returns the graph served as `window.__DSH_BOOT__`.
 */
graph(): WebBootGraph

/**
 * Absolute path of an entry's client bundle.
 * @param id - entry id (package name).
 * @returns the path, or undefined for an unknown id.
 */
clientPath(id: string): string | undefined

/**
 * Serve an advertised revisioned bundle or source map without a Web server.
 * Unknown URLs return 404, unsupported methods return 405, and `HEAD`
 * returns the same immutable headers without a body.
 * @param request - shell-carrier request for a `/plugins` resource.
 * @returns the exact response also exposed by the optional Web route.
 */
fetchBundle(request: Request): Response

/**
 * Filesystem baseline captured before an entry's current bytes were read.
 * HMR compares it with the live files when installing a watch, so a write
 * between startup composition and watch installation cannot disappear into
 * the watcher's initial state.
 * @param id - entry id (package name).
 * @returns the path and baseline, or undefined for an unknown id.
 */
artifactBaseline(id: string): ClientArtifactBaseline | undefined

/**
 * Re-hash one bundle (the HMR watch's registration hook — the only entry
 * point through which bundle content changes reach the graph).
 * @param id - entry id (package name).
 * @returns the new rev, or undefined for an unknown id.
 */
rebuilt(id: string): string | undefined

/**
 * Subscribe to bundle rebuilds; fires only when the re-hash changed the rev.
 * @param listener - receives the entry id and its new bundle rev.
 * @returns the unsubscriber.
 */
onRebuilt(listener: (id: string, rev: string) => void): () => void

/**
 * Fires after any flush that recomposed the graph (row added/removed, or a
 * rebuilt rev change). Pull model: listeners re-read {@link graph}.
 * @param listener - notified with no payload.
 * @returns the unsubscriber.
 */
onGraphChanged(listener: () => void): () => void
```

Source: [`packages/client/modules/src/index.ts`](../../packages/client/modules/src/index.ts)
<!-- END GENERATED cordis-surface -->
