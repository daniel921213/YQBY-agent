from abc import ABC, abstractmethod

import pandas as pd


class MarketDataSource(ABC):
    @abstractmethod
    def get_klines(self, symbol: str, timeframe: str, limit: int) -> pd.DataFrame:
        raise NotImplementedError

    @abstractmethod
    def list_symbols(self) -> list[str]:
        """Return the full tradable symbol universe.

        The mock returns a synthetic set; the real Binance implementation will
        call ``GET /fapi/v1/exchangeInfo`` and keep only actively trading USDT
        perpetuals.
        """
        raise NotImplementedError


class DerivativesDataSource(ABC):
    @abstractmethod
    def get_derivatives_metrics(self, symbol: str, timeframe: str, limit: int) -> pd.DataFrame:
        raise NotImplementedError

    def get_ratio_history(self, symbol: str, hours: int) -> pd.DataFrame:
        """Optional closed-1h long/short ratio history for crowding baselines.

        Columns: ``timestamp`` (hour open), ``account_long_short_ratio``,
        ``top_trader_long_short_ratio``. Providers without it return an empty
        frame and crowding falls back to the analysed frame's own history.
        """
        return pd.DataFrame()

