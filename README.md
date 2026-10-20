# AX-303 學員前置作業（先讀這一份）

你不需要會寫程式。全程只在**瀏覽器**（和手機上的 Telegram）。終端機的事，都是 Claude 代勞。
Windows、Mac 做法一樣。**開課前只要完成下面四步**，每步都有「做完你應該看到什麼」。其餘的（Cloudflare、知識庫、金鑰、Telegram）第一天上午在現場一起做。

> **這門課的東西都在 `course/` 資料夾**：給你看的講義、手工貼、小案子，還有店的資料、規格、驗收單、存檔點（見 `course/README.md`）。根目錄其他的（`CLAUDE.md`、`.claude/`）是 Claude 的到職須知與工具，你不用打開。

> 這個 repo 是公開的範本，裡面沒有任何金鑰，也不要把你公司的真實資料放進來——課程全程用一家虛構的烘焙坊「里歐烘焙坊」與假資料。

## 開課前：四步

| 步驟 | 做什麼 | 做完你應該看到 |
|---|---|---|
| 1 | 訂閱 **Claude 付費方案**（Pro 以上），登入 claude.ai。若是公司帳號，先問管理員有沒有開放「網頁版 Claude Code」 | 瀏覽器打開 **claude.ai/code** 能進去，不是「無權限」畫面 |
| 2 | 開一個 **GitHub 帳號**（免費）：github.com | 登入後看到 GitHub 首頁 |
| 3 | 打開講師報名信附的範本網址，按綠色 **Use this template → Create a new repository**；名稱隨意，選 **Public** | 你的 GitHub 帳號底下多了一個自己的 repo，根目錄有 `README.md`、`CLAUDE.md` 和一個 `course/` 資料夾 |
| 4 | 到 claude.ai/code，依畫面連結你的 GitHub 帳號 | 在 claude.ai/code 的 repo 清單看得到你剛建的 repo |

> 這四步做完就可以上課。沒有 Cloudflare 帳號、沒有金鑰、沒有 Telegram bot 都沒關係，現場帶著做。

## 第一天上午「環境架設」現場做（講師帶，這裡先給你看有什麼）

| 現場步驟 | 做什麼 | 做完你應該看到 |
|---|---|---|
| A | 到 **rag.arcrun.dev** 照安裝畫面裝 **Arcrun RAG**。過程中它會要你**登入 Cloudflare**：有帳號就登入，沒有就在那一步**新開一個**（免費版即可）。Arcrun RAG 會裝在這個 Cloudflare 帳號裡 | 你手上有「MCP 網址」（`https://arcrun-mcp.….workers.dev/mcp`；登入 Portal 的設定頁也複製得到）和你登入 Portal 用的 email、密碼。Arcrun 沒有另外的 token 或金鑰。登入失敗請舉手，那是已知問題 |
| B | 打開 **Cloudflare**（就是剛剛裝 Arcrun RAG 時登入的那個，瀏覽器已經登入了）→ 照 `course/paste-by-hand/how-to-paste.md` 手工貼一個小程式，證明帳號和環境是通的 | 打開網址看到「你現在連到的是 Cloudflare 在 ＿＿ 的機房」 |
| C | 同一個 Cloudflare 畫面順手拿金鑰：右上角頭像 → **My Profile → API Tokens → Create Token** → 選 **Edit Cloudflare Workers** 範本，再加上兩列 **Account → D1 → Edit**、**Account → Workers AI → Edit**（小模型工讀生要用）。再到 **Workers & Pages** 頁面右側抄下 **Account ID** | 你手上有「一串金鑰」和「一串 Account ID」，先存在只有你看得到的地方 |
| D | **接給 Claude**，兩件事：<br>① 打開 claude.ai 的**設定 → 連接器 → 新增自訂連接器**，名稱填 `Arcrun RAG`，網址貼 A 的 MCP 網址，儲存後按**授權**，在跳出的頁面填你的 **Portal email ＋密碼**（就是你登入知識庫的那一組）；<br>② 在 claude.ai/code 選你的 repo，打開**環境（Environment）設定**，**Network access** 選 **Full**，然後在**環境變數**填兩行：<br>`CLOUDFLARE_API_TOKEN=C 的金鑰`<br>`CLOUDFLARE_ACCOUNT_ID=C 的 Account ID` | ① 連接器清單裡 Arcrun RAG 顯示已連線。② 環境存好。兩個 Cloudflare 的值只填在這裡，不要貼進對話、不要寫進任何檔案；Arcrun 這邊全程沒有 token 要填 |
| E | **開一個新的工作階段**，對 Claude 說：「請執行 setup」 | Claude 逐項檢查，結尾給你一張清單。**全部「通過」才往下**；哪一項沒過，Claude 只會告訴你那一項怎麼辦，照做再說一次「請執行 setup」。Arcrun RAG 那一列會真的讀一次你的知識庫地圖，讀得到才算通過。Telegram 那一列早上會顯示「略過（下午才需要）」，這是正常的 |

