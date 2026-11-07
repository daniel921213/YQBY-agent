"""Exchange-normalised crowding reads.

Two Gate facts make fixed crowding thresholds wrong:

- Funding settles every 1h, 4h or 8h depending on the contract (most of the
  top-150 Gate crypto contracts settle every 4h). A per-settlement rate must be
  converted to an 8h equivalent before it is compared with an 8h threshold;
  otherwise a 4h contract needs twice the real heat to trip the alarm.
- Gate's all-account long/short ratio sits structurally above 1 for most
  majors (BTC ~2.3, ETH ~2.1, SOL ~3.0 in Nov 2026), so a fixed "1.5 = long
  crowded" line marks most of the universe as permanently crowded. Crowding is
  therefore read against each symbol's own causal baseline.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Literal

import numpy as np
import pandas as pd

# ── Funding ──────────────────────────────────────────────────────────────────

FUNDING_REFERENCE_SECONDS = 28_800
_FUNDING_INTERVALS = (3_600, 7_200, 14_400, 28_800)


def snap_funding_interval(seconds: float) -> float:
    """Nearest supported settlement interval; NaN when unknown.

    Settlement timestamps jitter (a 7h59m gap) and a missing record doubles a
    gap, so inferred gaps are snapped to the closest real interval.
    """

    try:
        value = float(seconds)
    except (TypeError, ValueError):
        return float("nan")
    if not math.isfinite(value) or value <= 0:
        return float("nan")
    return float(min(_FUNDING_INTERVALS, key=lambda item: abs(math.log(value / item))))


def funding_to_8h(rate: pd.Series, interval_seconds: pd.Series | None) -> pd.Series:
    """Per-settlement funding -> 8h-equivalent funding (unknown interval = 8h)."""

    values = pd.to_numeric(rate, errors="coerce")
    if interval_seconds is None:
        return values
    interval = pd.to_numeric(interval_seconds, errors="coerce")
    interval = interval.where(interval > 0).fillna(FUNDING_REFERENCE_SECONDS)
    return values * (FUNDING_REFERENCE_SECONDS / interval)


def interval_hours(interval_seconds: float | None) -> float:
    try:
        value = float(interval_seconds)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return FUNDING_REFERENCE_SECONDS / 3_600
    if not math.isfinite(value) or value <= 0:
        return FUNDING_REFERENCE_SECONDS / 3_600
    return value / 3_600


def describe_funding(rate: float, rate_8h: float, hours: float) -> str:
    """'0.0300%／4h（約 0.0600%／8h）' or '0.0300%／8h'."""

    if abs(hours - 8.0) < 1e-6:
        return f"{rate:.4%}／8h"
    return f"{rate:.4%}／{hours:g}h（約 {rate_8h:.4%}／8h）"


def latest_funding(frame: pd.DataFrame) -> tuple[float, float, float]:
    """(raw rate, 8h-equivalent rate, settlement hours) of the latest row."""

    if frame.empty or "funding_rate" not in frame.columns:
        return 0.0, 0.0, 8.0
    raw = _finite(frame["funding_rate"].iloc[-1], 0.0)
    if "funding_rate_8h" in frame.columns:
        rate_8h = _finite(frame["funding_rate_8h"].iloc[-1], raw)
    else:
        rate_8h = raw
    hours = 8.0
    if "funding_interval" in frame.columns:
        hours = interval_hours(frame["funding_interval"].iloc[-1])
    return raw, rate_8h, hours


# ── Long/short ratio baseline ────────────────────────────────────────────────

BASELINE_HOURS = 336          # 14 days of closed 1h snapshots
_BASELINE_MIN_HOURS = 72      # at least 3 days before a 1h baseline is trusted
_FRAME_BASELINE_DAYS = 14
_FRAME_MIN_BARS = 48          # in-frame fallback needs >=48 prior bars
CROWD_UPPER_QUANTILE = 0.90
CROWD_LOWER_QUANTILE = 0.10
# Being in the symbol's own top/bottom decile is not enough on a flat series;
# the ratio must also sit >=10% away from its own median.
CROWD_MIN_DEVIATION = 0.10

BASELINE_COLUMNS = (
    "account_ratio_p10",
    "account_ratio_p50",
    "account_ratio_p90",
    "top_ratio_p50",
)
_ACCOUNT = "account_long_short_ratio"
_TOP = "top_trader_long_short_ratio"

BaselineSource = Literal["14d", "frame", "none"]
CrowdedSide = Literal["LONG", "SHORT"]


def _positive(series: pd.Series) -> pd.Series:
    values = pd.to_numeric(series, errors="coerce")
    return values.where(values > 0)


def _quantiles(rolling) -> dict[str, pd.Series]:  # type: ignore[no-untyped-def]
    return {
        "p10": rolling.quantile(CROWD_LOWER_QUANTILE),
        "p50": rolling.quantile(0.5),
        "p90": rolling.quantile(CROWD_UPPER_QUANTILE),
    }


def _bar_seconds(frame: pd.DataFrame) -> int:
    if "timestamp" in frame.columns and len(frame) >= 2:
        diffs = pd.to_numeric(frame["timestamp"], errors="coerce").diff().dropna()
        diffs = diffs[diffs > 0]
        if not diffs.empty:
            return int(diffs.median())
    return 900


def _history_baseline(history: pd.DataFrame | None) -> pd.DataFrame:
    """Causal 14d quantiles keyed by the time they become available.

    A 1h row opened at ``h`` is a snapshot finished by ``h + 1h``; its baseline
    (that row and the 335 before it) is keyed at ``h + 1h`` so a bar can only
    see hours that had already closed before the bar opened.
    """

    columns = ["timestamp", *BASELINE_COLUMNS]
    if history is None or history.empty or "timestamp" not in history.columns:
        return pd.DataFrame(columns=columns)
    rows = history.sort_values("timestamp").drop_duplicates("timestamp", keep="last")
    out = pd.DataFrame({"timestamp": pd.to_numeric(rows["timestamp"]).astype("int64") + 3_600})
    if _ACCOUNT in rows.columns:
        account = _quantiles(
            _positive(rows[_ACCOUNT]).rolling(BASELINE_HOURS, min_periods=_BASELINE_MIN_HOURS)
        )
        for name, values in account.items():
            out[f"account_ratio_{name}"] = values.to_numpy()
    if _TOP in rows.columns:
        out["top_ratio_p50"] = (
            _positive(rows[_TOP])
            .rolling(BASELINE_HOURS, min_periods=_BASELINE_MIN_HOURS)
            .median()
            .to_numpy()
        )
    for column in BASELINE_COLUMNS:
        if column not in out.columns:
            out[column] = np.nan
    return out[columns]


def _frame_baseline(frame: pd.DataFrame) -> pd.DataFrame:
    """Fallback: quantiles of strictly earlier rows inside the frame itself."""

    window = max(int(_FRAME_BASELINE_DAYS * 86_400 / max(_bar_seconds(frame), 1)), _FRAME_MIN_BARS)
    out = pd.DataFrame(index=frame.index)
    if _ACCOUNT in frame.columns:
        prior = _positive(frame[_ACCOUNT]).shift(1)
        for name, values in _quantiles(prior.rolling(window, min_periods=_FRAME_MIN_BARS)).items():
            out[f"account_ratio_{name}"] = values
    if _TOP in frame.columns:
        out["top_ratio_p50"] = (
            _positive(frame[_TOP]).shift(1).rolling(window, min_periods=_FRAME_MIN_BARS).median()
        )
    for column in BASELINE_COLUMNS:
        if column not in out.columns:
            out[column] = np.nan
    return out


def add_ratio_baseline_columns(
    frame: pd.DataFrame,
    history: pd.DataFrame | None = None,
) -> pd.DataFrame:
    """Attach causal per-row ratio baselines.

    Prefers the 14-day 1h history; rows it cannot cover fall back to the
    frame's own earlier rows. ``ratio_baseline_source`` records which one won.
    """

    enriched = frame.copy()
    if enriched.empty:
        for column in BASELINE_COLUMNS:
            enriched[column] = pd.Series(dtype=float)
        enriched["ratio_baseline_source"] = pd.Series(dtype=object)
        return enriched

    fallback = _frame_baseline(enriched)
    long_history = _history_baseline(history)
    source = pd.Series("none", index=enriched.index, dtype=object)
    fallback_ok = fallback["account_ratio_p50"].notna()
    source[fallback_ok] = "frame"

    if not long_history.empty and "timestamp" in enriched.columns:
        keys = enriched[["timestamp"]].copy()
        keys["_row"] = np.arange(len(keys))
        keys["timestamp"] = pd.to_numeric(keys["timestamp"]).astype("int64")
        matched = pd.merge_asof(
            keys.sort_values("timestamp"),
            long_history.sort_values("timestamp"),
            on="timestamp",
            direction="backward",
        ).sort_values("_row")
        matched.index = enriched.index
        history_ok = matched["account_ratio_p50"].notna()
        for column in BASELINE_COLUMNS:
            enriched[column] = matched[column].where(history_ok, fallback[column])
        source[history_ok] = "14d"
    else:
        for column in BASELINE_COLUMNS:
            enriched[column] = fallback[column]

    enriched["ratio_baseline_source"] = source
    return enriched


@dataclass(frozen=True)
class RatioRead:
    """Latest participant ratios against the symbol's own baseline."""

    account_ratio: float
    account_median: float | None
    account_deviation: float      # ratio / own median - 1 (0 without a baseline)
    top_ratio: float
    top_median: float | None
    top_deviation: float
    crowded: CrowdedSide | None   # LONG = longs crowded, SHORT = shorts crowded
    source: BaselineSource

    @property
    def baseline_label(self) -> str:
        return "14 天" if self.source == "14d" else "近期"


