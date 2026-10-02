from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from pandas.testing import assert_frame_equal

from app.services import symbol_universe as module
from app.services.symbol_universe import SymbolUniverse, UniverseUnavailable, UnsupportedSymbol, bitget_symbols


def instrument(base="BTC", **overrides):
    return dict(dict(symbol=base + "USDT", baseCoin=base, quoteCoin="USDT",
                     category="USDT-FUTURES", type="perpetual", status="online", symbolType="crypto"), **overrides)


def test_instruments_require_matching_base_quote_and_tradable_crypto_perpetual():
    rows = [instrument(), instrument("1000PEPE"), instrument("ETH", status="offline"),
            instrument("SOL", type="delivery"), instrument("XAU", symbolType="metal"),
            instrument("BAD", symbol="OTHERUSDT"), instrument("USDC", quoteCoin="USDC"),
            instrument("NEW", status="listed"), instrument("LIMIT", status="limit_open")]
    assert bitget_symbols({"code": "00000", "data": rows}) == {"BTCUSDT", "1000PEPEUSDT"}


@pytest.mark.parametrize("payload", [{"code": "40000"}, {"code": "00000", "data": []},
                                      {"code": "00000", "data": [None]}])
def test_bad_catalog_fails_closed(payload):
    with pytest.raises(UniverseUnavailable):
        bitget_symbols(payload)


def test_full_intersection_preserves_gate_order_and_has_no_150_cap():
    gate = [f"COIN{i}USDT" for i in range(200)] + ["GATEONLYUSDT", "PEPEUSDT"]
    bitget = set(gate[:200]) | {"BITGETONLYUSDT", "1000PEPEUSDT"}
    universe = SymbolUniverse(fetch=lambda: bitget)
    from app.data_sources.gate_live import GateLiveMarketDataSource
    source = object.__new__(GateLiveMarketDataSource)
    source._settings = SimpleNamespace(scan_universe_size=150)
    source._list_gate_symbols = lambda: gate
    from unittest.mock import patch
    with patch.object(module, "symbol_universe", universe):
        assert source.list_symbols() == gate[:200]


def test_cache_single_refresh_bounded_fallback_retry_and_recovery():
    now = [0]
    calls = []
    response = [{"BTCUSDT", "ETHUSDT"}]
    def fetch():
        calls.append(1)
        if isinstance(response[0], Exception):
            raise response[0]
        return response[0]
    universe = SymbolUniverse(fetch=fetch, clock=lambda: now[0])
    gate = lambda: ["BTCUSDT", "ETHUSDT"]
    with ThreadPoolExecutor(max_workers=8) as pool:
        assert all(x == gate() for x in pool.map(lambda _: universe.symbols(gate), range(20)))
    assert len(calls) == 1
    response[0] = RuntimeError("outage")
    now[0] = 301
    assert universe.symbols(gate) == gate()
    assert universe.symbols(gate) == gate()
    assert len(calls) == 2  # retry cooldown, not one request per scanned coin
    now[0] = 1800
    with pytest.raises(UniverseUnavailable):
        universe.symbols(gate)
    response[0] = {"ETHUSDT"}
    now[0] = 1831
    assert universe.symbols(gate) == ["ETHUSDT"]


def test_no_successful_cache_never_falls_back_to_gate_only():
    universe = SymbolUniverse(fetch=lambda: set())
    with pytest.raises(UniverseUnavailable):
        universe.symbols(lambda: ["BTCUSDT"])


def test_analysis_and_explicit_scan_reject_unsupported_before_fetch(monkeypatch):
    from app.services.analysis_service import AnalysisService
    monkeypatch.setattr(module, "allowed_symbols", lambda: {"BTCUSDT"})
    service = AnalysisService()
    monkeypatch.setattr(service.market_data, "get_enriched_market_frame",
                        lambda *a, **kw: pytest.fail("Must reject before fetching data"))
    with pytest.raises(UnsupportedSymbol):
        service.analyze("GATEONLYUSDT", "15m", "5m", "1h", 120)
    with pytest.raises(UnsupportedSymbol):
        service.scan_market(["GATEONLYUSDT"], "15m", "5m", "1h", 120)


def test_stale_scan_with_removed_coin_is_not_served(monkeypatch):
    from app.services import scan_cache as cache_module
    cache = cache_module.ScanCache()
    cache._latest = SimpleNamespace(scanned_symbols=["BTCUSDT", "OLDUSDT"])
    monkeypatch.setattr(cache_module, "allowed_symbols", lambda: {"BTCUSDT"})
    assert cache.latest is None


