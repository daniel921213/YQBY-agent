"""Daily closes for the weekly brief: indices and commodities from Yahoo Finance,
crypto from Gate (the exchange the rest of the site already reads)."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any, Literal
from urllib.parse import quote

import httpx

logger = logging.getLogger(__name__)

Group = Literal["close", "kpi"]


@dataclass(frozen=True)
class Instrument:
    key: str
    name: str
    group: Group
    source: Literal["yahoo", "gate"]
    symbol: str
    kind: Literal["price", "yield"] = "price"
    decimals: int = 2


INSTRUMENTS: tuple[Instrument, ...] = (
    Instrument("spx", "S&P 500", "close", "yahoo", "^GSPC"),
    Instrument("nasdaq", "那斯達克", "close", "yahoo", "^IXIC"),
    Instrument("smh", "半導體 SMH", "close", "yahoo", "SMH"),
    Instrument("taiex", "台股加權", "close", "yahoo", "^TWII"),
    Instrument("btc", "BTC", "close", "gate", "BTC_USDT", decimals=0),
    Instrument("eth", "ETH", "close", "gate", "ETH_USDT"),
    Instrument("gold", "黃金", "close", "yahoo", "GC=F", decimals=1),
    Instrument("brent", "布蘭特原油", "close", "yahoo", "BZ=F"),
    Instrument("us10y", "10 年期美債殖利率", "kpi", "yahoo", "^TNX", kind="yield", decimals=3),
    Instrument("us30y", "30 年期美債殖利率", "kpi", "yahoo", "^TYX", kind="yield", decimals=3),
    Instrument("vix", "VIX 恐慌指數", "kpi", "yahoo", "^VIX"),
    Instrument("dxy", "美元指數", "kpi", "yahoo", "DX-Y.NYB"),
)


def _yahoo_bars(payload: dict[str, Any]) -> list[tuple[date, float]]:
    result = (payload.get("chart") or {}).get("result") or []
    if not result:
        return []
    chart = result[0]
    offset = int((chart.get("meta") or {}).get("gmtoffset") or 0)
    closes = ((chart.get("indicators") or {}).get("quote") or [{}])[0].get("close") or []
    bars: dict[date, float] = {}
    for stamp, close in zip(chart.get("timestamp") or [], closes):
        if close is None:
            continue
        local = datetime.fromtimestamp(int(stamp) + offset, timezone.utc).date()
        bars[local] = float(close)
    return sorted(bars.items())


def _gate_bars(payload: list[Any]) -> list[tuple[date, float]]:
    bars: dict[date, float] = {}
    for row in payload or []:
        try:
            day = datetime.fromtimestamp(int(float(row[0])), timezone.utc).date()
            bars[day] = float(row[2])
        except (IndexError, TypeError, ValueError):
            continue
    return sorted(bars.items())


def summarize(instrument: Instrument, bars: list[tuple[date, float]]) -> dict[str, Any] | None:
    """Last close plus day and week-to-date change.

    The week reference is the last close before the Monday of the latest bar's
    week, i.e. the prior Friday for stocks (prior Sunday for 24/7 crypto).
    """

    if not bars:
        return None
    last_day, last = bars[-1]
    previous = bars[-2][1] if len(bars) >= 2 else None
    monday = last_day - timedelta(days=last_day.weekday())
    week_ref = next((close for day, close in reversed(bars) if day < monday), None)

    def change(reference: float | None) -> float | None:
        if reference is None:
            return None
        if instrument.kind == "yield":
            return round((last - reference) * 100.0, 1)  # basis points
        if reference == 0:
            return None
        return round((last / reference - 1.0) * 100.0, 2)

    return {
        "key": instrument.key,
        "name": instrument.name,
        "group": instrument.group,
        "kind": instrument.kind,
        "decimals": instrument.decimals,
        "last": round(last, instrument.decimals),
        "as_of": last_day.isoformat(),
        "day_change": change(previous),
        "week_change": change(week_ref),
        "change_unit": "bp" if instrument.kind == "yield" else "pct",
    }


def fetch_quotes(
    client: httpx.Client,
    yahoo_url: str,
    gate_url: str,
    previous: dict[str, dict[str, Any]] | None = None,
    now: int = 0,
) -> tuple[dict[str, dict[str, Any]], int]:
    """Fetch every instrument; failed ones keep their previous value (marked stale)."""

    previous = previous or {}
    quotes: dict[str, dict[str, Any]] = {}
    ok = 0
    for instrument in INSTRUMENTS:
        try:
            if instrument.source == "yahoo":
                response = client.get(
                    f"{yahoo_url.rstrip('/')}/{quote(instrument.symbol, safe='')}",
                    params={"range": "1mo", "interval": "1d"},
                )
                response.raise_for_status()
                bars = _yahoo_bars(response.json())
            else:
                response = client.get(
                    f"{gate_url.rstrip('/')}/spot/candlesticks",
                    params={"currency_pair": instrument.symbol, "interval": "1d", "limit": 30},
                )
                response.raise_for_status()
                bars = _gate_bars(response.json())
            summary = summarize(instrument, bars)
            if summary is None:
                raise ValueError("no bars")
            summary["fetched_at"] = now
            summary["stale"] = False
            quotes[instrument.key] = summary
            ok += 1
        except Exception as exc:
            logger.warning("Weekly brief quote failed (%s): %s", instrument.symbol, exc)
            if instrument.key in previous:
                quotes[instrument.key] = {**previous[instrument.key], "stale": True}
    return quotes, ok
