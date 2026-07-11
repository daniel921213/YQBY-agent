"""OI state classification: 3×3 deadbands + server-side transition memory."""

import pandas as pd
import pytest

from app.indicators.open_interest import analyze_open_interest_price_relation
from app.schemas.market import CandlePoint, LinePoint, MarketChartPayload
from app.schemas.scoring import MarketSnapshot
from app.services.analysis_service import _oi_mover
from app.services.anomaly_tracker import AnomalyTracker


def _chart(
    prices: list[float], oi: list[float], oi_usd: list[float] | None = None
) -> MarketChartPayload:
    candles = [
        CandlePoint(time=i * 900, open=p, high=p, low=p, close=p, volume=100.0)
        for i, p in enumerate(prices)
    ]
    oi_points = [LinePoint(time=i * 900, value=v) for i, v in enumerate(oi)]
    usd_points = [
        LinePoint(time=i * 900, value=v) for i, v in enumerate(oi_usd or oi)
    ]
    return MarketChartPayload(
        candles=candles,
        cvd=[],
        open_interest=oi_points,
        open_interest_usd=usd_points,
        funding_rate=[],
    )


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


def test_price_only_notional_change_is_not_position_flow() -> None:
    prices = [100.0] * 8 + [110.0]
    qty = [1_000_000.0] * 9
    usd = [100_000_000.0] * 8 + [110_000_000.0]
    mover = _oi_mover(
        "TESTUSDT",
        _chart(prices, qty, usd),
        prices[-1],
        0.0,
        "15m",
        MarketSnapshot(),
    )
    assert mover is not None
    assert mover.oi_delta_qty == 0.0
    assert mover.oi_delta == 0.0
    assert mover.side == "價格上漲／OI持平"


def test_oi_side_memory_swap_returns_previous_scan() -> None:
    tracker = AnomalyTracker()
    first = tracker.swap_oi_sides({"BTCUSDT": "多頭建倉", "ETHUSDT": "空頭建倉"})
    assert first == {}  # nothing recorded yet

    second = tracker.swap_oi_sides({"BTCUSDT": "空頭平倉"})
    assert second == {"BTCUSDT": "多頭建倉", "ETHUSDT": "空頭建倉"}

    third = tracker.swap_oi_sides({})
    assert third == {"BTCUSDT": "空頭平倉"}


@pytest.mark.parametrize(
    ("price_end", "oi_end", "expected_direction", "label_part"),
    [
        (101.0, 1_030_000.0, "LONG", "上漲增倉"),
        (100.1, 1_030_000.0, "NEUTRAL", "價格持平、OI 增加"),
        (99.0, 1_030_000.0, "SHORT", "下跌增倉"),
        (101.0, 1_005_000.0, "NEUTRAL", "價格上漲、OI 持平"),
        (100.1, 1_005_000.0, "NEUTRAL", "價格與 OI 持平"),
        (99.0, 1_005_000.0, "NEUTRAL", "價格下跌、OI 持平"),
        (101.0, 970_000.0, "NEUTRAL", "空頭退出"),
        (100.1, 970_000.0, "NEUTRAL", "去槓桿"),
        (99.0, 970_000.0, "NEUTRAL", "多頭退出"),
    ],
)
def test_indicator_classifies_all_nine_price_oi_states(
    price_end: float,
    oi_end: float,
    expected_direction: str,
    label_part: str,
) -> None:
    frame = pd.DataFrame(
        {
            "close": [100.0] * 47 + [price_end],
            "open_interest": [1_000_000.0] * 47 + [oi_end],
        }
    )

    signal = analyze_open_interest_price_relation(frame)

    assert signal.direction == expected_direction
    assert label_part in signal.label


def test_indicator_rejects_missing_or_nonpositive_oi() -> None:
    frame = pd.DataFrame(
        {
            "close": [100.0] * 48,
            "open_interest": [1_000_000.0] * 47 + [0.0],
        }
    )

    signal = analyze_open_interest_price_relation(frame)

    assert signal.direction == "NEUTRAL"
    assert signal.strength == 0.0
