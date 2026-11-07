"""Collector, persistence and response builder for 每週消息面.

A background thread refreshes the Forex Factory calendar, market closes and
BLS actuals (hourly, plus a few minutes after each tracked US release and at
the page's mode boundaries). Every refresh is persisted so a Railway redeploy
keeps the previous week's calendar, which the feed itself no longer serves.
"""

from __future__ import annotations

import hashlib
import json
import logging
import threading
import time
from datetime import date, datetime, timedelta
from typing import Any

import httpx
from sqlalchemy import delete, select

from app.core.config import get_settings
from app.db import SessionLocal
from app.models import WeeklyBriefSnapshot
from app.schemas.weekly_brief import WeeklyBriefResponse
from app.services.weekly_brief import actuals, markets, narrative
from app.services.weekly_brief.calendar import (
    TAIPEI,
    WEEKDAY_ZH,
    event_weight,
    is_data_release,
    parse_calendar,
    rank_factors,
    week_label,
    week_monday,
)

logger = logging.getLogger(__name__)

_KEEP_WEEKS = 3
_BLS_RETRY_SECONDS = 1800
_NARRATIVE_RETRY_SECONDS = 1800
_RESULT_LIMIT = 4

MODE_TEXT = {
    "preview": {
        "title": "下週行情展望",
        "kicker": "WEEKLY OUTLOOK",
        "results": "上週關鍵數據",
        "closes": "最新收盤位置",
        "factors": "下週主導因素",
    },
    "live": {
        "title": "本週行情展望",
        "kicker": "THIS WEEK",
        "results": "本週已公布數據",
        "closes": "本週至今",
        "factors": "本週主導因素",
    },
    "recap": {
        "title": "本週行情回顧",
        "kicker": "WEEKLY RECAP",
        "results": "本週關鍵數據",
        "closes": "本週收盤位置",
        "factors": "本週主導因素回顧",
    },
}


def _now() -> int:
    return int(time.time())


def _taipei_start(day: date, hour: int = 0) -> int:
    return int(datetime(day.year, day.month, day.day, hour, tzinfo=TAIPEI).timestamp())


def mode_for(monday: date, now: int) -> str:
    """preview before Monday (Taipei); live through Friday's US session; recap after."""

    if now < _taipei_start(monday):
        return "preview"
    if now < _taipei_start(monday + timedelta(days=5), 6):
        return "live"
    return "recap"


def _mode_boundaries(monday: date) -> tuple[int, int]:
    return _taipei_start(monday), _taipei_start(monday + timedelta(days=5), 6)


def _time_text(event: dict[str, Any]) -> str:
    day = date.fromisoformat(event["date"])
    return f"{day.month}/{day.day}（{WEEKDAY_ZH[day.weekday()]}）{event['time_label']}"


def _with_actual(event: dict[str, Any], observations: dict[str, Any], now: int) -> dict[str, Any]:
    timestamp = event.get("timestamp")
    released = timestamp is not None and int(timestamp) <= now
    actual = actuals.compute_actual(event, observations) if released else None
    return {
        **event,
        "actual": actual,
        "actual_source": "BLS" if actual else None,
        "verdict": actuals.verdict(actual, event.get("forecast")),
        "released": released,
    }


def _actual_zh(actual: str | None) -> str | None:
    """'165K' -> '16.5 萬' for the Chinese headline numbers."""

    if not actual or not actual.endswith("K"):
        return None
    value = actuals.parse_value(actual)
    if value is None:
        return None
    return f"{value / 10_000:g} 萬"


