# 1. 編寫第一個插件

[English](01-first-plugin.md) | 中文

在本教程使用的 loader 配置中，Cordis 插件模塊通過命名導出提供 `apply` 函數。Cordis 加載模塊時，會用一個 **上下文** 調用 `apply`；該上下文就是 `ctx` 對象，插件通過它注冊自己貢獻的所有內容。

## 編寫插件

在 `tmp/cordis-tutorial` 目錄中（參見[環境設置](index.zh.md#setup)）創建 `hello.ts`：

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'hello'

export function apply(ctx: Context) {
  console.log('hello from my first plugin')
}
```

`name` 導出項是可選的顯示元數據；它用于在診斷信息中標識插件。

## 組合應用

本教程的啟動器通過配置組裝應用。創建 `cordis.yml`：

```yaml
- name: './hello.ts'
```

該文件是一組 Cordis 配置項的列表。`name` 是模塊指定符，可以是相對路徑或 NPM 包名；loader 會掛載每個配置項。各項會并發啟動，因此它們在列表中的位置不保證插件的加載先后；順序由服務依賴（`inject`，參見[第 3 章](03-services.zh.md)）決定，而非文件中的位置。

## 運行

```sh
node --import tsx ../../vendor/cordis/bin.js
```

預期輸出：

```
hello from my first plugin
```

當沒有任何內容繼續運行時，進程會自行退出。具體過程如下：

1. 啟動器創建根 `Context`，并掛載 **Loader** 插件。
2. Loader 讀取 `cordis.yml`，解析 `./hello.ts`，然后將其作為子插件掛載。
3. Cordis 調用你的 `apply(ctx)`。

你的文件中沒有框架啟動代碼：插件描述自己的貢獻，`cordis.yml` 則組合應用。例如，[`dsh` base](../../packages/bundle/base/cordis.patch.yml) 就是一份更長的插件組合，由部署 overlay 對它進行修補。

## 其他兩種插件形態

函數是最常見的形式，但 Cordis 接受三種形式：

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

// 1. Function plugin (what you just wrote).
export function apply(ctx: Context) {}

// 2. Object plugin: an object with an `apply` method.
export const objectPlugin = {
  name: 'object-plugin',
  apply(ctx: Context) {},
}

// 3. Class plugin: a Service subclass (covered in chapter 3).
export class MyService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'myTutorialService')
  }
}
```

在你需要公開服務之前，請一直使用函數形態；[第 3 章](03-services.zh.md)介紹了何時應當使用類形態。

## 嘗試制造錯誤

讓 `apply` 拋出異常：

```ts ignore-check
export function apply(ctx: Context) {
  throw new Error('apply exploded')
}
```

再次運行：進程會因該錯誤而終止。插件加載失敗會明確報錯，不會僅跳過該配置項。

還需要盡早了解一個例外：如果某個配置項的模塊無法被 **解析**，例如路徑或包名拼寫錯誤，Cordis 會通過 logger 服務報告錯誤，而不會使進程崩潰。在啟動階段，這條報告可能在 console 導出器開始觀察之前丟失。如果新增配置項似乎沒有任何效果，請先檢查拼寫。

下一章：[生命周期與 effect](02-lifecycle-and-effects.zh.md)：插件卸載時會發生什么。

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
