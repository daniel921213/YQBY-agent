"""Drift-adjusted per-indicator predictiveness backtest on real Binance data.

For each primary-timeframe bar we replay every indicator on the data available
up to that bar, then measure the forward return `horizon` bars later. Crucially
we also subtract each symbol's *baseline* forward return over the window, so a
signal is only credited with edge if it beats simply holding through the same
drift. This separates indicator alpha from market beta.

Run:
    set DATA_PROVIDER=binance
    python -m scripts.backtest                          # 30 days, 8-bar horizon
    python -m scripts.backtest BTCUSDT ETHUSDT --days 30 --horizon 8

Columns:
    hit%    raw direction accuracy (sign match)
    ret%    mean forward return in the signal's favour
    excess% ret% minus baseline drift  <-- the honest edge
    beat%   how often the signal beat just holding through the drift
"""

from __future__ import annotations

import argparse
from collections import defaultdict
from dataclasses import dataclass

import numpy as np
import pandas as pd

from app.core.constants import PRIMARY_TIMEFRAME
from app.data_sources.binance_history import fetch_history_frame
from app.indicators.divergence import detect_price_cvd_divergence
from app.indicators.funding_rate import analyze_funding_rate_extreme
from app.indicators.long_short_ratio import analyze_participant_contrast
from app.indicators.open_interest import analyze_open_interest_price_relation

WARMUP = 120  # bars of history each indicator needs before it is meaningful


@dataclass
class Sample:
    direction: str  # "LONG" | "SHORT"
    strength: float
    forward_return: float
    baseline: float  # symbol's mean forward return over the window


def _signals_at(frame: pd.DataFrame) -> dict[str, tuple[str, float]]:
    div = detect_price_cvd_divergence(frame, lookback=96)
    div_dir = {"bullish": "LONG", "bearish": "SHORT"}.get(div.kind, "NEUTRAL")
    oi = analyze_open_interest_price_relation(frame, lookback=48)
    ratio = analyze_participant_contrast(frame, lookback=36)
    funding = analyze_funding_rate_extreme(frame, lookback=96)
    return {
        "cvd_divergence": (div_dir, div.strength),
        "open_interest": (oi.direction, oi.strength),
        "participant_ratio": (ratio.direction, ratio.strength),
        "funding_extreme": (funding.direction, funding.strength),
    }


def backtest_symbol(
    frame: pd.DataFrame, horizon: int, samples: dict[str, list[Sample]]
) -> float:
    closes = frame["close"].to_numpy()
    n = len(frame)
    last = n - horizon
    fwd = np.array([closes[t + horizon] / closes[t] - 1.0 for t in range(WARMUP, last)])
    baseline = float(fwd.mean()) if len(fwd) else 0.0

    for idx, t in enumerate(range(WARMUP, last)):
        forward_return = float(fwd[idx])
        sliced = frame.iloc[: t + 1]
        for indicator, (direction, strength) in _signals_at(sliced).items():
            if direction == "NEUTRAL":
                continue
            samples[indicator].append(Sample(direction, strength, forward_return, baseline))
    return baseline


def report(samples: dict[str, list[Sample]], horizon: int) -> dict[str, float]:
    print(f"\nForward horizon = {horizon} bars ({PRIMARY_TIMEFRAME})")
    header = f"{'indicator':<20}{'dir':<6}{'n':>6}{'hit%':>7}{'ret%':>9}{'excess%':>10}{'beat%':>8}"
    print(header)
    print("-" * len(header))

    edges: dict[str, float] = {}
    for indicator in sorted(samples):
        rows = samples[indicator]
        for direction in ("LONG", "SHORT"):
            group = [s for s in rows if s.direction == direction]
            if not group:
                continue
            n = len(group)
            sign = 1.0 if direction == "LONG" else -1.0
            hit = sum(1 for s in group if (s.forward_return * sign) > 0) / n * 100
            ret = sum(s.forward_return for s in group) / n * sign * 100
            excess = sum((s.forward_return - s.baseline) for s in group) / n * sign * 100
            beat = sum(1 for s in group if (s.forward_return - s.baseline) * sign > 0) / n * 100
            print(f"{indicator:<20}{direction:<6}{n:>6}{hit:>7.1f}{ret:>9.3f}{excess:>10.3f}{beat:>8.1f}")
            edges[f"{indicator}:{direction}"] = excess
    return edges


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "symbols",
        nargs="*",
        default=["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "LINKUSDT"],
    )
    parser.add_argument("--days", type=int, default=30, help="history window in days")
    parser.add_argument("--horizon", type=int, default=8, help="forward bars")
    args = parser.parse_args()

    samples: dict[str, list[Sample]] = defaultdict(list)
    for symbol in args.symbols:
        frame = fetch_history_frame(symbol, PRIMARY_TIMEFRAME, args.days)
        if frame.empty or len(frame) < WARMUP + args.horizon + 10:
            print(f"{symbol}: insufficient history, skipped")
            continue
        baseline = backtest_symbol(frame, args.horizon, samples)
        print(f"{symbol}: {len(frame)} bars, baseline drift={baseline * 100:+.3f}% / {args.horizon} bars")

    report(samples, args.horizon)


if __name__ == "__main__":
    main()
