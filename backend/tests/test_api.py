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
