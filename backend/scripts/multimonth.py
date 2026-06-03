"""Multi-month regime test of the core 80-long driver: relative strength + momentum.

Binance only serves ~30 days of OI / long-short history, so the FULL 5-pillar
score can't be replayed further back. But the two pillars that actually push a
small-cap to score>=80 — relative strength vs BTC (w30) and momentum (w20) —
come from klines, which go back years. So we isolate that core signal:

    LONG when 4h+24h relative strength vs BTC is strongly positive
             AND 1h+4h momentum is strongly positive (both pillars "strong").

We then measure 12h/24h forward returns, bucketed by month, net of a realistic
small-cap round-trip cost. If the edge survives across months/regimes it is real;
if it only shows up in one window it was luck.

    set DATA_PROVIDER=binance
    python -m scripts.multimonth --days 180 --slippage 0.30
"""

from __future__ import annotations

import argparse
import sys
from collections import defaultdict
from datetime import datetime, timezone

import numpy as np

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from app.data_sources.binance_history import fetch_klines_history

# Established, volatile alts likely to have ~6 months of history (avoids brand-new
# listings). These are the kind of coins that reach high scores.
UNIVERSE = [
    "SOLUSDT", "AVAXUSDT", "LINKUSDT", "INJUSDT", "SUIUSDT", "OPUSDT", "ARBUSDT",
    "APTUSDT", "SEIUSDT", "TIAUSDT", "NEARUSDT", "DOGEUSDT", "ADAUSDT", "DOTUSDT",
    "FILUSDT", "RUNEUSDT", "AAVEUSDT", "UNIUSDT", "ATOMUSDT", "LTCUSDT", "WIFUSDT",
    "ORDIUSDT", "GALAUSDT", "ENAUSDT", "XRPUSDT", "BNBUSDT", "ETHUSDT", "TONUSDT",
]
STRONG = 0.5    # pillar strength bar (matches the engine's confluence threshold)


def returns(close: np.ndarray, bars: int) -> np.ndarray:
    out = np.full(len(close), np.nan)
    out[bars:] = close[bars:] / close[:-bars] - 1.0
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=180)
    parser.add_argument("--horizon", type=int, default=96, help="forward bars (96=24h)")
    parser.add_argument("--slippage", type=float, default=0.30, help="round-trip cost %")
    args = parser.parse_args()
    h = args.horizon

    btc = fetch_klines_history("BTCUSDT", "15m", args.days)
    btc_close = btc["close"].to_numpy()
    btc_ts = btc["timestamp"].to_numpy()
    btc_r4 = returns(btc_close, 16)
    btc_r24 = returns(btc_close, 96)

    # month bucket -> list of (forward_return, baseline)
    buckets: dict[str, list[tuple[float, float]]] = defaultdict(list)

    for symbol in UNIVERSE:
        try:
            df = fetch_klines_history(symbol, "15m", args.days)
        except Exception:
            print(f"{symbol}: skipped")
            continue
        if df.empty or len(df) < 200:
            print(f"{symbol}: short, skipped")
            continue
        close = df["close"].to_numpy()
        ts = df["timestamp"].to_numpy()
        # align BTC returns onto this symbol's bars by index from the end
        n = min(len(close), len(btc_close))
        close, ts = close[-n:], ts[-n:]
        b_r4, b_r24 = btc_r4[-n:], btc_r24[-n:]

        r1 = returns(close, 4)
        r4 = returns(close, 16)
        r24 = returns(close, 96)
        mom = 0.5 * (r1 / 0.015) + 0.5 * (r4 / 0.035)
        rs = 0.5 * ((r4 - b_r4) / 0.03) + 0.5 * ((r24 - b_r24) / 0.03)

        fwd = np.full(n, np.nan)
        fwd[: n - h] = close[h:] / close[: n - h] - 1.0
        baseline = float(np.nanmean(fwd))

        # strong-long: both pillars long and strong
        sig = (mom > STRONG) & (rs > STRONG)
        idx = np.where(sig & ~np.isnan(fwd))[0]

        last = -10**9
        for t in idx:
            if t - last < h:   # non-overlapping
                continue
            last = t
            month = datetime.fromtimestamp(int(ts[t]), tz=timezone.utc).strftime("%Y-%m")
            buckets[month].append((float(fwd[t]), baseline))

    print(f"\nCore signal = strong RS + strong momentum LONG | horizon={h} bars "
          f"({h * 15 // 60}h) | slippage={args.slippage}%\n")
    print(f"{'month':>9}{'trades':>8}{'hit%':>8}{'mean%':>9}{'net%':>9}")
    print("-" * 43)
    all_signed: list[float] = []
    for month in sorted(buckets):
        rows = buckets[month]
        signed = np.array([fr for fr, _ in rows])
        excess = np.array([fr - bl for fr, bl in rows])
        hit = float((signed > 0).mean()) * 100
        net = float(excess.mean()) * 100 - args.slippage
        all_signed.extend(signed.tolist())
        print(f"{month:>9}{len(rows):>8}{hit:>8.1f}{signed.mean() * 100:>9.3f}{net:>9.3f}")
    arr = np.array(all_signed)
    print("-" * 43)
    print(f"{'ALL':>9}{len(arr):>8}{(arr > 0).mean() * 100:>8.1f}{arr.mean() * 100:>9.3f}")


if __name__ == "__main__":
    main()
