from __future__ import annotations

import threading

from app.core.config import get_settings
from app.core.constants import (
    DEFAULT_LOOKBACK_CANDLES,
    PRIMARY_TIMEFRAME,
    TREND_TIMEFRAME,
    TRIGGER_TIMEFRAME,
)
from app.schemas.scoring import ScanResponse
from app.services.analysis_service import AnalysisService


class ScanCache:
    """Holds the latest full-universe scan, refreshed by a background thread.

    Scanning every USDⓈ-M perpetual live exceeds Binance's per-IP rate limits,
    so we do it on a timer and serve the cached result instantly. A quick
    warm-up pass (top symbols by volume) populates the dashboard within ~1 min
    while the full scan completes in the background.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._latest: ScanResponse | None = None
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()

    @property
    def latest(self) -> ScanResponse | None:
        with self._lock:
            return self._latest

    def refresh_once(self, cap: int | None = None) -> None:
        service = AnalysisService()
        symbols = service.market_data.list_symbols()
        if cap:
            symbols = symbols[:cap]  # list_symbols is volume-sorted => top `cap`
        result = service.scan_market(
            symbols=symbols,
            primary_timeframe=PRIMARY_TIMEFRAME,
            trigger_timeframe=TRIGGER_TIMEFRAME,
            trend_timeframe=TREND_TIMEFRAME,
            lookback=DEFAULT_LOOKBACK_CANDLES,
            top_per_direction=20,
            track=True,
        )
        with self._lock:
            self._latest = result

    def _run(self, interval: float, warmup_cap: int) -> None:
        try:
            self.refresh_once(cap=warmup_cap)  # fast first paint
        except Exception:
            pass
        while not self._stop.is_set():
            try:
                self.refresh_once(cap=None)  # full universe
            except Exception:
                pass
            self._stop.wait(interval)

    def start(self) -> None:
        if self._thread is not None:
            return
        settings = get_settings()
        self._thread = threading.Thread(
            target=self._run,
            args=(settings.scan_refresh_seconds, settings.scan_warmup_size),
            daemon=True,
        )
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()


scan_cache = ScanCache()