def _finite(value: object, default: float) -> float:
    try:
        parsed = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default
    return parsed if math.isfinite(parsed) else default


def classify_ratio_read(
    account_ratio: float,
    top_ratio: float,
    baseline: dict[str, float],
    source: BaselineSource,
) -> RatioRead:
    p10 = _finite(baseline.get("account_ratio_p10"), float("nan"))
    p50 = _finite(baseline.get("account_ratio_p50"), float("nan"))
    p90 = _finite(baseline.get("account_ratio_p90"), float("nan"))
    top_p50 = _finite(baseline.get("top_ratio_p50"), float("nan"))

    has_account = source != "none" and math.isfinite(p50) and p50 > 0 and account_ratio > 0
    account_dev = account_ratio / p50 - 1.0 if has_account else 0.0
    has_top = has_account and math.isfinite(top_p50) and top_p50 > 0 and top_ratio > 0
    top_dev = top_ratio / top_p50 - 1.0 if has_top else 0.0

    crowded: CrowdedSide | None = None
    if has_account and math.isfinite(p90) and account_ratio >= p90 and account_dev >= CROWD_MIN_DEVIATION:
        crowded = "LONG"
    elif has_account and math.isfinite(p10) and account_ratio <= p10 and account_dev <= -CROWD_MIN_DEVIATION:
        crowded = "SHORT"

    return RatioRead(
        account_ratio=account_ratio,
        account_median=p50 if has_account else None,
        account_deviation=account_dev,
        top_ratio=top_ratio,
        top_median=top_p50 if has_top else None,
        top_deviation=top_dev,
        crowded=crowded,
        source=source if has_account else "none",
    )


def latest_ratio_read(frame: pd.DataFrame) -> RatioRead:
    """Ratio read for the latest row (computes an in-frame baseline if needed)."""

    if frame.empty or _ACCOUNT not in frame.columns:
        return classify_ratio_read(1.0, 1.0, {}, "none")
    if not set(BASELINE_COLUMNS).issubset(frame.columns):
        frame = add_ratio_baseline_columns(frame)
    last = frame.iloc[-1]
    source_value = str(last.get("ratio_baseline_source", "frame"))
    source: BaselineSource = source_value if source_value in {"14d", "frame"} else "none"  # type: ignore[assignment]
    return classify_ratio_read(
        _finite(last.get(_ACCOUNT), 1.0),
        _finite(last.get(_TOP), 1.0),
        {column: last.get(column) for column in BASELINE_COLUMNS},
        source,
    )
