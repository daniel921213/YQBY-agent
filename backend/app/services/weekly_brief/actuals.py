"""Released values for key US data, from the BLS public API (no key needed).

Forex Factory's feed has forecast/previous only. For the releases that move
markets most (jobs report, CPI, PPI, JOLTS) the actual value is rebuilt from
the official BLS series. A value is only attached when the BLS reference month
matches the release (e.g. the November jobs report must read October), so a
stale series can never be shown as a fresh actual.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Literal

from app.services.weekly_brief.calendar import EASTERN

Transform = Literal["level", "diff", "mom", "yoy"]


@dataclass(frozen=True)
class BlsSeries:
    series_id: str
    transform: Transform
    lag_months: int
    unit: Literal["pct", "k", "m"]


BLS_SERIES: dict[str, BlsSeries] = {
    "Non-Farm Employment Change": BlsSeries("CES0000000001", "diff", 1, "k"),
    "Unemployment Rate": BlsSeries("LNS14000000", "level", 1, "pct"),
    "Average Hourly Earnings m/m": BlsSeries("CES0500000003", "mom", 1, "pct"),
    "CPI m/m": BlsSeries("CUSR0000SA0", "mom", 1, "pct"),
    "Core CPI m/m": BlsSeries("CUSR0000SA0L1E", "mom", 1, "pct"),
    "CPI y/y": BlsSeries("CUUR0000SA0", "yoy", 1, "pct"),
    "Core CPI y/y": BlsSeries("CUUR0000SA0L1E", "yoy", 1, "pct"),
    "PPI m/m": BlsSeries("WPSFD4", "mom", 1, "pct"),
    "Core PPI m/m": BlsSeries("WPSFD49104", "mom", 1, "pct"),
    "JOLTS Job Openings": BlsSeries("JTS000000000000000JOL", "level", 2, "m"),
}

# Retry window after a release while BLS has not published the new month yet.
PENDING_WINDOW_SECONDS = 12 * 3600


def series_for(event: dict[str, Any]) -> BlsSeries | None:
    if event.get("country") != "USD":
        return None
    return BLS_SERIES.get(str(event.get("title", "")))


def _month_key(year: int, month: int) -> str:
    return f"{year:04d}-{month:02d}"


def _shift(key: str, months: int) -> str:
    year, month = (int(part) for part in key.split("-"))
    index = year * 12 + (month - 1) - months
    return _month_key(index // 12, index % 12 + 1)


def reference_month(event: dict[str, Any], series: BlsSeries) -> str | None:
    if event.get("timestamp") is None:
        return None
    released = datetime.fromtimestamp(int(event["timestamp"]), EASTERN)
    return _shift(_month_key(released.year, released.month), series.lag_months)


def parse_bls_response(payload: dict[str, Any]) -> dict[str, dict[str, float]]:
    observations: dict[str, dict[str, float]] = {}
    for series in (payload.get("Results") or {}).get("series", []):
        rows: dict[str, float] = {}
        for row in series.get("data", []):
            period = str(row.get("period", ""))
            if not re.fullmatch(r"M(0[1-9]|1[0-2])", period):
                continue
            try:
                rows[_month_key(int(row["year"]), int(period[1:]))] = float(row["value"])
            except (KeyError, TypeError, ValueError):
                continue
        if rows:
            observations[str(series.get("seriesID"))] = rows
    return observations


def _round(value: float, places: str) -> Decimal:
    return Decimal(repr(value)).quantize(Decimal(places), rounding=ROUND_HALF_UP)


def compute_actual(
    event: dict[str, Any], observations: dict[str, dict[str, float]]
) -> str | None:
    """The released value formatted like Forex Factory ("165K", "0.3%", "7.52M")."""

    series = series_for(event)
    if series is None:
        return None
    month = reference_month(event, series)
    rows = observations.get(series.series_id, {})
    if month is None or month not in rows:
        return None
    current = rows[month]
    if series.transform == "level":
        value = current
    else:
        prior_key = _shift(month, 12 if series.transform == "yoy" else 1)
        prior = rows.get(prior_key)
        if prior is None or (series.transform != "diff" and prior == 0):
            return None
        value = current - prior if series.transform == "diff" else (current / prior - 1.0) * 100.0
    if series.unit == "k":
        return f"{_round(value, '1')}K"
    if series.unit == "m":
        return f"{_round(value / 1000.0, '0.01')}M"
    return f"{_round(value, '0.1')}%"


def pending_series(
    events: list[dict[str, Any]],
    observations: dict[str, dict[str, float]],
    now: int,
    *,
    include_old: bool,
) -> list[str]:
    """Series whose release has happened but whose value is still missing."""

    wanted: list[str] = []
    for event in events:
        series = series_for(event)
        if series is None or event.get("timestamp") is None:
            continue
        age = now - int(event["timestamp"])
        if age < 60 or (not include_old and age > PENDING_WINDOW_SECONDS):
            continue
        if compute_actual(event, observations) is None and series.series_id not in wanted:
            wanted.append(series.series_id)
    return wanted


_NUMBER = re.compile(r"^([<>]?)(-?\d+(?:\.\d+)?)\s*([KMBT%]?)$", re.IGNORECASE)
_SCALE = {"": 1.0, "%": 1.0, "K": 1e3, "M": 1e6, "B": 1e9, "T": 1e12}


def parse_value(text: str | None) -> float | None:
    if not text:
        return None
    match = _NUMBER.match(text.strip().replace(",", ""))
    if not match:
        return None
    return float(match.group(2)) * _SCALE[match.group(3).upper()]


def verdict(actual: str | None, forecast: str | None) -> str | None:
    a, f = parse_value(actual), parse_value(forecast)
    if a is None or f is None:
        return None
    if abs(a - f) <= 1e-9 * max(abs(a), abs(f), 1.0):
        return "INLINE"
    return "ABOVE" if a > f else "BELOW"
