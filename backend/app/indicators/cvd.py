import pandas as pd


def add_cvd_columns(frame: pd.DataFrame) -> pd.DataFrame:
    required = {"buy_volume", "sell_volume"}
    missing = required.difference(frame.columns)
    if missing:
        raise ValueError(f"Missing CVD columns: {sorted(missing)}")

    enriched = frame.copy()
    enriched["volume_delta"] = enriched["buy_volume"] - enriched["sell_volume"]
    enriched["cvd"] = enriched["volume_delta"].cumsum()
    return enriched

