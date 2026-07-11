from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.services.scan_cache import ScanCache


def _service(symbols: list[str], total: int):
    return SimpleNamespace(
        market_data=SimpleNamespace(list_symbols=lambda: symbols),
        scan_market=lambda **kwargs: SimpleNamespace(
            breadth=SimpleNamespace(total=total)
        ),
    )


def test_refresh_rejects_an_empty_provider_universe(monkeypatch) -> None:
    cache = ScanCache()
    monkeypatch.setattr(
        "app.services.scan_cache.AnalysisService", lambda: _service([], 0)
    )

    with pytest.raises(RuntimeError, match="no tradable symbols"):
        cache.refresh_once()

    assert cache.latest is None


def test_refresh_does_not_replace_last_good_scan_with_empty_result(monkeypatch) -> None:
    cache = ScanCache()
    services = iter([_service(["BTCUSDT"], 1), _service(["BTCUSDT"], 0)])
    monkeypatch.setattr(
        "app.services.scan_cache.AnalysisService", lambda: next(services)
    )

    cache.refresh_once()
    previous = cache.latest

    with pytest.raises(RuntimeError, match="analyzed 0 of 1"):
        cache.refresh_once()

    assert cache.latest is previous
