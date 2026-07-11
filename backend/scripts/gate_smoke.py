"""End-to-end Gate scan smoke test for release verification.

It exercises the same AnalysisService path used by the API, including the
closed-15m official score and independent closed-5m risk radar.
"""

from __future__ import annotations

import argparse
import time

from app.core.config import get_settings
from app.services.analysis_service import AnalysisService


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--top", type=int, default=20)
    parser.add_argument("--lookback", type=int, default=200)
    args = parser.parse_args()

    settings = get_settings()
    if settings.data_provider.lower() != "gate":
        raise SystemExit("DATA_PROVIDER must be gate")

    service = AnalysisService()
    symbols = service.market_data.list_symbols()[: max(1, args.top)]
    started = time.perf_counter()
    scan = service.scan_market(
        symbols=symbols,
        primary_timeframe="15m",
        trigger_timeframe="5m",
        trend_timeframe="1h",
        lookback=args.lookback,
        track=False,
    )
    elapsed = time.perf_counter() - started

    radar = scan.risk_radar
    print(f"requested={len(symbols)} analyzed={scan.breadth.total} elapsed={elapsed:.1f}s")
    print(
        f"official_close={scan.meta.official_close_time} "
        f"oi_movers={len(scan.oi_movers)} universe={len(scan.universe)}"
    )
    print(
        f"risk_coverage={radar.covered_count if radar else 0}/"
        f"{radar.scanned_count if radar else 0} events={len(radar.items) if radar else 0}"
    )
    print(
        "sample="
        + str(
            [
                {
                    "symbol": mover.symbol,
                    "side": mover.side,
                    "oi_qty_change_1h": mover.oi_qty_change_1h,
                    "oi_flow_usd": mover.oi_delta,
                    "oi_usd": mover.total_oi,
                }
                for mover in scan.oi_movers[:5]
            ]
        )
    )

    minimum = max(1, int(len(symbols) * 0.8))
    if scan.breadth.total < minimum:
        raise SystemExit(f"FAIL: only {scan.breadth.total}/{len(symbols)} symbols analyzed")
    if scan.meta.official_close_time is None:
        raise SystemExit("FAIL: official close time missing")
    if radar is None or radar.covered_count < minimum:
        covered = radar.covered_count if radar else 0
        raise SystemExit(f"FAIL: only {covered}/{len(symbols)} symbols have 5m risk coverage")
    print("PASS")


if __name__ == "__main__":
    main()
