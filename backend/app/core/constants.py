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

# Non-recommended setups still surface as a "數據異常" if at least this many
# pillars agree. Recommendations use condition gates, not a score threshold.
# Anomalies are capped to keep the payload sane.
ANOMALY_MIN_CONFLUENCE = 2
ANOMALY_CAP = 45
