from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.auth import (
    AuthRequest,
    AuthResponse,
    MeResponse,
    PasswordResetRequest,
    PasswordResetResponse,
    RedeemRequest,
)
from app.services import activation_service, auth_service, password_reset_service, rate_limit
from app.services.activation_service import RateLimitedError, RedeemError
from app.services.auth_service import AuthError

router = APIRouter(prefix="/auth", tags=["auth"])

# 註冊：每 IP 每小時 8 次（真人只註冊一兩次；批次灌註冊會在此止血）。
_REGISTER_LIMIT = 8
_REGISTER_WINDOW = 3600.0
# 登入：每 IP 每 10 分鐘 15 次失敗（成功即清零，不影響正常使用）。
_LOGIN_FAIL_LIMIT = 15
_LOGIN_WINDOW = 600.0
_PASSWORD_RESET_LIMIT = 5
_PASSWORD_RESET_WINDOW = 900.0


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
    return AuthResponse(token=auth_service.create_token(user), uid=user.uid)


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
    return AuthResponse(token=auth_service.create_token(user), uid=user.uid)


@router.post("/password-reset", response_model=PasswordResetResponse)
def reset_password(
    req: PasswordResetRequest, request: Request, db: Session = Depends(get_db)
) -> PasswordResetResponse:
    key = f"password-reset:{rate_limit.client_ip(request)}:{req.uid.strip().lower()}"
    if rate_limit.is_over_limit(key, _PASSWORD_RESET_LIMIT, _PASSWORD_RESET_WINDOW):
        raise HTTPException(status_code=429, detail="嘗試次數過多，請稍後再試")
    try:
        password_reset_service.reset_password(db, req.uid, req.code, req.new_password)
    except password_reset_service.PasswordResetError as exc:
        rate_limit.record_hit(key, _PASSWORD_RESET_WINDOW)
        raise HTTPException(status_code=400, detail=str(exc))
    rate_limit.clear(key)
    return PasswordResetResponse(message="密碼已重設，請使用新密碼登入")


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


def current_session(
    authorization: str | None = Header(default=None), db: Session = Depends(get_db)
):
    """Resolve a session and reject tokens issued before a password reset."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="authentication_required")
    token_data = auth_service.decode_token_with_version(authorization[len("Bearer ") :])
    if token_data is None:
        raise HTTPException(status_code=401, detail="invalid_session")
    uid, token_version = token_data
    user = auth_service.get_user(db, uid)
    if user is None or token_version != int(user.auth_version or 0):
        raise HTTPException(status_code=401, detail="session_revoked")
    return user


# Keep the historical dependency name safe for any future route imports.
current_user = current_session


def require_active_user(user=Depends(current_session)):
    """Data-endpoint gate: valid login AND (lifetime OR unexpired trial).

    403 detail is the machine-readable "expired" — the frontend switches the
    dashboard to the trial-expired wall on it.
    """
    if not auth_service.is_active(user):
        raise HTTPException(status_code=403, detail="expired")
    return user


def require_lifetime_user(user=Depends(current_session)):
    """Feature-preview gate for endpoints limited to permanent accounts.

    Keep this separate from ``require_active_user`` so a preview can later be
    opened to every valid activation tier by swapping one router dependency.
    """
    if user.plan != auth_service.PLAN_LIFETIME:
        raise HTTPException(status_code=403, detail="lifetime_required")
    return user


def require_yokai_user(user=Depends(current_session)):
    """Allow Yokai Intelligence for lifetime or active 30-day members."""
    has_access = user.plan == auth_service.PLAN_LIFETIME or (
        user.plan == auth_service.PLAN_MEMBER and auth_service.is_active(user)
    )
    if not has_access:
        raise HTTPException(status_code=403, detail="yokai_plan_required")
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
def me(user=Depends(current_session)) -> MeResponse:
    return _me_response(user)


@router.post("/redeem", response_model=MeResponse)
def redeem(
    req: RedeemRequest, user=Depends(current_session), db: Session = Depends(get_db)
) -> MeResponse:
    """兌換啟用碼。只要登入即可（到期用戶就是主要使用者），回最新資格狀態。"""
    try:
        activation_service.redeem(db, user, req.code)
    except RateLimitedError:
        raise HTTPException(status_code=429, detail="嘗試次數過多，請 10 分鐘後再試")
    except RedeemError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return _me_response(user)
