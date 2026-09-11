# Terminology

本表約定本倉庫的中英術語統一譯法。

**通用規則：**
- "中文"列為中文譯文的正文默認用詞。若該列為英文，則中文譯文的正文中保留英文不翻譯。
- 首次出現按"首次出現"列書寫（帶括號注釋）；后續出現只寫括號前的部分（可能為中文，也可能為英文），不出現括號內的注釋。
- "不要譯作"列為嚴格禁止的譯法。
- 如果某術語已經作為另一個術語的組成部分被括注過（如 `agent loop（智能體循環）` 中已包含 `agent` 的括注），則該術語后續單獨出現時無需再次括注。

## 縮寫類（中英文文本中均使用縮寫）

| English | 中文 | 首次出現 | 不要譯作 | 備注 |
|---|---|---|---|---|
| ACP | ACP | ACP（Agent Client Protocol） | | |
| AI | AI | AI（人工智能） | | |
| API | API | | | |
| CI | CI | | | |
| CLI | CLI | CLI（命令行界面） | | |
| e2e | e2e | | | |
| HMR | HMR | HMR（熱模塊替換） | | |
| JSON Schema | JSON Schema | | | |
| JSONL | JSONL | | | |
| LLM | LLM | LLM（大語言模型） | | |
| MCP | MCP | | | |
| PR | PR | PR（Pull Request） | | |
| RAG | RAG | RAG（檢索增強生成） | | |
| SDK | SDK | | | 只指受支持的 Python 與 TypeScript SDK 所使用的 JSON-RPC 客戶端／服務器協議；DeepSeek Harness 項目本身不是 SDK |
| SSE | SSE | SSE（Server-Sent Events） | | |

## 英文類（中英文文本中均使用英文）

| English | 中文 | 首次出現 | 不要譯作 | 備注 |
|---|---|---|---|---|
| agent | agent | agent（智能體） | | |
| Agent Note | Agent Note | | 智能體注記、智能體筆記 | 倉庫定義的文檔類型，涵蓋提案、已實現決策和被否決提案；中文對側 H1 保持固定前綴 `# Agent Note: `，標題中不加術語括注 |
| agent harness | agent harness | agent harness（智能體框架） | | agent 組合詞（agent harness/workflow/loop/skill 等）整體保留英文；未括注過 agent 時首現按對應組合詞或 agent 行處理 |
| agent loop | agent loop | agent loop（智能體循環） | | |
| blob hash | blob hash | | | `git hash-object` 的結果 |
| coding agent | coding agent | coding agent（編程智能體） | | agent 組合詞，正文保留英文 |
| Cordis | Cordis | | | |
| dispose | dispose | dispose（資源釋放） | | |
| doc-sync | doc-sync | doc-sync（文檔同步門禁） | | |
| fiber | fiber | | | |
| fixture | fixture | fixture（測試前置數據） | | |
| fork | fork | | | |
| Function Calling | Function Calling | Function Calling（函數調用） | | |
| harness | harness | | | |
| harness engineering | harness engineering | | | |
| KV Cache | KV Cache | | | 專有技術名稱，保持大小寫與空格 |
| lint | lint | | | |
| mock | mock | | | 保留英文；指測試替身 |
| loader | loader | | | |
| manifest | manifest | manifest（元數據清單） | | |
| monorepo | monorepo | | | |
| Round | Round | | 回合、目標回合、Ralph 回合 | 外層策略使用 Round 時，領域層級為 Session > Round > Turn（輪次） > Step（步驟）；Round 是可選的外層策略迭代，并非每個會話輪次都具有的通用層級。Goal Round 與 Ralph Round 均保留英文。一個 Round 承載一個輪次，步驟隸屬于該輪次；明確的零步驟輪次仍保持原義。 |
| schema | schema | | | |
| schema DSL | schema DSL | | | |
| seam | seam | | 接縫 | 一個可替換能力的整體，包含 Service Definition / Service Provider / Consumer 三種角色；角色需要獨立演化時才拆包，也可由同一包承擔多個角色。以 `packages/shell` 為范例；Service Definition 是 Cordis `Service`（抽象類或具體 registry 服務），不是 TypeScript interface。任何單一角色、普通邊界或擴展點都不能稱為 seam。本倉庫正文保留英文；與 `extension point` 是不同概念 |
| Service Provider | Service Provider | | Service provider | 能力 seam 的命名角色；單數固定寫作 Service Provider，復數寫作 Service Providers。泛指提供服務的 provider 不適用本詞條 |
| skill | skill | skill（技能） | | |
| slot | slot | | 坑位、孔位 | 客戶端架構中的具名可注冊位置，保留英文 |
| spill | spill | | | 工具輸出超限落盤機制；組合詞寫 `spill 文件`、`spill 路徑` |
| spawn | spawn | | | |
| steering | steering | steering（中途引導） | | |
| job id | job id | | 任務 id | 保留英文 |
| subagent | subagent | | | |
| transcript | transcript | transcript（文本記錄） | | 指會話渲染給用戶或編輯器的完整文本，區別于事件日志 |
| Typert | Typert | | TypeRT、typeRT、Type RT | DeepSeek Harness 類型圖、生成器、loader 與運行時 registry 的產品拼寫 |
| waterfall | waterfall | waterfall（瀑布式事件） | | |
| wheel | wheel 包 | | | Python 打包格式 |
| worktree | worktree | | | git 工作區概念 |
| Zstandard | Zstandard | | | RFC 8878 compression format; `zstd` remains a code value. |

