"""One-time entitlement migration: add plan/expires_at and backfill every user.

- The LIFETIME_UIDS below become `lifetime` (never expires).
- Every other existing user becomes `trial` with expires_at = now + 7 days.
- Lifetime UIDs that don't exist in the DB are reported loudly (typo guard).

Usage (from backend/, with DATABASE_URL pointing at the target DB):
    python scripts/migrate_entitlement.py            # dry-run: print the plan only
    python scripts/migrate_entitlement.py --apply    # actually write

Run this BEFORE deploying the entitlement code — the new app queries the new
columns and would 500 against a table that doesn't have them yet.
"""

from __future__ import annotations

import sys
from datetime import UTC, datetime, timedelta

from sqlalchemy import inspect, select, text

from app.db import SessionLocal, engine
from app.models import User
from app.services.auth_service import PLAN_LIFETIME, PLAN_TRIAL, TRIAL_DAYS
from app.services.entitlement_migration import LIFETIME_UIDS  # 單一名單來源


def ensure_columns() -> None:
    """Add plan/expires_at if missing (works on both Postgres and SQLite)."""
    existing = {col["name"] for col in inspect(engine).get_columns("users")}
    with engine.begin() as conn:
        if "plan" not in existing:
            conn.execute(text("ALTER TABLE users ADD COLUMN plan VARCHAR(16) NOT NULL DEFAULT 'trial'"))
            print("+ 已新增欄位 users.plan")
        if "expires_at" not in existing:
            conn.execute(text("ALTER TABLE users ADD COLUMN expires_at TIMESTAMPTZ NULL")
                         if engine.dialect.name == "postgresql"
                         else text("ALTER TABLE users ADD COLUMN expires_at DATETIME NULL"))
            print("+ 已新增欄位 users.expires_at")


def main() -> int:
    apply = "--apply" in sys.argv
    lifetime_keys = {uid.lower() for uid in LIFETIME_UIDS}
    trial_expiry = datetime.now(UTC) + timedelta(days=TRIAL_DAYS)

    ensure_columns()

    with SessionLocal() as db:
        users = list(db.scalars(select(User).order_by(User.id)))

        found_keys = {u.uid_key for u in users}
        missing = [uid for uid in LIFETIME_UIDS if uid.lower() not in found_keys]

        print(f"\n資料庫共 {len(users)} 個帳號，設定計畫如下：\n")
        print(f"{'UID':<24} {'方案':<10} 到期日")
        print("-" * 60)
        for u in users:
            if u.uid_key in lifetime_keys:
                print(f"{u.uid:<24} {'永久':<10} —")
            else:
                print(f"{u.uid:<24} {'試用':<10} {trial_expiry:%Y-%m-%d %H:%M} UTC")

        if missing:
            print(f"\n!! 警告：這些永久名單 UID 在資料庫裡找不到（不會有任何效果）：{missing}")

        if not apply:
            print("\n[dry-run] 尚未寫入。確認名單無誤後加上 --apply 執行。")
            return 0

        for u in users:
            if u.uid_key in lifetime_keys:
                u.plan = PLAN_LIFETIME
                u.expires_at = None
            else:
                u.plan = PLAN_TRIAL
                u.expires_at = trial_expiry
        db.commit()
        lifetime_count = sum(1 for u in users if u.uid_key in lifetime_keys)
        print(f"\n✔ 已寫入：{lifetime_count} 個永久、{len(users) - lifetime_count} 個試用（+{TRIAL_DAYS} 天）。")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
