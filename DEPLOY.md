# 部署到 Railway（前端 + 後端，真實幣安資料）

兩個服務放在**同一個 Railway 專案**，都從這個 GitHub repo 部署，各自設定不同的「Root Directory」。

> 重點：後端要對外抓 `fapi.binance.com`，**Region 一定要選 Singapore（Southeast Asia）**，否則會被幣安地理封鎖（HTTP 451）。

---

## 步驟 1 — 後端服務（backend）

1. Railway → **New Project → Deploy from GitHub repo** → 選 `YQBY-agent`。
2. 進該服務 **Settings**：
   - **Root Directory** = `backend`
   - **Region** = `Southeast Asia (Singapore)`
3. **Variables**（環境變數）貼上：
   ```
   DATA_PROVIDER=binance
   ANTHROPIC_API_KEY=<你的 Claude 金鑰>
   ANALYST_MODEL=claude-sonnet-4-6
   SCAN_UNIVERSE_SIZE=150
   BINANCE_MAX_REQUESTS_PER_SECOND=8
   ```
   （`CORS_ORIGINS` 等拿到前端網址後再回來加。）
4. **Settings → Networking → Generate Domain**，記下後端網址，例如
   `https://yqby-backend-production.up.railway.app`
5. 等部署完成，開 `<後端網址>/health` 應回 `{"status":"ok"}`。

## 步驟 2 — 前端服務（frontend）

1. 同一個專案 → **New → GitHub Repo** → 再選一次 `YQBY-agent`（建立第二個服務）。
2. **Settings**：
   - **Root Directory** = `frontend`
3. **Variables**：
   ```
   NEXT_PUBLIC_API_BASE_URL=<步驟1的後端網址>
   ```
   （這個變數在 **build 時**就會被寫進前端，所以一定要先設好再部署。）
4. **Generate Domain**，記下前端網址，例如
   `https://yqby-frontend-production.up.railway.app`

## 步驟 3 — 把前端網址加回後端 CORS

1. 回到**後端服務 → Variables**，新增：
   ```
   CORS_ORIGINS=<步驟2的前端網址>
   ```
   （多個網址用逗號分隔；不要留結尾斜線。）
2. 後端會自動重新部署。

## 完成

打開**前端網址**就是公開站了。把這個網址給你的人即可。

---

## 備註
- **分析師聊天**已開（後端有 `ANTHROPIC_API_KEY`）。網址只給自己人沒問題；若之後想擋路人，再加密碼或速率限制。
- **異常歷史 / 觸發次數**是記憶體狀態，每次重新部署會歸零（正常，這是 demo 取捨）。
- 若後端 build 失敗，到後端服務 Variables 加 `NIXPACKS_PYTHON_VERSION=3.12` 再重試。
- 金鑰只貼在 Railway 後台，**不要**寫進程式或 commit（`backend/.env` 已被 git 忽略）。
- Railway 有試用額度，用完後大約 $5/月（Hobby）。
