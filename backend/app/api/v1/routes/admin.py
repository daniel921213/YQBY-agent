"""Hidden admin endpoints (activation-code minting).

Auth model: a single long secret in the ADMIN_SECRET env var, sent as the
X-Admin-Key header. No secret configured or wrong key -> plain 404, so the
endpoint is indistinguishable from a nonexistent route to outsiders.
"""

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db import get_db
from app.services import activation_service

router = APIRouter(prefix="/admin", tags=["admin"])


def require_admin(x_admin_key: str | None = Header(default=None)) -> None:
    secret = get_settings().admin_secret
    if not secret or x_admin_key != secret:
        raise HTTPException(status_code=404, detail="Not Found")


class CreateCodesRequest(BaseModel):
    tier: str = Field(..., description='"30d" 或 "lifetime"')
    count: int = Field(..., ge=1, le=500)


class CreateCodesResponse(BaseModel):
    tier: str
    codes: list[str]


@router.post("/codes", response_model=CreateCodesResponse, dependencies=[Depends(require_admin)])
def create_codes(req: CreateCodesRequest, db: Session = Depends(get_db)) -> CreateCodesResponse:
    if req.tier not in activation_service.VALID_TIERS:
        raise HTTPException(status_code=400, detail=f"tier 必須是 {sorted(activation_service.VALID_TIERS)}")
    codes = activation_service.create_codes(db, req.tier, req.count)
    return CreateCodesResponse(tier=req.tier, codes=codes)
