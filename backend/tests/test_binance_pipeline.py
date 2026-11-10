"""Binance pipeline: candles, statistics, liquidation venues, sessions, markets."""

from __future__ import annotations

from datetime import datetime, timezone

import httpx
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.data_sources import binance_client, binance_live, liquidations
from app.services import market_sessions

NOW = 1_794_300_000  # a 5m and 15m boundary (2026-11-10 ~09:20 UTC)


class FakeClient:
    """Stand-in for BinanceHttpClient: canned JSON per path."""

    def __init__(self, routes: dict[str, object]) -> None:
        self.routes = routes
        self.calls: list[tuple[str, dict | None]] = []

    def get_json(self, path, params=None, *, cache=True, ttl=None, max_retries=3):
        self.calls.append((path, params))
        value = self.routes[path]
        return value(params) if callable(value) else value


def _kline(open_s: int, close: float, volume: float, taker_buy: float) -> list:
    return [open_s * 1000, "1", "2", "0.5", str(close), str(volume), open_s * 1000 + 299_999,
            str(volume * close), 10, str(taker_buy), "0", "0"]


def _stats(period: int, n: int, **fields) -> list[dict]:
    # Rows stamped at period boundaries, newest = the forming bar (excluded).
    start = NOW - period * (n - 1)
    return [{"timestamp": (start + i * period) * 1000, **fields} for i in range(n)]


@pytest.fixture
def frozen_now(monkeypatch):
    monkeypatch.setattr(binance_live.time, "time", lambda: NOW)
    monkeypatch.setattr(liquidations.time, "time", lambda: NOW)
    return NOW


def test_klines_drop_forming_candle_and_keep_binance_taker_split(monkeypatch, frozen_now):
    rows = [_kline(NOW - 600, 10.0, 100.0, 60.0), _kline(NOW - 300, 11.0, 50.0, 20.0),
            _kline(NOW, 12.0, 5.0, 5.0)]  # last one is still forming
    fake = FakeClient({"/fapi/v1/klines": rows})
    monkeypatch.setattr(binance_live, "get_binance_client", lambda: fake)

    frame = binance_live.BinanceLiveMarketDataSource().get_klines("BTCUSDT", "5m", 10)

    assert frame["timestamp"].tolist() == [NOW - 600, NOW - 300]
    assert frame["buy_volume"].tolist() == [60.0, 20.0]
    assert frame["sell_volume"].tolist() == [40.0, 30.0]
    assert frame["quote_volume"].tolist() == [1000.0, 550.0]
    assert set(frame["flow_quality"]) == {"REAL"}
    assert frame["cvd_proxy"].sum() == 0


def test_universe_families_split_crypto_from_tradfi(monkeypatch):
    info = {"symbols": [
        {"symbol": "BTCUSDT", "status": "TRADING", "quoteAsset": "USDT", "contractType": "PERPETUAL", "underlyingType": "COIN"},
        {"symbol": "BTCDOMUSDT", "status": "TRADING", "quoteAsset": "USDT", "contractType": "PERPETUAL", "underlyingType": "INDEX"},
        {"symbol": "XAUUSDT", "status": "TRADING", "quoteAsset": "USDT", "contractType": "TRADIFI_PERPETUAL", "underlyingType": "COMMODITY"},
        {"symbol": "NVDAUSDT", "status": "TRADING", "quoteAsset": "USDT", "contractType": "TRADIFI_PERPETUAL", "underlyingType": "EQUITY"},
        {"symbol": "IPOUSDT", "status": "TRADING", "quoteAsset": "USDT", "contractType": "TRADIFI_PERPETUAL", "underlyingType": "PREMARKET"},
        {"symbol": "OLDUSDT", "status": "SETTLING", "quoteAsset": "USDT", "contractType": "PERPETUAL", "underlyingType": "COIN"},
    ]}
    tickers = [{"symbol": s, "quoteVolume": v} for s, v in
               (("BTCUSDT", "9"), ("XAUUSDT", "5"), ("NVDAUSDT", "7"), ("IPOUSDT", "99"), ("BTCDOMUSDT", "1"))]
    fake = FakeClient({"/fapi/v1/exchangeInfo": info, "/fapi/v1/ticker/24hr": tickers})
    monkeypatch.setattr(binance_live, "get_binance_client", lambda: fake)
    monkeypatch.setattr(binance_live, "_instruments", binance_live._Instruments())

    assert binance_live.binance_ranked_symbols("crypto") == ["BTCUSDT"]
    assert binance_live.binance_ranked_symbols("tradfi") == ["NVDAUSDT", "XAUUSDT"]
    assert binance_live.underlying_type("XAUUSDT") == "COMMODITY"


