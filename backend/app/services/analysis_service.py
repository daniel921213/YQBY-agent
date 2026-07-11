import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, replace

import pandas as pd

from app.core.config import get_settings
from app.core.constants import ANOMALY_CAP, ANOMALY_MIN_CONFLUENCE, RECOMMEND_SCORE
from app.indicators.risk_radar import RiskRadarReading, analyze_five_minute_risk
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
    RiskRadar,
    RiskRadarItem,
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
RISK_RADAR_LOOKBACK = 96
RISK_RADAR_ITEMS_CAP = 40
# Below this score a screener row reads as 中性 rather than forcing 做多/做空.
SCREENER_NEUTRAL_SCORE = 15.0
# Independent axis deadbands for a true 3x3 price/OI state map.
OI_SIDE_MIN_PRICE_MOVE = 0.0015  # |1h price| < 0.15%
OI_SIDE_MIN_OI_MOVE = 0.005      # |1h OI| < 0.5%


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


def _flow_sum(frame, column: str, bars: int) -> float:
    """Sum of a per-bar flow column over the last `bars` bars (0 if absent)."""
    if column not in frame.columns or not len(frame):
        return 0.0
    return float(frame[column].tail(bars).sum())


def _number(value: object, default: float = 0.0) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    return default if pd.isna(parsed) else parsed


def _last_value(frame: pd.DataFrame, column: str, default: float = 0.0) -> float:
    if column not in frame.columns or frame.empty:
        return default
    return _number(frame[column].iloc[-1], default)


def _flow_quality(frame: pd.DataFrame) -> str:
    if frame.empty:
        return "MISSING"
    if "flow_quality" in frame.columns:
        value = str(frame["flow_quality"].iloc[-1]).upper()
        return value if value in {"REAL", "MISSING", "PROXY", "STALE"} else "MISSING"
    if {"buy_volume", "sell_volume"}.issubset(frame.columns):
        return "REAL"
    return "MISSING"


def _official_close_time(frame: pd.DataFrame, timeframe: str) -> int | None:
    if frame.empty or "timestamp" not in frame.columns:
        return None
    return int(frame["timestamp"].iloc[-1]) + timeframe_to_seconds(timeframe)


