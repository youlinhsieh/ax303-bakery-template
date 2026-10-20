# AX-303 學員前置作業（先讀這一份）

你不需要會寫程式。全程只在**瀏覽器**：claude.ai、GitHub、Cloudflare。終端機的事，都是 Claude 代勞。
Windows、Mac 做法一樣。**開課前完成，越早越好**，一個步驟一個步驟做，每步都有「做完你應該看到什麼」。

> 這個 repo 是公開的範本，裡面沒有任何金鑰，也不要把你公司的真實資料放進來——課程全程用一家虛構的烘焙坊「里歐烘焙坊」與假資料。

## 步驟（依序做）

| 步驟 | 做什麼 | 做完你應該看到 |
|---|---|---|
| 1 | 訂閱 **Claude 付費方案**（Pro 以上），登入 claude.ai。若是公司帳號，先問管理員有沒有開放「網頁版 Claude Code」 | 瀏覽器打開 **claude.ai/code** 能進去，不是「無權限」畫面 |
| 2 | 開一個 **GitHub 帳號**（免費）：github.com | 登入後看到 GitHub 首頁 |
| 3 | 開一個 **Cloudflare 帳號**（免費版即可）：dash.cloudflare.com | 登入後看到 Cloudflare 管理頁 |
| 4 | 打開講師報名信附的範本網址，按綠色 **Use this template → Create a new repository**；名稱隨意，選 **Public** | 你的 GitHub 帳號底下多了一個自己的 repo，裡面有 `README.md`、`orders/`、`tests/`、`scenario/` |
| 5 | 到 claude.ai/code，依畫面連結你的 GitHub 帳號 | 在 claude.ai/code 的 repo 清單看得到你剛建的 repo |
| 6 | 在 Cloudflare 建一把 **API 金鑰**：右上角頭像 → My Profile → API Tokens → Create Token → 選 **Edit Cloudflare Workers** 範本，再加上一列 **Account → D1 → Edit**。另外記下 **Account ID**（Workers & Pages 頁面右側） | 你手上有「一串金鑰」和「一串 Account ID」，先存在只有你看得到的地方 |
| 7 | 在**你自己的** Cloudflare 帳號安裝 **Arcrun RAG**（照 rag.arcrun.dev 的安裝步驟） | 你有「一個網址」和「一個 MCP token」。登入失敗請截圖寄講師，那是已知問題 |
| 8 | 在 claude.ai/code 選你的 repo，打開**環境（Environment）設定**：<br>**Network access** 選 **Full**；<br>環境變數填四行：<br>`CLOUDFLARE_API_TOKEN=第 6 步的金鑰`<br>`CLOUDFLARE_ACCOUNT_ID=第 6 步的 Account ID`<br>`ARCRUN_RAG_URL=第 7 步的網址加上 /mcp`<br>`ARCRUN_RAG_TOKEN=第 7 步的 token` | 環境存好。四個值只填在這裡，不要貼進對話、不要寫進任何檔案 |

## 最後一步：自己檢查（開課前一天）

在 claude.ai/code 選你的 repo、**開一個新的工作階段**（設定環境變數後要開新的才讀得到），對 Claude 說這一句：

> 請執行 setup。

Claude 會逐項檢查，結尾給你一張清單（Node、wrangler、jq、Cloudflare 金鑰與連線、Arcrun RAG）。**全部「通過」就可以上課**。哪一項沒過，Claude 只會告訴你那一項怎麼辦，照做再說一次「請執行 setup」。

## 開課當天

- 帶一台有鍵盤的筆電（只需要瀏覽器）。
- 課程講義在你 repo 的 `講義/` 資料夾；上課時講師會說現在看哪一段。
- 每個實作段做完，對 Claude 說「存檔」，你的進度才會留在自己的 repo 裡。

## 跟不上進度時（存檔點）

兩天的內容很多，落後是正常的。你的 repo 裡有兩個**存檔點**（`存檔點/` 資料夾）：

| 你對 Claude 說 | 接回的進度 |
|---|---|
| 「從 D1 存檔點接著做」 | 門市客服上線、過了自己的驗收單（D1 收場的樣子） |
| 「從 D2 中午存檔點接著做」 | 再加上接單員、內勤小幫手、廚房排產（D2 午餐前的樣子） |

Claude 會先把你原本寫的收起來（不會刪），放進存檔點的程式，跑驗收單給你看全綠，再跟全班一起往下走。後面的工位不在存檔點裡，還是要請 Claude 自己蓋。

## 安全提醒

- 金鑰只放在環境設定裡。課後想收回：Cloudflare 的 API Tokens 頁刪掉那一把，環境設定裡清掉四個變數。
- 看到任何畫面要你輸入金鑰、卻不是上面列的地方，先停下來問講師。

## 卡關了？

截圖你卡住的畫面，連同「我在第幾步」寄給講師。**不用自己搜尋，也不用自己開終端機。**