def _derivative_routes(n: int = 6, period: int = 300) -> dict[str, object]:
    return {
        "/futures/data/openInterestHist": _stats(period, n, sumOpenInterest="100", sumOpenInterestValue="5000"),
        "/futures/data/topLongShortAccountRatio": _stats(period, n, longShortRatio="1.5"),
        "/futures/data/globalLongShortAccountRatio": _stats(period, n, longShortRatio="2.0"),
        "/fapi/v1/fundingRate": [
            {"fundingTime": (NOW - 8 * 3600) * 1000 + 1, "fundingRate": "0.0001"},
            {"fundingTime": (NOW - 4 * 3600) * 1000 + 1, "fundingRate": "0.0002"},
        ],
        "/fapi/v1/premiumIndex": [{"symbol": "XAUUSDT", "lastFundingRate": "0.0003", "nextFundingTime": (NOW + 600) * 1000}],
        "/fapi/v1/fundingInfo": [{"symbol": "XAUUSDT", "fundingIntervalHours": 4}],
    }


def test_derivatives_key_snapshots_to_closed_bars_and_attach_gate_liquidations(monkeypatch, frozen_now):
    fake = FakeClient(_derivative_routes())
    monkeypatch.setattr(binance_live, "get_binance_client", lambda: fake)
    gate = pd.DataFrame({
        "timestamp": [NOW - 600, NOW - 300],
        "long_liq_usd": [10.0, 0.0],
        "short_liq_usd": [0.0, 5.0],
        "liq_ref_oi_usd": [2000.0, 2100.0],
        "liq_ref_quote_volume": [900.0, 800.0],
    })
    monkeypatch.setattr(binance_live, "fetch_liquidations", lambda *a, **k: (gate, "GATE"))

    frame = binance_live.BinanceLiveDerivativesDataSource("tradfi").get_derivatives_metrics("XAUUSDT", "5m", 4)

    # The row stamped NOW belongs to the still-forming bar and is dropped.
    assert frame["timestamp"].max() == NOW - 300
    assert len(frame) == 4
    assert frame["open_interest_usd"].iloc[-1] == 5000.0
    # The 5m radar frame never reads ratios, so they are not fetched.
    assert frame["account_long_short_ratio"].isna().all()
    assert not any("LongShort" in path for path, _ in fake.calls)
    assert frame["liquidation_source"].iloc[-1] == "GATE"
    assert frame["short_liq_usd"].iloc[-1] == 5.0
    assert frame["long_liq_usd"].iloc[-2] == 10.0
    # The indicative funding rate sits on the latest bar only.
    assert frame["funding_rate_quality"].iloc[-1] == "CURRENT"
    assert frame["funding_rate"].iloc[-1] == 0.0003
    assert frame["funding_interval"].iloc[-1] == 4 * 3600
    assert frame["funding_rate_quality"].iloc[0] == "SETTLED"