class WeeklyBriefCollector:
    def __init__(self) -> None:
        self.settings = get_settings()

    def collect(self, previous: dict[str, Any] | None, now: int, *, backfill: bool) -> dict[str, Any]:
        state = json.loads(json.dumps(previous or {}))  # deep copy
        state.setdefault("weeks", {})
        state.setdefault("bls", {})
        state.setdefault("sources", {})
        headers = {"User-Agent": "Mozilla/5.0 (CT_Trader weekly brief)"}
        timeout = self.settings.weekly_brief_request_timeout
        with httpx.Client(timeout=timeout, headers=headers, follow_redirects=True) as client:
            self._calendar(client, state, now)
            self._markets(client, state, now)
            self._bls(client, state, now, backfill=backfill)
        state["generated_at"] = now
        return state

    def _calendar(self, client: httpx.Client, state: dict[str, Any], now: int) -> None:
        try:
            response = client.get(self.settings.forex_factory_calendar_url)
            response.raise_for_status()
            events = parse_calendar(response.content)
            monday = week_monday(events)
            if monday is None:
                raise ValueError("empty calendar")
            state["weeks"][monday.isoformat()] = {"events": events, "fetched_at": now}
            for key in sorted(state["weeks"])[:-_KEEP_WEEKS]:
                del state["weeks"][key]
            state["sources"]["calendar"] = {"ok": True, "last_success_at": now, "count": len(events)}
        except Exception as exc:
            logger.warning("Weekly brief calendar fetch failed: %s", exc)
            source = state["sources"].get("calendar", {})
            state["sources"]["calendar"] = {**source, "ok": False}

    def _markets(self, client: httpx.Client, state: dict[str, Any], now: int) -> None:
        quotes, ok = markets.fetch_quotes(
            client,
            self.settings.yahoo_chart_url,
            self.settings.gate_base_url,
            state.get("quotes"),
            now,
        )
        state["quotes"] = quotes
        source = state["sources"].get("markets", {})
        state["sources"]["markets"] = {
            "ok": ok == len(markets.INSTRUMENTS),
            "last_success_at": now if ok else source.get("last_success_at"),
            "count": ok,
        }

    def _bls(self, client: httpx.Client, state: dict[str, Any], now: int, *, backfill: bool) -> None:
        events = [event for week in state["weeks"].values() for event in week["events"]]
        wanted = actuals.pending_series(events, state["bls"], now, include_old=backfill)
        last_try = int(state["sources"].get("bls", {}).get("last_attempt_at") or 0)
        if not wanted or (not backfill and now - last_try < _BLS_RETRY_SECONDS):
            return
        year = datetime.fromtimestamp(now, TAIPEI).year
        source = state["sources"].get("bls", {})
        try:
            response = client.post(
                self.settings.bls_api_url,
                json={"seriesid": wanted, "startyear": str(year - 1), "endyear": str(year)},
            )
            response.raise_for_status()
            payload = response.json()
            if payload.get("status") != "REQUEST_SUCCEEDED":
                raise ValueError(str(payload.get("message")))
            for series_id, rows in actuals.parse_bls_response(payload).items():
                state["bls"].setdefault(series_id, {}).update(rows)
            state["sources"]["bls"] = {"ok": True, "last_success_at": now, "last_attempt_at": now}
        except Exception as exc:
            logger.warning("Weekly brief BLS fetch failed: %s", exc)
            state["sources"]["bls"] = {**source, "ok": False, "last_attempt_at": now}


def _display_week(state: dict[str, Any]) -> tuple[str | None, str | None]:
    weeks = sorted((state or {}).get("weeks", {}))
    if not weeks:
        return None, None
    return weeks[-1], (weeks[-2] if len(weeks) > 1 else None)


_BLS_ORDER = list(actuals.BLS_SERIES)


def _bls_order(event: dict[str, Any]) -> int:
    """Headline order inside one release (jobs report: payrolls, rate, wages)."""

    title = str(event.get("title", ""))
    return _BLS_ORDER.index(title) if title in _BLS_ORDER else len(_BLS_ORDER)


