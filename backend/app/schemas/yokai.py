from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.scoring import Stage


YokaiLifecycle = Literal["潛伏", "顯形", "發酵", "狂熱", "退散"]
YokaiSourceHealth = Literal["HEALTHY", "STALE", "OFFLINE"]
YokaiTokenStatus = Literal["QUALIFIED", "WATCH", "RISK"]
YokaiNarrativeGroup = Literal["INFRA", "FINANCE", "APPLICATION", "CULTURE", "ECOSYSTEM"]


class YokaiSourceStatus(BaseModel):
    key: str
    name: str
    health: YokaiSourceHealth
    item_count: int = 0
    last_success_at: int | None = None
    note: str = ""


class YokaiArticle(BaseModel):
    id: str
    title: str
    url: str
    source: str
    published_at: int
    narrative_ids: list[str] = Field(default_factory=list)
    symbols: list[str] = Field(default_factory=list)


class YokaiHistoryPoint(BaseModel):
    time: int
    value: float


class YokaiNarrative(BaseModel):
    id: str
    name: str
    english_name: str
    summary: str
    group: YokaiNarrativeGroup = "APPLICATION"
    parent_id: str | None = None
    lifecycle: YokaiLifecycle
    heat_score: float
    heat_change: float = 0.0
    mentions_1h: int = 0
    mentions_6h: int = 0
    mentions_24h: int = 0
    mentions_7d: int = 0
    source_count: int = 0
    related_token_count: int = 0
    qualified_long_count: int = 0
    keywords: list[str] = Field(default_factory=list)
    history: list[YokaiHistoryPoint] = Field(default_factory=list)
    articles: list[YokaiArticle] = Field(default_factory=list)


class YokaiToken(BaseModel):
    symbol: str
    narrative_ids: list[str]
    narrative_names: list[str]
    narrative_heat: float
    narrative_lifecycle: YokaiLifecycle
    status: YokaiTokenStatus
    qualified_long: bool
    price: float
    change_24h: float
    formal_direction: Literal["LONG", "SHORT", "NEUTRAL"]
    formal_stage: Stage
    formal_score: float
    oi_change_1h: float
    oi_side: str | None = None
    funding_rate: float
    account_ratio: float
    flow_quality: Literal["REAL", "MISSING", "PROXY", "STALE"]
    five_minute_state: str | None = None
    five_minute_direction: Literal["LONG", "SHORT", "NEUTRAL"] | None = None
    active_flow_direction: Literal["LONG", "SHORT", "NEUTRAL"] = "NEUTRAL"
    active_flow_strength: float = 0.0
    cvd_signal: str | None = None
    reasons: list[str] = Field(default_factory=list)
    blocked_reasons: list[str] = Field(default_factory=list)


class YokaiResponse(BaseModel):
    generated_at: int = 0
    external_generated_at: int = 0
    gate_generated_at: int = 0
    refresh_interval_seconds: int = 900
    external_ready: bool = False
    gate_ready: bool = False
    sources: list[YokaiSourceStatus] = Field(default_factory=list)
    narratives: list[YokaiNarrative] = Field(default_factory=list)
    tokens: list[YokaiToken] = Field(default_factory=list)
    qualified_longs: list[YokaiToken] = Field(default_factory=list)
    coverage_symbols: int = 0
    notice: str = ""
