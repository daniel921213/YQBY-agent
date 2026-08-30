"""Password-reset stock, issuance, validation, and session revocation."""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import PasswordResetCode, User
from app.services.auth_service import MIN_PASSWORD_LEN, _as_utc, hash_password

RESET_STOCK_TARGET = 100
RESET_VALID_MINUTES = 15
_CODE_PREFIX = "RESET"
_CODE_CHARS = 12


class PasswordResetError(ValueError):
    """Public reset failure. Messages intentionally avoid account disclosure."""


class PasswordResetIssueError(ValueError):
    """Administrator-facing issuance failure."""


def _secret() -> bytes:
    settings = get_settings()
    value = settings.password_reset_secret or settings.jwt_secret
    return value.encode("utf-8")


def _raw_code(nonce: str) -> str:
    digest = hmac.new(_secret(), f"password-reset:{nonce}".encode(), hashlib.sha256).digest()
    token = base64.b32encode(digest).decode("ascii").rstrip("=")[:_CODE_CHARS]
    return f"{_CODE_PREFIX}-{token[:4]}-{token[4:8]}-{token[8:12]}"


def _normalize_code(value: str) -> str:
    return value.strip().upper()


def _code_hash(value: str) -> str:
    return hashlib.sha256(_normalize_code(value).encode("utf-8")).hexdigest()


def stock_count(db: Session) -> int:
    return int(
        db.scalar(
            select(func.count(PasswordResetCode.id)).where(
                PasswordResetCode.assigned_uid_key.is_(None),
                PasswordResetCode.used_at.is_(None),
            )
        )
        or 0
    )


def ensure_inventory(db: Session, target: int = RESET_STOCK_TARGET) -> int:
    """Ensure at least ``target`` safe, unassigned rows exist."""
    current = stock_count(db)
    for _ in range(max(0, target - current)):
        nonce = secrets.token_hex(24)
        raw = _raw_code(nonce)
        db.add(PasswordResetCode(nonce=nonce, code_hash=_code_hash(raw)))
    db.commit()
    return stock_count(db)


def issue_code(db: Session, uid: str) -> tuple[str, datetime, int]:
    uid_key = uid.strip().lower()
    user = db.scalar(select(User).where(User.uid_key == uid_key))
    if user is None:
        raise PasswordResetIssueError("找不到這個 UID")

    now = datetime.now(UTC)
    # Only the newest helper-issued code stays valid for this account.
    active = list(
        db.scalars(
            select(PasswordResetCode).where(
                PasswordResetCode.assigned_uid_key == uid_key,
                PasswordResetCode.used_at.is_(None),
            )
        )
    )
    for row in active:
        row.used_at = now

    ensure_inventory(db)
    row = db.scalar(
        select(PasswordResetCode)
        .where(
            PasswordResetCode.assigned_uid_key.is_(None),
            PasswordResetCode.used_at.is_(None),
        )
        .order_by(PasswordResetCode.id)
        .with_for_update(skip_locked=True)
    )
    if row is None:  # pragma: no cover - ensure_inventory normally makes this impossible
        raise PasswordResetIssueError("目前沒有可用的重設碼")

    expires_at = now + timedelta(minutes=RESET_VALID_MINUTES)
    row.assigned_uid_key = uid_key
    row.issued_at = now
    row.expires_at = expires_at
    raw = _raw_code(row.nonce)
    db.commit()

    # Keep the Railway reserve at 100 even after one code has been issued.
    remaining = ensure_inventory(db)
    return raw, expires_at, remaining


def reset_password(db: Session, uid: str, code: str, new_password: str) -> User:
    if len(new_password) < MIN_PASSWORD_LEN:
        raise PasswordResetError(f"新密碼至少需要 {MIN_PASSWORD_LEN} 個字元")

    uid_key = uid.strip().lower()
    row = db.scalar(
        select(PasswordResetCode)
        .where(PasswordResetCode.code_hash == _code_hash(code))
        .with_for_update()
    )
    now = datetime.now(UTC)
    valid = (
        row is not None
        and row.assigned_uid_key == uid_key
        and row.used_at is None
        and _as_utc(row.expires_at) is not None
        and _as_utc(row.expires_at) > now
    )
    if not valid:
        raise PasswordResetError("重設碼無效或已過期")

    user = db.scalar(select(User).where(User.uid_key == uid_key))
    if user is None:  # Keep the public response identical to an invalid code.
        raise PasswordResetError("重設碼無效或已過期")

    user.password_hash = hash_password(new_password)
    user.auth_version = int(user.auth_version or 0) + 1
    row.used_at = now
    db.commit()
    return user


def inventory_status(db: Session) -> dict[str, int]:
    now = datetime.now(UTC)
    stock = stock_count(db)
    active = int(
        db.scalar(
            select(func.count(PasswordResetCode.id)).where(
                PasswordResetCode.assigned_uid_key.is_not(None),
                PasswordResetCode.used_at.is_(None),
                PasswordResetCode.expires_at > now,
            )
        )
        or 0
    )
    used = int(
        db.scalar(
            select(func.count(PasswordResetCode.id)).where(
                PasswordResetCode.used_at.is_not(None)
            )
        )
        or 0
    )
    return {"stock": stock, "active": active, "used_or_cancelled": used}
