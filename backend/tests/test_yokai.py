from app.schemas.scoring import AnalysisMeta, MarketBreadth, ScanResponse, ScreenerRow
from app.services.yokai_service import build_yokai_response


def _external(lifecycle: str = "發酵") -> dict:
    return {
        "generated_at": 1_800_000_000,
        "sources": [
            {
                "key": "gdelt",
                "name": "GDELT 全球新聞",
                "health": "HEALTHY",
                "item_count": 8,
                "last_success_at": 1_800_000_000,
                "note": "ok",
            },
            {
                "key": "coingecko",
                "name": "CoinGecko 趨勢",
                "health": "HEALTHY",
                "item_count": 4,
                "last_success_at": 1_800_000_000,
                "note": "ok",
            },
        ],
        "narratives": [
            {
                "id": "rwa",
                "name": "RWA 實體資產",
                "english_name": "REAL WORLD ASSETS",
                "summary": "test",
                "lifecycle": lifecycle,
                "heat_score": 68.0,
                "heat_change": 12.0,
                "mentions_1h": 2,
                "mentions_6h": 5,
                "mentions_24h": 8,
                "mentions_7d": 12,
                "source_count": 3,
                "related_token_count": 0,
                "qualified_long_count": 0,
                "keywords": ["rwa"],
                "history": [],
                "articles": [],
            }
        ],
    }


def _scan(
    *,
    stage: str = "趨勢啟動",
    trade_eligible: bool = True,
    yokai_long_eligible: bool = True,
    yokai_long_failed_reasons: list[str] | None = None,
) -> ScanResponse:
    row = ScreenerRow(
        symbol="ONDOUSDT",
        price=1.25,
        change_24h=0.03,
        score=62.0,
        direction="LONG",
        confidence_level="MEDIUM",
        confluence_pillars=4,
        pillars=[],
        funding_rate=0.0001,
        top_trader_ratio=1.1,
        account_ratio=1.2,
        oi_change_1h=0.04,
        stage=stage,  # type: ignore[arg-type]
        trade_eligible=trade_eligible,
        trade_reasons=["15m 趨勢啟動", "OI 多頭建倉"],
        yokai_long_eligible=yokai_long_eligible,
        yokai_long_reasons=[f"15m {stage}", "OI 多頭建倉", "5m 狀態切換已確認"],
        yokai_long_failed_reasons=yokai_long_failed_reasons or [],
        flow_quality="REAL",
        oi_side="多頭建倉",
        five_minute_state="多頭建倉",
        five_minute_direction="LONG",
        five_minute_quality="REAL",
    )
    return ScanResponse(
        items=[],
        scanned_symbols=["ONDOUSDT"],
        breadth=MarketBreadth(total=1, long_count=1, short_count=0, anomaly_count=1),
        meta=AnalysisMeta(
            primary_timeframe="15m",
            trigger_timeframe="5m",
            trend_timeframe="4h",
            lookback=200,
            data_provider="gate",
        ),
        generated_at=1_800_000_000,
        universe=[row],
    )


def test_yokai_requires_both_narrative_and_gate_confirmation() -> None:
    response = build_yokai_response(_external(), _scan())
    assert response.external_ready is True
    assert response.gate_ready is True
    assert len(response.qualified_longs) == 1
    assert response.qualified_longs[0].symbol == "ONDOUSDT"
    assert response.narratives[0].qualified_long_count == 1


def test_yokai_can_confirm_an_early_long_without_changing_dashboard_eligibility() -> None:
    response = build_yokai_response(
        _external(),
        _scan(stage="早期異動", trade_eligible=False, yokai_long_eligible=True),
    )

    assert len(response.qualified_longs) == 1
    assert response.qualified_longs[0].formal_stage == "早期異動"
    assert "5m 狀態切換已確認" in response.qualified_longs[0].reasons


def test_unconfirmed_early_long_stays_in_yokai_watchlist() -> None:
    response = build_yokai_response(
        _external(),
        _scan(
            stage="早期異動",
            trade_eligible=False,
            yokai_long_eligible=False,
            yokai_long_failed_reasons=["早期異動缺少 5m 狀態切換確認"],
        ),
    )

    assert response.qualified_longs == []
    assert response.tokens[0].status == "WATCH"
    assert "早期異動缺少 5m 狀態切換確認" in response.tokens[0].blocked_reasons


def test_yokai_overheated_narrative_blocks_long_even_when_gate_passes() -> None:
    response = build_yokai_response(_external("狂熱"), _scan())
    assert response.qualified_longs == []
    assert response.tokens[0].status == "RISK"
    assert "題材已進入狂熱階段" in response.tokens[0].blocked_reasons[0]
