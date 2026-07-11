from app.services.analysis_service import AnalysisService
from app.scoring.engine import ScoringEngine
from app.services.market_data_service import MarketDataService


def test_analysis_service_returns_directional_recommendation() -> None:
    response = AnalysisService().analyze(
        symbol="BTCUSDT",
        primary_timeframe="15m",
        trigger_timeframe="5m",
        trend_timeframe="1h",
        lookback=120,
    )

    assert response.recommendation.direction in {"LONG", "SHORT"}
    assert 0 <= response.recommendation.score <= 100
    assert response.evidence
    assert response.chart.candles


def test_partial_flow_quality_cannot_contribute_cvd_or_volume_direction() -> None:
    service = MarketDataService()
    primary = service.get_enriched_market_frame("ETHUSDT", "15m", 120)
    btc = service.get_enriched_market_frame(
        "BTCUSDT", "15m", 120, with_derivatives=False
    )
    primary["flow_quality"] = "REAL"
    primary.loc[primary.index[-8:], "flow_quality"] = "MISSING"

    _, evidence, _ = ScoringEngine().score("ETHUSDT", primary, btc, "15m")
    by_key = {item.key: item for item in evidence}

    assert by_key["cvd_thrust"].direction == "NEUTRAL"
    assert by_key["cvd_thrust"].score == 0.0
    assert "覆蓋不足" in by_key["cvd_thrust"].description
    assert by_key["volume_surge"].direction == "NEUTRAL"
    assert by_key["volume_surge"].score == 0.0
    assert not any(item.key.startswith("cvd_bullish_") for item in evidence)
    assert not any(item.key.startswith("cvd_bearish_") for item in evidence)