def test_binance_statistics_gaps_do_not_drop_gate_liquidations(monkeypatch, frozen_now):
    routes = _derivative_routes()
    # Thin contract: Binance published no statistics row for the latest bar.
    routes["/futures/data/openInterestHist"] = routes["/futures/data/openInterestHist"][:-2]
    fake = FakeClient(routes)
    monkeypatch.setattr(binance_live, "get_binance_client", lambda: fake)
    gate = pd.DataFrame({
        "timestamp": [NOW - 600, NOW - 300], "long_liq_usd": [0.0, 7.0], "short_liq_usd": [0.0, 0.0],
        "liq_ref_oi_usd": [1.0, 1.0], "liq_ref_quote_volume": [1.0, 1.0],
    })
    monkeypatch.setattr(binance_live, "fetch_liquidations", lambda *a, **k: (gate, "GATE"))

    frame = binance_live.BinanceLiveDerivativesDataSource("tradfi").get_derivatives_metrics("UBERUSDT", "5m", 4)

    latest = frame.loc[frame["timestamp"] == NOW - 300].iloc[0]
    assert latest["long_liq_usd"] == 7.0 and latest["liquidation_source"] == "GATE"
    assert pd.isna(latest["open_interest_usd"])


def test_15m_frame_reads_account_and_top_trader_ratios(monkeypatch, frozen_now):
    fake = FakeClient(_derivative_routes(period=900))
    monkeypatch.setattr(binance_live, "get_binance_client", lambda: fake)
    monkeypatch.setattr(binance_live, "fetch_liquidations", lambda *a, **k: (liquidations._empty(), None))

    frame = binance_live.BinanceLiveDerivativesDataSource().get_derivatives_metrics("BTCUSDT", "15m", 4)

    assert frame["timestamp"].max() == NOW - 900
    assert frame["account_long_short_ratio"].iloc[-1] == 2.0
    assert frame["top_trader_long_short_ratio"].iloc[-1] == 1.5


def test_no_liquidation_venue_leaves_columns_out(monkeypatch, frozen_now):
    fake = FakeClient(_derivative_routes())
    monkeypatch.setattr(binance_live, "get_binance_client", lambda: fake)
    monkeypatch.setattr(binance_live, "fetch_liquidations", lambda *a, **k: (liquidations._empty(), None))

    frame = binance_live.BinanceLiveDerivativesDataSource().get_derivatives_metrics("XAUUSDT", "5m", 4)

    assert "long_liq_usd" not in frame.columns
    assert set(frame["liquidation_source"]) == {""}


def test_market_frame_marks_missing_liquidations_and_normalises_by_venue(monkeypatch, frozen_now):
    from app.services import market_data_service as mds

    service = mds.MarketDataService.__new__(mds.MarketDataService)
    service.market, service.provider = "tradfi", "binance"
    klines = pd.DataFrame({
        "timestamp": [NOW - 600, NOW - 300], "open": [1.0, 1.0], "high": [1.0, 1.0],
        "low": [1.0, 1.0], "close": [1.0, 1.0], "volume": [1.0, 1.0],
        "quote_volume": [1.0, 1.0], "buy_volume": [0.5, 0.5], "sell_volume": [0.5, 0.5],
        "flow_quality": ["REAL", "REAL"],
    })
    derivatives = pd.DataFrame({
        "timestamp": [NOW - 600, NOW - 300], "open_interest_qty": [1.0, 1.0],
        "open_interest_usd": [10.0, 10.0], "long_liq_usd": [float("nan"), 3.0],
        "short_liq_usd": [float("nan"), 0.0], "liq_ref_oi_usd": [4.0, 4.0],
        "liq_ref_quote_volume": [2.0, 2.0], "liquidation_source": ["BITGET", "BITGET"],
    })
    service.market_source = type("M", (), {"get_klines": lambda self, **k: klines})()
    service.derivatives_source = type("D", (), {
        "get_derivatives_metrics": lambda self, **k: derivatives,
        "get_ratio_history": lambda self, *a: pd.DataFrame(),
    })()

    frame = service.get_enriched_market_frame("XAUUSDT", "5m", 2, with_ratio_baseline=False)

    assert frame["liquidation_quality"].tolist() == ["MISSING", "REAL"]
    assert frame["liquidation_source"].tolist() == ["BITGET", "BITGET"]
    assert frame["liq_ref_quote_volume"].tolist() == [2.0, 2.0]


