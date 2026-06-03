from concurrent.futures import ThreadPoolExecutor

from app.core.config import get_settings
from app.core.constants import ANOMALY_CAP, ANOMALY_MIN_CONFLUENCE, RECOMMEND_SCORE
from app.schemas.indicators import EvidenceItem
from app.schemas.market import CandlePoint, LinePoint, MarketChartPayload
from app.schemas.scoring import (
    AnalysisMeta,
    AnalysisResponse,
    MarketBreadth,
    PillarScore,
    Recommendation,
    ScanItem,
    ScanResponse,
)

# Fixed display order for the five pillars.
PILLAR_ORDER = ["市場結構", "動能", "相對強弱", "資金費率", "多空比"]


def _pillar_breakdown(evidence: list) -> list[PillarScore]:
    """Collapse evidence to one row per pillar (its strongest contributing factor)."""
    rows: list[PillarScore] = []
    for pillar in PILLAR_ORDER:
        members = [e for e in evidence if e.pillar == pillar]
        if not members:
            rows.append(PillarScore(pillar=pillar, direction="NEUTRAL", strength=0.0, score=0.0))
            continue
        top = max(members, key=lambda e: e.strength)
        rows.append(
            PillarScore(
                pillar=pillar,
                direction=top.direction,
                strength=round(top.strength, 4),
                score=round(sum(e.score for e in members), 2),
            )
        )
    return rows
from app.scoring.engine import ScoringEngine
from app.services.market_data_service import MarketDataService


def _is_anomaly(recommendation: Recommendation) -> bool:
    score_gap = abs(recommendation.long_score - recommendation.short_score)
    return (
        recommendation.confidence_level in {"MEDIUM", "HIGH"}
        or recommendation.score >= 52
        or score_gap >= 18
    )


_DIVERGENCE_KEYS = {"cvd_bullish_divergence", "cvd_bearish_divergence"}


def _categorize(evidence: list[EvidenceItem], direction: str) -> str:
    """轉多 / 轉空 / 疑似反轉.

    A CVD price-volume divergence is the classic *reversal* tell, so its presence
    flags 疑似反轉; otherwise the net direction is a continuation read.
    """
    if any(e.key in _DIVERGENCE_KEYS for e in evidence):
        return "疑似反轉"
    return "轉多" if direction == "LONG" else "轉空"


