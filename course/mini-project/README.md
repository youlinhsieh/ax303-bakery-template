# 小案子：我的雲端聊天介面（第一天上午最後一段）

> 你在：學員範本 `course/mini-project/`。頁碼是 AX-303 簡報的頁碼（D1＝第一天）。

上一段你手工貼了一個 Worker，打開看到「你現在連到的是 Cloudflare 在 ＿＿ 的機房」。這一段把它**長大**成一個能聊天的網頁，背後是 Cloudflare 的小模型（Workers AI）：

> 你打開自己的網址（手機也行），打一句話，小模型回你。

你只做幾個動作：**對 Claude 說一句需求 → 它蓋好、測過、部署 → 你打開網址聊天。**

這個案子和烘焙坊無關。用意有二：走一遍「之後兩天的開發方式」（說需求 → 先寫驗收題 → 蓋 → 測 → 部署），也看清楚 Cloudflare 跟傳統 server 的差別：

| | 傳統 server | Cloudflare |
|---|---|---|
| 網頁＋後端 | 租主機、裝系統、裝網頁伺服器 | 一個 Worker |
| 接 AI | 申請 AI 的 API、管金鑰、算帳 | Workers AI，同一個帳號，免費額度內，不用任何金鑰 |
| 上線 | 設定、開防火牆、等 | 幾秒 |

- 要貼給 Claude 的那一句：`prompt-for-claude.md`
- 先決條件：前置作業全部完成、`setup` 全部通過、上一段已手工貼過 Worker（`course/paste-by-hand/how-to-paste.md`）。
- 這一段不用 Telegram、不用資料庫；Telegram 留給下午的門市客服。

**什麼時候用**：D1 上午環境架設之後。D1 第 13 頁（小案子是什麼）、第 14 頁（三個動作：貼上 [`prompt-for-claude.md`](prompt-for-claude.md)、Claude 蓋好、打開網址聊）、第 15 頁（對照傳統 server）、第 16 頁（結果）。

**下一步**：午餐後講 Harness（D1 第 17–24 頁），接著蓋烘焙坊；第一個要用到的資料夾是 [`../company-data/`](../company-data/)（D1 第 31 頁）。