def _pick_results(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    released = [
        event
        for event in events
        if event["country"] == "USD"
        and event["impact"] == "High"
        and event["released"]
        and is_data_release(event)
    ]
    released.sort(key=lambda item: (item["actual"] is None, -event_weight(item), _bls_order(item)))
    chosen = released[:_RESULT_LIMIT]
    return sorted(chosen, key=lambda item: (item.get("timestamp") or 0, -event_weight(item), _bls_order(item)))


def assemble(state: dict[str, Any] | None, now: int) -> dict[str, Any] | None:
    """Everything the page and the AI writer need, for the current mode."""

    state = state or {}
    current_key, previous_key = _display_week(state)
    if current_key is None:
        return None
    monday = date.fromisoformat(current_key)
    mode = mode_for(monday, now)
    observations = state.get("bls", {})
    current = [_with_actual(e, observations, now) for e in state["weeks"][current_key]["events"]]
    previous = (
        [_with_actual(e, observations, now) for e in state["weeks"][previous_key]["events"]]
        if previous_key
        else []
    )

    results = _pick_results(current) if mode != "preview" else []
    results_from_previous = False
    if not results:
        results = _pick_results(previous)
        results_from_previous = bool(results)

    by_id = {event["id"]: event for event in current}
    factors = rank_factors(current)
    for factor in factors:
        factor["events"] = [by_id[event_id] for event_id in factor.pop("event_ids")]
        factor["released"] = factor["timestamp"] is not None and int(factor["timestamp"]) <= now

    quotes = state.get("quotes", {})
    ordered = [quotes[i.key] for i in markets.INSTRUMENTS if i.key in quotes]
    return {
        "week_key": current_key,
        "monday": monday,
        "mode": mode,
        "results": results,
        "results_from_previous": results_from_previous,
        "factors": factors,
        "calendar": current,
        "kpis": [q for q in ordered if q["group"] == "kpi"],
        "closes": [q for q in ordered if q["group"] == "close"],
    }


def narrative_context(view: dict[str, Any], now: int) -> dict[str, Any]:
    monday: date = view["monday"]
    friday = monday + timedelta(days=4)
    local = datetime.fromtimestamp(now, TAIPEI)
    return {
        "mode": view["mode"],
        "week": f"{week_label(monday)}（{monday.isoformat()} ~ {friday.isoformat()}）",
        "now_taipei": f"{local:%Y-%m-%d %H:%M}（週{WEEKDAY_ZH[local.weekday()]}）",
        "released_results": [
            {
                "title": f"{event['country_zh']} {event['title_zh']}",
                "time_taipei": _time_text(event),
                "actual": event["actual"],
                "actual_zh": _actual_zh(event["actual"]),
                "forecast": event["forecast"],
                "previous": event["previous"],
                "vs_forecast": {"ABOVE": "高於預期", "BELOW": "低於預期", "INLINE": "符合預期"}.get(
                    event["verdict"] or ""
                ),
            }
            for event in view["results"]
        ],
        "factors": [
            {
                "id": factor["id"],
                "title": factor["title"],
                "time_taipei": _time_text(factor),
                "released": factor["released"],
                "note": factor["holiday_note"],
                "events": [
                    {
                        "title": event["title_zh"],
                        "forecast": event["forecast"],
                        "previous": event["previous"],
                        "actual": event["actual"],
                    }
                    for event in factor["events"]
                ],
            }
            for factor in view["factors"]
        ],
        "markets": [
            {
                "name": quote["name"],
                "last": quote["last"],
                "as_of": quote["as_of"],
                "day_change": quote["day_change"],
                "week_change": quote["week_change"],
                "change_unit": "bp" if quote["change_unit"] == "bp" else "%",
            }
            for quote in view["kpis"] + view["closes"]
        ],
    }


def narrative_fingerprint(view: dict[str, Any], now: int) -> str:
    """Changes with the week, the mode, each newly released number, and daily in live mode."""

    parts = [view["week_key"], view["mode"]]
    parts += [f"{e['id']}={e['actual']}" for e in view["results"]]
    parts += [f.get("id", "") for f in view["factors"]]
    if view["mode"] == "live":
        parts.append(datetime.fromtimestamp(now, TAIPEI).date().isoformat())
    return hashlib.sha1("|".join(parts).encode()).hexdigest()[:16]


def _health(source: dict[str, Any] | None) -> str:
    if not source:
        return "OFFLINE"
    if source.get("ok"):
        return "HEALTHY"
    return "STALE" if source.get("last_success_at") else "OFFLINE"


def build_response(state: dict[str, Any] | None, now: int) -> WeeklyBriefResponse:
    settings = get_settings()
    state = state or {}
    sources_state = state.get("sources", {})
    sources = [
        {
            "key": "calendar",
            "name": "Forex Factory 經濟日曆",
            "health": _health(sources_state.get("calendar")),
            "last_success_at": (sources_state.get("calendar") or {}).get("last_success_at"),
        },
        {
            "key": "markets",
            "name": "Yahoo Finance／Gate 行情",
            "health": _health(sources_state.get("markets")),
            "last_success_at": (sources_state.get("markets") or {}).get("last_success_at"),
        },
        {
            "key": "bls",
            "name": "BLS 美國勞工統計局",
            "health": _health(sources_state.get("bls")),
            "last_success_at": (sources_state.get("bls") or {}).get("last_success_at"),
        },
    ]
    view = assemble(state, now)
    ai_enabled = bool(settings.anthropic_api_key)
    if view is None:
        return WeeklyBriefResponse(
            generated_at=now,
            data_as_of=None,
            mode="warming",
            title="每週消息面",
            kicker="WEEKLY MACRO",
            week_start=None,
            week_end=None,
            week_label="",
            results=[],
            results_label="",
            kpis=[],
            closes=[],
            closes_label="",
            factors=[],
            factors_label="",
            calendar=[],
            narrative=None,
            sources=sources,
            notice="正在建立第一份經濟日曆，約一分鐘後重新整理即可看到。",
            ai_enabled=ai_enabled,
        )

    text = MODE_TEXT[view["mode"]]
    monday: date = view["monday"]
    stored = state.get("narrative") or {}
    narrative_payload = None
    notes: dict[str, str] = {}
    if stored.get("week_key") == view["week_key"] and stored.get("content"):
        content = stored["content"]
        notes = content.get("factor_notes", {})
        narrative_payload = {
            "headline": content.get("headline", []),
            "one_line": content.get("one_line", []),
            "markets": content.get("markets", []),
            "generated_at": int(stored.get("generated_at", 0)),
            "mode": stored.get("mode", view["mode"]),
            "stale": stored.get("fingerprint") != narrative_fingerprint(view, now),
        }
    for factor in view["factors"]:
        factor["note"] = notes.get(factor["id"])

    results_label = text["results"]
    if view["mode"] != "preview" and view["results_from_previous"]:
        results_label = "上週關鍵數據"

    notice = None
    if view["mode"] == "recap":
        notice = "下週經濟日曆會在 Forex Factory 換週後更新（約台灣時間週日下午）。"
    elif ai_enabled and narrative_payload is None:
        notice = "AI 觀察產生中，數據已先更新。"

    timestamps = [
        (sources_state.get(key) or {}).get("last_success_at") for key in ("calendar", "markets")
    ]
    data_as_of = max((int(t) for t in timestamps if t), default=None)
    return WeeklyBriefResponse(
        generated_at=now,
        data_as_of=data_as_of,
        mode=view["mode"],
        title=text["title"],
        kicker=text["kicker"],
        week_start=monday.isoformat(),
        week_end=(monday + timedelta(days=4)).isoformat(),
        week_label=week_label(monday),
        results=view["results"],
        results_label=results_label,
        kpis=view["kpis"],
        closes=view["closes"],
        closes_label=text["closes"],
        factors=view["factors"],
        factors_label=text["factors"],
        calendar=view["calendar"],
        narrative=narrative_payload,
        sources=sources,
        notice=notice,
        ai_enabled=ai_enabled,
    )


class WeeklyBriefCache:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._state: dict[str, Any] | None = None
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._backfilled = False
        self._narrative_failed_at = 0

    @property
    def state(self) -> dict[str, Any] | None:
        with self._lock:
            return self._state

    def response(self, now: int | None = None) -> WeeklyBriefResponse:
        return build_response(self.state, _now() if now is None else now)

    def refresh_once(self, now: int | None = None) -> None:
        now = _now() if now is None else now
        state = WeeklyBriefCollector().collect(self.state, now, backfill=not self._backfilled)
        self._backfilled = True
        self._refresh_narrative(state, now)
        with self._lock:
            self._state = state
        self._persist(state)

    def _refresh_narrative(self, state: dict[str, Any], now: int) -> None:
        settings = get_settings()
        if not settings.anthropic_api_key:
            return
        view = assemble(state, now)
        if view is None:
            return
        fingerprint = narrative_fingerprint(view, now)
        stored = state.get("narrative") or {}
        if stored.get("fingerprint") == fingerprint:
            return
        if now - self._narrative_failed_at < _NARRATIVE_RETRY_SECONDS:
            return
        context = narrative_context(view, now)
        try:
            content = narrative.generate(
                context,
                api_key=settings.anthropic_api_key,
                model=settings.weekly_brief_model or settings.analyst_model,
            )
        except Exception:
            logger.exception("Weekly brief narrative generation failed")
            self._narrative_failed_at = now
            return
        state["narrative"] = {
            "week_key": view["week_key"],
            "mode": view["mode"],
            "fingerprint": fingerprint,
            "generated_at": now,
            "content": content,
        }

    def next_wait(self, now: int | None = None) -> float:
        """Sleep until the next hourly refresh, release or mode boundary."""

        now = _now() if now is None else now
        interval = get_settings().weekly_brief_refresh_seconds
        wake = now + interval
        state = self.state or {}
        current_key, _ = _display_week(state)
        if current_key:
            for boundary in _mode_boundaries(date.fromisoformat(current_key)):
                if boundary + 60 > now:
                    wake = min(wake, boundary + 60)
            for event in state["weeks"][current_key]["events"]:
                if actuals.series_for(event) and event.get("timestamp"):
                    release = int(event["timestamp"]) + 180
                    if release > now:
                        wake = min(wake, release)
        return max(wake - now, 30.0)

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                self.refresh_once()
            except Exception:
                logger.exception("Weekly brief refresh failed")
            if self._stop.wait(self.next_wait()):
                break

    def start(self) -> None:
        if self._thread is not None:
            return
        self._load_latest()
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        self._thread = None

    def _load_latest(self) -> None:
        try:
            with SessionLocal() as db:
                row = db.scalar(
                    select(WeeklyBriefSnapshot).order_by(WeeklyBriefSnapshot.id.desc()).limit(1)
                )
                if row is not None:
                    with self._lock:
                        self._state = json.loads(row.payload)
        except Exception:
            logger.exception("Could not load persisted weekly brief")

    @staticmethod
    def _persist(state: dict[str, Any]) -> None:
        try:
            with SessionLocal() as db:
                row = WeeklyBriefSnapshot(
                    generated_at=int(state.get("generated_at", _now())),
                    payload=json.dumps(state, ensure_ascii=False, separators=(",", ":")),
                )
                db.add(row)
                db.flush()
                keep_from = max(row.id - 23, 0)
                if keep_from:
                    db.execute(delete(WeeklyBriefSnapshot).where(WeeklyBriefSnapshot.id <= keep_from))
                db.commit()
        except Exception:
            logger.exception("Could not persist weekly brief")


weekly_brief_cache = WeeklyBriefCache()