class AnalysisService:
    def __init__(self) -> None:
        self.market_data = MarketDataService()
        self.scoring = ScoringEngine()
        self.settings = get_settings()

    def analyze(
        self,
        symbol: str,
        primary_timeframe: str,
        trigger_timeframe: str,
        trend_timeframe: str,
        lookback: int,
    ) -> AnalysisResponse:
        # The 5-pillar model derives 1h/4h/24h momentum and relative strength from
        # the single primary frame, so trigger/trend frames are no longer fetched.
        # BTC is the relative-strength benchmark (cached => ~free across a scan).
        primary = self.market_data.get_enriched_market_frame(symbol, primary_timeframe, lookback)
        btc = self.market_data.get_enriched_market_frame(
            "BTCUSDT", primary_timeframe, lookback, with_derivatives=False
        )

        recommendation, evidence = self.scoring.score(
            symbol=symbol,
            primary=primary,
            btc=btc,
            primary_timeframe=primary_timeframe,
        )

        chart = MarketChartPayload(
            candles=[
                CandlePoint(
                    time=int(row.timestamp),
                    open=float(row.open),
                    high=float(row.high),
                    low=float(row.low),
                    close=float(row.close),
                    volume=float(row.volume),
                )
                for row in primary.itertuples()
            ],
            cvd=[
                LinePoint(time=int(row.timestamp), value=float(row.cvd))
                for row in primary.itertuples()
            ],
            open_interest=[
                LinePoint(time=int(row.timestamp), value=float(row.open_interest))
                for row in primary.itertuples()
            ],
            funding_rate=[
                LinePoint(time=int(row.timestamp), value=float(row.funding_rate))
                for row in primary.itertuples()
            ],
        )

        return AnalysisResponse(
            recommendation=recommendation,
            evidence=evidence,
            chart=chart,
            meta=AnalysisMeta(
                primary_timeframe=primary_timeframe,
                trigger_timeframe=trigger_timeframe,
                trend_timeframe=trend_timeframe,
                lookback=lookback,
                data_provider=self.settings.data_provider,
            ),
        )

    def scan_market(
        self,
        symbols: list[str] | None,
        primary_timeframe: str,
        trigger_timeframe: str,
        trend_timeframe: str,
        lookback: int,
        top_per_direction: int = 20,
    ) -> ScanResponse:
        # No explicit symbols => scan the entire tradable universe.
        scanned_symbols = symbols if symbols else self.market_data.list_symbols()

        def run(symbol: str) -> AnalysisResponse | None:
            try:
                return self.analyze(
                    symbol=symbol,
                    primary_timeframe=primary_timeframe,
                    trigger_timeframe=trigger_timeframe,
                    trend_timeframe=trend_timeframe,
                    lookback=lookback,
                )
            except Exception:
                # A single bad/illiquid symbol must not abort the whole scan.
                return None

        # Bounded-concurrency fan-out: speeds up live HTTP scans while the shared
        # client's rate limiter + cache keep us under Binance's IP limits.
        workers = max(1, min(self.settings.scan_max_workers, len(scanned_symbols)))
        with ThreadPoolExecutor(max_workers=workers) as pool:
            analyses = [a for a in pool.map(run, scanned_symbols) if a is not None]

        longs = [a for a in analyses if a.recommendation.direction == "LONG"]
        shorts = [a for a in analyses if a.recommendation.direction == "SHORT"]

        # High-conviction recommendations (score >= 80) + categorised anomalies.
        ranked = sorted(analyses, key=lambda a: a.recommendation.score, reverse=True)
        recommends = [a for a in ranked if a.recommendation.score >= RECOMMEND_SCORE]
        anomalies = [
            a
            for a in ranked
            if a.recommendation.score < RECOMMEND_SCORE
            and a.recommendation.confluence_pillars >= ANOMALY_MIN_CONFLUENCE
        ][:ANOMALY_CAP]
        items = [self._build_item(rank, a) for rank, a in enumerate(recommends + anomalies, 1)]

        breadth = MarketBreadth(
            total=len(analyses),
            long_count=len(longs),
            short_count=len(shorts),
            anomaly_count=sum(1 for a in analyses if _is_anomaly(a.recommendation)),
        )

        return ScanResponse(
            items=items,
            scanned_symbols=scanned_symbols,
            breadth=breadth,
            meta=AnalysisMeta(
                primary_timeframe=primary_timeframe,
                trigger_timeframe=trigger_timeframe,
                trend_timeframe=trend_timeframe,
                lookback=lookback,
                data_provider=self.settings.data_provider,
            ),
        )

    @staticmethod
    def _build_item(rank: int, analysis: AnalysisResponse) -> ScanItem:
        recommendation = analysis.recommendation
        score_gap = abs(recommendation.long_score - recommendation.short_score)
        directional_evidence = [
            item for item in analysis.evidence if item.direction == recommendation.direction
        ]
        return ScanItem(
            rank=rank,
            symbol=recommendation.symbol,
            direction=recommendation.direction,
            score=recommendation.score,
            confidence_level=recommendation.confidence_level,
            confluence_pillars=recommendation.confluence_pillars,
            long_score=recommendation.long_score,
            short_score=recommendation.short_score,
            score_gap=round(score_gap, 2),
            is_anomaly=_is_anomaly(recommendation),
            is_recommend=recommendation.score >= RECOMMEND_SCORE,
            category=_categorize(analysis.evidence, recommendation.direction),
            triggered_count=len(directional_evidence),
            pillars=_pillar_breakdown(analysis.evidence),
            top_evidence=directional_evidence[:3],
        )
