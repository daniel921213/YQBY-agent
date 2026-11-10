"""Is the market behind a TradFi perpetual open right now?

Binance TradFi perpetuals trade around the clock, but outside the underlying
session there is no real price discovery: weekend and after-hours moves are
thin and the contract can gap at the next open. The 外匯版 dashboard keeps
scanning them, labels them 休市中, and does not recommend them while closed.
"""

from __future__ import annotations

from datetime import date, datetime, time, timezone
from typing import Literal
from zoneinfo import ZoneInfo

SessionState = Literal["OPEN", "CLOSED"]

_NEW_YORK = ZoneInfo("America/New_York")
_HONG_KONG = ZoneInfo("Asia/Hong_Kong")
_SEOUL = ZoneInfo("Asia/Seoul")
_SHANGHAI = ZoneInfo("Asia/Shanghai")

# NYSE full-day closures. Early closes are treated as a normal session.
_NYSE_HOLIDAYS = {
    date(2026, 1, 1), date(2026, 1, 19), date(2026, 2, 16), date(2026, 4, 3),
    date(2026, 5, 25), date(2026, 6, 19), date(2026, 7, 3), date(2026, 9, 7),
    date(2026, 11, 26), date(2026, 12, 25),
    date(2027, 1, 1), date(2027, 1, 18), date(2027, 2, 15), date(2027, 3, 26),
    date(2027, 5, 31), date(2027, 6, 18), date(2027, 7, 5), date(2027, 9, 6),
    date(2027, 11, 25), date(2027, 12, 24),
}

_Window = tuple[time, time]
# Weekday regular-session windows in exchange-local time.
_EQUITY_SESSIONS: dict[str, tuple[ZoneInfo, tuple[_Window, ...]]] = {
    "EQUITY": (_NEW_YORK, ((time(9, 30), time(16, 0)),)),
    "HK_EQUITY": (_HONG_KONG, ((time(9, 30), time(12, 0)), (time(13, 0), time(16, 0)))),
    "KR_EQUITY": (_SEOUL, ((time(9, 0), time(15, 30)),)),
    "CN_EQUITY": (_SHANGHAI, ((time(9, 30), time(11, 30)), (time(13, 0), time(15, 0)))),
}


def _in_windows(local: datetime, windows: tuple[_Window, ...]) -> bool:
    clock = local.time()
    return any(start <= clock < end for start, end in windows)


def _globex_open(local: datetime) -> bool:
    """CME Globex metals/energy: Sun 18:00 – Fri 17:00 ET, daily 17:00–18:00 break."""

    weekday, clock = local.weekday(), local.time()
    if weekday == 5:  # Saturday
        return False
    if weekday == 6:  # Sunday
        return clock >= time(18, 0)
    if weekday == 4:  # Friday
        return clock < time(17, 0)
    return not (time(17, 0) <= clock < time(18, 0))


def _fx_open(local: datetime) -> bool:
    """Spot FX: Sun 17:00 – Fri 17:00 New York."""

    weekday, clock = local.weekday(), local.time()
    if weekday == 5:
        return False
    if weekday == 6:
        return clock >= time(17, 0)
    if weekday == 4:
        return clock < time(17, 0)
    return True


def session_state(underlying_type: str | None, now: datetime | None = None) -> SessionState | None:
    """OPEN / CLOSED for a TradFi underlying; None when not applicable."""

    if not underlying_type:
        return None
    moment = now or datetime.now(timezone.utc)
    if underlying_type == "COMMODITY":
        return "OPEN" if _globex_open(moment.astimezone(_NEW_YORK)) else "CLOSED"
    if underlying_type == "FX":
        return "OPEN" if _fx_open(moment.astimezone(_NEW_YORK)) else "CLOSED"
    spec = _EQUITY_SESSIONS.get(underlying_type)
    if spec is None:
        return None
    zone, windows = spec
    local = moment.astimezone(zone)
    if local.weekday() >= 5:
        return "CLOSED"
    if underlying_type == "EQUITY" and local.date() in _NYSE_HOLIDAYS:
        return "CLOSED"
    return "OPEN" if _in_windows(local, windows) else "CLOSED"

