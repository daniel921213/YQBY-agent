"""Validate the LIVE score (default weights, live universe) — does score>=80 rise?

Fixes two flaws in the earlier sweep:
  1. Uses the SAME weights the dashboard uses (scoring/weights.DEFAULT_WEIGHTS),
     not the calibrated set.
  2. Uses the live top-N-by-volume universe, which includes the small/volatile
     coins that actually reach 80 (the majors rarely do).

Weights are fixed (not fitted here), so every bar is effectively out-of-sample
and we evaluate the whole window for maximum samples.

    set DATA_PROVIDER=binance
    python -m scripts.validate80 --top 60 --days 30
"""

from __future__ import annotations

import argparse
import sys

import numpy as np

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from app.data_sources.binance_history import fetch_history_frame
from app.scoring.weights import DEFAULT_WEIGHTS
from app.services.market_data_service import MarketDataService
from scripts.walkforward import WARMUP, composite, factor_signals

HORIZONS = {"1h": 4, "2h": 8, "4h": 16, "12h": 48, "24h": 96}
FEE = 0.10

# Live dashboard weights, mapped to the factor keys used by composite().
LIVE_WEIGHTS = {
    "cvd": DEFAULT_WEIGHTS.cvd_divergence,
    "oi": DEFAULT_WEIGHTS.open_interest_relation,
    "momentum": DEFAULT_WEIGHTS.momentum,
    "funding": DEFAULT_WEIGHTS.funding_extreme,
    "participant": DEFAULT_WEIGHTS.participant_contrast,
    "relative_strength": DEFAULT_WEIGHTS.relative_strength,
}


def collect(symbols, days):
    obs = []
    closes: dict[str, np.ndarray] = {}
    btc = fetch_history_frame("BTCUSDT", "15m", days)
    btc_ts = btc["timestamp"].to_numpy()
    for symbol in symbols:
        try:
            prim = fetch_history_frame(symbol, "15m", days)
        except Exception:
            print(f"{symbol}: skipped (no/short history)")
            continue
        if prim.empty or len(prim) < WARMUP + 100:
            print(f"{symbol}: skipped (too short)")
            continue
        prim_ts = prim["timestamp"].to_numpy()
        closes[symbol] = prim["close"].to_numpy()
        for t in range(WARMUP, len(prim)):
            btc_slice = btc.iloc[: int(np.searchsorted(btc_ts, prim_ts[t], side="right"))]
            if len(btc_slice) < 100:
                continue
            obs.append((symbol, t, composite(factor_signals(prim.iloc[: t + 1], btc_slice),
                                             LIVE_WEIGHTS)))
    return obs, closes


def evaluate(obs, closes, horizon, threshold, side):
    rows = []
    base = {}
    for s, arr in closes.items():
        rets = arr[horizon:] / arr[:-horizon] - 1.0
        base[s] = float(rets[WARMUP:].mean()) if len(rets) > WARMUP else 0.0
    for symbol, bar, (direction, score) in obs:
        if score < threshold or direction != side:
            continue
        arr = closes[symbol]
        if bar + horizon >= len(arr):
            continue
        fwd = arr[bar + horizon] / arr[bar] - 1.0
        rows.append((symbol, bar, direction, fwd, base[symbol]))
    # dedup overlapping
    picked = []
    by_sym: dict[str, list] = {}
    for r in rows:
        by_sym.setdefault(r[0], []).append(r)
    for items in by_sym.values():
        last = -10**9
        for r in sorted(items, key=lambda x: x[1]):
            if r[1] - last >= horizon:
                picked.append(r)
                last = r[1]
    if not picked:
        return 0, None, None
    signed = np.array([r[3] * (1 if r[2] == "LONG" else -1) for r in picked])
    basearr = np.array([r[4] * (1 if r[2] == "LONG" else -1) for r in picked])
    hit = float((signed > 0).mean()) * 100
    net = float((signed - basearr).mean()) * 100 - FEE
    return len(picked), hit, net


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--top", type=int, default=60, help="top-N by volume (live universe)")
    parser.add_argument("--days", type=int, default=30)
    args = parser.parse_args()

    universe = MarketDataService().list_symbols()[: args.top]
    print(f"universe: top {len(universe)} by volume (live), e.g. {universe[:6]}")
    obs, closes = collect(universe, args.days)
    n80 = sum(1 for _s, _b, (_d, sc) in obs if sc >= 80)
    print(f"\ncollected {len(obs)} signal points across {len(closes)} symbols; "
          f"{n80} raw points had score>=80\n")

    print(f"LIVE weights, all-window (fee={FEE}%). hit% = went the predicted way.")
    print(f"{'horizon':>8}{'thr':>5}{'side':>6}{'trades':>8}{'hit%':>8}{'net%':>9}")
    print("-" * 44)
    for name, h in HORIZONS.items():
        for thr in (60, 80):
            for side in ("LONG", "SHORT"):
                n, hit, net = evaluate(obs, closes, h, thr, side)
                hit_s = f"{hit:.1f}" if hit is not None else "-"
                net_s = f"{net:+.3f}" if net is not None else "-"
                print(f"{name:>8}{thr:>5}{side:>6}{n:>8}{hit_s:>8}{net_s:>9}")
        print()


if __name__ == "__main__":
    main()
