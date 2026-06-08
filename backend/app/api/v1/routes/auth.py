from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.auth import AuthRequest, AuthResponse, MeResponse
from app.services import auth_service
from app.services.auth_service import AuthError

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=AuthResponse)
def register(req: AuthRequest, db: Session = Depends(get_db)) -> AuthResponse:
    try:
        user = auth_service.register(db, req.uid, req.password)
    except AuthError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return AuthResponse(token=auth_service.create_token(user.uid), uid=user.uid)


@router.post("/login", response_model=AuthResponse)
def login(req: AuthRequest, db: Session = Depends(get_db)) -> AuthResponse:
    user = auth_service.authenticate(db, req.uid, req.password)
    if user is None:
        raise HTTPException(status_code=401, detail="UID 或密碼不正確")
    return AuthResponse(token=auth_service.create_token(user.uid), uid=user.uid)


def current_uid(authorization: str | None = Header(default=None)) -> str:
    """Bearer-token dependency for protected endpoints (per-user features later)."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="未登入")
    uid = auth_service.decode_token(authorization[len("Bearer ") :])
    if uid is None:
        raise HTTPException(status_code=401, detail="登入已過期，請重新登入")
    return uid


@router.get("/me", response_model=MeResponse)
def me(uid: str = Depends(current_uid)) -> MeResponse:
    return MeResponse(uid=uid)
