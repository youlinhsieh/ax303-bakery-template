# AX-303 學員前置作業（先讀這一份）

你不需要會寫程式。全程只在**瀏覽器**（和手機上的 Telegram）。終端機的事，都是 Claude 代勞。
Windows、Mac 做法一樣。**開課前只要完成下面四步**，每步都有「做完你應該看到什麼」。其餘的（Cloudflare、知識庫、金鑰、Telegram）第一天上午在現場一起做。

> **這門課的東西都在 `課程/` 資料夾**：給你看的講義、手工貼、小案子，還有店的資料、規格、驗收單、存檔點（見 `課程/README.md`）。根目錄其他的（`CLAUDE.md`、`.claude/`、`.mcp.json`）是 Claude 的到職須知與工具，你不用打開。

> 這個 repo 是公開的範本，裡面沒有任何金鑰，也不要把你公司的真實資料放進來——課程全程用一家虛構的烘焙坊「里歐烘焙坊」與假資料。

## 開課前：四步

| 步驟 | 做什麼 | 做完你應該看到 |
|---|---|---|
| 1 | 訂閱 **Claude 付費方案**（Pro 以上），登入 claude.ai。若是公司帳號，先問管理員有沒有開放「網頁版 Claude Code」 | 瀏覽器打開 **claude.ai/code** 能進去，不是「無權限」畫面 |
| 2 | 開一個 **GitHub 帳號**（免費）：github.com | 登入後看到 GitHub 首頁 |
| 3 | 打開講師報名信附的範本網址，按綠色 **Use this template → Create a new repository**；名稱隨意，選 **Public** | 你的 GitHub 帳號底下多了一個自己的 repo，根目錄有 `README.md`、`CLAUDE.md` 和一個 `課程/` 資料夾 |
| 4 | 到 claude.ai/code，依畫面連結你的 GitHub 帳號 | 在 claude.ai/code 的 repo 清單看得到你剛建的 repo |

> 這四步做完就可以上課。沒有 Cloudflare 帳號、沒有金鑰、沒有 Telegram bot 都沒關係，現場帶著做。

## 第一天上午「環境架設」現場做（講師帶，這裡先給你看有什麼）

| 現場步驟 | 做什麼 | 做完你應該看到 |
|---|---|---|
| A | 到 **rag.arcrun.dev** 照安裝畫面裝 **Arcrun RAG**。過程中它會要你**登入 Cloudflare**：有帳號就登入，沒有就在那一步**新開一個**（免費版即可）。Arcrun RAG 會裝在這個 Cloudflare 帳號裡 | 裝完的畫面給你「一個網址」和「一個 MCP token」，先存在只有你看得到的地方。登入失敗請舉手，那是已知問題 |
| B | 打開 **Cloudflare**（就是剛剛裝 Arcrun RAG 時登入的那個，瀏覽器已經登入了）→ 照 `課程/手工貼/怎麼貼.md` 手工貼一個小程式，證明帳號和環境是通的 | 打開網址看到「你現在連到的是 Cloudflare 在 ＿＿ 的機房」 |
| C | 同一個 Cloudflare 畫面順手拿金鑰：右上角頭像 → **My Profile → API Tokens → Create Token** → 選 **Edit Cloudflare Workers** 範本，再加上兩列 **Account → D1 → Edit**、**Account → Workers AI → Edit**（小模型工讀生要用）。再到 **Workers & Pages** 頁面右側抄下 **Account ID** | 你手上有「一串金鑰」和「一串 Account ID」，和 A 的兩串放在一起 |
| D | 在 claude.ai/code 選你的 repo，打開**環境（Environment）設定**：<br>**Network access** 選 **Full**；<br>環境變數填四行：<br>`CLOUDFLARE_API_TOKEN=C 的金鑰`<br>`CLOUDFLARE_ACCOUNT_ID=C 的 Account ID`<br>`ARCRUN_RAG_URL=A 的網址加上 /mcp`<br>`ARCRUN_RAG_TOKEN=A 的 token` | 環境存好。四個值只填在這裡，不要貼進對話、不要寫進任何檔案 |
| E | **開一個新的工作階段**，對 Claude 說：「請執行 setup」 | Claude 逐項檢查，結尾給你一張清單。**全部「通過」才往下**；哪一項沒過，Claude 只會告訴你那一項怎麼辦，照做再說一次「請執行 setup」。Arcrun RAG 那一列會確認它真的裝在你自己的帳號、MCP 接得上。Telegram 那一列早上會顯示「略過（下午才需要）」，這是正常的 |

> 不用先另外去開 Cloudflare 帳號：開帳號是裝 Arcrun RAG 的其中一步。

## 第一天下午「接 Telegram」現場做

| 現場步驟 | 做什麼 | 做完你應該看到 |
|---|---|---|
| F | 在手機或電腦的 **Telegram** 找 **@BotFather**，傳 `/newbot`，照它問的取個名字（帳號要以 `bot` 結尾）。它會回你一串 **bot token** | 你手上有「一串 bot token」（長得像 `123456:ABC-…`）。再對你的新 bot 傳一句 `/start`（之後 Claude 才接得到你） |
| G | 回環境設定，**加第五行**環境變數 `TELEGRAM_BOT_TOKEN=F 的 token`，再開新的工作階段 | Claude 說「請執行 setup」，Telegram 那一列變成 `bot @你的bot名字` |
| H | 對你的 bot 傳 `/id`，把回的數字交給 Claude，說「我是店長，也是店員阿德」 | Claude 把編號寫進設定；之後你在 Telegram 上能用 `/接單` 等指令，也收得到「等核准」的按鈕 |

## 開課當天

- 帶一台有鍵盤的筆電（只需要瀏覽器），手機裝好 Telegram。
- 課程講義在你 repo 的 `課程/講義/` 資料夾；上課時講師會說現在看哪一段。
- 每個實作段做完，對 Claude 說「存檔」，你的進度才會留在自己的 repo 裡。

## 跟不上進度時（存檔點）

兩天的內容很多，落後是正常的。你的 repo 裡有兩個**存檔點**（`課程/存檔點/` 資料夾）：

| 你對 Claude 說 | 接回的進度 |
|---|---|
| 「從 D1 存檔點接著做」 | 門市客服上線、過了自己的驗收單（D1 收場的樣子） |
| 「從 D2 中午存檔點接著做」 | 再加上接單員、內勤小幫手、廚房排產（D2 午餐前的樣子） |

Claude 會先把你原本寫的收起來（不會刪），放進存檔點的程式，跑驗收單給你看全綠，再跟全班一起往下走。後面的工位不在存檔點裡，還是要請 Claude 自己蓋。

## 安全提醒

- 金鑰只放在環境設定裡。課後想收回：Cloudflare 的 API Tokens 頁刪掉那一把、在 @BotFather 對 bot 傳 `/revoke` 換掉 token，環境設定裡清掉五個變數。
- 看到任何畫面要你輸入金鑰、卻不是上面列的地方，先停下來問講師。

## 卡關了？

截圖你卡住的畫面，連同「我在第幾步」寄給講師。**不用自己搜尋，也不用自己開終端機。**