> 不用先另外去開 Cloudflare 帳號：開帳號是裝 Arcrun RAG 的其中一步。

**步驟 D 要填的東西，一次看清楚**

| 東西 | 是不是秘密 | 填在哪裡 | 怎麼填 |
|---|---|---|---|
| Arcrun RAG | 沒有金鑰，用 Portal 帳密登入 | claude.ai **設定 → 連接器** | 新增自訂連接器，貼 MCP 網址，授權時填 Portal email＋密碼 |
| Cloudflare 金鑰（C 拿到的那串） | **是** | claude.ai/code 環境設定 → **環境變數** | `CLOUDFLARE_API_TOKEN`＝金鑰（課堂預設；Network secrets 是選用、尚未驗證，見下方） |
| Cloudflare Account ID | 不是 | 同一個環境設定 → **環境變數** | `CLOUDFLARE_ACCOUNT_ID`＝Account ID |
| Telegram bot token、webhook 密語 | **是** | **Cloudflare 後台**（下午，見 G），不是這裡 | 直接填進 Worker 的 Secret，不經過 Claude |

> **選用、尚未驗證（課堂不要當預設，講師說可以再試）**：Cloudflare 金鑰也可以改放 **Network secrets → Add secret**：**Name** 填 `Cloudflare`；**Secret type** 照預設 **Bearer**；**Allowed websites** 填 `api.cloudflare.com`；**Custom headers** 那一列照預設（**Name** `Authorization`、**Prefix** `Bearer`），**Value** 貼 C 的金鑰；按 **Add**。存好看不到值也不能改，貼錯要刪掉重加；Team 方案沒組織管理員角色時是短表單（**Host** `api.cloudflare.com`、**Secret type** **Token**、**Value** 貼金鑰）。這條路 wrangler 能不能用還沒實測，所以預設是環境變數。

## 第一天下午「接 Telegram」現場做

| 現場步驟 | 做什麼 | 做完你應該看到 |
|---|---|---|
| F | 在手機或電腦的 **Telegram** 找 **@BotFather**，傳 `/newbot`，照它問的取個名字（帳號要以 `bot` 結尾）。它會回你一串 **bot token** | 你手上有「一串 bot token」（長得像 `123456:ABC-…`）。再對你的新 bot 傳一句 `/start`（之後 Claude 才接得到你） |
| G | 等 Claude 把門市客服蓋好、給你 Worker 網址之後（講師會說時機）。**token 不給 Claude**，自己放進 Cloudflare：<br>① Cloudflare → **Workers & Pages** → 你的 Worker（`leo-bakery`）→ **Settings → Variables and Secrets → Add**，**Type** 選 **Secret**，名稱 `TELEGRAM_BOT_TOKEN`，值貼 F 的 token；再加一個名稱 `TELEGRAM_WEBHOOK_SECRET`，值自己亂打一串英文字母和數字（不要空格，記下來）；按 Deploy。<br>② 在你自己的瀏覽器網址列貼上這串（`<…>` 換成你的），按 Enter：<br>`https://api.telegram.org/bot<F 的 token>/setWebhook?url=<Worker 網址>/api/telegram/webhook&secret_token=<剛剛那串亂碼>` | 瀏覽器畫面出現 `{"ok":true,"result":true,…}`。再對你的 bot 傳 `/id`，它回你一串數字，就是接通了（沒回就先找講師，再往 H） |
| H | 把 `/id` 回的數字交給 Claude，說「我是店長，也是店員阿德」 | Claude 把編號寫進設定；之後你在 Telegram 上能用 `/接單` 等指令，也收得到「等核准」的按鈕 |

