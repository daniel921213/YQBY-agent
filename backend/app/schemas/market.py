from pydantic import BaseModel, Field


class CandlePoint(BaseModel):
    time: int = Field(description="Unix timestamp in seconds")
    open: float
    high: float
    low: float
    close: float
    volume: float


class LinePoint(BaseModel):
    time: int = Field(description="Unix timestamp in seconds")
    value: float


class MarketChartPayload(BaseModel):
    candles: list[CandlePoint]
    cvd: list[LinePoint]
    open_interest: list[LinePoint]
    funding_rate: list[LinePoint]

