import uuid

from fastapi.testclient import TestClient

from app.main import app


def _register_headers(client: TestClient) -> dict[str, str]:
    """Data endpoints are gated; register + redeem a 7d trial code (the real flow)."""
    uid = "t_" + uuid.uuid4().hex[:10]
    res = client.post("/api/v1/auth/register", json={"uid": uid, "password": "secret123"})
    assert res.status_code == 200
    headers = {"Authorization": f"Bearer {res.json()['token']}"}

    mint = client.post(
        "/api/v1/admin/codes",
        json={"tier": "7d", "count": 1},
        headers={"X-Admin-Key": "test-admin-secret"},
    )
    assert mint.status_code == 200
    redeem = client.post(
        "/api/v1/auth/redeem", json={"code": mint.json()["codes"][0]}, headers=headers
    )
    assert redeem.status_code == 200
    return headers


def test_data_endpoints_require_auth() -> None:
    with TestClient(app) as client:
        assert client.get("/api/v1/analysis", params={"symbol": "BTCUSDT"}).status_code == 401
        assert client.get("/api/v1/scan").status_code == 401
        assert client.get("/api/v1/anomaly-history").status_code == 401
        assert client.get("/api/v1/yokai").status_code == 401
        assert client.post("/api/v1/analyst/chat", json={"messages": []}).status_code == 401


def test_analysis_endpoint_returns_payload() -> None:
    with TestClient(app) as client:
        headers = _register_headers(client)

        response = client.get(
            "/api/v1/analysis", params={"symbol": "BTCUSDT", "lookback": 120}, headers=headers
        )

        assert response.status_code == 200
        payload = response.json()
        assert payload["recommendation"]["direction"] in {"LONG", "SHORT"}
        assert payload["evidence"]
        assert payload["chart"]["candles"]


def test_scan_endpoint_returns_ranked_market_items() -> None:
    with TestClient(app) as client:
        headers = _register_headers(client)

        response = client.get(
            "/api/v1/scan", params={"symbols": "BTCUSDT,ETHUSDT", "lookback": 120}, headers=headers
        )

        assert response.status_code == 200
        payload = response.json()
        # Items contain only signals that clear the recommendation/anomaly gate;
        # a stricter causal flow model may legitimately return none. The full
        # universe proves both requested symbols were still analyzed.
        assert len(payload["items"]) <= 2
        assert payload["breadth"]["total"] == 2
        assert len(payload["universe"]) == 2
        if payload["items"]:
            assert payload["items"][0]["rank"] == 1
            assert payload["items"][0]["symbol"] in {"BTCUSDT", "ETHUSDT"}
            assert payload["items"][0]["price"] > 0
            assert "change_24h" in payload["items"][0]
            assert payload["items"][0]["stage"] in {
                "早期異動", "趨勢啟動", "趨勢延續", "過熱風險", "反轉警訊", "觀察"
            }
            assert isinstance(payload["items"][0]["stage_reasons"], list)
        assert payload["risk_radar"]["timeframe"] == "5m"


def test_scan_endpoint_includes_altseason_and_oi_movers() -> None:
    with TestClient(app) as client:
        headers = _register_headers(client)

        response = client.get(
            "/api/v1/scan",
            params={"symbols": "BTCUSDT,ETHUSDT,SOLUSDT,XRPUSDT", "lookback": 200},
            headers=headers,
        )

        assert response.status_code == 200
        payload = response.json()
        altseason = payload["altseason"]
        assert 0 <= altseason["index"] <= 100
        assert altseason["label"] in {"BTC季", "偏BTC", "中性", "偏山寨", "山寨季"}
        assert payload["oi_movers"]
        mover = payload["oi_movers"][0]
        assert mover["side"] in {
            "多頭建倉", "空頭建倉", "空頭回補", "多頭去槓桿",
            "OI增倉／價格持平", "OI減倉／價格持平",
            "價格上漲／OI持平", "價格下跌／OI持平", "持平",
        }
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
    with TestClient(app) as client:
        headers = _register_headers(client)
        response = client.get(
            "/api/v1/analysis", params={"symbol": "ETHUSDT", "lookback": 120}, headers=headers
        )
        assert response.status_code == 200
        metrics = response.json()["metrics"]
        assert metrics is not None
        assert metrics["open_interest"] >= 0
        assert metrics["top_trader_ratio"] > 0


def test_anomaly_history_endpoint() -> None:
    with TestClient(app) as client:
        headers = _register_headers(client)
        response = client.get("/api/v1/anomaly-history", headers=headers)
        assert response.status_code == 200
        assert isinstance(response.json()["items"], list)


def test_yokai_endpoint_has_stable_empty_warmup_payload() -> None:
    with TestClient(app) as client:
        headers = _register_headers(client)
        response = client.get("/api/v1/yokai", headers=headers)
        assert response.status_code == 200
        payload = response.json()
        assert isinstance(payload["narratives"], list)
        assert isinstance(payload["qualified_longs"], list)
        assert "external_ready" in payload and "gate_ready" in payload
