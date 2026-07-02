"""OI quadrant classification: deadband + server-side transition memory."""

from app.schemas.market import CandlePoint, LinePoint, MarketChartPayload
from app.schemas.scoring import MarketSnapshot
from app.services.analysis_service import _oi_mover
from app.services.anomaly_tracker import AnomalyTracker


def _chart(prices: list[float], oi: list[float]) -> MarketChartPayload:
    candles = [
        CandlePoint(time=i * 900, open=p, high=p, low=p, close=p, volume=100.0)
        for i, p in enumerate(prices)
    ]
    oi_points = [LinePoint(time=i * 900, value=v) for i, v in enumerate(oi)]
    return MarketChartPayload(candles=candles, cvd=[], open_interest=oi_points, funding_rate=[])


def _mover(prices: list[float], oi: list[float]):
    return _oi_mover(
        "TESTUSDT", _chart(prices, oi), prices[-1], 0.0, "15m",
        MarketSnapshot(long_liq_usd_1h=120.0, short_liq_usd_1h=350.0),
    )


def test_quiet_coin_is_flat_not_a_random_quadrant() -> None:
    # 1h price +0.05% and OI +0.1% is sign noise, not positioning — without the
    # deadband this coin flaps between quadrants and fakes 象限切換 alerts.
    prices = [100.0] * 8 + [100.05]
    oi = [1_000_000.0] * 8 + [1_001_000.0]
    mover = _mover(prices, oi)
    assert mover is not None
    assert mover.side == "持平"


def test_real_move_still_classifies_quadrant() -> None:
    prices = [100.0] * 8 + [101.2]          # +1.2% in 1h
    oi = [1_000_000.0] * 8 + [1_030_000.0]  # +3% in 1h
    mover = _mover(prices, oi)
    assert mover is not None
    assert mover.side == "多頭建倉"
    # Liquidation notionals ride along for the squeeze radar.
    assert mover.short_liq_usd_1h == 350.0


def test_oi_side_memory_swap_returns_previous_scan() -> None:
    tracker = AnomalyTracker()
    first = tracker.swap_oi_sides({"BTCUSDT": "多頭建倉", "ETHUSDT": "空頭建倉"})
    assert first == {}  # nothing recorded yet

    second = tracker.swap_oi_sides({"BTCUSDT": "空頭平倉"})
    assert second == {"BTCUSDT": "多頭建倉", "ETHUSDT": "空頭建倉"}

    third = tracker.swap_oi_sides({})
    assert third == {"BTCUSDT": "空頭平倉"}
