from typing import Literal

from pydantic import BaseModel, Field


class WeeklyEvent(BaseModel):
    id: str
    title: str
    title_zh: str
    country: str
    country_zh: str
    impact: str
    timestamp: int | None = None
    date: str
    weekday: str
    time_label: str
    forecast: str = ""
    previous: str = ""
    actual: str | None = None
    actual_source: str | None = None
    verdict: Literal["ABOVE", "BELOW", "INLINE"] | None = None
    released: bool = False
    url: str | None = None


class WeeklyFactor(BaseModel):
    id: str
    rank: int
    title: str
    country: str
    country_zh: str
    impact: str
    timestamp: int | None = None
    date: str
    weekday: str
    time_label: str
    released: bool = False
    holiday_note: str | None = None
    note: str | None = None
    events: list[WeeklyEvent] = Field(default_factory=list)


class WeeklyQuote(BaseModel):
    key: str
    name: str
    group: Literal["close", "kpi"]
    kind: Literal["price", "yield"]
    decimals: int
    last: float
    as_of: str
    day_change: float | None = None
    week_change: float | None = None
    change_unit: Literal["pct", "bp"]
    stale: bool = False


class WeeklyMarketView(BaseModel):
    market: str
    points: list[str]


class WeeklyNarrative(BaseModel):
    headline: list[str] = Field(default_factory=list)
    one_line: list[str] = Field(default_factory=list)
    markets: list[WeeklyMarketView] = Field(default_factory=list)
    generated_at: int
    mode: str
    stale: bool = False


class WeeklySourceStatus(BaseModel):
    key: str
    name: str
    health: Literal["HEALTHY", "STALE", "OFFLINE"]
    last_success_at: int | None = None


class WeeklyBriefResponse(BaseModel):
    generated_at: int
    data_as_of: int | None = None
    mode: Literal["preview", "live", "recap", "warming"]
    title: str
    kicker: str
    week_start: str | None = None
    week_end: str | None = None
    week_label: str
    results: list[WeeklyEvent]
    results_label: str
    kpis: list[WeeklyQuote]
    closes: list[WeeklyQuote]
    closes_label: str
    factors: list[WeeklyFactor]
    factors_label: str
    calendar: list[WeeklyEvent]
    narrative: WeeklyNarrative | None = None
    sources: list[WeeklySourceStatus]
    notice: str | None = None
    ai_enabled: bool = False
