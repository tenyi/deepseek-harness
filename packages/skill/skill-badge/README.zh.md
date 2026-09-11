---
description: "隨包附帶的「powered by dsh」徽章 skill（技能），供啟用、使用或排查該可選徽章提供方的用戶與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-skill-badge

[English](README.md) | 中文

## 概述

agent（智能體）可以通過該內置提供方加載官方「powered by dsh」徽章 skill，并遵循其指令，給文檔、PR（Pull Request）以及其他用 DeepSeek Harness 生成的內容添加署名徽章。該提供方沒有配置，隨附 CLI（命令行界面）組合以禁用狀態包含該插件，因此部署方需要顯式啟用。該 skill 同時提供 Markdown 片段和隨包分發的 PNG，供無法可靠導入遠程圖片的系統使用。

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

啟用插件即可讓 `dsh-badge` skill 出現在會話 skill 目錄中；隨后模型可以像加載任何其他 skill 一樣加載它，并遵循其指令添加「powered by dsh」徽章。

### 何時選擇

當用 DeepSeek Harness 生成的內容應攜帶官方署名徽章、且部署方希望該徽章 skill 對 agent 可用而無需存入本地 skill 目錄時，選擇此提供方。當徽章與部署無關時，請跳過——插件默認禁用，啟用前不增加任何東西。

### 啟用插件

該插件沒有配置。把它的組合行加入組合即可；隨附 CLI 組合以 `disabled: true` 攜帶該行，因此在那里需要顯式啟用。

```yaml
- name: '@deepseek-ai/dsh-skill-badge'
```

啟用后，`dsh-badge` 會出現在會話目錄的可用 skill 中。該 skill 覆蓋遠程 Markdown 徽章（基于 Shields.io）和隨包分發的 PNG 徽章資源，后者用于無法可靠獲取遠程圖片的目標環境。

### 徽章 skill 提供什么

- **Markdown 片段。** 在文檔、PR 與 merge request 中嵌入官方徽章標記的指令。
- **隨包分發的 PNG 資源。** `dsh-badge.png`（726×120 源圖，按 121×20 渲染），在無法導入遠程圖片的環境中可用。

### 可觀察的成功與失敗

啟用插件會使 `dsh-badge` 出現在目錄中并可憑名稱加載；禁用或省略該行則它不會出現在任何目錄中。由于提供方不可變，發現始終成功且恰好返回一個 skill，絕不會報告部分結果。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋內置提供方如何接線；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

該提供方是一個不可變、同步注冊的 skill 來源：它以 `dsh-badge` 作為提供方名稱、按內置 skill rank（600）注冊一個固定候選項，把隨包分發的 `assets/` 目錄作為該 skill 的目錄資源基底公開，并在每次加載時從隨包分發的 `assets/dsh-badge.md` 文件讀取 skill 正文。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口與不可變提供方：一個候選項、資源基底、正文加載 |
| — | 不發布運行時不變式伴生入口；本包只持有一個不可變的提供方注冊，注冊唯一性與生命周期檢查由 skill 注冊表負責。 |
| [`assets/`](assets/) | 隨包分發的 skill 正文（`dsh-badge.md`）與 PNG 資源（`dsh-badge.png`） |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時，請閱讀以下頁面。這些頁面先介紹該提供方注冊到的注冊表，再說明 skill 如何到達模型。

- [skill 子系統參考](../../../docs/subsystems/skills.zh.md)——該提供方實現的注冊表與提供方約定。
- [skill 包](../skill/README.zh.md)——該提供方注冊到的注冊表，以及已加載 skill 的共享渲染。
- [tool-skill 包](../tool-skill/README.zh.md)——徽章 skill 如何到達會話目錄與模型。

-----

<a id="model-experience"></a>
## 模型體驗

通過 `dsh-tool-skill` 間接影響模型；該包會把該提供方的目錄條目和所選 skill 的正文渲染給模型。

#### KV Cache 影響

該插件默認禁用，不會改變任何請求。啟用后，其目錄條目和任何已加載正文都會在各自插入點改變提供方的 KV 前綴。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明內置提供方不做什么。它們是當前包約束，不是任務積壓。

- **固定一個 skill，無運行時自定義**——提供方恰好貢獻 `dsh-badge` 這一個 skill；需要其他徽章變體的部署請自行編寫 skill。
- **遠程 Markdown 依賴 Shields.io**——遠程徽章標記內嵌 Shields.io 圖片；目標環境無法可靠獲取遠程圖片時，請使用隨包分發的 PNG。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>
