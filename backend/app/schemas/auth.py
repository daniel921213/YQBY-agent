from datetime import datetime

from pydantic import BaseModel, Field


class AuthRequest(BaseModel):
    uid: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1, max_length=200)


class AuthResponse(BaseModel):
    token: str
    uid: str


class MeResponse(BaseModel):
    uid: str
    plan: str  # "trial" | "member" | "lifetime"
    expires_at: datetime | None
    days_left: int | None  # None = 永久；0 = 已到期
    active: bool


class RedeemRequest(BaseModel):
    code: str = Field(..., min_length=4, max_length=32)
