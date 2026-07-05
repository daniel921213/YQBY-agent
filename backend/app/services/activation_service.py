"""Activation codes: generation + redemption.

Codes are pre-generated rows in `activation_codes`; a string the table doesn't
contain is simply invalid. Redemption is single-use and records who/when —
the table doubles as the customer ledger.

Tiers:
- "7d":       試用碼。expires_at = max(now, current expiry) + 7 days; plan
              becomes "trial" (unless already member/lifetime).
- "30d":      expires_at = max(now, current expiry) + 30 days (stacking — 提前
              續費不吃虧), plan becomes "member" (unless already lifetime).
- "lifetime": plan = "lifetime", expires_at cleared.

Brute-force guard: 5 consecutive bad attempts per account -> locked 10 minutes
(in-memory; single-instance deployment).
"""

from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ActivationCode, User
from app.services.auth_service import PLAN_LIFETIME, PLAN_TRIAL, _as_utc

TIER_7D = "7d"
TIER_30D = "30d"
TIER_LIFETIME = "lifetime"
VALID_TIERS = {TIER_7D, TIER_30D, TIER_LIFETIME}
TIER_DAYS = {TIER_7D: 7, TIER_30D: 30}
PLAN_MEMBER = "member"

# 排除易混淆字元（0/O、1/I/L）
_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

_MAX_FAILS = 5
_LOCK_MINUTES = 10
# uid_key -> (consecutive fails, locked_until | None)
_attempts: dict[str, tuple[int, datetime | None]] = {}


class RedeemError(ValueError):
    """Invalid / already-used code (HTTP 400)."""


class RateLimitedError(RuntimeError):
    """Too many bad attempts (HTTP 429)."""


def _random_code() -> str:
    def chunk() -> str:
        return "".join(secrets.choice(_ALPHABET) for _ in range(4))

    return f"NOVA-{chunk()}-{chunk()}"


def create_codes(db: Session, tier: str, count: int) -> list[str]:
    if tier not in VALID_TIERS:
        raise ValueError(f"unknown tier: {tier}")
    codes: list[str] = []
    while len(codes) < count:
        candidate = _random_code()
        exists = db.scalar(select(ActivationCode).where(ActivationCode.code == candidate))
        if exists is not None or candidate in codes:
            continue  # 撞號重抽（機率趨近於零）
        db.add(ActivationCode(code=candidate, tier=tier))
        codes.append(candidate)
    db.commit()
    return codes


def _check_rate_limit(uid_key: str) -> None:
    fails, locked_until = _attempts.get(uid_key, (0, None))
    if locked_until is not None:
        if datetime.now(UTC) < locked_until:
            raise RateLimitedError()
        _attempts[uid_key] = (0, None)


def _record_fail(uid_key: str) -> None:
    fails, _ = _attempts.get(uid_key, (0, None))
    fails += 1
    locked = (
        datetime.now(UTC) + timedelta(minutes=_LOCK_MINUTES) if fails >= _MAX_FAILS else None
    )
    _attempts[uid_key] = (0 if locked else fails, locked)


def redeem(db: Session, user: User, raw_code: str) -> ActivationCode:
    _check_rate_limit(user.uid_key)

    code = raw_code.strip().upper()
    row = db.scalar(select(ActivationCode).where(ActivationCode.code == code))
    if row is None:
        _record_fail(user.uid_key)
        raise RedeemError("啟用碼無效")
    if row.used_by is not None:
        _record_fail(user.uid_key)
        raise RedeemError("此啟用碼已被使用")

    now = datetime.now(UTC)
    if row.tier == TIER_LIFETIME:
        user.plan = PLAN_LIFETIME
        user.expires_at = None
    else:
        current = _as_utc(user.expires_at)
        base = current if current is not None and current > now else now
        user.expires_at = base + timedelta(days=TIER_DAYS[row.tier])
        # 方案只升不降：lifetime > member > trial。7 天碼不會把付費會員降回試用。
        if row.tier == TIER_30D and user.plan != PLAN_LIFETIME:
            user.plan = PLAN_MEMBER
        elif row.tier == TIER_7D and user.plan not in (PLAN_LIFETIME, PLAN_MEMBER):
            user.plan = PLAN_TRIAL

    row.used_by = user.uid
    row.used_at = now
    db.commit()
    _attempts.pop(user.uid_key, None)
    return row
