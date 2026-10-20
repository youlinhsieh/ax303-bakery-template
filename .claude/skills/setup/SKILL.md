---
name: setup
description: 課前與 D1 開場用（Claude Code on the web 版）。檢查雲端環境的 Node、wrangler、jq，驗證 Cloudflare 金鑰與 Arcrun RAG 接上。學員說「幫我設定環境」「/setup」時使用。
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
7. **Arcrun RAG 接上**：檢查 `ARCRUN_RAG_URL`、`ARCRUN_RAG_TOKEN` 兩個環境變數有沒有設（同樣只檢查有沒有）。專案根目錄的 `.mcp.json` 會讀這兩個值。沒設 → 請學員補在環境變數；設了之後 `/mcp` 應該看到 `arcrun-rag` 是已連線。

## 收尾

印一張清單：

| 項目 | 結果 |
|---|---|
| Node | 版本或失敗原因 |
| wrangler | 同上 |
| jq | 同上 |
| Cloudflare 金鑰與連線 | 帳號名稱或失敗原因 |
| Arcrun RAG | 已接上 / 還沒設 |

全部通過才說「環境好了」。任何一項失敗，只講那一項該怎麼辦，不要一次丟一堆。

## 不要做

- 不要印出、複述、或寫進任何檔案：`CLOUDFLARE_API_TOKEN`、`ARCRUN_RAG_TOKEN` 的值。
- 不要叫學員自己開終端機或裝東西到自己的電腦。
- 不要跑 `wrangler login`。
