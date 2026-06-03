"""Out-of-sample horizon sweep: does the 5-pillar score predict at ANY horizon?

Signals are replayed once per bar (the expensive step); then for each forward
horizon we compute returns, re-split train/test, re-derive weights, and evaluate
the composite score out-of-sample. This answers whether 2h was just the wrong
window, or the signal has no edge at any horizon.

    set DATA_PROVIDER=binance
    python -m scripts.horizon_sweep --days 30
"""

from __future__ import annotations

import argparse
import sys

import numpy as np

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from app.data_sources.binance_history import fetch_history_frame
from scripts.walkforward import FACTORS, PRIOR, WARMUP, composite, factor_signals

# bars on a 15m frame: 1h, 2h, 4h, 8h, 12h, 24h
HORIZONS = {"1h": 4, "2h": 8, "4h": 16, "8h": 32, "12h": 48, "24h": 96}
SPLIT = 0.65
FEE = 0.10


def collect(symbols, days):
    """Return observations [(symbol, bar, signals)] + closes per symbol."""
    obs = []
    closes: dict[str, np.ndarray] = {}
    btc = fetch_history_frame("BTCUSDT", "15m", days)
    btc_ts = btc["timestamp"].to_numpy()
    for symbol in symbols:
        try:
            prim = fetch_history_frame(symbol, "15m", days)
        except Exception:
            print(f"{symbol}: skipped")
            continue
        if prim.empty or len(prim) < WARMUP + 100:
            continue
        prim_ts = prim["timestamp"].to_numpy()
        closes[symbol] = prim["close"].to_numpy()
        for t in range(WARMUP, len(prim)):
            btc_slice = btc.iloc[: int(np.searchsorted(btc_ts, prim_ts[t], side="right"))]
            if len(btc_slice) < 100:
                continue
            obs.append((symbol, t, factor_signals(prim.iloc[: t + 1], btc_slice)))
        print(f"{symbol}: collected")
    return obs, closes


def _records(obs, closes, horizon):
    """Attach forward return + per-symbol baseline drift for this horizon."""
    base: dict[str, float] = {}
    for s, arr in closes.items():
        rets = arr[horizon:] / arr[:-horizon] - 1.0
        base[s] = float(rets[WARMUP:].mean()) if len(rets) > WARMUP else 0.0
    out = []
    for symbol, bar, sig in obs:
        arr = closes[symbol]
        if bar + horizon >= len(arr):
            continue
        fwd = arr[bar + horizon] / arr[bar] - 1.0
        out.append((symbol, bar, sig, float(fwd), base[symbol]))
    return out


def _edges(train):
    edges = {}
    for f in FACTORS:
        ex = []
        for _s, _b, sig, fwd, base in train:
            d, st = sig[f]
            if d == "NEUTRAL" or st < 0.25:
                continue
            ex.append((fwd - base) * (1 if d == "LONG" else -1))
        edges[f] = float(np.mean(ex)) * 100 if ex else 0.0
    return edges


def _derive(edges):
    pos = {f: max(edges[f], 0.0) for f in FACTORS}
    tot = sum(pos.values())
    ev = {f: (pos[f] / tot * 100 if tot > 0 else PRIOR[f]) for f in FACTORS}
    return {f: 0.5 * PRIOR[f] + 0.5 * ev[f] for f in FACTORS}


def _eval(test, weights, horizon, threshold, side=None):
    scored = []
    for symbol, bar, sig, fwd, base in test:
        direction, score = composite(sig, weights)
        if score >= threshold and (side is None or direction == side):
            scored.append((symbol, bar, direction, fwd, base))
    # non-overlapping per symbol
    picked = []
    by_sym: dict[str, list] = {}
    for r in scored:
        by_sym.setdefault(r[0], []).append(r)
    for rows in by_sym.values():
        last = -10**9
        for r in sorted(rows, key=lambda x: x[1]):
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
    parser.add_argument("symbols", nargs="*", default=[
        "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT",
        "LINKUSDT", "AVAXUSDT", "TONUSDT", "SUIUSDT", "OPUSDT", "ARBUSDT", "APTUSDT",
        "LTCUSDT", "NEARUSDT", "INJUSDT", "TIAUSDT", "SEIUSDT", "DOTUSDT",
        "FILUSDT", "ATOMUSDT", "UNIUSDT", "AAVEUSDT", "RUNEUSDT", "ENAUSDT",
        "WIFUSDT", "ORDIUSDT", "GALAUSDT", "WLDUSDT",
    ])
    parser.add_argument("--days", type=int, default=30)
    args = parser.parse_args()

    obs, closes = collect(args.symbols, args.days)
    print(f"\ncollected {len(obs)} signal points across {len(closes)} symbols\n")

    # hit% = did the call go the predicted way (LONG=rose, SHORT=fell).
    print(f"Out-of-sample by horizon, split by side (calibrated weights, fee={FEE}%)")
    print(f"{'horizon':>8}{'thr':>5}{'side':>6}{'trades':>8}{'hit%':>8}{'net%':>9}")
    print("-" * 44)
    for name, h in HORIZONS.items():
        recs = _records(obs, closes, h)
        max_bar = max(r[1] for r in recs)
        cut = WARMUP + (max_bar - WARMUP) * SPLIT
        train = [r for r in recs if r[1] <= cut]
        test = [r for r in recs if r[1] > cut]
        weights = _derive(_edges(train))
        for thr in (60, 80):
            for side in ("LONG", "SHORT"):
                n, hit, net = _eval(test, weights, h, thr, side)
                hit_s = f"{hit:.1f}" if hit is not None else "-"
                net_s = f"{net:+.3f}" if net is not None else "-"
                print(f"{name:>8}{thr:>5}{side:>6}{n:>8}{hit_s:>8}{net_s:>9}")
        print()


if __name__ == "__main__":
    main()
