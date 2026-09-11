# 實操手冊：添加 LLM（大語言模型）適配器

[English](adding-an-llm-adapter.md) | 中文

如何接入一個新的模型提供方。參考實現：`packages/llm/llm-deepseek`（直接 HTTP，SSE（Server-Sent Events）由 `eventsource-parser` 分幀）與 `packages/llm/llm-pi-ai`（封裝 LLM 庫）。請先閱讀 `packages/llm/llm/src/types.ts` 中的 `StreamChunk` 文檔——它記錄了兩個適配器都經過驗證的協議約定。

## 基本形態

```ts ignore-check
class MyAdapter extends LlmAdapter {
  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> { … }
}

export const name = 'llm-myprovider'
export const inject = ['llm']
export const Config: z<Config> = z.object({ apiKey: z.string(), … })

export function apply(ctx: Context, config: Config) {
  ctx.llm.registerAdapter(['my-provider'], new MyAdapter(…))
}
```

注冊基于副作用，可安全支持 HMR（熱模塊替換）；每個提供方路由僅對應一個適配器，重復注冊會拋出異常，多路由注冊要么全部成功，要么全部失敗。`options.provider` 用于選擇適配器，`options.model` 是提供方模型 ID，因此動態模型目錄適配器無需重新配置生命周期即可提供新模型。密鑰采用 Cordis 原生方式管理：schemastery Config 帶環境變量回退，通過 cordis.yml 的 `!!js process.env.MY_KEY` 注入。切勿在代碼中讀取自行約定的密鑰文件。

## 協議義務（兩個實現共同驗證的約定）

- 在 `finish` **之前**發出 `usage`；`finish` 之后**不再發出任何內容**。穩健做法：緩沖 finish/usage 直到提供方的流結束標記，再統一 flush（可處理提供方在末尾發送僅含 usage 的分片的情況）。
- 工具調用的 `arguments` 全程為原始 JSON 字符串；流式片段以 `argumentsDelta` 發送。如果你的提供方返回已解析的對象，請在 `block-end` 時重新 stringify。
- 按首次出現的流順序分配塊 `index`；同一個塊的每次 delta 復用該 index。
- 錯誤有且僅有兩條合法路徑：從 `stream()` **拋出**（傳輸與協議故障——使用帶穩定 code 的 `LlmError`），或以 `finish {kind: 'error' | 'aborted'}` 結束流（提供方帶內故障）。消費方兩者都處理；按故障類別選擇路徑并加以文檔化。
- 遵守 `options.signal`（將其傳遞給 fetch 或你的 SDK）。
- 如果 `GenerateOptions` 中某個字段你的提供方無法支持（例如提供方不支持 stop sequences 時收到 `stop` 列表）：拋出 `LlmError(..., 'UNSUPPORTED_OPTION')`，而非靜默丟棄。
- 如果提供方在后續調用中需要響應 ID、簽名或其他原生元數據，請將其最小無損 JSON 投影作為 `finish.replayState` 發出。重建歷史時驗證該狀態。只有歷史提供方路由和目標提供方路由當前由完全相同的適配器實例擁有時，`LlmRuntime` 才會傳遞該狀態；由適配器決定同模型、跨模型或跨提供方恢復是否合法。狀態缺失時，切勿僅根據提供方/模型名稱推斷原生回放。

提供方特有的思考模式開關仍放在適配器的 Config 中。確切模型元數據使用一處提供方無關的能力 seam：實現 `resolveModel()`，返回提供方/模型身份以及可選的 `context` 和 `reasoning` 字段；僅當存在配置指定的默認值時才聲明 `defaultEffort`；遵守解析模型時傳入的可選 `AbortSignal`。推理（reasoning）強度是由適配器映射到提供方請求的有序不透明 ID。請保留適配器給出的權威可選列表，包括適配器在支持時定義的 `off`；不得暴露最終協議值的具體拼寫，也不得自動調整不支持的值。ID 無需與其協議表示相同。

## 實現結構

讓協議格式（wire format）類型、請求序列化、傳輸解析、分片轉換和適配器類分別承擔獨立職責；[`llm-deepseek`](../../packages/llm/llm-deepseek/README.zh.md) 是參考布局。

## 驗證

遵循[倉庫測試策略](../testing.zh.md)，該策略負責適配器覆蓋、真實提供方檢查和已發布入口要求。
