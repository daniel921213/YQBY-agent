"""The two dashboards: 主控台-加密 (crypto) and 主控台-外匯版 (TradFi).

Both scan Binance USDT perpetuals that Bitget also lists; they differ in the
contract family, the relative-strength benchmark and a few labels.
"""

from __future__ import annotations

from typing import Literal

Market = Literal["crypto", "tradfi"]
MARKETS: tuple[Market, ...] = ("crypto", "tradfi")

# Relative strength and the breadth gauge compare every symbol with this one.
BENCHMARK_SYMBOL: dict[Market, str] = {"crypto": "BTCUSDT", "tradfi": "SPYUSDT"}
BENCHMARK_LABEL: dict[Market, str] = {"crypto": "BTC", "tradfi": "SPY"}

# Binance exchangeInfo `underlyingType` values that belong on the TradFi
# dashboard. PREMARKET (pre-IPO) contracts have no underlying session.
TRADFI_UNDERLYING_TYPES = frozenset(
    {"COMMODITY", "EQUITY", "HK_EQUITY", "KR_EQUITY", "CN_EQUITY", "FX"}
)

# Display names for the TradFi asset classes.
ASSET_CLASS_LABEL = {
    "COMMODITY": "商品",
    "EQUITY": "美股",
    "HK_EQUITY": "港股",
    "KR_EQUITY": "韓股",
    "CN_EQUITY": "陸股",
    "FX": "外匯",
}


def parse_market(value: str | None) -> Market:
    """Query-string market -> Market (unknown values fall back to crypto)."""

    return "tradfi" if (value or "").strip().lower() == "tradfi" else "crypto"
