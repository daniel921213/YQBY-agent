"""Hidden admin endpoints (activation-code and password-reset operations).

Auth model: a single long secret in the ADMIN_SECRET env var, sent as the
X-Admin-Key header. No secret configured or wrong key -> plain 404, so the
endpoint is indistinguishable from a nonexistent route to outsiders.
"""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import AwareDatetime, BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db import get_db
from app.models import User
from app.services import activation_service, password_reset_service
from app.services.auth_service import PLAN_LIFETIME, PLAN_MEMBER, _as_utc

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


class IssuePasswordResetRequest(BaseModel):
    uid: str = Field(..., min_length=1, max_length=64)


class IssuePasswordResetResponse(BaseModel):
    uid: str
    code: str
    expires_at: datetime | None
    stock_remaining: int


class PasswordResetInventoryResponse(BaseModel):
    stock: int
    active: int
    used_or_cancelled: int


class DisplayNameRequest(BaseModel):
    display_name: str | None = Field(default=None, max_length=64)


class MembershipWindowRequest(BaseModel):
    uids: list[str] = Field(min_length=1, max_length=500)
    starts_at: AwareDatetime
    expires_at: AwareDatetime
    apply: bool = False

    @model_validator(mode="after")
    def validate_window(self):
        self.uids = [uid.strip() for uid in self.uids]
        if any(not uid or len(uid) > 64 for uid in self.uids):
            raise ValueError("UID must contain 1 to 64 characters")
        if len({uid.lower() for uid in self.uids}) != len(self.uids):
            raise ValueError("Duplicate UIDs")
        if self.expires_at <= self.starts_at:
            raise ValueError("Expiry must be after start")
        self.starts_at = self.starts_at.astimezone(UTC)
        self.expires_at = self.expires_at.astimezone(UTC)
        return self


@router.put("/users/membership-window", dependencies=[Depends(require_admin)])
def set_membership_window(req: MembershipWindowRequest, db: Session = Depends(get_db)) -> dict:
    """Preview by default; explicitly apply one atomic, fixed membership window."""
    keys = [uid.lower() for uid in req.uids]
    query = select(User).where(User.uid_key.in_(keys)).order_by(User.id)
    if req.apply:
        query = query.with_for_update()
    users = {user.uid_key: user for user in db.scalars(query)}
    missing = [uid for uid in req.uids if uid.lower() not in users]
    if missing:
        raise HTTPException(status_code=409, detail={"reason": "users_not_found", "uids": missing})
    permanent = [user.uid for user in users.values() if user.plan == PLAN_LIFETIME]
    if permanent:
        raise HTTPException(status_code=409, detail={"reason": "cannot_replace_lifetime", "uids": permanent})
    results = []
    for key in keys:
        user = users[key]
        results.append({
            "uid": user.uid,
            "previous": {"plan": user.plan, "starts_at": _as_utc(user.starts_at), "expires_at": _as_utc(user.expires_at)},
            "membership": {"plan": PLAN_MEMBER, "starts_at": req.starts_at, "expires_at": req.expires_at},
        })
        if req.apply:
            user.plan = PLAN_MEMBER
            user.starts_at = req.starts_at
            user.expires_at = req.expires_at
    if req.apply:
        db.commit()
    return {"applied": req.apply, "count": len(results), "users": results}


@router.put("/users/{uid}/display-name", dependencies=[Depends(require_admin)])
def set_display_name(uid: str, req: DisplayNameRequest, db: Session = Depends(get_db)) -> dict[str, str | None]:
    from sqlalchemy import select

    user = db.scalar(select(User).where(User.uid_key == uid.strip().lower()))
    if user is None:
        raise HTTPException(status_code=404, detail="user_not_found")
    name = req.display_name.strip() if req.display_name else None
    if name is not None and not name:
        name = None
    user.display_name = name
    db.commit()
    return {"uid": user.uid, "display_name": user.display_name}


@router.post("/codes", response_model=CreateCodesResponse, dependencies=[Depends(require_admin)])
def create_codes(req: CreateCodesRequest, db: Session = Depends(get_db)) -> CreateCodesResponse:
    if req.tier not in activation_service.VALID_TIERS:
        raise HTTPException(status_code=400, detail=f"tier 必須是 {sorted(activation_service.VALID_TIERS)}")
    codes = activation_service.create_codes(db, req.tier, req.count)
    return CreateCodesResponse(tier=req.tier, codes=codes)


@router.post(
    "/password-resets/issue",
    response_model=IssuePasswordResetResponse,
    dependencies=[Depends(require_admin)],
)
def issue_password_reset(
    req: IssuePasswordResetRequest, db: Session = Depends(get_db)
) -> IssuePasswordResetResponse:
    try:
        code, expires_at, stock = password_reset_service.issue_code(db, req.uid)
    except password_reset_service.PasswordResetIssueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return IssuePasswordResetResponse(
        uid=req.uid.strip(), code=code, expires_at=expires_at, stock_remaining=stock
    )


@router.get(
    "/password-resets/status",
    response_model=PasswordResetInventoryResponse,
    dependencies=[Depends(require_admin)],
)
def password_reset_status(db: Session = Depends(get_db)) -> PasswordResetInventoryResponse:
    return PasswordResetInventoryResponse(**password_reset_service.inventory_status(db))
