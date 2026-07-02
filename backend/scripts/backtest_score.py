"""Composite-score threshold backtest: 'only trade when total score > N'.

Replays the FULL scoring engine on every primary bar (using sliced 15m/5m/1h
history up to that bar), then asks: if you only opened a trade in the
recommended direction when score >= threshold, how did it do? Reported per
threshold, drift-adjusted, and net of a round-trip fee.

Run:
    set DATA_PROVIDER=binance
    python -m scripts.backtest_score --days 30 --horizon 8 --fee 0.10
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass

import numpy as np

from app.data_sources.binance_history import fetch_history_frame
from app.scoring.engine import ScoringEngine

WARMUP = 120        # 15m bars before testing (relative-strength needs ~96/24h of history)
THRESHOLDS = [0, 40, 50, 55, 60, 70]


@dataclass
class Trade:
    symbol: str
    bar: int
    score: float
    direction: str
    forward_return: float
    baseline: float


def collect(symbols: list[str], days: int, horizon: int) -> list[Trade]:
    engine = ScoringEngine()
    trades: list[Trade] = []

    # BTC is the relative-strength benchmark, fetched once and sliced per bar.
    btc = fetch_history_frame("BTCUSDT", "15m", days)
    btc_ts = btc["timestamp"].to_numpy()

    for symbol in symbols:
        prim = fetch_history_frame(symbol, "15m", days)
        if prim.empty or btc.empty or len(prim) < WARMUP + horizon + 10:
            print(f"{symbol}: insufficient history, skipped")
            continue

        prim_ts = prim["timestamp"].to_numpy()
        closes = prim["close"].to_numpy()

        last = len(prim) - horizon
        fwd = np.array([closes[t + horizon] / closes[t] - 1.0 for t in range(WARMUP, last)])
        baseline = float(fwd.mean()) if len(fwd) else 0.0

        count = 0
        for idx, t in enumerate(range(WARMUP, last)):
            btc_slice = btc.iloc[: int(np.searchsorted(btc_ts, prim_ts[t], side="right"))]
            if len(btc_slice) < 100:
                continue
            rec, _, _ = engine.score(
                symbol=symbol,
                primary=prim.iloc[: t + 1],
                btc=btc_slice,
                primary_timeframe="15m",
            )
            trades.append(Trade(symbol, t, rec.score, rec.direction, float(fwd[idx]), baseline))
            count += 1
        print(f"{symbol}: {len(prim)} bars, {count} scored points, baseline={baseline * 100:+.3f}%")

    return trades


def _non_overlapping(group: list[Trade], horizon: int) -> list[Trade]:
    """Greedily drop trades within `horizon` bars of the previous one per symbol,
    so overlapping/autocorrelated signals count as a single independent bet."""
    picked: list[Trade] = []
    by_symbol: dict[str, list[Trade]] = {}
    for t in group:
        by_symbol.setdefault(t.symbol, []).append(t)
    for rows in by_symbol.values():
        last_bar = -10**9
        for t in sorted(rows, key=lambda x: x.bar):
            if t.bar - last_bar >= horizon:
                picked.append(t)
                last_bar = t.bar
    return picked


def report(trades: list[Trade], horizon: int, fee_pct: float) -> None:
    total = len(trades)
    print(f"\nTotal scored points: {total}   horizon={horizon} bars   round-trip fee={fee_pct:.2f}%")
    print("(trades = independent, non-overlapping bets after cooldown dedup)")
    header = (
        f"{'score>=':>8}{'trades':>8}{'hit%':>7}"
        f"{'excess%':>9}{'net%':>8}{'beat%':>7}"
    )
    print(header)
    print("-" * len(header))

    for thr in THRESHOLDS:
        group = _non_overlapping([t for t in trades if t.score >= thr], horizon)
        n = len(group)
        if n == 0:
            print(f"{thr:>8}{0:>8}{'-':>7}{'-':>9}{'-':>8}{'-':>7}")
            continue
        signed = np.array(
            [t.forward_return * (1 if t.direction == "LONG" else -1) for t in group]
        )
        base = np.array(
            [t.baseline * (1 if t.direction == "LONG" else -1) for t in group]
        )
        hit = float((signed > 0).mean()) * 100
        excess = float((signed - base).mean()) * 100
        net = excess - fee_pct  # subtract round-trip cost from the per-trade edge
        beat = float(((signed - base) > 0).mean()) * 100
        print(f"{thr:>8}{n:>8}{hit:>7.1f}{excess:>9.3f}{net:>8.3f}{beat:>7.1f}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "symbols",
        nargs="*",
        default=[
            "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT",
            "LINKUSDT", "AVAXUSDT", "TONUSDT", "SUIUSDT", "OPUSDT", "ARBUSDT", "APTUSDT",
            "LTCUSDT", "NEARUSDT", "INJUSDT", "TIAUSDT", "SEIUSDT", "DOTUSDT",
        ],
    )
    parser.add_argument("--days", type=int, default=30)
    parser.add_argument("--horizon", type=int, default=8)
    parser.add_argument("--fee", type=float, default=0.10, help="round-trip fee+slippage %")
    args = parser.parse_args()

    trades = collect(args.symbols, args.days, args.horizon)
    report(trades, args.horizon, args.fee)


if __name__ == "__main__":
    main()
