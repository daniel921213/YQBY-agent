from datetime import UTC, datetime
import hashlib

import numpy as np
import pandas as pd

from app.data_sources.base import DerivativesDataSource
from app.utils.numeric import symbol_direction_bias
from app.utils.timeframes import timeframe_to_seconds


class CoinglassMockDataSource(DerivativesDataSource):
    """Deterministic synthetic derivatives metrics shaped like Coinglass data."""

    def get_derivatives_metrics(self, symbol: str, timeframe: str, limit: int) -> pd.DataFrame:
        step = timeframe_to_seconds(timeframe)
        now = int(datetime.now(tz=UTC).timestamp())
        aligned_now = now - (now % step)
        timestamps = np.arange(aligned_now - step * (limit - 1), aligned_now + step, step)

        seed = int.from_bytes(
            hashlib.sha256(f"coinglass:{symbol}:{timeframe}".encode()).digest()[:8],
            "big",
        ) % (2**32)
        rng = np.random.default_rng(seed)

        bias = symbol_direction_bias(symbol)

        oi_base = 14_000_000_000 if symbol.startswith("BTC") else 5_000_000_000
        oi_cycle = np.sin(np.linspace(0, 3.2 * np.pi, limit)) * 0.08
        oi_noise = rng.normal(0, 0.008, limit).cumsum()
        open_interest = oi_base * (1 + oi_cycle + oi_noise)

        top_trader_ratio = 1.08 + np.sin(np.linspace(0.4, 3.6 * np.pi, limit)) * 0.18
        top_trader_ratio += rng.normal(0, 0.035, limit)

        account_ratio = 0.98 + np.cos(np.linspace(0.2, 3.4 * np.pi, limit)) * 0.2
        account_ratio += rng.normal(0, 0.05, limit)

        funding_rate = 0.00008 + np.sin(np.linspace(0, 4 * np.pi, limit)) * 0.00028
        funding_rate += rng.normal(0, 0.000045, limit)

        if limit > 60:
            # Recent setup aligned with the symbol's lean: for a bullish lean, top
            # traders accumulate, retail leans short, funding softens; the bearish
            # lean mirrors it. Keeps derivatives evidence consistent with price.
            top_trader_ratio[-24:] += 0.12 * bias
            account_ratio[-24:] -= 0.14 * bias
            funding_rate[-18:] -= 0.00022 * bias

        return pd.DataFrame(
            {
                "timestamp": timestamps.astype("int64"),
                "open_interest": open_interest.astype(float),
                "top_trader_long_short_ratio": np.clip(top_trader_ratio, 0.45, 2.2),
                "account_long_short_ratio": np.clip(account_ratio, 0.35, 2.5),
                "funding_rate": funding_rate.astype(float),
            }
        )
