---
name: setup
description: 課前與 D1 開場用（Claude Code on the web 版）。檢查雲端環境的 Node、wrangler、jq，驗證 Cloudflare 金鑰、Arcrun RAG（真的裝在學員自己的帳號、MCP 接得上）與 Telegram bot。學員說「幫我設定環境」「/setup」時使用。
---

# setup：幫學員確認雲端環境準備好（網頁版）

學員是不寫程式的主管，用瀏覽器開 Claude Code on the web。**你代勞所有指令**，每一步用一句白話說你在做什麼。
這個環境是 Linux 雲端虛擬機：不用裝 Git Bash、不用 winget、**不能用 `wrangler login`**（雲端沒有瀏覽器可以跳出來）。Cloudflare 靠環境變數裡的金鑰登入。

## 步驟（照順序，每步印出「通過」或「失敗＋原因」）

1. **Node**：`node -v`，要 v20 以上（雲端預設 22）。
2. **jq**：`jq --version`（雲端預設已裝）。
3. **wrangler**：`npx --yes wrangler --version`。
4. **Cloudflare 金鑰有沒有設**：只檢查「有沒有」，**絕對不要把值印出來**：
   `[ -n "$CLOUDFLARE_API_TOKEN" ] && echo 有 || echo 沒有`，`CLOUDFLARE_ACCOUNT_ID` 同理。
   沒有 → 告訴學員去 claude.ai/code 的環境設定（Environment variables）補上，補完要**開新 session**才讀得到。
5. **雲端連得到 Cloudflare 嗎**：`curl -s -o /dev/null -w "%{http_code}" https://api.cloudflare.com/client/v4/user/tokens/verify`
   連不上或 403 且訊息提到 blocked / not allowed → 是環境的網路等級太窄。告訴學員：環境設定的 Network access 要改成 **Full**（或 Custom 並加入 `*.cloudflare.com`、`*.workers.dev`、以及你的 Arcrun RAG 網址）。
6. **登入驗證**：`npx wrangler whoami`，要看到學員自己的帳號名稱。看到別人的帳號或失敗，只講那一項怎麼辦。
7. **Arcrun RAG 真的裝好、裝在學員自己的帳號、接得上**：跑 `node .claude/scripts/check-arcrun-rag.mjs`（它自己讀 `ARCRUN_RAG_URL`、`ARCRUN_RAG_TOKEN`、Cloudflare 金鑰，不會印出任何值）。它會逐項印「通過」或「失敗＋原因＋怎麼辦」：網址格式、MCP 連得上且有地圖／目錄／整張卡三個工具、能讀知識庫地圖、這個 Worker 在學員**自己的** Cloudflare 帳號底下。**只轉述它印出來的那一項怎麼辦**，不要自己猜。
   - 只檢查「變數有沒有設」**不算通過**：安裝登入失敗、token 貼錯、裝到別人的帳號，變數都會是「有設」。
   - 它印「略過」（網址不是 workers.dev）→ 請學員到 Cloudflare 的 Workers & Pages 看一眼那個 Worker 是不是在自己帳號底下，學員說是才算通過。
   - 這一步通過後，`/mcp` 應該看到 `arcrun-rag` 是已連線；沒有的話要開新的工作階段。
8. **Telegram bot（下午才要求通過）**：只檢查 `TELEGRAM_BOT_TOKEN` 有沒有設（不印出）。**沒設，而且學員不是正在做「接 Telegram」那一段 → 印「略過（下午才需要）」，不算失敗，也不影響「環境好了」。** 學員說正在接 Telegram（下午）而沒設 → 才算失敗，請他回前置作業「第一天下午」的 F、G 步。有設就問 Telegram 這個 bot 是誰：
   `curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe" | jq -r 'if .ok then "bot @" + .result.username else .description end'`
   看到 `bot @…` 才算通過，並把 `@…` 這個名字告訴學員（之後在 Telegram 搜尋它）。回 `Unauthorized` → token 貼錯，重新從 @BotFather 複製；連不上 → Network access 要 Full。

## 收尾

印一張清單：

| 項目 | 結果 |
|---|---|
| Node | 版本或失敗原因 |
| wrangler | 同上 |
| jq | 同上 |
| Cloudflare 金鑰與連線 | 帳號名稱或失敗原因 |
| Arcrun RAG | 通過（裝在你自己的帳號、MCP 接得上）/ 哪一項失敗 |
| Telegram bot | bot 名稱 / 略過（下午才需要）/ 失敗原因 |

全部通過才說「環境好了」（Telegram 那列是「略過」時不擋）。任何一項失敗，只講那一項該怎麼辦，不要一次丟一堆。

## 不要做

- 不要印出、複述、或寫進任何檔案：`CLOUDFLARE_API_TOKEN`、`ARCRUN_RAG_TOKEN`、`TELEGRAM_BOT_TOKEN` 的值（`getMe` 的網址裡有 token，指令輸出只留 jq 過濾後的那一行）。
- 不要叫學員自己開終端機或裝東西到自己的電腦。
- 不要跑 `wrangler login`。