def test_expired_catalog_blocks_old_scan_and_keeps_news_available(monkeypatch):
    from app.services import scan_cache as cache_module
    from app.api.v1.routes import yokai
    cache = cache_module.ScanCache()
    cache._latest = SimpleNamespace(scanned_symbols=["BTCUSDT"])
    def unavailable():
        raise UniverseUnavailable("expired")
    monkeypatch.setattr(cache_module, "allowed_symbols", unavailable)
    with pytest.raises(UniverseUnavailable):
        _ = cache.latest
    monkeypatch.setattr(yokai, "scan_cache", cache)
    monkeypatch.setattr(yokai, "yokai_cache", SimpleNamespace(response=lambda scan: {"news": True, "scan": scan}))
    assert yokai.yokai_overview() == {"news": True, "scan": None}


def test_ai_waits_for_background_scan_instead_of_reporting_30_coin_universe(monkeypatch):
    from app.services import analyst_service as ai
    monkeypatch.setattr(ai, "scan_cache", SimpleNamespace(latest=None))
    monkeypatch.setattr(ai, "AnalysisService", lambda: SimpleNamespace(
        settings=SimpleNamespace(is_live_provider=True, scan_background=True)))
    with pytest.raises(UniverseUnavailable):
        ai._get_scan()


def test_ai_gate_tool_checks_individual_requests_and_filters_before_truncating(monkeypatch):
    from app.services import analyst_service as ai
    monkeypatch.setattr(ai, "allowed_symbols", lambda: {"BTCUSDT"})
    calls = []
    def get(url, **kwargs):
        calls.append(url)
        return SimpleNamespace(raise_for_status=lambda: None,
                               json=lambda: [{"contract": "OLD_USDT"}] * 15 + [{"contract": "BTC_USDT", "last": "100"}])
    monkeypatch.setattr(ai.httpx, "get", get)
    base = "https://api.gateio.ws/api/v4/futures/usdt/"
    assert "error" in ai._tool_gate_query(base + "tickers?contract=OLD_USDT")
    assert "error" in ai._tool_gate_query(base + "candlesticks")
    assert not calls
    assert ai._tool_gate_query(base + "tickers") == {"data": [{"contract": "BTC_USDT", "last": "100"}]}


def test_http_returns_clear_errors_without_starting_background_jobs(monkeypatch):
    from app.main import app
    from app.api.v1.routes.auth import require_active_user
    app.dependency_overrides[require_active_user] = lambda: object()
    client = TestClient(app)
    try:
        monkeypatch.setattr(module, "allowed_symbols", lambda: {"BTCUSDT"})
        assert client.get("/api/v1/analysis?symbol=OLDUSDT").status_code == 422
        def unavailable():
            raise UniverseUnavailable("unavailable")
        monkeypatch.setattr(module, "allowed_symbols", unavailable)
        assert client.get("/api/v1/analysis?symbol=BTCUSDT").status_code == 503
    finally:
        app.dependency_overrides.pop(require_active_user, None)


def test_fixed_frames_produce_identical_analysis_and_scan_after_eligibility_filter(monkeypatch):
    from app.services.analysis_service import AnalysisService
    service = AnalysisService()
    frames = {}
    original = service.market_data.get_enriched_market_frame
    def fixed(symbol, timeframe, limit, with_derivatives=True):
        key = symbol, timeframe, limit, with_derivatives
        if key not in frames:
            frames[key] = original(symbol, timeframe, limit, with_derivatives).copy(deep=True)
        return frames[key].copy(deep=True)
    monkeypatch.setattr(service.market_data, "get_enriched_market_frame", fixed)
    monkeypatch.setattr("app.services.analysis_service.time.time", lambda: 1790880000)
    monkeypatch.setattr(module, "allowed_symbols", lambda: None)
    before = service.scan_market(["BTCUSDT", "ETHUSDT"], "15m", "5m", "1h", 120)
    snapshots = {key: frame.copy(deep=True) for key, frame in frames.items()}
    monkeypatch.setattr(module, "allowed_symbols", lambda: {"BTCUSDT", "ETHUSDT"})
    after = service.scan_market(["BTCUSDT", "ETHUSDT"], "15m", "5m", "1h", 120)
    assert before.model_dump() == after.model_dump()
    for key, frame in snapshots.items():
        assert_frame_equal(frame, frames[key])
