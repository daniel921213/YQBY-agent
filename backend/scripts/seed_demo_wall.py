"""Dev-only: seed demo accounts for the expired-wall screenshot run.

Run with DATABASE_URL pointing at the throwaway demo sqlite:
    DATABASE_URL=sqlite:///./demo_wall.db python scripts/seed_demo_wall.py
"""

from datetime import UTC, datetime, timedelta

from app.db import SessionLocal, init_db
from app.services import auth_service

init_db()

with SessionLocal() as db:
    if auth_service.get_user(db, "demo_expired") is None:
        expired = auth_service.register(db, "demo_expired", "secret123")
        expired.expires_at = datetime.now(UTC) - timedelta(hours=2)
        db.commit()
        print("seeded demo_expired (已過期)")
    if auth_service.get_user(db, "demo_trial") is None:
        auth_service.register(db, "demo_trial", "secret123")
        print("seeded demo_trial (試用 7 天)")
print("done")
