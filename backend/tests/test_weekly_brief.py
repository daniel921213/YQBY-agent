"""每週消息面: Forex Factory parsing, BLS actuals, closes, modes and AI guard."""

import uuid
from datetime import date, datetime, timezone

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.services.weekly_brief import actuals, markets, narrative, service
from app.services.weekly_brief.calendar import (
    TAIPEI,
    parse_calendar,
    rank_factors,
    translate_title,
    week_label,
    week_monday,
)


def _xml(rows: list[tuple]) -> bytes:
    events = []
    for title, country, day, clock, impact, forecast, previous in rows:
        events.append(
            "<event>"
            f"<title>{title}</title><country>{country}</country>"
            f"<date><![CDATA[{day}]]></date><time><![CDATA[{clock}]]></time>"
            f"<impact><![CDATA[{impact}]]></impact>"
            f"<forecast><![CDATA[{forecast}]]></forecast><previous><![CDATA[{previous}]]></previous>"
            "<url><![CDATA[https://www.forexfactory.com/calendar/1-x]]></url>"
            "</event>"
        )
    body = "".join(events)
    return f'<?xml version="1.0" encoding="windows-1252"?><weeklyevents>{body}</weeklyevents>'.encode(
        "cp1252"
    )


PREVIOUS_WEEK = _xml(
    [
        ("Daylight Saving Time Shift", "USD", "11-01-2026", "7:00am", "Holiday", "", ""),
        ("ISM Services PMI", "USD", "11-04-2026", "3:00pm", "Medium", "53.1", "52.4"),
        ("Average Hourly Earnings m/m", "USD", "11-06-2026", "1:30pm", "High", "0.3%", "0.1%"),
        ("Non-Farm Employment Change", "USD", "11-06-2026", "1:30pm", "High", "65K", "29K"),
        ("Unemployment Rate", "USD", "11-06-2026", "1:30pm", "High", "4.2%", "4.2%"),
    ]
)

CURRENT_WEEK = _xml(
    [
        ("Trade Balance", "CNY", "11-08-2026", "11:00pm", "Medium", "90.0B", "95.2B"),
        ("German Final Manufacturing PMI", "EUR", "11-09-2026", "8:55am", "Low", "49.6", "49.6"),
        ("CPI m/m", "USD", "11-10-2026", "1:30pm", "High", "0.3%", "0.6%"),
        ("Core CPI m/m", "USD", "11-10-2026", "1:30pm", "High", "0.3%", "0.3%"),
        ("CPI y/y", "USD", "11-10-2026", "1:30pm", "Medium", "3.1%", "3.0%"),
        ("Bank Holiday", "USD", "11-11-2026", "All Day", "Holiday", "", ""),
        ("FOMC Member Daly Speaks", "USD", "11-12-2026", "6:00pm", "Medium", "", ""),
        ("PPI m/m", "USD", "11-13-2026", "1:30pm", "High", "0.2%", "1.3%"),
        ("Unemployment Rate", "CAD", "11-13-2026", "1:30pm", "High", "6.5%", "6.5%"),
    ]
)


def _tpe(year: int, month: int, day: int, hour: int = 0, minute: int = 0) -> int:
    return int(datetime(year, month, day, hour, minute, tzinfo=TAIPEI).timestamp())


def _utc(year: int, month: int, day: int, hour: int = 0, minute: int = 0) -> int:
    return int(datetime(year, month, day, hour, minute, tzinfo=timezone.utc).timestamp())


# --- calendar -----------------------------------------------------------------


def test_feed_times_are_gmt_and_shown_in_taipei() -> None:
    events = {event["title"]: event for event in parse_calendar(PREVIOUS_WEEK)}

    nfp = events["Non-Farm Employment Change"]
    assert nfp["timestamp"] == _utc(2026, 11, 6, 13, 30)
    assert (nfp["date"], nfp["weekday"], nfp["time_label"]) == ("2026-11-06", "五", "21:30")
    assert nfp["title_zh"] == "非農新增就業" and nfp["country_zh"] == "美國"
    assert "Daylight Saving Time Shift" not in events