def test_bitget_records_bucket_by_side_and_respect_coverage():
    records = [
        {"ts": str((NOW - 290) * 1000), "side": "sell", "price": "100", "amount": "2"},   # long liq
        {"ts": str((NOW - 10) * 1000), "side": "buy", "price": "100", "amount": "1"},     # forming bar
        {"ts": str((NOW - 590) * 1000), "side": "buy", "price": "50", "amount": "1"},     # short liq
        {"ts": str((NOW - 3000) * 1000), "side": "sell", "price": "1", "amount": "1"},    # not covered
    ]
    frame = liquidations.bitget_frame(records, NOW - 1000, "5m", 10, now=NOW)

    # Buckets before the coverage start are omitted (read as MISSING).
    assert frame["timestamp"].min() == NOW - 900
    by_ts = frame.set_index("timestamp")
    assert by_ts.loc[NOW - 300, "long_liq_usd"] == 200.0
    assert by_ts.loc[NOW - 600, "short_liq_usd"] == 50.0
    assert by_ts.loc[NOW - 900, ["long_liq_usd", "short_liq_usd"]].tolist() == [0.0, 0.0]
    assert NOW not in by_ts.index  # forming bucket excluded


def test_liquidation_venue_order_gate_then_bitget_then_none(monkeypatch):
    gate_frame = pd.DataFrame({"timestamp": [1], "long_liq_usd": [1.0], "short_liq_usd": [0.0],
                               "liq_ref_oi_usd": [1.0], "liq_ref_quote_volume": [1.0]})
    monkeypatch.setattr(liquidations._gate_contracts, "get", lambda: frozenset({"BTCUSDT"}))
    monkeypatch.setattr(liquidations, "_gate_liquidations", lambda *a: gate_frame)
    bitget_calls = []

    class FakeBitget:
        def records(self, symbol, needed):
            bitget_calls.append(symbol)
            return [{"ts": str((NOW - 290) * 1000), "side": "sell", "price": "1", "amount": "1"}], None

    monkeypatch.setattr(liquidations, "_bitget", lambda: FakeBitget())
    monkeypatch.setattr(liquidations.time, "time", lambda: NOW)

    assert liquidations.fetch_liquidations("BTCUSDT", "5m", 4)[1] == "GATE"
    frame, source = liquidations.fetch_liquidations("ZENUSDT", "5m", 4, bitget_symbols={"ZENUSDT"})
    assert source == "BITGET" and not frame.empty
    assert liquidations.fetch_liquidations("NOPEUSDT", "5m", 4, bitget_symbols={"ZENUSDT"}) [1] is None
    assert bitget_calls == ["ZENUSDT"]


def test_http_451_blocks_binance_and_short_circuits(monkeypatch):
    binance_client.binance_block.clear()
    client = binance_client.BinanceHttpClient()
    calls = []

    def handler(request):
        calls.append(request.url.path)
        return httpx.Response(451, json={"code": 0, "msg": "restricted location"})

    client._client = httpx.Client(base_url="https://fapi.binance.com", transport=httpx.MockTransport(handler))
    try:
        with pytest.raises(binance_client.BinanceRestricted):
            client.get_json("/fapi/v1/ticker/24hr", cache=False)
        assert binance_client.binance_block.blocked
        with pytest.raises(binance_client.BinanceRestricted):
            client.get_json("/fapi/v1/exchangeInfo", cache=False)
        assert calls == ["/fapi/v1/ticker/24hr"]  # second call never left the process

        from app.services.market_data_service import effective_provider
        monkeypatch.setattr("app.services.market_data_service.get_settings",
                            lambda: type("S", (), {"data_provider": "binance"})())
        assert effective_provider("crypto") == "gate"
        assert effective_provider("tradfi") == "binance"
    finally:
        binance_client.binance_block.clear()


