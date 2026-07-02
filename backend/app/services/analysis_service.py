from concurrent.futures import ThreadPoolExecutor

from app.core.config import get_settings
from app.core.constants import ANOMALY_CAP, ANOMALY_MIN_CONFLUENCE, RECOMMEND_SCORE
from app.schemas.indicators import EvidenceItem
from app.schemas.market import CandlePoint, LinePoint, MarketChartPayload
from app.schemas.scoring import (
    AltseasonIndex,
    AnalysisMeta,
    AnalysisResponse,
    MarketBreadth,
    MarketSnapshot,
    OiMover,
    PillarScore,
    Recommendation,
    ScanItem,
    ScanResponse,
    ScreenerRow,
)
from app.utils.numeric import pct_change
from app.utils.timeframes import timeframe_to_seconds

# Fixed display order for the five pillars.
PILLAR_ORDER = ["市場結構", "動能", "相對強弱", "資金費率", "多空比"]

# Points on the OI quadrant map — biggest 1h movers by notional change. Higher
# than the old table's 15 so all four quadrants have enough dots to read.
OI_MOVERS_CAP = 40
# Below this score a screener row reads as 中性 rather than forcing 做多/做空.
SCREENER_NEUTRAL_SCORE = 15.0


def _pillar_breakdown(evidence: list) -> list[PillarScore]:
    """Collapse evidence to one row per pillar (its strongest contributing factor).

    Directional members take precedence: a pillar with e.g. directional momentum
    plus a strong-but-NEUTRAL volume read should display the direction, not
    neutral."""
    rows: list[PillarScore] = []
    for pillar in PILLAR_ORDER:
        members = [e for e in evidence if e.pillar == pillar]
        if not members:
            rows.append(PillarScore(pillar=pillar, direction="NEUTRAL", strength=0.0, score=0.0))
            continue
        directional = [e for e in members if e.direction != "NEUTRAL"]
        top = max(directional or members, key=lambda e: e.strength)
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
from app.services.anomaly_tracker import anomaly_tracker
from app.services.market_data_service import MarketDataService


