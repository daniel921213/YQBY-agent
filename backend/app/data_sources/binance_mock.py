from datetime import UTC, datetime
import hashlib

import numpy as np
import pandas as pd

from app.data_sources.base import MarketDataSource
from app.utils.numeric import symbol_direction_bias
from app.utils.timeframes import timeframe_to_seconds


# A synthetic stand-in for the live USDT-perpetual universe. The real Binance
# source will replace this by calling GET /fapi/v1/exchangeInfo at runtime.
_MOCK_UNIVERSE_BASES = (
    "BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "AVAX", "LINK", "TON",
    "SUI", "OP", "ARB", "APT", "MATIC", "DOT", "LTC", "BCH", "NEAR", "ATOM",
    "FIL", "ICP", "INJ", "TIA", "SEI", "RUNE", "AAVE", "MKR", "LDO", "UNI",
    "ETC", "XLM", "ALGO", "FTM", "SAND", "MANA", "AXS", "GALA", "CHZ", "GRT",
    "SNX", "CRV", "DYDX", "1INCH", "COMP", "ENS", "IMX", "STX", "RNDR", "FET",
    "AGIX", "OCEAN", "WLD", "PEPE", "SHIB", "FLOKI", "BONK", "WIF", "ORDI", "JUP",
    "PYTH", "JTO", "STRK", "ENA", "W", "ETHFI", "ZRO", "BLUR", "GMX", "PENDLE",
    "CAKE", "TWT", "ROSE", "KAVA", "ZIL", "ONE", "HBAR", "VET", "EGLD", "THETA",
    "FLOW", "CFX", "KSM", "MINA", "GMT", "APE", "DASH", "ZEC", "XMR", "EOS",
)


class BinanceMockDataSource(MarketDataSource):
    """Deterministic synthetic OHLCV with buy/sell volume split."""

    def list_symbols(self) -> list[str]:
        return [f"{base}USDT" for base in _MOCK_UNIVERSE_BASES]

    def get_klines(self, symbol: str, timeframe: str, limit: int) -> pd.DataFrame:
        step = timeframe_to_seconds(timeframe)
        now = int(datetime.now(tz=UTC).timestamp())
        aligned_now = now - (now % step)
        timestamps = np.arange(aligned_now - step * (limit - 1), aligned_now + step, step)

        seed = int.from_bytes(
            hashlib.sha256(f"binance:{symbol}:{timeframe}".encode()).digest()[:8],
            "big",
        ) % (2**32)
        rng = np.random.default_rng(seed)

        bias = symbol_direction_bias(symbol)

        base_price = 64_000 if symbol.startswith("BTC") else 3_200
        trend = np.linspace(-0.018, 0.012, limit) * bias
        cycle = np.sin(np.linspace(0, 5.4 * np.pi, limit)) * 0.018
        noise = rng.normal(0, 0.0045, limit).cumsum()
        close = base_price * (1 + trend + cycle + noise)

        open_ = np.r_[close[0], close[:-1]]
        spread = np.abs(rng.normal(0.0025, 0.0012, limit))
        high = np.maximum(open_, close) * (1 + spread)
        low = np.minimum(open_, close) * (1 - spread)

        volume_base = 1_800 if symbol.startswith("BTC") else 12_000
        volume = volume_base * (1 + np.abs(rng.normal(0, 0.35, limit)))

        returns = np.r_[0, np.diff(close) / close[:-1]]
        taker_buy_ratio = np.clip(0.5 + returns * 18 + rng.normal(0, 0.08, limit), 0.08, 0.92)

        if limit > 80:
            # Force a recent hidden accumulation (bullish) or distribution (bearish)
            # pattern, per the symbol's lean, so the demo has useful CVD evidence
            # in both directions.
            taker_buy_ratio[-36:-12] = np.clip(taker_buy_ratio[-36:-12] + 0.1 * bias, 0.08, 0.92)
            taker_buy_ratio[-12:] = np.clip(taker_buy_ratio[-12:] + 0.18 * bias, 0.08, 0.92)

        buy_volume = volume * taker_buy_ratio
        sell_volume = volume - buy_volume

        return pd.DataFrame(
            {
                "timestamp": timestamps.astype("int64"),
                "open": open_.astype(float),
                "high": high.astype(float),
                "low": low.astype(float),
                "close": close.astype(float),
                "volume": volume.astype(float),
                "buy_volume": buy_volume.astype(float),
                "sell_volume": sell_volume.astype(float),
            }
        )