def test_all_day_events_keep_their_date_without_a_time() -> None:
    holiday = next(e for e in parse_calendar(CURRENT_WEEK) if e["title"] == "Bank Holiday")

    assert holiday["timestamp"] is None
    assert (holiday["date"], holiday["time_label"]) == ("2026-11-11", "全天")


def test_week_is_the_forex_factory_sunday_to_saturday_week() -> None:
    # The CNY release is Sunday evening US time, Monday morning in Taipei.
    assert week_monday(parse_calendar(CURRENT_WEEK)) == date(2026, 11, 9)
    assert week_monday(parse_calendar(PREVIOUS_WEEK)) == date(2026, 11, 2)
    assert week_label(date(2026, 11, 9)) == "NOV 9–13"
    assert week_label(date(2026, 11, 30)) == "NOV 30 – DEC 4"


@pytest.mark.parametrize(
    ("title", "expected"),
    [
        ("Core CPI m/m", "核心 CPI 月增率"),
        ("CPI y/y", "CPI 年增率"),
        ("German Final Manufacturing PMI", "德國製造業 PMI 終值"),
        ("FOMC Member Daly Speaks", "FOMC 委員 Daly 談話"),
        ("Fed Chair Warsh Speaks", "聯準會主席 Warsh 談話"),
        ("BOJ Gov Ueda Speaks", "日銀總裁 Ueda 談話"),
        ("30-y Bond Auction", "30 年期公債標售"),
        ("Some Brand New Indicator", "Some Brand New Indicator"),
    ],
)
def test_titles_are_translated(title: str, expected: str) -> None:
    assert translate_title(title) == expected


def test_factors_group_simultaneous_releases_and_rank_us_first() -> None:
    factors = rank_factors(parse_calendar(CURRENT_WEEK))
    titles = [factor["title"] for factor in factors]

    assert titles[0] == "美國 CPI 消費者物價"
    assert len(factors[0]["event_ids"]) == 3
    assert titles.index("美國 PPI 生產者物價") < titles.index("加拿大 失業率")
    holiday = next(f for f in factors if f["title"] == "美國 銀行假日")
    assert holiday["holiday_note"] == "美股照常交易、債市休市，流動性較差"
    assert [f["rank"] for f in factors] == list(range(1, len(factors) + 1))


# --- BLS actuals --------------------------------------------------------------

_OBSERVATIONS = {
    "CES0000000001": {"2026-08": 159068.0, "2026-09": 159128.0, "2026-10": 159293.0},
    "LNS14000000": {"2026-09": 4.2, "2026-10": 4.1},
    "CES0500000003": {"2026-09": 37.86, "2026-10": 38.00},
    "CUSR0000SA0": {"2026-09": 336.298, "2026-10": 337.306},
    "CUUR0000SA0": {"2025-10": 326.5, "2026-10": 337.0},
    "JTS000000000000000JOL": {"2026-08": 7190.0, "2026-09": 7523.0},
}


def _event(title: str, when: int, country: str = "USD") -> dict:
    return {"title": title, "country": country, "timestamp": when}


def test_actuals_are_rebuilt_from_bls_in_forex_factory_format() -> None:
    jobs_day = _utc(2026, 11, 6, 13, 30)
    cpi_day = _utc(2026, 11, 10, 13, 30)

    assert actuals.compute_actual(_event("Non-Farm Employment Change", jobs_day), _OBSERVATIONS) == "165K"
    assert actuals.compute_actual(_event("Unemployment Rate", jobs_day), _OBSERVATIONS) == "4.1%"
    assert actuals.compute_actual(_event("Average Hourly Earnings m/m", jobs_day), _OBSERVATIONS) == "0.4%"
    assert actuals.compute_actual(_event("CPI m/m", cpi_day), _OBSERVATIONS) == "0.3%"
    assert actuals.compute_actual(_event("CPI y/y", cpi_day), _OBSERVATIONS) == "3.2%"
    # JOLTS reports two months back.
    jolts_day = _utc(2026, 11, 3, 15)
    assert actuals.compute_actual(_event("JOLTS Job Openings", jolts_day), _OBSERVATIONS) == "7.52M"
    # Same title from another country is not a BLS series.
    assert actuals.compute_actual(_event("Unemployment Rate", jobs_day, "CAD"), _OBSERVATIONS) is None


