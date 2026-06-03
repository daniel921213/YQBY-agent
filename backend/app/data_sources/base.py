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

