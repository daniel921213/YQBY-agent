"""Walk-forward calibration + out-of-sample validation of the 5-pillar model.

Procedure:
  1. Replay every factor on every bar (cheap signals stored once).
  2. Split bars by time: first 65% = TRAIN, last 35% = TEST.
  3. TRAIN: measure each factor's drift-adjusted edge, derive weights from it
     (shrunk 50/50 toward the current priors to avoid overfitting one window).
  4. TEST (out-of-sample): score every bar with the derived weights + confluence,
     evaluate score thresholds, deduped and net of fees. Also score the TEST set
     with the CURRENT weights for a head-to-head.

The TEST table is the honest answer: does the model predict on data it was never
tuned on, and do the calibrated weights beat the current ones out-of-sample?

    set DATA_PROVIDER=binance
    python -m scripts.walkforward --days 30 --horizon 8
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass

# Avoid cp950 console crashes on non-ASCII output (pillar names, symbols like ≈).
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

import numpy as np

from app.data_sources.binance_history import fetch_history_frame
from app.indicators.divergence import detect_price_cvd_divergence
from app.indicators.funding_rate import analyze_funding_rate_extreme
from app.indicators.long_short_ratio import analyze_participant_contrast
from app.indicators.momentum import analyze_momentum
from app.indicators.open_interest import analyze_open_interest_price_relation
from app.indicators.relative_strength import analyze_relative_strength
from app.scoring.weights import CONFLUENCE_MULTIPLIER, CONFLUENCE_STRENGTH_THRESHOLD
from app.utils.numeric import clamp

WARMUP = 120
THRESHOLDS = [0, 30, 40, 50, 60]

# factor -> pillar, and the current prior weights (from scoring/weights.py).
PILLAR_OF = {
    "cvd": "結構", "oi": "結構", "momentum": "動能",
    "funding": "資金", "participant": "多空", "relative_strength": "相對",
}
PRIOR = {
    "cvd": 14.0, "oi": 14.0, "momentum": 20.0,
    "funding": 10.0, "participant": 12.0, "relative_strength": 30.0,
}
FACTORS = list(PRIOR)


@dataclass
class Obs:
    symbol: str
    bar: int
    signals: dict[str, tuple[str, float]]  # factor -> (direction, strength)
    fwd: float
    baseline: float


def factor_signals(primary, btc) -> dict[str, tuple[str, float]]:
    div = detect_price_cvd_divergence(primary, lookback=96)
    cvd_dir = {"bullish": "LONG", "bearish": "SHORT"}.get(div.kind, "NEUTRAL")
    oi = analyze_open_interest_price_relation(primary, lookback=48)
    mom = analyze_momentum(primary, bars_short=4, bars_long=16)
    fund = analyze_funding_rate_extreme(primary, lookback=96)
    part = analyze_participant_contrast(primary, lookback=36)
    rs = analyze_relative_strength(primary, btc, bars_short=16, bars_long=96)
    return {
        "cvd": (cvd_dir, div.strength),
        "oi": (oi.direction, oi.strength),
        "momentum": (mom.direction, mom.strength),
        "funding": (fund.direction, fund.strength),
        "participant": (part.direction, part.strength),
        "relative_strength": (rs.direction, rs.strength),
    }


def collect(symbols: list[str], days: int, horizon: int) -> list[Obs]:
    obs: list[Obs] = []
    btc = fetch_history_frame("BTCUSDT", "15m", days)
    btc_ts = btc["timestamp"].to_numpy()
    for symbol in symbols:
        try:
            prim = fetch_history_frame(symbol, "15m", days)
        except Exception as exc:
            print(f"{symbol}: fetch failed ({type(exc).__name__}), skipped")
            continue
        if prim.empty or btc.empty or len(prim) < WARMUP + horizon + 20:
            print(f"{symbol}: skipped")
            continue
        prim_ts = prim["timestamp"].to_numpy()
        closes = prim["close"].to_numpy()
        last = len(prim) - horizon
        fwd = np.array([closes[t + horizon] / closes[t] - 1.0 for t in range(WARMUP, last)])
        baseline = float(fwd.mean()) if len(fwd) else 0.0
        for idx, t in enumerate(range(WARMUP, last)):
            btc_slice = btc.iloc[: int(np.searchsorted(btc_ts, prim_ts[t], side="right"))]
            if len(btc_slice) < 100:
                continue
            obs.append(Obs(symbol, t, factor_signals(prim.iloc[: t + 1], btc_slice),
                           float(fwd[idx]), baseline))
        print(f"{symbol}: {len(prim)} bars collected")
    return obs


def factor_edges(train: list[Obs]) -> dict[str, float]:
    """Drift-adjusted excess return (%) when each factor fires, signed by its call."""
    edges: dict[str, float] = {}
    for f in FACTORS:
        ex: list[float] = []
        for o in train:
            direction, strength = o.signals[f]
            if direction == "NEUTRAL" or strength < 0.25:
                continue
            sign = 1.0 if direction == "LONG" else -1.0
            ex.append((o.fwd - o.baseline) * sign)
        edges[f] = float(np.mean(ex)) * 100 if ex else 0.0
    return edges


def derive_weights(edges: dict[str, float]) -> dict[str, float]:
    pos = {f: max(edges[f], 0.0) for f in FACTORS}
    total = sum(pos.values())
    evidence = {f: (pos[f] / total * 100 if total > 0 else PRIOR[f]) for f in FACTORS}
    # 50/50 shrink toward priors so one window can't fully rewrite the model.
    return {f: round(0.5 * PRIOR[f] + 0.5 * evidence[f], 1) for f in FACTORS}


def composite(signals: dict[str, tuple[str, float]], weights: dict[str, float]) -> tuple[str, float]:
    long = short = 0.0
    lp: set[str] = set()
    sp: set[str] = set()
    for f, (direction, strength) in signals.items():
        contrib = weights[f] * clamp(strength, 0.0, 1.0)
        if direction == "LONG":
            long += contrib
            if strength >= CONFLUENCE_STRENGTH_THRESHOLD:
                lp.add(PILLAR_OF[f])
        elif direction == "SHORT":
            short += contrib
            if strength >= CONFLUENCE_STRENGTH_THRESHOLD:
                sp.add(PILLAR_OF[f])
    fl = clamp(long * CONFLUENCE_MULTIPLIER[min(len(lp), 5)], 0.0, 100.0)
    fs = clamp(short * CONFLUENCE_MULTIPLIER[min(len(sp), 5)], 0.0, 100.0)
    return ("LONG", fl) if fl >= fs else ("SHORT", fs)


@dataclass
class Scored:
    symbol: str
    bar: int
    score: float
    direction: str
    fwd: float
    baseline: float


def _non_overlapping(rows: list[Scored], horizon: int) -> list[Scored]:
    picked: list[Scored] = []
    by_symbol: dict[str, list[Scored]] = {}
    for r in rows:
        by_symbol.setdefault(r.symbol, []).append(r)
    for items in by_symbol.values():
        last = -10**9
        for r in sorted(items, key=lambda x: x.bar):
            if r.bar - last >= horizon:
                picked.append(r)
                last = r.bar
    return picked


def evaluate(test: list[Obs], weights: dict[str, float], horizon: int, fee: float, label: str) -> None:
    scored = []
    for o in test:
        direction, score = composite(o.signals, weights)
        scored.append(Scored(o.symbol, o.bar, score, direction, o.fwd, o.baseline))

    print(f"\n[{label}]  out-of-sample (test set), fee={fee:.2f}%")
    print(f"{'score>=':>8}{'trades':>8}{'hit%':>7}{'excess%':>9}{'net%':>8}")
    print("-" * 40)
    for thr in THRESHOLDS:
        group = _non_overlapping([s for s in scored if s.score >= thr], horizon)
        n = len(group)
        if n == 0:
            print(f"{thr:>8}{0:>8}{'-':>7}{'-':>9}{'-':>8}")
            continue
        signed = np.array([s.fwd * (1 if s.direction == "LONG" else -1) for s in group])
        base = np.array([s.baseline * (1 if s.direction == "LONG" else -1) for s in group])
        hit = float((signed > 0).mean()) * 100
        excess = float((signed - base).mean()) * 100
        print(f"{thr:>8}{n:>8}{hit:>7.1f}{excess:>9.3f}{excess - fee:>8.3f}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("symbols", nargs="*", default=[
        "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT",
        "LINKUSDT", "AVAXUSDT", "TONUSDT", "SUIUSDT", "OPUSDT", "ARBUSDT", "APTUSDT",
        "LTCUSDT", "NEARUSDT", "INJUSDT", "TIAUSDT", "SEIUSDT", "DOTUSDT",
        "FILUSDT", "ATOMUSDT", "UNIUSDT", "AAVEUSDT", "RUNEUSDT", "ENAUSDT",
        "WIFUSDT", "ORDIUSDT", "GALAUSDT", "WLDUSDT",
    ])
    parser.add_argument("--days", type=int, default=30)
    parser.add_argument("--horizon", type=int, default=8)
    parser.add_argument("--fee", type=float, default=0.10)
    parser.add_argument("--split", type=float, default=0.65)
    args = parser.parse_args()

    obs = collect(args.symbols, args.days, args.horizon)
    if not obs:
        print("no observations")
        return

    # Split by time (global bar index proxy: use per-symbol bar position quantile).
    max_bar = max(o.bar for o in obs)
    cut = WARMUP + (max_bar - WARMUP) * args.split
    train = [o for o in obs if o.bar <= cut]
    test = [o for o in obs if o.bar > cut]
    print(f"\nobservations: {len(obs)}  train={len(train)}  test={len(test)}  cut@bar≈{cut:.0f}")

    edges = factor_edges(train)
    weights = derive_weights(edges)
    print("\nfactor (train edge% → derived weight, prior):")
    for f in FACTORS:
        print(f"  {f:18} edge={edges[f]:+.3f}  weight={weights[f]:>5}  (prior {PRIOR[f]})")

    evaluate(test, PRIOR, args.horizon, args.fee, "CURRENT weights")
    evaluate(test, weights, args.horizon, args.fee, "CALIBRATED weights")


if __name__ == "__main__":
    main()
