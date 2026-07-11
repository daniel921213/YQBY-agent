import numpy as np
import pandas as pd


def add_cvd_columns(frame: pd.DataFrame) -> pd.DataFrame:
    required = {"buy_volume", "sell_volume"}
    missing = required.difference(frame.columns)
    if missing:
        raise ValueError(f"Missing CVD columns: {sorted(missing)}")

    enriched = frame.copy()
    buy = pd.to_numeric(enriched["buy_volume"], errors="coerce")
    sell = pd.to_numeric(enriched["sell_volume"], errors="coerce")
    valid = np.isfinite(buy) & np.isfinite(sell) & (buy >= 0) & (sell >= 0)

    # Invalid flow must remain missing rather than silently becoming zero.  The
    # signal detectors reject windows containing these gaps, which is safer than
    # manufacturing a flat CVD segment from incomplete exchange data.
    enriched["buy_volume"] = buy.where(valid)
    enriched["sell_volume"] = sell.where(valid)
    enriched["volume_delta"] = (buy - sell).where(valid)
    enriched["cvd"] = enriched["volume_delta"].cumsum()
    return enriched
