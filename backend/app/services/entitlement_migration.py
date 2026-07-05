"""Idempotent startup migration for the entitlement rollout.

Runs on every boot and is a no-op once applied:
1. Adds users.plan / users.expires_at if the columns are missing.
2. Backfills any user that has no entitlement yet (plan='trial' AND
   expires_at IS NULL — the state legacy rows land in after step 1):
   - UIDs in LIFETIME_UIDS -> lifetime (never expires)
   - everyone else         -> trial, now + 7 days

New registrations always set both fields, so after the first boot the
backfill matches nobody. Lifetime users (expires_at NULL, plan='lifetime')
are never touched. Outcomes are printed to the deploy log for audit.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import inspect, select, text

from app.models import User
from app.services.auth_service import PLAN_LIFETIME, PLAN_TRIAL, TRIAL_DAYS

# 手動維護的永久名單（大小寫不敏感）。只在「該用戶還沒有任何資格設定」時套用；
# 之後的方案調整走資料庫（下一輪的啟用碼 / 管理工具），不改這份名單。
LIFETIME_UIDS = [
    "53887220",
    "54182275",
    "54181155",
    "54034140",
    "54136886",
    "ShinCi_1314",
    "53885339",
]


def run_entitlement_migration(engine, session_factory) -> None:
    existing = {col["name"] for col in inspect(engine).get_columns("users")}
    with engine.begin() as conn:
        if "plan" not in existing:
            conn.execute(
                text("ALTER TABLE users ADD COLUMN plan VARCHAR(16) NOT NULL DEFAULT 'trial'")
            )
            print("[entitlement] added users.plan")
        if "expires_at" not in existing:
            column_type = "TIMESTAMPTZ" if engine.dialect.name == "postgresql" else "DATETIME"
            conn.execute(text(f"ALTER TABLE users ADD COLUMN expires_at {column_type} NULL"))
            print("[entitlement] added users.expires_at")

    lifetime_keys = {uid.lower() for uid in LIFETIME_UIDS}
    trial_expiry = datetime.now(UTC) + timedelta(days=TRIAL_DAYS)

    with session_factory() as db:
        pending = list(
            db.scalars(
                select(User).where(User.plan == PLAN_TRIAL, User.expires_at.is_(None))
            )
        )
        if not pending:
            return

        lifetime_count = 0
        for user in pending:
            if user.uid_key in lifetime_keys:
                user.plan = PLAN_LIFETIME
                user.expires_at = None
                lifetime_count += 1
                print(f"[entitlement] {user.uid} -> lifetime")
            else:
                user.expires_at = trial_expiry
                print(f"[entitlement] {user.uid} -> trial until {trial_expiry:%Y-%m-%d %H:%M} UTC")
        db.commit()

        found_keys = {u.uid_key for u in pending}
        missing = [uid for uid in LIFETIME_UIDS if uid.lower() not in found_keys]
        if missing and lifetime_count < len(LIFETIME_UIDS):
            # 名單裡不在這次 backfill 的 UID：可能早已設定過，也可能根本不存在。
            print(f"[entitlement] lifetime UIDs not in this backfill (already set or absent): {missing}")
        print(
            f"[entitlement] backfilled {len(pending)} users "
            f"({lifetime_count} lifetime, {len(pending) - lifetime_count} trial +{TRIAL_DAYS}d)"
        )