def _line_points(
    frame: pd.DataFrame,
    column: str,
    *,
    fallback_column: str | None = None,
) -> list[LinePoint]:
    source = column if column in frame.columns else fallback_column
    if source is None or source not in frame.columns:
        return []
    points: list[LinePoint] = []
    for row in frame.itertuples():
        value = getattr(row, source)
        if pd.isna(value):
            continue
        points.append(LinePoint(time=int(row.timestamp), value=float(value)))
    return points


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
    metrics: MarketSnapshot | None,
) -> OiMover | None:
    oi_qty = chart.open_interest
    if len(oi_qty) < 2 or oi_qty[-1].value <= 0:
        return None
    bars_1h = _bars_for(3_600, primary_timeframe)
    prev_qty = oi_qty[-1 - bars_1h].value if len(oi_qty) > bars_1h else oi_qty[0].value
    total_qty = oi_qty[-1].value
    oi_delta_qty = total_qty - prev_qty
    oi_change_1h = pct_change(prev_qty, total_qty)

    # Bubble size/ranking is USD notional. Legacy providers may only expose one
    # OI series, in which case the fallback preserves their prior behaviour.
    oi_usd = chart.open_interest_usd or oi_qty
    total_oi_usd = oi_usd[-1].value
    # Cross-symbol flow estimate strips out the mechanical mark-price effect:
    # Δcontracts × current USD/contract (= multiplier × mark price).
    usd_per_contract = total_oi_usd / total_qty if total_qty > 0 else 0.0
    oi_delta_usd = oi_delta_qty * usd_per_contract

    candles = chart.candles
    price_ref = candles[-1 - bars_1h].close if len(candles) > bars_1h else candles[0].close
    price_change_1h = pct_change(price_ref, price)

    price_axis = (
        0 if abs(price_change_1h) < OI_SIDE_MIN_PRICE_MOVE
        else (1 if price_change_1h > 0 else -1)
    )
    oi_axis = (
        0 if abs(oi_change_1h) < OI_SIDE_MIN_OI_MOVE
        else (1 if oi_change_1h > 0 else -1)
    )
    side = {
        (1, 1): "多頭建倉",
        (-1, 1): "空頭建倉",
        (1, -1): "空頭回補",
        (-1, -1): "多頭去槓桿",
        (0, 1): "OI增倉／價格持平",
        (0, -1): "OI減倉／價格持平",
        (1, 0): "價格上漲／OI持平",
        (-1, 0): "價格下跌／OI持平",
        (0, 0): "持平",
    }[(price_axis, oi_axis)]

    return OiMover(
        symbol=symbol,
        price=price,
        oi_change_1h=round(oi_change_1h, 6),
        oi_delta=round(oi_delta_usd, 2),
        total_oi=round(total_oi_usd, 2),
        oi_qty_change_1h=round(oi_change_1h, 6),
        oi_delta_qty=round(oi_delta_qty, 6),
        total_oi_qty=round(total_qty, 6),
        change_24h=change_24h,
        price_change_1h=round(price_change_1h, 6),
        side=side,
        long_liq_usd_1h=metrics.long_liq_usd_1h if metrics else 0.0,
        short_liq_usd_1h=metrics.short_liq_usd_1h if metrics else 0.0,
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
            cvd=_line_points(primary, "cvd"),
            open_interest=_line_points(
                primary, "open_interest_qty", fallback_column="open_interest"
            ),
            open_interest_usd=_line_points(
                primary, "open_interest_usd", fallback_column="open_interest"
            ),
            funding_rate=_line_points(primary, "funding_rate"),
        )

        bars_1h = _bars_for(3_600, primary_timeframe)
        long_liq_1h = _flow_sum(primary, "long_liq_usd", bars_1h)
        short_liq_1h = _flow_sum(primary, "short_liq_usd", bars_1h)
        oi_qty = _last_value(primary, "open_interest_qty", _last_value(primary, "open_interest"))
        oi_usd = _last_value(primary, "open_interest_usd", _last_value(primary, "open_interest"))
        quote_volume_1h = _flow_sum(primary, "quote_volume", bars_1h)
        total_liq_1h = long_liq_1h + short_liq_1h
        metrics = MarketSnapshot(
            funding_rate=_last_value(primary, "funding_rate"),
            top_trader_ratio=_last_value(primary, "top_trader_long_short_ratio", 1.0),
            top_position_ratio=_last_value(primary, "top_position_long_short_ratio", 1.0),
            account_ratio=_last_value(primary, "account_long_short_ratio", 1.0),
            open_interest=oi_qty,
            open_interest_qty=oi_qty,
            open_interest_usd=oi_usd,
            account_ratio_avg=round(
                _number(primary["account_long_short_ratio"].tail(36).mean(), 1.0), 4
            ),
            long_liq_usd_1h=round(long_liq_1h, 2),
            short_liq_usd_1h=round(short_liq_1h, 2),
            liquidation_intensity_1h=round(total_liq_1h / oi_usd, 8) if oi_usd > 0 else 0.0,
            liquidation_to_volume_1h=(
                round(total_liq_1h / quote_volume_1h, 8) if quote_volume_1h > 0 else 0.0
            ),
            flow_quality=_flow_quality(primary),
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
                official_close_time=_official_close_time(primary, primary_timeframe),
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

        oi_movers = self._build_oi_movers(analyses, primary_timeframe, track=track)
        altseason = self._build_altseason(analyses, record=track)
        universe = self._build_universe(analyses, primary_timeframe)
        risk_radar = self._build_risk_radar(analyses, track=track)
        official_closes = [
            a.meta.official_close_time for a in analyses if a.meta.official_close_time is not None
        ]

        return ScanResponse(
            items=items,
            scanned_symbols=scanned_symbols,
            breadth=breadth,
            altseason=altseason,
            oi_movers=oi_movers,
            universe=universe,
            risk_radar=risk_radar,
            generated_at=int(time.time()),
            meta=AnalysisMeta(
                primary_timeframe=primary_timeframe,
                trigger_timeframe=trigger_timeframe,
                trend_timeframe=trend_timeframe,
                lookback=lookback,
                data_provider=self.settings.data_provider,
                official_close_time=min(official_closes) if official_closes else None,
            ),
        )

    def _build_risk_radar(
        self,
        analyses: list[AnalysisResponse],
        *,
        track: bool,
    ) -> RiskRadar:
        """Fetch a separate closed-5m frame and emit an independent risk overlay."""

        official = {
            analysis.recommendation.symbol: analysis.recommendation.direction
            for analysis in analyses
        }

        def run(symbol: str) -> RiskRadarReading | None:
            try:
                frame = self.market_data.get_enriched_market_frame(
                    symbol, "5m", RISK_RADAR_LOOKBACK
                )
                return analyze_five_minute_risk(symbol, frame, official[symbol])
            except Exception:
                return None

        symbols = list(official)
        if not symbols:
            return RiskRadar(generated_at=int(time.time()))
        workers = max(1, min(self.settings.scan_max_workers, len(symbols)))
        with ThreadPoolExecutor(max_workers=workers) as pool:
            readings = [reading for reading in pool.map(run, symbols) if reading is not None]

        if track and readings:
            transitions = anomaly_tracker.confirm_risk_state_transitions(
                {reading.symbol: reading.state for reading in readings}
            )
            updated: list[RiskRadarReading] = []
            for reading in readings:
                transition = transitions.get(reading.symbol)
                if transition is None:
                    updated.append(reading)
                    continue
                previous, current = transition
                flags = [*reading.flags, f"5m狀態確認切換：{previous} → {current}"]
                severity = "HIGH" if reading.severity == "MEDIUM" else (
                    "MEDIUM" if reading.severity == "LOW" else reading.severity
                )
                updated.append(replace(reading, flags=flags, severity=severity))
            readings = updated

        actionable = [reading for reading in readings if reading.severity != "LOW"]
        severity_rank = {"HIGH": 2, "MEDIUM": 1, "LOW": 0}
        actionable.sort(
            key=lambda reading: (
                severity_rank[reading.severity],
                reading.conflicts_official,
                reading.liquidation_intensity,
                abs(reading.oi_change_zscore),
                abs(reading.flow_zscore),
            ),
            reverse=True,
        )
        return RiskRadar(
            generated_at=int(time.time()),
            scanned_count=len(symbols),
            covered_count=len(readings),
            items=[
                RiskRadarItem(**asdict(reading))
                for reading in actionable[:RISK_RADAR_ITEMS_CAP]
            ],
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
                    account_ratio_avg=m.account_ratio_avg if m else 1.0,
                    oi_change_1h=_oi_change_1h(a.chart, primary_timeframe),
                    stage=a.stage,
                )
            )
        rows.sort(key=lambda row: row.score, reverse=True)
        return rows

    @staticmethod
    def _build_oi_movers(
        analyses: list[AnalysisResponse], primary_timeframe: str, track: bool = False
    ) -> list[OiMover]:
        movers: list[OiMover] = []
        for a in analyses:
            price, change_24h = _price_and_change_24h(a.chart, primary_timeframe)
            mover = _oi_mover(
                a.recommendation.symbol, a.chart, price, change_24h,
                primary_timeframe, a.metrics,
            )
            if mover is not None:
                movers.append(mover)

        # Quadrant-transition memory lives server-side (one baseline = the
        # previous authoritative scan, identical for every client). Record ALL
        # scanned symbols — not just the shipped top movers — so a coin that
        # jumps into the top list still has a valid "previous" to compare with.
        if track and movers:
            transitions = anomaly_tracker.confirm_oi_side_transitions(
                {m.symbol: m.side for m in movers}
            )
            for mover in movers:
                transition = transitions.get(mover.symbol)
                if transition and mover.side != "持平":
                    mover.previous_side = transition[0]  # type: ignore[assignment]

        # Rank/bubble by USD exposure; quadrant signs above use quantity OI.
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
            evidence=analysis.evidence,
            raw_score=recommendation.raw_score,
            confluence_multiplier=recommendation.confluence_multiplier,
        )