def _bars_for(seconds: int, primary_timeframe: str) -> int:
    """How many primary-frame bars span `seconds` (>=1)."""
    return max(1, seconds // timeframe_to_seconds(primary_timeframe))


def _price_and_change_24h(chart: MarketChartPayload, primary_timeframe: str) -> tuple[float, float]:
    candles = chart.candles
    if not candles:
        return 0.0, 0.0
    price = candles[-1].close
    bars_24h = _bars_for(86_400, primary_timeframe)
    ref = candles[-1 - bars_24h] if len(candles) > bars_24h else candles[0]
    return price, round(pct_change(ref.close, price), 6)


def _relative_strength_direction(evidence: list[EvidenceItem]) -> str:
    for e in evidence:
        if e.key == "relative_strength":
            return e.direction
    return "NEUTRAL"


def _oi_change_1h(chart: MarketChartPayload, primary_timeframe: str) -> float:
    oi = chart.open_interest
    if len(oi) < 2:
        return 0.0
    bars_1h = _bars_for(3_600, primary_timeframe)
    prev = oi[-1 - bars_1h].value if len(oi) > bars_1h else oi[0].value
    return round(pct_change(prev, oi[-1].value), 6)


def _oi_mover(
    symbol: str,
    chart: MarketChartPayload,
    price: float,
    change_24h: float,
    primary_timeframe: str,
) -> OiMover | None:
    oi = chart.open_interest
    if len(oi) < 2 or oi[-1].value <= 0:
        return None
    bars_1h = _bars_for(3_600, primary_timeframe)
    prev = oi[-1 - bars_1h].value if len(oi) > bars_1h else oi[0].value
    total_oi = oi[-1].value
    oi_delta = total_oi - prev

    candles = chart.candles
    price_ref = candles[-1 - bars_1h].close if len(candles) > bars_1h else candles[0].close
    price_change_1h = pct_change(price_ref, price)
    price_up = price_change_1h >= 0
    oi_up = oi_delta >= 0
    if oi_up:
        side = "多頭建倉" if price_up else "空頭建倉"
    else:
        side = "空頭平倉" if price_up else "多頭平倉"

    return OiMover(
        symbol=symbol,
        price=price,
        oi_change_1h=round(pct_change(prev, total_oi), 6),
        oi_delta=round(oi_delta, 2),
        total_oi=round(total_oi, 2),
        change_24h=change_24h,
        price_change_1h=round(price_change_1h, 6),
        side=side,
    )


def _is_anomaly(recommendation: Recommendation) -> bool:
    score_gap = abs(recommendation.long_score - recommendation.short_score)
    return (
        recommendation.confidence_level in {"MEDIUM", "HIGH"}
        or recommendation.score >= 52
        or score_gap >= 18
    )


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

        recommendation, evidence, stage = self.scoring.score(
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

        last = primary.iloc[-1]
        metrics = MarketSnapshot(
            funding_rate=float(last["funding_rate"]),
            top_trader_ratio=float(last["top_trader_long_short_ratio"]),
            account_ratio=float(last["account_long_short_ratio"]),
            open_interest=float(last["open_interest"]),
        )

        return AnalysisResponse(
            recommendation=recommendation,
            evidence=evidence,
            chart=chart,
            metrics=metrics,
            stage=stage.stage,
            stage_reasons=stage.reasons,
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
        track: bool = False,
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
        items: list[ScanItem] = []
        for rank, analysis in enumerate(recommends + anomalies, 1):
            item = self._build_item(rank, analysis)
            item.price, item.change_24h = _price_and_change_24h(
                analysis.chart, primary_timeframe
            )
            items.append(item)

        # Lifecycle enrichment (first-seen time/price, change-since, trigger count)
        # only on an authoritative full scan — analyst/subset calls don't pollute it.
        if track:
            anomaly_tracker.record(items)

        breadth = MarketBreadth(
            total=len(analyses),
            long_count=len(longs),
            short_count=len(shorts),
            anomaly_count=sum(1 for a in analyses if _is_anomaly(a.recommendation)),
        )

        oi_movers = self._build_oi_movers(analyses, primary_timeframe)
        altseason = self._build_altseason(analyses, record=track)
        universe = self._build_universe(analyses, primary_timeframe)

        return ScanResponse(
            items=items,
            scanned_symbols=scanned_symbols,
            breadth=breadth,
            altseason=altseason,
            oi_movers=oi_movers,
            universe=universe,
            meta=AnalysisMeta(
                primary_timeframe=primary_timeframe,
                trigger_timeframe=trigger_timeframe,
                trend_timeframe=trend_timeframe,
                lookback=lookback,
                data_provider=self.settings.data_provider,
            ),
        )

    @staticmethod
    def _build_universe(
        analyses: list[AnalysisResponse], primary_timeframe: str
    ) -> list[ScreenerRow]:
        rows: list[ScreenerRow] = []
        for a in analyses:
            r = a.recommendation
            price, change_24h = _price_and_change_24h(a.chart, primary_timeframe)
            direction = "NEUTRAL" if r.score < SCREENER_NEUTRAL_SCORE else r.direction
            m = a.metrics
            rows.append(
                ScreenerRow(
                    symbol=r.symbol,
                    price=price,
                    change_24h=change_24h,
                    score=r.score,
                    direction=direction,
                    confidence_level=r.confidence_level,
                    confluence_pillars=r.confluence_pillars,
                    pillars=_pillar_breakdown(a.evidence),
                    funding_rate=m.funding_rate if m else 0.0,
                    top_trader_ratio=m.top_trader_ratio if m else 1.0,
                    account_ratio=m.account_ratio if m else 1.0,
                    oi_change_1h=_oi_change_1h(a.chart, primary_timeframe),
                    stage=a.stage,
                )
            )
        rows.sort(key=lambda row: row.score, reverse=True)
        return rows

    @staticmethod
    def _build_oi_movers(
        analyses: list[AnalysisResponse], primary_timeframe: str
    ) -> list[OiMover]:
        movers: list[OiMover] = []
        for a in analyses:
            price, change_24h = _price_and_change_24h(a.chart, primary_timeframe)
            mover = _oi_mover(
                a.recommendation.symbol, a.chart, price, change_24h, primary_timeframe
            )
            if mover is not None:
                movers.append(mover)
        # Rank by 1h OI change in USD notional (open_interest is USD from both
        # live providers), like the reference's "依變化金額排序".
        movers.sort(key=lambda m: abs(m.oi_delta), reverse=True)
        return movers[:OI_MOVERS_CAP]

    @staticmethod
    def _build_altseason(analyses: list[AnalysisResponse], record: bool) -> AltseasonIndex:
        # A snapshot is only logged for an authoritative scan (record=True), so
        # the "vs 稍早" baseline isn't skewed by analyst/subset calls.
        outperform = sum(
            1 for a in analyses if _relative_strength_direction(a.evidence) == "LONG"
        )
        return anomaly_tracker.build_altseason(outperform, len(analyses), record=record)

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
            stage=analysis.stage,
            stage_reasons=analysis.stage_reasons,
            triggered_count=len(directional_evidence),
            pillars=_pillar_breakdown(analysis.evidence),
            top_evidence=directional_evidence[:3],
        )
