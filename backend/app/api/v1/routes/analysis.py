from fastapi import APIRouter, Query

from app.core.config import get_settings
from app.core.constants import (
    DEFAULT_LOOKBACK_CANDLES,
    PRIMARY_TIMEFRAME,
    TREND_TIMEFRAME,
    TRIGGER_TIMEFRAME,
)
from app.schemas.scoring import AnalysisMeta, AnalysisResponse, MarketBreadth, ScanResponse
from app.services.analysis_service import AnalysisService
from app.services.scan_cache import scan_cache


router = APIRouter(tags=["analysis"])


@router.get("/analysis", response_model=AnalysisResponse)
def get_analysis(
    symbol: str = Query(default="BTCUSDT", min_length=3, max_length=20),
    primary_timeframe: str = Query(default=PRIMARY_TIMEFRAME),
    trigger_timeframe: str = Query(default=TRIGGER_TIMEFRAME),
    trend_timeframe: str = Query(default=TREND_TIMEFRAME),
    lookback: int = Query(default=DEFAULT_LOOKBACK_CANDLES, ge=80, le=500),
) -> AnalysisResponse:
    service = AnalysisService()
    return service.analyze(
        symbol=symbol.upper(),
        primary_timeframe=primary_timeframe,
        trigger_timeframe=trigger_timeframe,
        trend_timeframe=trend_timeframe,
        lookback=lookback,
    )


@router.get("/scan", response_model=ScanResponse)
def scan_market(
    symbols: str | None = Query(
        default=None,
        description="Comma separated symbols. Empty => scan the full tradable universe.",
    ),
    primary_timeframe: str = Query(default=PRIMARY_TIMEFRAME),
    trigger_timeframe: str = Query(default=TRIGGER_TIMEFRAME),
    trend_timeframe: str = Query(default=TREND_TIMEFRAME),
    lookback: int = Query(default=DEFAULT_LOOKBACK_CANDLES, ge=80, le=500),
    top: int = Query(default=20, ge=1, le=100, description="Top N per direction by score."),
) -> ScanResponse:
    selected_symbols = (
        [item.strip().upper() for item in symbols.split(",") if item.strip()]
        if symbols
        else None
    )

    settings = get_settings()
    # Default full-universe request on the live provider is served from the
    # background scanner's cache (a live full scan would blow the rate limits).
    if selected_symbols is None and settings.data_provider.lower() == "binance" and settings.scan_background:
        cached = scan_cache.latest
        if cached is not None:
            return cached
        # Still warming up: return an empty-but-valid payload the UI handles.
        return ScanResponse(
            items=[],
            scanned_symbols=[],
            breadth=MarketBreadth(total=0, long_count=0, short_count=0, anomaly_count=0),
            meta=AnalysisMeta(
                primary_timeframe=primary_timeframe,
                trigger_timeframe=trigger_timeframe,
                trend_timeframe=trend_timeframe,
                lookback=lookback,
                data_provider=settings.data_provider,
            ),
        )

    service = AnalysisService()
    return service.scan_market(
        symbols=selected_symbols,
        primary_timeframe=primary_timeframe,
        trigger_timeframe=trigger_timeframe,
        trend_timeframe=trend_timeframe,
        lookback=lookback,
        top_per_direction=top,
    )
