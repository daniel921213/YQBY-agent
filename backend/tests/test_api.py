from fastapi.testclient import TestClient

from app.main import app


def test_analysis_endpoint_returns_payload() -> None:
    client = TestClient(app)

    response = client.get("/api/v1/analysis", params={"symbol": "BTCUSDT", "lookback": 120})

    assert response.status_code == 200
    payload = response.json()
    assert payload["recommendation"]["direction"] in {"LONG", "SHORT"}
    assert payload["evidence"]
    assert payload["chart"]["candles"]


def test_scan_endpoint_returns_ranked_market_items() -> None:
    client = TestClient(app)

    response = client.get("/api/v1/scan", params={"symbols": "BTCUSDT,ETHUSDT", "lookback": 120})

    assert response.status_code == 200
    payload = response.json()
    assert len(payload["items"]) == 2
    assert payload["items"][0]["rank"] == 1
    assert payload["items"][0]["symbol"] in {"BTCUSDT", "ETHUSDT"}
    # New per-item spot reads are always present.
    assert payload["items"][0]["price"] > 0
    assert "change_24h" in payload["items"][0]


def test_scan_endpoint_includes_altseason_and_oi_movers() -> None:
    client = TestClient(app)

    response = client.get(
        "/api/v1/scan", params={"symbols": "BTCUSDT,ETHUSDT,SOLUSDT,XRPUSDT", "lookback": 200}
    )

    assert response.status_code == 200
    payload = response.json()
    altseason = payload["altseason"]
    assert 0 <= altseason["index"] <= 100
    assert altseason["label"] in {"BTC季", "偏BTC", "中性", "偏山寨", "山寨季"}
    assert payload["oi_movers"]
    mover = payload["oi_movers"][0]
    assert mover["side"] in {"多頭建倉", "空頭建倉", "多頭平倉", "空頭平倉", "持平"}
    assert mover["total_oi"] > 0
    # Quadrant chart Y axis: 1h price change shipped alongside the 1h OI change.
    assert "price_change_1h" in mover

    # Full universe (every scanned symbol) powers the screener + data rankings.
    universe = payload["universe"]
    assert len(universe) == 4
    row = universe[0]
    assert row["price"] > 0
    assert row["direction"] in {"LONG", "SHORT", "NEUTRAL"}
    assert len(row["pillars"]) == 5
    assert "funding_rate" in row and "top_trader_ratio" in row
    # Sorted by score, descending.
    scores = [r["score"] for r in universe]
    assert scores == sorted(scores, reverse=True)


def test_analysis_endpoint_includes_metrics_snapshot() -> None:
    client = TestClient(app)
    response = client.get("/api/v1/analysis", params={"symbol": "ETHUSDT", "lookback": 120})
    assert response.status_code == 200
    metrics = response.json()["metrics"]
    assert metrics is not None
    assert metrics["open_interest"] >= 0
    assert metrics["top_trader_ratio"] > 0


def test_anomaly_history_endpoint() -> None:
    client = TestClient(app)
    response = client.get("/api/v1/anomaly-history")
    assert response.status_code == 200
    assert isinstance(response.json()["items"], list)
