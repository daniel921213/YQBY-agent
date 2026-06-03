import hashlib


def clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, float(value)))


def symbol_direction_bias(symbol: str) -> int:
    """Deterministic per-symbol bullish (+1) / bearish (-1) lean for mock data.

    Shared by the binance and coinglass mocks so a given symbol's synthetic
    price action and derivatives metrics point the same way, producing a
    realistic mix of long and short setups across the scanned universe.
    """
    digest = hashlib.sha256(f"bias:{symbol.upper()}".encode()).digest()
    return 1 if digest[0] % 2 == 0 else -1


def pct_change(start: float, end: float) -> float:
    if abs(start) < 1e-12:
        return 0.0
    return (end - start) / abs(start)

