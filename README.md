# Crypto Divergence Analyzer

加密貨幣日內波段量化數據背離與打分分析儀。

第一版使用 mock Binance / Coinglass provider，完整跑通：

- 5m 觸發週期
- 15m 主分析週期
- 1h 趨勢濾網
- CVD / OI / 大戶散戶多空比 / Funding Rate / 量能放大 / 主動買賣力道 / 波動壓縮
- Long / Short recommendation scoring（五支柱共振）
- 早期異動雷達：每個幣標上行情階段（早期異動 / 趨勢啟動 / 趨勢延續 / 過熱風險 / 反轉警訊）
  與被選出的具體原因，目標是在價格發酵前抓到資金與量能先行的幣
- Next.js dark dashboard + TradingView Lightweight Charts

## Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

API docs:

```txt
http://localhost:8000/docs
```

Analysis endpoint:

```txt
GET http://localhost:8000/api/v1/analysis?symbol=BTCUSDT
```

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend URL:

```txt
http://localhost:3000
```

## API Keys

目前 mock provider 不需要 API key。之後要接真實資料時，請複製：

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

需要填的位置：

- `backend/.env`
  - `BINANCE_API_KEY`
  - `BINANCE_API_SECRET`
  - `COINGLASS_API_KEY`

- `frontend/.env.local`
  - `NEXT_PUBLIC_API_BASE_URL`

