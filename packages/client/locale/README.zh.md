---
description: "面向用戶與插件作者的 web GUI 本地化說明：zh/en 偏好、瀏覽器派生回退、類型化命名空間字典與框架翻譯席位。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-locale

[English](README.md) | 中文

## 概述

使用 `dsh-client-locale` 可在 web GUI 中切換內置的英文和中文 locale，或 client 插件添加的語言。用戶選擇會立即生效；loopback 頁面把選擇持久化到 `$DSH_HOME/settings.yaml`，非 loopback 頁面則只為當前進程保留選擇。全新瀏覽器會使用瀏覽器請求的第一個受支持語言，直到允許讀取的已存儲偏好到達。插件作者可添加類型化命名空間字典，并通過公開 locale API 翻譯；經 slot 渲染的文案無需重新加載即可隨語言切換更新。

## 目錄

- [使用本包](#use-this-package)
- [理解實現](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與暫緩事項](#known-limitations-and-deferred-work)
- [開發備注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

只要 web GUI 需要語言切換或翻譯文案就使用它：已發布的設置行覆蓋用戶側，插件作者則注冊自己的字典。掛載無需任何配置——本包隨客戶端樹一起激活。

### 選擇語言

打開“設置 → 常規”并選擇一種已注冊語言。生效中的 locale 會立即應用：UI 文案切換、`<html lang>` 指向外部 id 或內置語言的文檔標簽，選擇寫入持久設置分區。沒有顯式 Host 偏好的瀏覽器會按完整標簽、再按主語言子標簽選擇 `navigator` 請求的第一個已注冊語言，無法匹配時回退到英文。已存儲的外部 locale 會等待其定義注冊，不會在不可用時生效。

### 注冊字典

用已合并進 `LocaleNamespaceMap` 的命名空間調用 `ctx.locale.register(ns, { zh, en })`；編譯器會對照該命名空間的類型化鍵并集檢查每個鍵，并要求兩個內置 locale 齊全。消費方通過 `ctx.locale.bind(ns)` 或框架注入的 `t` 席位翻譯。UI 已掛載后再注冊的字典無需重新掛載即可生效。

### 注冊語言包

外部 client 插件把語言定義和每個已翻譯命名空間注冊為自身擁有的 effect；定義與字典可以按任意順序注冊：

```js
export const inject = ['locale']

export function apply(ctx) {
  ctx.effect(
    () => ctx.locale.addLanguage({ id: 'ja', label: '日本語', fallback: 'en' }),
    'my-locale: language',
  )
  ctx.effect(
    () => ctx.locale.register('common', 'ja', {
      cancel: 'キャンセル',
      close: '閉じる',
    }),
    'my-locale: common dictionary',
  )
}
```

外部 id 必須是非空的 ASCII BCP 47 風格標簽。它的 fallback 必須已經注冊，且整條鏈必須終止于 `en`；未知目標、重復 id 與循環會在注冊時失敗。查找時先在請求命名空間內遍歷生效語言的 fallback 鏈，再在 `common` 中遍歷該鏈，最后顯示鍵本身。卸載語言定義會將其從選擇器移除，并讓生效中的選擇回落到可用的瀏覽器語言或默認語言。

### Host 半側做什么

Host 通過 settings 服務為 loopback 頁面持久化偏好。Client 會刻意拒絕非 loopback 頁面使用該 settings scope，因此即使 Connection 認證所有 API 方法，它們的 locale 選擇仍只存在于進程內。

-----

<a id="understand-the-implementation"></a>
## 理解實現

<details>
<summary>實現細節——點擊展開</summary>

本節解釋 locale 服務的構建方式；可觀察行為已在[使用本包](#use-this-package)中說明。

### 設計理念

一個 `LocaleRuntime` 同時擁有偏好與字典注冊表，并且自身就是 slot 系統的 `LocaleFace`：`getSnapshot`／`subscribe` 通過 `ctx.slots.installLocale` 支撐框架注入的 `t` 席位。不可變快照攜帶生效中的 locale、可選擇的 locale 列表與單調 revision；字典注冊與 locale 切換都會推進 revision，但只有切換會發出 `locale/change` 事件。產品編寫的 Client UI 文本必須來自這些帶類型的字典，或來自已經本地化的 primitive prop；`verify-client-ui-i18n` 強制執行該源碼歸屬（見[決策](../../../.agents/notes/implemented/architecture/2026-08-23-locale-owned-client-ui-copy.zh.md)）。

### 偏好解析

臨時 locale 來自瀏覽器（`navigator.languages` 先按完整標簽、再按主語言子標簽匹配，以英文作為回退），在允許使用的 Host-backed settings scope 送達其存儲偏好之前生效。Host 讀取在插件激活后運行，因此 settings scope 不可用或被拒絕都不會阻塞頁面，結果會實時替換臨時值。已存儲的外部 locale 會等待其定義注冊。`setLocale` 是唯一寫入入口；即使 id 已與生效中的 locale 匹配也會持久化，因為生效中的值可能是臨時的，必須能供共享同一 home 的其他瀏覽器繼續使用。

### 字典查找

帶類型的對象形式要求兩個內置 locale 都有完整字典；逐 locale 形式允許語言包獨立注冊每個命名空間。逐鍵查找會先在請求命名空間中沿生效語言聲明的 fallback 鏈查找，再在 `common` 中重復該鏈，最后顯示鍵本身。綁定的翻譯函數按命名空間保持穩定身份，因此可通過 inject 機制傳遞，且不會破壞 memoization。

### 源碼地圖

| 文件 | 職責 |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | `LocaleRuntime`、字典注冊表、Language 行注冊、`locale/change` 事件 |
| [`src/index.ts`](src/index.ts) | node 半側：注冊 `locale` 設置命名空間 |
| [`src/locale-settings.ts`](src/locale-settings.ts) | `locale.preference` 的持久 schema |
| [`src/locales/`](src/locales/) | 內置的 `zh`／`en` 字典 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當僅閱讀 locale 約定不足以解答問題時，請繼續閱讀以下頁面，了解它實現的 slot 接口、依托的設置機制，以及偏好背后的持久化決策。

- [客戶端 slot 系統](../ui-slots/README.zh.md)——本包實現的 slot 模型與 `LocaleFace` 席位。
- [Host 支撐偏好決策](../../../.agents/notes/implemented/bug-fix/2026-08-06-host-backed-web-preferences.zh.md)——偏好為何持久化在 Host 設置中而非瀏覽器里。
- [設置組地圖](../../settings/README.zh.md)——存儲該偏好的設置服務。
- [客戶端組地圖](../README.zh.md)——本包所屬的瀏覽器半側。

-----

<a id="model-experience"></a>
## 模型體驗

無。locale 服務屬于瀏覽器側 UI 插件層，不注冊任何面向模型的內容。

#### KV Cache 影響

無；該包既不組裝也不發送提供方請求。

## 已知限制與暫緩事項

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本地化在哪些地方不完整，或在注冊時被凍結。它們是當前包約束，不是待辦事項清單。

- **注冊表持有的文本只讀取一次翻譯**——在 slot 渲染路徑之外于注冊時捕獲的文案（例如 command 注冊表中的 `/model` 命令描述）在重新注冊前保持注冊時的語言；slot 渲染的文案隨切換實時更新。
- **語言包負責語言特有行為**——注冊表提供選擇、持久化、瀏覽器匹配、逐鍵回退和 `<html lang>`；它不增加復數規則或雙向布局。

<a id="dev-note"></a>
### 開發備注

<details>
<summary>維護者的工作上下文——點擊展開</summary>

無。

</details>

**運行時不變式：** 不發布伴生入口。locale catalog 與字典沒有可供交叉核對的獨立運行時來源；注冊釋放、偏好解析和 fallback 查找由行為測試覆蓋。
