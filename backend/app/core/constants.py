DEFAULT_SYMBOLS = [
    "BTCUSDT",
    "ETHUSDT",
    "SOLUSDT",
    "BNBUSDT",
    "XRPUSDT",
    "DOGEUSDT",
    "ADAUSDT",
    "AVAXUSDT",
    "LINKUSDT",
    "TONUSDT",
    "SUIUSDT",
    "OPUSDT",
]

PRIMARY_TIMEFRAME = "15m"
TRIGGER_TIMEFRAME = "5m"
TREND_TIMEFRAME = "1h"
CONTEXT_TIMEFRAME = "4h"

DEFAULT_LOOKBACK_CANDLES = 200

# Score at/above which an item is a high-conviction "推薦" (rare by design).
RECOMMEND_SCORE = 80.0
# Below the recommend bar, an item still surfaces as a "數據異常" if at least
# this many pillars agree. Anomalies are capped to keep the payload sane.
ANOMALY_MIN_CONFLUENCE = 2
ANOMALY_CAP = 45