## 課程資料夾地圖（從簡報點進來會到這些地方）

課程的東西全在 [`course/`](course/)，每個資料夾裡都有一份 README，寫著「這裡的東西幹嘛用、在簡報第幾頁用到、下一步去哪」。

| 資料夾 | 簡報 |
|---|---|
| [`course/handouts/`](course/handouts/) | 整堂課 |
| [`course/paste-by-hand/`](course/paste-by-hand/) | D1 第 9–12 頁 |
| [`course/mini-project/`](course/mini-project/) | D1 第 13–16 頁 |
| [`course/company-data/`](course/company-data/) | D1 第 30–32 頁 |
| [`course/tests/`](course/tests/) | D1 第 34、38 頁；D2 各工位 |
| [`course/orders/`](course/orders/) | D1 第 35–37 頁；D2 第 7 頁 |
| [`course/scenario/`](course/scenario/) | D1 第 28、40 頁；D2 第 15–16 頁 |
| [`course/savepoints/`](course/savepoints/) | D2 第 3、9 頁 |
| [`course/data/`](course/data/) | D2 第 4 頁 |
| [`course/logs/`](course/logs/) | D2 第 13–14 頁 |

根目錄其他的（`CLAUDE.md`、`.claude/`）是 Claude 的到職須知與工具，不用動。

## 開課當天

- 帶一台有鍵盤的筆電（只需要瀏覽器），手機裝好 Telegram。
- 課程講義在你 repo 的 `course/handouts/` 資料夾；上課時講師會說現在看哪一段。
- 每個實作段做完，對 Claude 說「存檔」，你的進度才會留在自己的 repo 裡。

## 跟不上進度時（存檔點）

兩天的內容很多，落後是正常的。你的 repo 裡有兩個**存檔點**（`course/savepoints/` 資料夾）：

| 你對 Claude 說 | 接回的進度 |
|---|---|
| 「從 D1 存檔點接著做」 | 門市客服上線、過了自己的驗收單（D1 收場的樣子） |
| 「從 D2 中午存檔點接著做」 | 再加上接單員、內勤小幫手、廚房排產（D2 午餐前的樣子） |

Claude 會先把你原本寫的收起來（不會刪），放進存檔點的程式，跑驗收單給你看全綠，再跟全班一起往下走。後面的工位不在存檔點裡，還是要請 Claude 自己蓋。

## 安全提醒

- 金鑰只放在環境設定的環境變數（Cloudflare 金鑰）和 Cloudflare 後台的 **Secret**（Telegram），不貼進對話、不寫進檔案。課後想收回：Cloudflare 的 API Tokens 頁刪掉那一把、在 @BotFather 對 bot 傳 `/revoke` 換掉 token，環境設定裡刪掉 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID` 兩個變數（若試過 Network secret，也刪掉那一筆）、Cloudflare 後台 Worker 的兩個 Telegram Secret；Arcrun 那邊到 claude.ai 的連接器清單把 Arcrun RAG 移除。
- 看到任何畫面要你輸入金鑰、卻不是上面列的地方，先停下來問講師。

## 卡關了？

截圖你卡住的畫面，連同「我在第幾步」寄給講師。**不用自己搜尋，也不用自己開終端機。**
