# 通過 GitHub Webhook 創建評審會話

[English](github-review.md) | 中文

此可選 overlay 會為 `dsh web` 增加一個簽名 GitHub 端點。當已配置倉庫中的 pull request 從 draft 變為 ready for review 時，規則會在該倉庫的 Web Workspace 下創建帶標題的根 Session，并啟動只讀評審提示詞。

## 前置條件

- 一個可由 DSH 注冊為 Web Workspace 的本地 checkout。
- 一個可通過 `DSH_GITHUB_WEBHOOK_SECRET` 憑據引用訪問的高熵 GitHub webhook 密鑰。
- 一個可以把單個公共 URL 轉發到 loopback 監聽器的 TLS 反向代理或 tunnel。
- GitHub webhook 訂閱 Pull requests 事件，且 content type 為 `application/json`。

overlay 默認使用啟動目錄作為 Workspace，并監聽 `127.0.0.1:3081`。可通過 `DSH_GITHUB_REVIEW_WORKSPACE` 與 `DSH_GITHUB_WEBHOOK_PORT` 覆蓋它們。

## 啟動 DSH

生成密鑰，并在重啟后繼續使用同一值：

```sh
export DSH_GITHUB_WEBHOOK_SECRET="$(openssl rand -hex 32)"
printf '%s\n' "$DSH_GITHUB_WEBHOOK_SECRET"
```

在開發 checkout 中運行：

```sh
export DSH_GITHUB_REVIEW_WORKSPACE=/path/to/deepseek-harness
pnpm dsh web --patch apps/cli/config/examples/github-review/cordis.yml
```

安裝版 DSH 通過絕對路徑使用同一 overlay：

```sh
dsh web --patch /absolute/path/to/github-review/cordis.yml
```

對于永久 profile，把 `github-ready-review-rule.mjs` 放在 `$DSH_HOME/profiles/web/cordis.patch.yml` 旁邊，把 `cordis.yml` 中的行追加到該 patch，然后運行 `dsh web`。隨附 CLI 已經包含兩個 webhook 包；只需 overlay 即可激活它們。

## 暴露專用端點

主 Web UI 與 `/api` 繼續位于端口 3080。overlay 會在隔離 realm 中掛載第二個 WebServer；其中只注冊 `POST /github`，其他路徑均返回 `404`。

Caddy 配置可以只暴露該監聽器：

```caddyfile
hooks.example.com {
  route {
    @github path /github
    reverse_proxy @github 127.0.0.1:3081
    respond 404
  }
}
```

GitHub 配置如下：

```text
Payload URL:  https://hooks.example.com/github
Content type: application/json
Secret:       DSH_GITHUB_WEBHOOK_SECRET value
Events:       Pull requests
Active:       yes
```

## 規則行為

規則只接受來源 `primary-github`、倉庫 `deepseek-harness/deepseek-harness`、事件 `pull_request` 與動作 `ready_for_review`。它會把精確 head SHA 和選定 PR 字段傳給評審提示詞，把 JSON 標為不受信任的元數據，并禁止修改文件、分支、PR 或 GitHub 狀態。

Session 請求選擇 `standard` agent preset 與 `read-only` permission preset。`workspacePath` 通過 `WorkspaceRegistry.create()` 規范化，因此第一次匹配交付會在 Workspace 不存在時創建它，后續交付會復用它。

HTTP 響應刻意弱于 Agent 結果：`202` 表示簽名與 JSON 已被接受，規則調用已在內存中調度。它不表示此規則已經匹配，也不表示已創建 Session。

## 程序化擴展

`run()` 是普通受信任 JavaScript。部署可以在返回 Session 請求前查詢內部策略服務：

```js
const response = await fetch('https://policy.internal/pr-review', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ repository: payload.repository.full_name }),
  signal,
})
if (!response.ok || (await response.json()).automaticReview !== true) return null
```

它還可以把倉庫映射到不同本地路徑：

```js
const workspacePath = {
  'deepseek-harness/deepseek-harness': '/path/to/deepseek-harness',
  'deepseek-harness/dsh-sdk': '/path/to/dsh-sdk',
}[payload.repository.full_name]
if (workspacePath === undefined) return null
```

## 交付語義

webhook runtime 不存儲交付或執行狀態。重復交付會運行規則，并可能創建另一個 Session。崩潰會丟失尚未接納提示詞的規則調用。提示詞接納后，工作由普通 Session 日志、persistence、Workspace 與 Agent 生命周期擁有。

webhook 密鑰只驗證入站 GitHub 數據。它不會向規則代碼或所創建 Agent 授予出站 GitHub 訪問權；規則或 Agent 需要時應單獨配置該權限。
