from app.services.analysis_service import AnalysisService


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

