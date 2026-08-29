"""Account auth: bcrypt password hashing + JWT sessions.

UID + password only (the user's choice). No email, no OAuth. Tokens are signed
with JWT_SECRET and carry just the uid; the dashboard stays public, the token is
for per-user features layered on later.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import bcrypt
import jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import User

MIN_UID_LEN = 3
MIN_PASSWORD_LEN = 6
# bcrypt only uses the first 72 bytes; truncate so long inputs don't error.
_BCRYPT_MAX_BYTES = 72

PLAN_UNACTIVATED = "unactivated"  # 註冊完、還沒輸入任何啟用碼
PLAN_TRIAL = "trial"
PLAN_MEMBER = "member"
PLAN_LIFETIME = "lifetime"
TRIAL_DAYS = 7


class AuthError(ValueError):
    """Raised for invalid registration / credentials (mapped to HTTP 4xx)."""


def hash_password(password: str) -> str:
    digest = bcrypt.hashpw(password.encode("utf-8")[:_BCRYPT_MAX_BYTES], bcrypt.gensalt())
    return digest.decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8")[:_BCRYPT_MAX_BYTES], hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def create_token(uid: str) -> str:
    settings = get_settings()
    payload = {
        "sub": uid,
        "exp": datetime.now(UTC) + timedelta(hours=settings.jwt_expire_hours),
        "iat": datetime.now(UTC),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def decode_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    sub = payload.get("sub")
    return sub if isinstance(sub, str) else None


def register(db: Session, uid: str, password: str) -> User:
    uid = uid.strip()
    if len(uid) < MIN_UID_LEN:
        raise AuthError(f"UID 至少需要 {MIN_UID_LEN} 個字元")
    if len(password) < MIN_PASSWORD_LEN:
        raise AuthError(f"密碼至少需要 {MIN_PASSWORD_LEN} 個字元")

    key = uid.lower()
    if db.scalar(select(User).where(User.uid_key == key)) is not None:
        raise AuthError("這個 UID 已經被註冊了")

    # 註冊只建立帳號，不送任何使用天數——7 天試用要輸入啟用碼（LINE 索取）
    # 才開始，否則重複註冊新帳號就能無限白嫖。
    user = User(
        uid=uid,
        uid_key=key,
        password_hash=hash_password(password),
        plan=PLAN_UNACTIVATED,
        expires_at=None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _as_utc(value: datetime | None) -> datetime | None:
    """SQLite hands back naive datetimes; treat them as UTC."""
    if value is None:
        return None
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def is_active(user: User) -> bool:
    if user.plan == PLAN_LIFETIME:
        return True
    expires = _as_utc(user.expires_at)
    return expires is not None and expires > datetime.now(UTC)


def days_left(user: User) -> int | None:
    """Whole days remaining (ceil); None for lifetime, 0 when expired."""
    if user.plan == PLAN_LIFETIME:
        return None
    expires = _as_utc(user.expires_at)
    if expires is None:
        return 0
    remaining = (expires - datetime.now(UTC)).total_seconds()
    return max(0, -(-int(remaining) // 86400))


def get_user(db: Session, uid: str) -> User | None:
    return db.scalar(select(User).where(User.uid_key == uid.strip().lower()))


def authenticate(db: Session, uid: str, password: str) -> User | None:
    user = db.scalar(select(User).where(User.uid_key == uid.strip().lower()))
    if user is None or not verify_password(password, user.password_hash):
        return None
    return user
