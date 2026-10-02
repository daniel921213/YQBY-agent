"""Read-only live catalog audit and frozen Gate-data parity against a Git ref.

Run from backend: python scripts/check_symbol_universe.py --baseline HEAD
No account credentials or database access required. Reports counts and timings.
"""

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ["DATA_PROVIDER"] = "gate"
os.environ["SCAN_BACKGROUND"] = "false"
os.environ["YOKAI_BACKGROUND"] = "false"

from app.data_sources.gate_live import GateLiveMarketDataSource
from app.services.analysis_service import AnalysisService
from app.services.symbol_universe import SymbolUniverse, fetch_bitget_symbols


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", required=True, help="Git commit before this change")
    parser.add_argument("--report", type=Path)
    parser.add_argument("--full-scan", action="store_true", help="Measure one complete, read-only live scan")
    args = parser.parse_args()
    start = time.monotonic()
    source = GateLiveMarketDataSource()
    bitget = fetch_bitget_symbols()
    gate = source._list_gate_symbols()
    universe = SymbolUniverse(fetch=lambda: bitget)
    shared = universe.symbols(lambda: gate)
    report = {"bitget_eligible": len(bitget), "gate_eligible": len(gate), "shared": len(shared),
              "bitget_only": sorted(bitget - set(gate)), "gate_only": sorted(set(gate) - bitget),
              "symbols": shared, "catalog_seconds": round(time.monotonic() - start, 2)}
    print(json.dumps({k: v for k, v in report.items() if k not in ("bitget_only", "gate_only", "symbols")}))

    old = subprocess.check_output(["git", "show", f"{args.baseline}:backend/app/services/analysis_service.py"], encoding="utf-8")
    namespace = {"__name__": "baseline_analysis"}
    exec(compile(old, "baseline_analysis.py", "exec"), namespace)
    baseline = namespace["AnalysisService"]()
    current = AnalysisService()
    frames = {}
    fetch = current.market_data.get_enriched_market_frame
    def frozen(symbol, timeframe, limit, with_derivatives=True):
        key = (symbol, timeframe, limit, with_derivatives)
        if key not in frames:
            frames[key] = fetch(symbol, timeframe, limit, with_derivatives).copy(deep=True)
        return frames[key].copy(deep=True)
    baseline.market_data.get_enriched_market_frame = frozen
    current.market_data.get_enriched_market_frame = frozen
    samples = [s for s in ("BTCUSDT", "ETHUSDT", "SOLUSDT") if s in shared]
    if not samples:
        raise RuntimeError("No sample contracts available for parity check")
    sample_start = time.monotonic()
    with patch("app.services.symbol_universe.symbol_universe", universe):
        # Fetch once before freezing the clock; Gate rate-limit/cache clocks
        # keep running normally during requests.
        for symbol in samples:
            baseline.analyze(symbol, "15m", "5m", "1h", 200)
            frozen(symbol, "5m", 96)
        frozen_time = time.time()
        with patch("app.services.analysis_service.time.time", return_value=frozen_time):
            before = baseline.scan_market(samples, "15m", "5m", "1h", 200)
            after = current.scan_market(samples, "15m", "5m", "1h", 200)
            assert before.breadth.total == len(samples), "Some sample analyses failed"
            assert before.model_dump(mode="json") == after.model_dump(mode="json"), "Scan result changed"
            for symbol in samples:
                a = baseline.analyze(symbol, "15m", "5m", "1h", 200)
                b = current.analyze(symbol, "15m", "5m", "1h", 200)
                assert a.model_dump(mode="json") == b.model_dump(mode="json"), f"Analysis changed: {symbol}"
    report.update(parity="identical", baseline=args.baseline, parity_symbols=samples,
                  frozen_gate_frames=len(frames), sample_seconds=round(time.monotonic() - sample_start, 2))
    if args.full_scan:
        print(f"Starting full scan of {len(shared)} contracts", flush=True)
        started = time.monotonic()
        result = AnalysisService().scan_market(shared, "15m", "5m", "1h", 200)
        assert result.scanned_symbols == shared, "Full scan was capped"
        report["full_scan"] = {"requested": len(shared), "analyzed": result.breadth.total,
                               "seconds": round(time.monotonic() - started, 2)}
        print(json.dumps(report["full_scan"]), flush=True)
    if args.report:
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: report[k] for k in ("parity", "parity_symbols", "frozen_gate_frames", "sample_seconds")}))


if __name__ == "__main__":
    main()
