# Cookbook: 新增設置卡片

[English](adding-a-settings-card.md) | 中文

插件如何把自己的配置放上 Web 設置頁。這條路徑上沒有任何一步需要改動本倉庫：Host 服務每一個已注冊的 settings 命名空間，而**插件配置**分區以卡片所編輯的命名空間為鍵，因此同時注冊了兩個半側的插件會被自動配對。

兩個半側住在同一個包里——Host 半側在 `src/`，瀏覽器半側在 `src/client/`，以 `./client` 導出并用 `dsh.client` 聲明。[`packages/client/ui-theme`](../../packages/client/ui-theme) 是這種打包方式的現成例子；本分區自帶的卡片在 [`packages/client/ui-settings-plugins`](../../packages/client/ui-settings-plugins)。

## 1. 注冊命名空間（Host 半側）

命名空間就是配對用的鍵，所以只挑一次，并在兩個半側都寫出它。已經有 `cordis.yml` entry 的消費方應通過 `ctx.settings.installSection()` 注冊——它把 entry 層疊在用戶文檔之下，并在沒有掛載 settings provider 時照常工作：

```ts
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'

declare function assertReachable(endpoint: string | undefined): void
declare function rebuildFromSettings(config: Config): void

export const MY_PLUGIN_NS = 'my-plugin'

export interface Config {
  endpoint?: string
  retries?: number
}

export const Config: z<Config> = z.object({
  endpoint: z.string(),
  retries: z.number().step(1).min(0).default(3),
})

export function apply(ctx: Context, config: Config) {
  let source = () => config
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, MY_PLUGIN_NS, Config, config, {
      // Constraints the schema cannot express refuse the write, not the next use.
      validate: value => void assertReachable(value.endpoint),
      setSource: (current) => { source = current },
      onChange: () => { rebuildFromSettings(source()) },
    })
  })
}
```

字段上的 `role('secret')` 讓它的值不出現在任何響應里；卡片把這類字段寫進 `update`/`mutate` 載荷，或改為經 `credentials` 領域尋址一個憑據引用。`applies: 'restart'` 告訴配置表層：擁有方要到下次啟動才會對變更生效。

## 2. 注冊卡片（瀏覽器半側）

卡片以自己的命名空間為鍵注冊進 `settings.plugin.item`，并擁有其中的一切——外觀、控件與文案。它通過 `ctx.settingsScope` 讀寫，后者用讀取時的 revision 為每次寫入設柵：

```ts ignore-check
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: the keyed slot's declaration. Cross-plugin collaboration goes
// through cordis services; a value import fails the client bundle-purity gate.
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'

export const inject = ['slots', 'locale', 'connection', 'remote', 'settingsScope']

export function apply(ctx: ClientContext): void {
  const card = new MyPluginCardController(ctx.settingsScope.bind({ namespace: 'my-plugin' }))
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: 'my-plugin',
    locale: 'settings.myPlugin',
    inject: () => card.inject(),
  }, MyPluginCard),
  )
}
```

scope 快照攜帶表單所需的一切：解析后的 `value`、組裝層 `base`，以及原始的 `user` 層——字段是否被覆蓋，取決于它在 `user` 層中是否**出現**，而非它的值。`scope.set(field, value)` 存一個字段，`scope.unset(field)` 把它清回組裝層。

## 3. 標簽頁拿它做什么

**插件配置**標簽頁讀取 Host 服務了哪些命名空間，并為每個命名空間派發一個 slot 鍵。當 Host 服務了某卡片的鍵時它被渲染，否則被跳過，因此從未組裝過 Host 半側的部署不會留下這張卡片的任何痕跡。被服務卻無人認領的命名空間什么都不渲染——歸其他頁面所有的那些命名空間（`ui-theme`、`permission`、`llm-*`）正是這樣留在本標簽頁之外的。

卡片按其注冊進該 slot 的順序出現；keyed entry 不聲明自己的 `order`。

## 打包

瀏覽器半側由[客戶端模塊系統](../../packages/client/modules)提供給頁面：它掃描已啟用的 Loader entries 中聲明了 `dsh.client` 的包，并提供每個包構建出的 `./client` 導出。因此只要 `cordis.yml` 掛載了該插件，它就會出現在頁面上——無需重新構建 Web 應用。

```jsonc
{
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./client": { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" }
  },
  "dsh": { "client": { "platform": "web", "inject": ["@deepseek-ai/dsh-client-ui-settings-plugins"] } }
}
```

bundle 必須是 loader 的 lazy-CJS factory 產物。在本倉庫內，`tsdown.config.ts` 就是基于共享預設的三行：

```ts ignore-check
import { clientBundle } from '../tsdown.client.ts'

export default clientBundle('@deepseek-ai/dsh-client-my-plugin', ['lib/types/index.js', 'lib/types/invariant.js'])
```

沒有已發布的預設暴露該包，因此本倉庫之外的包得自行復刻同樣的輸出格式。bundle 純凈度門禁同時拒絕跨插件的值導入，所以卡片無法導入本分區的卡片外觀或其暫存表單模型——它渲染自己的那一份，并自行擁有暫存與 revision 設柵。這兩條限制都記在[本分區的已知限制](../../packages/client/ui-settings-plugins/README.zh.md#known-limitations-and-deferred-work)里。
