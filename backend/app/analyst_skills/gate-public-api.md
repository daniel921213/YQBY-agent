---
name: gate-public-api
description: |
  Gate.io public v4 market data (keyless, read-only). Query USDT-perpetual
  prices, 24h change, funding rate, open interest, long/short ratios, taker
  flow, candlesticks, market rankings, and spot prices. Use whenever the user
  asks about a coin's price/market data, funding, OI, long-short crowding, or
  "what's hot / biggest movers".
metadata:
  author: yqby
  version: "1.0"
---

# Gate 公開 API 技能（免金鑰、唯讀）

- **Base URL**：`https://api.gateio.ws/api/v4`
- **方法**：全部 GET，公開、不需金鑰。
- **合約代號格式**：Gate 用底線，例如 `BTC_USDT`、`1000PEPE_USDT`。使用者通常寫 `BTCUSDT`，呼叫前自行轉成 `BTC_USDT`。
- 所有數字欄位多為字串，使用時自行轉數字。

---

## 1. 永續合約行情 / 市場排行（tickers）

**URL**：`https://api.gateio.ws/api/v4/futures/usdt/tickers`
- 不帶參數 → 回傳「全部」USDT 永續的即時行情（陣列）。
- 帶 `?contract=BTC_USDT` → 只回傳單一合約。

**常用欄位**：`contract`、`last`(現價)、`change_percentage`(24h漲跌%)、`volume_24h_quote`(24h成交額USDT)、`funding_rate`、`mark_price`、`index_price`、`high_24h`、`low_24h`、`total_size`(未平倉量)。

**用途**：
- 查某幣現價/24h漲跌 → 帶 `contract`。
- 「市場排行 / 成交額最大 / 最熱」→ 取全部、依 `volume_24h_quote` 由大到小排序取前幾名。
- 「漲最多 / 跌最多」→ 依 `change_percentage` 排序。

---

## 2. K線（candlesticks）

**URL**：`https://api.gateio.ws/api/v4/futures/usdt/candlesticks?contract=BTC_USDT&interval=15m&limit=100`
- `interval`：`10s,1m,5m,15m,30m,1h,4h,8h,1d` 等。
- 每根欄位：`t`(秒)、`o`、`h`、`l`、`c`、`v`(合約量)、`sum`(成交額)。

**用途**：技術走勢、近期高低點、波動。

---

## 3. 合約統計：OI + 多空比 + 主動買賣（contract_stats）⭐

**URL**：`https://api.gateio.ws/api/v4/futures/usdt/contract_stats?contract=BTC_USDT&interval=1h&limit=24`
- `interval`：`5m,15m,1h,4h,1d`。

**重要欄位**：
| 欄位 | 意義 |
|------|------|
| `open_interest` / `open_interest_usd` | 未平倉量（張數 / 美元） |
| `lsr_account` | 全體持倉帳戶多空比（不是純散戶；>1 偏多） |
| `top_lsr_account` | 大戶帳戶多空比 |
| `lsr_taker` | 主動買/賣比（>1 主動買盤強） |
| `long_taker_size` / `short_taker_size` | 主動買量 / 主動賣量 |
| `mark_price` | 標記價 |

**用途**：回答「OI 變化」「全體帳戶多空比」「大戶帳戶 vs 全體帳戶」「主動買賣力道」。

---

## 4. 資金費率（funding_rate）

**URL**：`https://api.gateio.ws/api/v4/futures/usdt/funding_rate?contract=BTC_USDT&limit=10`
- 每筆欄位：`t`(秒)、`r`(費率)。正值＝多頭付費。

---

## 5. 現貨價格（spot，選用）

**URL**：`https://api.gateio.ws/api/v4/spot/tickers?currency_pair=BTC_USDT`
- 欄位：`last`、`change_percentage`、`base_volume`、`quote_volume`、`high_24h`、`low_24h`。
- 現貨 K線：`https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=BTC_USDT&interval=1h&limit=100`

---

## 注意
1. 全部是 Gate 公開唯讀端點，永不需要、也永不帶金鑰。
2. 回傳常是「陣列」，請只取需要的前幾筆作答，不要把整包倒給使用者。
3. 數字欄位多為字串，計算時轉成 float。
