from pydantic import BaseModel, Field


class AuthRequest(BaseModel):
    uid: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1, max_length=200)


class AuthResponse(BaseModel):
    token: str
    uid: str


class MeResponse(BaseModel):
    uid: str