def test_a_stale_bls_month_is_never_shown_as_the_new_release() -> None:
    december_jobs = _utc(2026, 12, 4, 13, 30)  # needs November; BLS still ends at October

    assert actuals.compute_actual(_event("Non-Farm Employment Change", december_jobs), _OBSERVATIONS) is None
    assert actuals.pending_series(
        [_event("Non-Farm Employment Change", december_jobs)],
        _OBSERVATIONS,
        december_jobs + 600,
        include_old=False,
    ) == ["CES0000000001"]
    # Twelve hours later we stop retrying (unless backfilling after a restart).
    later = december_jobs + actuals.PENDING_WINDOW_SECONDS + 1
    event = [_event("Non-Farm Employment Change", december_jobs)]
    assert actuals.pending_series(event, _OBSERVATIONS, later, include_old=False) == []
    assert actuals.pending_series(event, _OBSERVATIONS, later, include_old=True) == ["CES0000000001"]


@pytest.mark.parametrize(
    ("actual", "forecast", "expected"),
    [("165K", "65K", "ABOVE"), ("4.1%", "4.2%", "BELOW"), ("0.3%", "0.3%", "INLINE"), (None, "1%", None)],
)
def test_verdict_compares_actual_with_forecast(actual, forecast, expected) -> None:
    assert actuals.verdict(actual, forecast) == expected


# --- market closes ------------------------------------------------------------


def _yahoo(days: list[tuple[int, int, float]], offset: int = -18000) -> dict:
    stamps = [_utc(2026, month, day, 14, 30) for month, day, _ in days]
    return {
        "chart": {
            "result": [
                {
                    "meta": {"gmtoffset": offset},
                    "timestamp": stamps,
                    "indicators": {"quote": [{"close": [close for _, _, close in days]}]},
                }
            ]
        }
    }


def test_week_change_is_measured_from_the_prior_friday_close() -> None:
    spx = next(i for i in markets.INSTRUMENTS if i.key == "spx")
    bars = markets._yahoo_bars(
        _yahoo([(10, 30, 7580.0), (11, 2, 7600.0), (11, 5, 7354.0), (11, 6, 7376.86)])
    )
    summary = markets.summarize(spx, bars)

    assert summary["as_of"] == "2026-11-06"
    assert summary["day_change"] == pytest.approx(0.31, abs=0.01)
    assert summary["week_change"] == pytest.approx(-2.68, abs=0.01)


def test_yield_changes_are_in_basis_points() -> None:
    tnx = next(i for i in markets.INSTRUMENTS if i.key == "us10y")
    summary = markets.summarize(tnx, [(date(2026, 10, 30), 4.929), (date(2026, 11, 6), 4.859)])

    assert summary["change_unit"] == "bp"
    assert summary["week_change"] == pytest.approx(-7.0)


# --- modes and assembly -------------------------------------------------------


def test_mode_switches_on_taipei_monday_and_after_the_us_friday_close() -> None:
    monday = date(2026, 11, 9)

    assert service.mode_for(monday, _tpe(2026, 11, 8, 20)) == "preview"
    assert service.mode_for(monday, _tpe(2026, 11, 9)) == "live"
    assert service.mode_for(monday, _tpe(2026, 11, 14, 5, 59)) == "live"
    assert service.mode_for(monday, _tpe(2026, 11, 14, 6)) == "recap"


def _state() -> dict:
    return {
        "weeks": {
            "2026-11-02": {"events": parse_calendar(PREVIOUS_WEEK), "fetched_at": 0},
            "2026-11-09": {"events": parse_calendar(CURRENT_WEEK), "fetched_at": 0},
        },
        "bls": _OBSERVATIONS,
        "sources": {"calendar": {"ok": True, "last_success_at": 100}},
        "quotes": {},
    }


