"""Causal Gate walk-forward validation using the dashboard's production path.

No weight fitting occurs here. Every score is calculated from a prefix ending
at that closed 15-minute bar; forward prices are read only after scoring. This
keeps the validation useful as a release gate for the live algorithm.

Run from ``backend``::

    python -m scripts.gate_walkforward --top 8 --bars 1200
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass

import numpy as np
import pandas as pd

from app.core.config import get_settings
from app.scoring.engine import ScoringEngine
from app.services.market_data_service import MarketDataService

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

TIMEFRAME = "15m"
WARMUP = 120
HORIZONS = {"1h": 4, "4h": 16, "12h": 48, "24h": 96}
THRESHOLDS = (40.0, 60.0, 80.0)


@dataclass(frozen=True)
class Observation:
    symbol: str
    bar: int
    timestamp: int
    direction: str
    score: float
    forward_returns: dict[str, float]


def _real_flow_coverage(frame: pd.DataFrame) -> float:
    if frame.empty:
        return 0.0
    if "flow_quality" in frame.columns:
        return float(frame["flow_quality"].astype(str).str.upper().eq("REAL").mean())
    return 1.0 if {"buy_volume", "sell_volume"}.issubset(frame.columns) else 0.0


def collect(
    service: MarketDataService,
    symbols: list[str],
    bars: int,
) -> tuple[list[Observation], dict[str, tuple[int, float, float]]]:
    engine = ScoringEngine()
    observations: list[Observation] = []
    quality: dict[str, tuple[int, float, float]] = {}

    btc = service.get_enriched_market_frame(
        "BTCUSDT", TIMEFRAME, bars, with_derivatives=False
    )
    btc_times = btc["timestamp"].to_numpy(dtype=np.int64)

    for symbol in symbols:
        try:
            primary = service.get_enriched_market_frame(symbol, TIMEFRAME, bars)
        except Exception as exc:
            print(f"{symbol}: fetch failed ({type(exc).__name__}: {exc})")
            continue

        max_horizon = max(HORIZONS.values())
        if len(primary) < WARMUP + max_horizon + 10:
            print(f"{symbol}: only {len(primary)} bars, skipped")
            continue

        oi_coverage = (
            float(primary["oi_quality"].eq("REAL").mean())
            if "oi_quality" in primary.columns
            else float(primary["open_interest"].notna().mean())
        )
        flow_coverage = _real_flow_coverage(primary)
        quality[symbol] = (len(primary), flow_coverage, oi_coverage)

        closes = primary["close"].to_numpy(dtype=float)
        timestamps = primary["timestamp"].to_numpy(dtype=np.int64)
        start = max(WARMUP, int(len(primary) * 0.65))
        stop = len(primary) - max_horizon
        symbol_count = 0
        for bar in range(start, stop):
            btc_stop = int(np.searchsorted(btc_times, timestamps[bar], side="right"))
            if btc_stop < WARMUP:
                continue
            # Strict prefix slicing is the no-look-ahead boundary.
            recommendation, _, _ = engine.score(
                symbol=symbol,
                primary=primary.iloc[: bar + 1],
                btc=btc.iloc[:btc_stop],
                primary_timeframe=TIMEFRAME,
            )
            forward = {
                name: float(closes[bar + horizon] / closes[bar] - 1.0)
                for name, horizon in HORIZONS.items()
            }
            observations.append(
                Observation(
                    symbol=symbol,
                    bar=bar,
                    timestamp=int(timestamps[bar]),
                    direction=recommendation.direction,
                    score=recommendation.score,
                    forward_returns=forward,
                )
            )
            symbol_count += 1
        print(
            f"{symbol}: {len(primary)} closed bars, {symbol_count} holdout scores, "
            f"real-flow={flow_coverage:.1%}, OI={oi_coverage:.1%}"
        )
    return observations, quality


def _non_overlapping(
    observations: list[Observation], horizon_bars: int
) -> list[Observation]:
    selected: list[Observation] = []
    groups: dict[str, list[Observation]] = {}
    for observation in observations:
        groups.setdefault(observation.symbol, []).append(observation)
    for rows in groups.values():
        previous = -10**9
        for row in sorted(rows, key=lambda value: value.bar):
            if row.bar - previous >= horizon_bars:
                selected.append(row)
                previous = row.bar
    return selected


def report(observations: list[Observation], fee_pct: float) -> None:
    scores = np.array([row.score for row in observations], dtype=float)
    print(
        f"\nHoldout observations: {len(observations)} | "
        f"round-trip fee/slippage: {fee_pct:.2f}%"
    )
    print(
        "Score distribution: "
        f"p50={np.percentile(scores, 50):.1f}, "
        f"p90={np.percentile(scores, 90):.1f}, "
        f"p99={np.percentile(scores, 99):.1f}, "
        f">=80={int((scores >= 80).sum())} raw points"
    )
    high_by_symbol = {
        symbol: sum(1 for row in observations if row.symbol == symbol and row.score >= 80)
        for symbol in sorted({row.symbol for row in observations})
    }
    print(
        "Score>=80 by symbol: "
        + ", ".join(f"{symbol}={count}" for symbol, count in high_by_symbol.items())
    )
    header = f"{'horizon':>8}{'score':>8}{'trades':>9}{'hit%':>8}{'avg%':>9}{'net%':>9}"
    print(header)
    print("-" * len(header))
    for horizon_name, horizon_bars in HORIZONS.items():
        for threshold in THRESHOLDS:
            eligible = [row for row in observations if row.score >= threshold]
            rows = _non_overlapping(eligible, horizon_bars)
            if not rows:
                print(f"{horizon_name:>8}{threshold:>8.0f}{0:>9}{'-':>8}{'-':>9}{'-':>9}")
                continue
            signed = np.array(
                [
                    row.forward_returns[horizon_name]
                    * (1.0 if row.direction == "LONG" else -1.0)
                    for row in rows
                ],
                dtype=float,
            )
            hit = float((signed > 0).mean()) * 100.0
            average = float(signed.mean()) * 100.0
            net = average - fee_pct
            print(
                f"{horizon_name:>8}{threshold:>8.0f}{len(rows):>9}"
                f"{hit:>8.1f}{average:>9.3f}{net:>9.3f}"
            )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("symbols", nargs="*", help="Display symbols such as BTCUSDT")
    parser.add_argument("--top", type=int, default=8, help="Top Gate contracts by 24h quote volume")
    parser.add_argument("--bars", type=int, default=1_200, choices=range(300, 2_001))
    parser.add_argument("--fee", type=float, default=0.10, help="Round-trip fee + slippage in percent")
    args = parser.parse_args()

    settings = get_settings()
    if settings.data_provider.lower() != "gate":
        raise SystemExit("DATA_PROVIDER must be gate for this validation")

    service = MarketDataService()
    symbols = [symbol.upper() for symbol in args.symbols]
    if not symbols:
        symbols = service.list_symbols()[: max(1, args.top)]
    print(f"Gate validation universe ({len(symbols)}): {', '.join(symbols)}")
    observations, quality = collect(service, symbols, args.bars)
    if not observations:
        raise SystemExit("No causal observations were produced")
    if any(flow < 0.90 or oi < 0.90 for _, flow, oi in quality.values()):
        print("WARNING: at least one symbol has <90% real flow/OI coverage")
    report(observations, args.fee)


if __name__ == "__main__":
    main()