## 雙語類（中英文文本各自使用中英文）

| English | 中文 | 首次出現 | 不要譯作 | 備注 |
|---|---|---|---|---|
| adapter | 適配器 | | | |
| adapter contract | 適配器約定 | 適配器約定（adapter contract） | | |
| append-only | 僅追加 | | | |
| artifact | 產物 | | 制品 | |
| backend | 后端 | | | |
| binder | 綁定器 | | | 命名角色：把已聲明接口綁定到調用方 context 或生命周期 |
| config | 配置 | | | 命名角色：一個已解析配置值或邊界嚴格的配置記錄 |
| controller | 控制器 | | | 命名角色：接受意圖并改變一項既有領域或展示狀態 |
| directory | 目錄 | | | 命名角色：暴露供發現或選擇的條目及元數據 |
| engine | 引擎 | | | 命名角色：實現領域算法或有狀態執行模型 |
| gateway | 網關 | | | 命名角色：適配進程、網絡、RPC 或 API 邊界 |
| handle | 句柄 | | | 命名角色：引用并控制或觀察一個實時資源 |
| policy | 策略 | | | 命名角色：決定允許、選擇、限制或觀察什么 |
| presenter | 展示轉換器 | | | 命名角色：把領域值純轉換為渲染意圖 |
| resolver | 解析器 | | | 命名角色：根據輸入計算或定位一個答案 |
| store | 存儲 | | | 命名角色：擁有一組數據并主要提供數據操作 |
| background job | 后臺任務 | | | |
| block | 塊 | | | |
| build target | 構建目標 | | | |
| cancel | 取消 | | | |
| canary test | canary 測試 | | 金絲雀測試 | 本倉庫保留 `canary` |
| capability | 能力 | | | 必須與 `feature` → `功能` 區分 |
| capability seam | 能力 seam | | 功能 seam、能力接縫 | 本倉庫 Service Definition、Service Provider 與 Consumer 三種角色組成完整可替換能力的命名架構概念；普通 `seam` 仍按其詞條處理 |
| feature | 功能 | | 能力 | SDK 產品與工程模型中的可管理產品單元 |
| feature option | 功能選項 | | variant | 一項 SDK 功能內有限、可選擇的實現或配置 |
| checkpoint | 檢查點 | | | |
| chunk | 分片 | | | |
| compaction | 壓縮 | 壓縮（compaction） | | |
| companion tool | 配套工具 | | | |
| composition bundle | 組合包 | | | 只約束應用或插件的組合語境，不約束所有 `bundle` |
| Cordis plugin config | Cordis 插件配置 | | | Cordis 插件公開的 `Config` 對象或配置結構 |
| config key | 配置鍵 | | | Cordis 插件配置中的單個字段 |
| consumer | 消費方 | | 消費者 | |
| content block | 內容塊 | | | |
| Cookbook | 實操手冊 | | | 文檔標題用語 |
| context | 上下文 | | | |
| counterpart | 對側文件 | | 對應物、配對物 | 雙語配對語境；泛指"另一側"時可寫「另一側」 |
| configurable-provider directory | 可配置提供方目錄 | | | llm seam 中 `registerConfigurableProviders()` 維護的目錄；沿用 Service Catalog →「服務目錄」先例 |
| context compaction | 上下文壓縮 | 上下文壓縮（context compaction） | | |
| contract | 約定 | | | 如：`pairing contract` →`配對約定` |
| Cordis config entry | Cordis 配置項 | | | 指 `cordis.yml` 插件列表中的一項；插件實現本身寫`Cordis 插件` |
| Cordis plugin | Cordis 插件 | | | Cordis 加載的插件實現，不指 `cordis.yml` 中的一項配置 |
| crash recovery | 崩潰恢復 | | | |
| deploy root | 部署根目錄 | | | |
| dormant | 休眠 | | 睡眠、蟄伏 | 指已聲明可配置但當前未注冊路由的提供方 |
| durability | 持久性 | | | |
| feature requirement | 功能依賴 | | | 功能或功能選項通過 `requires` 聲明的關系 |
| event | 事件 | | | |
| event log | 事件日志 | | | |
| event stream | 事件流 | | | |
| event-sourced | 事件溯源 | | | 沿用 DDD 社區通行譯法 |
| Executive summary | 摘要 | | | 事故復盤標題用語 |
| executor | 執行器 | | | |
| expected output | 預期輸出 | | 金標 | 指 snapshot 比較產物；翻譯語料的人工校準樣例不在此列 |
| extension | 擴展 | | | |
| extension point | 擴展點 | | | 注意與 `seam` 區分 |
| fail-fast | 快速失敗 | | | |
| fenced code block | 圍欄代碼塊 | | | 沿用 MDN 中文翻譯 |
| fingerprint | 指紋 | | | 通用內容指紋；雙語配對機制使用 sidecar record 記錄兩側 blob hash |
| finish reason | 結束原因 | | | |
| fold | 折疊區 | | | 配置界面語境：默認收起的字段分區（collapsed →「收起」）|
| foreground run | 前臺運行 | | | |
| freshness | 新鮮度 | | | 沿用 MDN 中文翻譯；在本項目中指譯文相對源文的同步狀態 |
| hook | 鉤子 | | | |
| implementation | 實現 | | | |
| inference | 推理 | 推理（inference） | | 需要和 `reasoning` 區分時保留英文括注 |
| info string | 信息字符串 | | | 沿用 CommonMark 中文翻譯；指代碼圍欄 ``` 之后的語言標注 |
| injection | 注入 | | | |
| integration | 集成 | | | |
| interface | 接口 | | | |
| language switcher | 語言切換行 | | | i18n 配對機制用語：雙語配對文件頂部的互鏈行 |
| merge | 合并 | | | |
| message | 消息 | | | |
| mod | 模組 | | | |
| model provider | 模型提供方 | | | |
| model selection | 模型選擇 | | 模型目標 | 面向 Agent 的提供方、模型和可選推理強度選擇。 |
| module | 模塊 | | | |
| non-escalation | 非升權 | | 非升級、不可升級 | 僅用于安全與權限語境，指主體不得獲得超出既有授權的權限；普通升級不適用此行 |
| npm dependency | NPM 依賴 | | | `package.json` 中的包關系；`dependencies`、`devDependencies` 等字段保持原樣 |
| opt-out ratio | opt-out 比例 | | 退出檢查比例 | |
| orphan | 遺留 | | 孤兒、孤立 | 指英文源已不存在的 `.zh.md`（如「遺留譯文」）；進程語境按 OS 慣用語譯「孤兒進程」 |
| orphan branch | 孤立分支 | | 孤兒分支 | 沿用 git 官方中文翻譯 |
| package | 包 | | | 指 npm 包（`@deepseek-ai/dsh-*`）；`package.json` 等代碼標識保持原樣 |
| pairing | 配對 | | | |
| parent-subset grants | 父級子集授權 | | 父集合授權 | 指授權范圍僅限于父級所持授權的子集 |
| peer dependency | 對等依賴 | 對等依賴（peer dependency） | | |
| permission | 權限 | | | |
| persistence | 持久化 | | | |
| pipeline | 流水線 | | | |
| plugin | 插件 | | | |
| postmortem | 事故復盤 | 事故復盤（postmortem） | 事后分析、事故記錄 | 事故記錄與分析文檔；目錄或路徑中的 `postmortem` 保持代碼形式 |
| prompt | 提示詞 | | | |
| provider | 提供方 | | | |
| provider-neutral | 提供方無關 | | 提供方中立 | |
| quality gate | 質量門禁 | | | |
| quiescence | 完全停穩 | | 靜默、靜止狀態 | 指生命周期工作全部結算后的狀態 |
| reasoning | 推理 | 推理（reasoning） | | 需要和 `inference` 區分時保留英文括注 |
| reasoning_content | 思考內容 | | | |
| registry | 注冊表 | | | |
| replay | 回放 | | | |
| resume | 恢復 | | | |
| runtime | 運行時 | | | |
| same-world subprocess | 與宿主共享文件系統和內核的子進程 | | 同世界子進程 | |
| sandbox | 沙箱 | | | |
| service | 服務 | | | |
| serving interface | 對外服務接口 | | | |
| session | 會話 | | | |
| session event | 會話事件 | | | |
| setup card | 設置卡片 | | | 首次運行時代替行卡直接展開的配置卡 |
| sidecar file | 伴隨文件 | | | 指與文檔同目錄的普通伴隨文件 |
| sidecar record | 伴隨記錄 | | 旁掛記錄 | 指與文檔同目錄的伴隨記錄文件 |
| smoke test | 冒煙測試 | | | |
| snapshot | 快照 | | | |
| source of truth | 真源 | | 事實來源、唯一來源 | |
| spine | 主干 | | | |
| stale | 陳舊 | | 過期 | 與 `fresh`（`新鮮`）成對；門禁輸出中保留英文 `stale` 不翻譯；`expired` 才譯為`過期` |
| step | 步驟 | | | |
| stream | 流 | | | |
| structural signature | 結構簽名 | | | i18n 配對機制用語：門禁比對兩側文件時提取的有序結構序列（標題層級、代碼塊、列表等） |
| Summary | 概述 | | | 事故復盤標題用語 |
| system prompt | 系統提示詞 | | | |
| taxonomy | 分類體系 | | | |
| token usage | token 用量 | | | |
| tool | 工具 | | | |
| tool call | 工具調用 | | | |
| tool result | 工具結果 | | | |
| tool schema | 工具 schema | | | |
| toolkit | 工具包 | | | |
| turn | 輪次 | | | |
| VFS | VFS | 虛擬文件系統（VFS） | | |
| typecheck | 類型檢查 | | | |
| vocabulary | 詞匯 | | | |
| wire format | 協議格式 | 協議格式（wire format） | | |
| workflow | 工作流 | | | |
| wrapper | 包裝層 | | | 軟件層或 SDK 包裝層 |
| wrapper script | 包裝腳本 | | | 可執行腳本包裝層 |