def test_preview_shows_last_weeks_results_and_next_weeks_factors() -> None:
    response = service.build_response(_state(), _tpe(2026, 11, 8, 20))

    assert response.mode == "preview"
    assert response.title == "下週行情展望" and response.week_label == "NOV 9–13"
    assert response.results_label == "上週關鍵數據"
    assert [(e.title_zh, e.actual, e.verdict) for e in response.results] == [
        ("非農新增就業", "165K", "ABOVE"),
        ("失業率", "4.1%", "BELOW"),
        ("平均時薪 月增率", "0.4%", "ABOVE"),
    ]
    assert response.factors[0].title == "美國 CPI 消費者物價"
    assert not any(f.released for f in response.factors)


def test_live_mode_switches_results_to_this_weeks_releases() -> None:
    response = service.build_response(_state(), _utc(2026, 11, 10, 14))

    assert response.mode == "live"
    assert response.results_label == "本週已公布數據"
    assert [(e.title_zh, e.actual) for e in response.results] == [
        ("CPI 月增率", "0.3%"),
        ("核心 CPI 月增率", None),  # BLS core series not loaded in this fixture
    ]
    assert response.factors[0].released


def test_an_actual_is_never_shown_before_its_release_time() -> None:
    state = _state()
    # BLS already holds October CPI, but at 21:00 Taipei the 21:30 release has not happened.
    response = service.build_response(state, _tpe(2026, 11, 10, 21))

    cpi = next(e for e in response.calendar if e.title == "CPI m/m")
    assert cpi.actual is None and not cpi.released


def test_recap_mode_explains_when_next_week_arrives() -> None:
    response = service.build_response(_state(), _tpe(2026, 11, 14, 9))

    assert response.mode == "recap" and response.title == "本週行情回顧"
    assert "週日下午" in (response.notice or "")


def test_empty_state_is_a_warming_page() -> None:
    response = service.build_response(None, _tpe(2026, 11, 8, 20))

    assert response.mode == "warming" and response.calendar == []


# --- collector end to end -----------------------------------------------------


def test_collector_reads_every_source_and_keeps_last_good_quotes(monkeypatch) -> None:
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        host = request.url.host
        calls.append(host)
        if host == "nfs.faireconomy.media":
            return httpx.Response(200, content=CURRENT_WEEK)
        if host == "api.bls.gov":
            return httpx.Response(
                200,
                json={
                    "status": "REQUEST_SUCCEEDED",
                    "Results": {
                        "series": [
                            {
                                "seriesID": "CUSR0000SA0",
                                "data": [
                                    {"year": "2026", "period": "M10", "value": "337.306"},
                                    {"year": "2026", "period": "M09", "value": "336.298"},
                                    {"year": "2026", "period": "M13", "value": "0"},
                                ],
                            }
                        ]
                    },
                },
            )
        if host == "api.gateio.ws":
            return httpx.Response(200, json=[[str(_utc(2026, 11, 9)), "0", "76000", "0", "0", "0", "0", "true"]])
        if "GSPC" in str(request.url):
            return httpx.Response(500)
        return httpx.Response(200, json=_yahoo([(11, 6, 100.0), (11, 9, 101.0)]))

    real_client = httpx.Client
    monkeypatch.setattr(
        service.httpx, "Client", lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs)
    )
    previous = {"quotes": {"spx": {"key": "spx", "name": "S&P 500", "last": 1.0}}}
    now = _utc(2026, 11, 10, 14)

    state = service.WeeklyBriefCollector().collect(previous, now, backfill=True)

    assert list(state["weeks"]) == ["2026-11-09"]
    assert state["bls"]["CUSR0000SA0"] == {"2026-09": 336.298, "2026-10": 337.306}
    assert state["quotes"]["spx"]["stale"] is True and state["quotes"]["spx"]["last"] == 1.0
    assert state["quotes"]["btc"]["last"] == 76000.0
    assert state["sources"]["markets"]["ok"] is False
    assert calls.count("api.bls.gov") == 1

    # A second refresh inside the retry window does not hit BLS again.
    service.WeeklyBriefCollector().collect(state, now + 600, backfill=False)
    assert calls.count("api.bls.gov") == 1


