from typing import Literal

from pydantic import BaseModel


Direction = Literal["LONG", "SHORT", "NEUTRAL"]


class EvidenceItem(BaseModel):
    key: str
    label: str
    pillar: str = "其他"
    direction: Direction
    timeframe: str
    weight: float
    score: float
    strength: float
    description: str

