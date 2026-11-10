from __future__ import annotations

import logging
import threading
import time

from app.core.config import get_settings
from app.core.constants import (
    DEFAULT_LOOKBACK_CANDLES,
    PRIMARY_TIMEFRAME,
    TREND_TIMEFRAME,
    TRIGGER_TIMEFRAME,
)
from app.core.markets import Market
from app.data_sources.binance_client import BinanceRestricted, binance_block
from app.schemas.scoring import ScanResponse
from app.services.analysis_service import AnalysisService
from app.services.market_data_service import effective_provider
from app.services.symbol_universe import allowed_symbols


logger = logging.getLogger("uvicorn.error.scan_cache")

# Shortest pause between two scans when a scan ran past its cadence.
_MIN_PAUSE_SECONDS = 30.0
BINANCE_BLOCKED_NOTICE = "Binance 數據暫時無法取得（伺服器所在地區被 Binance 限制），請稍後再試。"


class ScanCache:
    """Holds one dashboard's latest full-universe scan, refreshed in background.

    Scanning every perpetual live exceeds the exchanges' per-IP rate limits,
    so we do it on a timer and serve the cached result instantly. A quick
    warm-up pass (top symbols by volume) populates the dashboard within ~1 min
    while the full scan completes in the background.
    """

    def __init__(self, market: Market = "crypto") -> None:
        self.market: Market = market
        self._lock = threading.Lock()
        self._latest: ScanResponse | None = None
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self.last_error: str | None = None

    @property
    def latest(self) -> ScanResponse | None:
        with self._lock:
            latest = self._latest
        if latest is not None:
            allowed = allowed_symbols(self.market)
            if allowed is not None and not set(latest.scanned_symbols).issubset(allowed):
                return None
        return latest

    @property
    def notice(self) -> str | None:
        """Why there is nothing to serve, when the reason is known."""
        if self.market == "tradfi" and binance_block.blocked:
            return BINANCE_BLOCKED_NOTICE
        return None

    def refresh_once(self, cap: int | None = None) -> None:
        started = time.monotonic()
        provider_before = effective_provider(self.market)
        try:
            result = self._scan(cap)
        except Exception:
            if not (
                self.market == "crypto"
                and provider_before == "binance"
                and binance_block.blocked
            ):
                raise
            # Binance geo-blocked this server mid-scan: the crypto dashboard
            # fails over to the all-Gate pipeline right away.
            logger.warning("Binance geo-blocked; crypto scan failing over to Gate")
            result = self._scan(cap)
        with self._lock:
            self._latest = result
        self.last_error = None
        provider = getattr(getattr(result, "meta", None), "data_provider", provider_before)
        if provider == "binance":
            from app.data_sources.binance_client import get_binance_client

            logger.info("Binance requests since last scan: %s", get_binance_client().stats())
        logger.info("Market scan completed: market=%s provider=%s analyzed=%d elapsed=%.1fs warmup=%s",
                    self.market, provider, result.breadth.total,
                    time.monotonic() - started, cap is not None)

    def _scan(self, cap: int | None) -> ScanResponse:
        service = AnalysisService(self.market)
        symbols = service.market_data.list_symbols()
        if cap:
            symbols = symbols[:cap]  # list_symbols is volume-sorted => top `cap`
        if not symbols:
            raise RuntimeError("Market data provider returned no tradable symbols")
        result = service.scan_market(
            symbols=symbols,
            primary_timeframe=PRIMARY_TIMEFRAME,
            trigger_timeframe=TRIGGER_TIMEFRAME,
            trend_timeframe=TREND_TIMEFRAME,
            lookback=DEFAULT_LOOKBACK_CANDLES,
            top_per_direction=3,
            track=True,
        )
        if result.breadth.total == 0:
            if service.market_data.provider == "binance" and binance_block.blocked:
                raise BinanceRestricted("Binance blocked during the scan")
            raise RuntimeError(
                f"Market scan analyzed 0 of {len(symbols)} requested symbols"
            )
        return result

    def _run(self, interval: float, warmup_cap: int) -> None:
        try:
            self.refresh_once(cap=warmup_cap)  # fast first paint
        except Exception as exc:
            self.last_error = type(exc).__name__
            logger.exception(
                "Background %s market scan warm-up failed (cap=%s)", self.market, warmup_cap
            )
        while not self._stop.is_set():
            started = time.monotonic()
            try:
                self.refresh_once(cap=None)  # full universe
            except Exception as exc:
                self.last_error = type(exc).__name__
                logger.exception("Background full-universe %s market scan failed", self.market)
            # Keep a steady cadence between scan starts; a long scan only gets
            # a short breather instead of a full extra interval.
            elapsed = time.monotonic() - started
            self._stop.wait(max(_MIN_PAUSE_SECONDS, interval - elapsed))

    def start(self) -> None:
        if self._thread is not None:
            return
        settings = get_settings()
        self._thread = threading.Thread(
            target=self._run,
            args=(settings.scan_refresh_seconds, settings.scan_warmup_size),
            daemon=True,
            name=f"scan-{self.market}",
        )
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()


scan_caches: dict[Market, ScanCache] = {"crypto": ScanCache("crypto"), "tradfi": ScanCache("tradfi")}
# Backward-compatible name: the crypto dashboard (also feeds 妖怪篩選器).
scan_cache = scan_caches["crypto"]