# --- AI notes -----------------------------------------------------------------


def test_ai_lines_with_unsourced_numbers_are_dropped() -> None:
    context = {
        "factors": [{"id": "USD-1", "title": "美國 CPI", "events": [{"forecast": "0.3%"}]}],
        "markets": [{"name": "S&P 500", "last": 7376.86, "week_change": -2.68}],
    }
    raw = {
        "headline": ["CPI 預期 0.3%，關注是否再熱", "12 月升息機率 79.1%"],
        "factor_notes": [{"id": "USD-1", "note": "高於 0.3% 即雙熱"}, {"id": "nope", "note": "x"}],
        "markets": [
            {"market": "幣圈", "points": ["跟隨美股情緒"]},
            {"market": "美股", "points": ["S&P 500 收 7,376.86，本週 -2.68%", "守 7,400 點"]},
            {"market": "外星", "points": ["不存在"]},
        ],
        "one_line": ["CPI 過關 → 反彈", "失靈 → 回測"],
    }

    clean = narrative.sanitize(raw, context)

    assert clean["headline"] == ["CPI 預期 0.3%，關注是否再熱"]
    assert clean["factor_notes"] == {"USD-1": "高於 0.3% 即雙熱"}
    assert clean["markets"] == [
        {"market": "美股", "points": ["S&P 500 收 7,376.86，本週 -2.68%"]},
        {"market": "幣圈", "points": ["跟隨美股情緒"]},
    ]
    assert clean["one_line"] == ["CPI 過關 → 反彈", "失靈 → 回測"]


def test_ai_notes_are_written_once_per_fingerprint(monkeypatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "anthropic_api_key", "test-key")
    seen: list[dict] = []

    def fake_generate(context, *, api_key, model):  # noqa: ANN001
        seen.append(context)
        return {"headline": ["A"], "factor_notes": {}, "markets": [], "one_line": ["B"]}

    monkeypatch.setattr(service.narrative, "generate", fake_generate)
    cache = service.WeeklyBriefCache()
    state = _state()
    now = _tpe(2026, 11, 8, 20)

    cache._refresh_narrative(state, now)
    cache._refresh_narrative(state, now + 600)
    assert len(seen) == 1
    assert seen[0]["mode"] == "preview"
    assert seen[0]["released_results"][0]["actual_zh"] == "16.5 萬"

    response = service.build_response(state, now)
    assert response.narrative is not None and response.narrative.headline == ["A"]
    assert response.narrative.stale is False

    # Monday turns the page into live mode, which needs fresh notes.
    cache._refresh_narrative(state, _tpe(2026, 11, 9, 1))
    assert len(seen) == 2 and seen[1]["mode"] == "live"


def test_no_api_key_means_no_ai_call(monkeypatch) -> None:
    monkeypatch.setattr(get_settings(), "anthropic_api_key", None)
    monkeypatch.setattr(service.narrative, "generate", lambda *a, **k: pytest.fail("called"))

    state = _state()
    service.WeeklyBriefCache()._refresh_narrative(state, _tpe(2026, 11, 8, 20))

    assert "narrative" not in state


def test_wakes_up_shortly_after_a_tracked_release() -> None:
    cache = service.WeeklyBriefCache()
    cache._state = _state()
    before_cpi = _utc(2026, 11, 10, 13)

    assert cache.next_wait(before_cpi) == pytest.approx(30 * 60 + 180)


# --- API ----------------------------------------------------------------------


def test_weekly_brief_needs_any_signed_in_account() -> None:
    from app.main import app

    with TestClient(app) as client:
        assert client.get("/api/v1/weekly-brief").status_code == 401
        uid = "t_" + uuid.uuid4().hex[:10]
        token = client.post("/api/v1/auth/register", json={"uid": uid, "password": "secret123"}).json()[
            "token"
        ]
        response = client.get("/api/v1/weekly-brief", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json()["mode"] in {"warming", "preview", "live", "recap"}
