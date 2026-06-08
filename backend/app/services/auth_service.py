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

    user = User(uid=uid, uid_key=key, password_hash=hash_password(password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate(db: Session, uid: str, password: str) -> User | None:
    user = db.scalar(select(User).where(User.uid_key == uid.strip().lower()))
    if user is None or not verify_password(password, user.password_hash):
        return None
    return user
