from app.services.anomaly_tracker import (
    _STALE_AFTER_SECONDS,
    _TRIGGER_COOLDOWN_SECONDS,
    _TRIGGER_WINDOW_SECONDS,
    AnomalyTracker,
)
from app.schemas.scoring import ScanItem


def _item(symbol: str, price: float, direction: str = "LONG") -> ScanItem:
    return ScanItem(
        rank=1,
        symbol=symbol,
        direction=direction,
        score=62.0,
        confidence_level="MEDIUM",
        confluence_pillars=3,
        long_score=62.0,
        short_score=10.0,
        score_gap=52.0,
        is_anomaly=True,
        is_recommend=False,
        stage="趨勢啟動",
        stage_reasons=["量能 2.5× 異常放大"],
        triggered_count=3,
        pillars=[],
        top_evidence=[],
        price=price,
    )


def test_first_sight_marks_new_and_seeds_lifecycle() -> None:
    tracker = AnomalyTracker()
    item = _item("ETHUSDT", 100.0)
    tracker.record([item], now_ts=1_000)

    assert item.is_new is True
    assert item.first_seen_ts == 1_000
    assert item.first_seen_price == 100.0
    assert item.change_since_first == 0.0
    assert item.alert_trigger_count == 1
    assert item.frequency_tier == "low"


def test_rapid_polls_within_cooldown_count_as_one_trigger() -> None:
    tracker = AnomalyTracker()
    tracker.record([_item("ETHUSDT", 100.0)], now_ts=0)  # trigger #1
    # Five more polls a few seconds apart — all inside the cooldown.
    for _ in range(5):
        last = _item("ETHUSDT", 100.0)
        tracker.record([last], now_ts=100)

    assert last.is_new is False
    assert last.alert_trigger_count == 1  # polling cadence must not inflate it
    assert last.frequency_tier == "low"


def test_trigger_counted_again_after_cooldown_and_change_tracked() -> None:
    tracker = AnomalyTracker()
    tracker.record([_item("ETHUSDT", 100.0)], now_ts=0)
    later = _item("ETHUSDT", 110.0)
    tracker.record([later], now_ts=int(_TRIGGER_COOLDOWN_SECONDS) + 1)

    assert later.alert_trigger_count == 2  # past the cooldown -> a fresh trigger
    assert round(later.change_since_first, 4) == 0.1  # +10% since first alert


def test_triggers_outside_the_rolling_window_slide_out() -> None:
    tracker = AnomalyTracker()
    tracker.record([_item("ETHUSDT", 100.0)], now_ts=0)  # trigger at t=0
    it = _item("ETHUSDT", 100.0)
    tracker.record([it], now_ts=int(_TRIGGER_WINDOW_SECONDS) + 1)

    # The t=0 trigger has aged out of the 1h window; only the new one remains.
    assert it.alert_trigger_count == 1


def test_stale_alert_moves_to_history() -> None:
    tracker = AnomalyTracker()
    tracker.record([_item("ETHUSDT", 100.0)], now_ts=1_000)
    # A later scan that no longer contains ETHUSDT, far enough past the TTL.
    tracker.record([], now_ts=1_000 + int(_STALE_AFTER_SECONDS) + 1)

    history = tracker.history
    assert len(history) == 1
    assert history[0].symbol == "ETHUSDT"
    assert history[0].first_seen_price == 100.0


def test_altseason_index_and_label() -> None:
    tracker = AnomalyTracker()
    gauge = tracker.build_altseason(outperform=9, total=10, record=False)
    assert gauge.index == 90
    assert gauge.label == "山寨季"
    assert gauge.previous_index is None
