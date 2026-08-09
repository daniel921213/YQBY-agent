from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.auth import AuthRequest, AuthResponse, MeResponse, RedeemRequest
from app.services import activation_service, auth_service, rate_limit
from app.services.activation_service import RateLimitedError, RedeemError
from app.services.auth_service import AuthError

router = APIRouter(prefix="/auth", tags=["auth"])

# 註冊：每 IP 每小時 8 次（真人只註冊一兩次；批次灌註冊會在此止血）。
_REGISTER_LIMIT = 8
_REGISTER_WINDOW = 3600.0
# 登入：每 IP 每 10 分鐘 15 次失敗（成功即清零，不影響正常使用）。
_LOGIN_FAIL_LIMIT = 15
_LOGIN_WINDOW = 600.0


@router.post("/register", response_model=AuthResponse)
def register(req: AuthRequest, request: Request, db: Session = Depends(get_db)) -> AuthResponse:
    ip_key = f"reg:{rate_limit.client_ip(request)}"
    if rate_limit.is_over_limit(ip_key, _REGISTER_LIMIT, _REGISTER_WINDOW):
        raise HTTPException(status_code=429, detail="註冊次數過多，請稍後再試")
    rate_limit.record_hit(ip_key, _REGISTER_WINDOW)
    try:
        user = auth_service.register(db, req.uid, req.password)
    except AuthError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return AuthResponse(token=auth_service.create_token(user.uid), uid=user.uid)


@router.post("/login", response_model=AuthResponse)
def login(req: AuthRequest, request: Request, db: Session = Depends(get_db)) -> AuthResponse:
    ip_key = f"login:{rate_limit.client_ip(request)}"
    if rate_limit.is_over_limit(ip_key, _LOGIN_FAIL_LIMIT, _LOGIN_WINDOW):
        raise HTTPException(status_code=429, detail="登入嘗試過多，請稍後再試")
    user = auth_service.authenticate(db, req.uid, req.password)
    if user is None:
        rate_limit.record_hit(ip_key, _LOGIN_WINDOW)
        raise HTTPException(status_code=401, detail="UID 或密碼不正確")
    rate_limit.clear(ip_key)
    return AuthResponse(token=auth_service.create_token(user.uid), uid=user.uid)


def current_uid(authorization: str | None = Header(default=None)) -> str:
    """Bearer-token dependency for protected endpoints (per-user features later)."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="未登入")
    uid = auth_service.decode_token(authorization[len("Bearer ") :])
    if uid is None:
        raise HTTPException(status_code=401, detail="登入已過期，請重新登入")
    return uid


def current_user(uid: str = Depends(current_uid), db: Session = Depends(get_db)):
    user = auth_service.get_user(db, uid)
    if user is None:
        raise HTTPException(status_code=401, detail="帳號不存在，請重新登入")
    return user


def require_active_user(user=Depends(current_user)):
    """Data-endpoint gate: valid login AND (lifetime OR unexpired trial).

    403 detail is the machine-readable "expired" — the frontend switches the
    dashboard to the trial-expired wall on it.
    """
    if not auth_service.is_active(user):
        raise HTTPException(status_code=403, detail="expired")
    return user


def require_lifetime_user(user=Depends(current_user)):
    """Feature-preview gate for endpoints limited to permanent accounts.

    Keep this separate from ``require_active_user`` so a preview can later be
    opened to every valid activation tier by swapping one router dependency.
    """
    if user.plan != auth_service.PLAN_LIFETIME:
        raise HTTPException(status_code=403, detail="lifetime_required")
    return user


def _me_response(user) -> MeResponse:
    return MeResponse(
        uid=user.uid,
        plan=user.plan,
        expires_at=user.expires_at,
        days_left=auth_service.days_left(user),
        active=auth_service.is_active(user),
    )


@router.get("/me", response_model=MeResponse)
def me(user=Depends(current_user)) -> MeResponse:
    return _me_response(user)


@router.post("/redeem", response_model=MeResponse)
def redeem(
    req: RedeemRequest, user=Depends(current_user), db: Session = Depends(get_db)
) -> MeResponse:
    """兌換啟用碼。只要登入即可（到期用戶就是主要使用者），回最新資格狀態。"""
    try:
        activation_service.redeem(db, user, req.code)
    except RateLimitedError:
        raise HTTPException(status_code=429, detail="嘗試次數過多，請 10 分鐘後再試")
    except RedeemError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return _me_response(user)