@pytest.mark.parametrize(
    ("asset", "moment", "expected"),
    [
        ("EQUITY", datetime(2026, 11, 10, 15, 0, tzinfo=timezone.utc), "OPEN"),     # Tue 10:00 ET
        ("EQUITY", datetime(2026, 11, 10, 22, 0, tzinfo=timezone.utc), "CLOSED"),   # Tue 17:00 ET
        ("EQUITY", datetime(2026, 11, 8, 15, 0, tzinfo=timezone.utc), "CLOSED"),    # Sunday
        ("EQUITY", datetime(2026, 11, 26, 15, 0, tzinfo=timezone.utc), "CLOSED"),   # Thanksgiving
        ("COMMODITY", datetime(2026, 11, 8, 23, 30, tzinfo=timezone.utc), "OPEN"),  # Sun 18:30 ET
        ("COMMODITY", datetime(2026, 11, 10, 22, 30, tzinfo=timezone.utc), "CLOSED"),  # daily break
        ("COMMODITY", datetime(2026, 11, 7, 12, 0, tzinfo=timezone.utc), "CLOSED"),  # Saturday
        ("HK_EQUITY", datetime(2026, 11, 10, 4, 30, tzinfo=timezone.utc), "CLOSED"),  # HK lunch
        ("HK_EQUITY", datetime(2026, 11, 10, 2, 0, tzinfo=timezone.utc), "OPEN"),
        ("KR_EQUITY", datetime(2026, 11, 10, 1, 0, tzinfo=timezone.utc), "OPEN"),   # 10:00 Seoul
        (None, datetime(2026, 11, 10, 1, 0, tzinfo=timezone.utc), None),
    ],
)
def test_underlying_sessions(asset, moment, expected):
    assert market_sessions.session_state(asset, moment) == expected


def _auth_client():
    from app.api.v1.routes.auth import require_active_user
    from app.main import app

    app.dependency_overrides[require_active_user] = lambda: object()
    return app, require_active_user


def test_tradfi_market_scans_its_own_universe_against_spy():
    app, dependency = _auth_client()
    try:
        with TestClient(app) as client:
            scan = client.get("/api/v1/scan", params={"market": "tradfi"}).json()
            assert scan["meta"]["market"] == "tradfi"
            assert "XAUUSDT" in scan["scanned_symbols"] and "BTCUSDT" not in scan["scanned_symbols"]
            assert scan["altseason"]["label"] in {"SPY主導", "偏SPY", "中性", "偏個股", "個股強勢"}

            analysis = client.get("/api/v1/analysis", params={"symbol": "NVDAUSDT", "market": "tradfi"}).json()
            rs = next(e for e in analysis["evidence"] if e["key"] == "relative_strength")
            assert "SPY" in rs["label"] and "BTC" not in rs["label"]

            crypto = client.get("/api/v1/scan").json()
            assert crypto["meta"]["market"] == "crypto"
            assert "BTCUSDT" in crypto["scanned_symbols"] and "XAUUSDT" not in crypto["scanned_symbols"]

            assert client.get("/api/v1/scan", params={"market": "stocks"}).status_code == 422
            history = client.get("/api/v1/anomaly-history", params={"market": "tradfi"})
            assert history.status_code == 200
    finally:
        app.dependency_overrides.pop(dependency, None)


def test_closed_session_blocks_tradfi_recommendations(monkeypatch):
    from app.services import analysis_service

    monkeypatch.setattr(analysis_service, "_tradfi_session", lambda *a: ("EQUITY", "CLOSED"))
    service = analysis_service.AnalysisService("tradfi")
    scan = service.scan_market(["NVDAUSDT", "QQQUSDT", "SPYUSDT"], "15m", "5m", "1h", 120)

    assert scan.universe
    for row in scan.universe:
        assert row.market_session == "CLOSED" and row.asset_class == "EQUITY"
        assert not row.trade_eligible
        assert analysis_service.SESSION_CLOSED_REASON in row.trade_failed_reasons
    assert not any(item.is_recommend for item in scan.items)
    # Closed-session contracts never reach the 5m radar list.
    assert scan.risk_radar is not None and not scan.risk_radar.items
