"""Startup entitlement migration: legacy rows get backfilled exactly once."""

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from app.main import app


def test_startup_backfills_legacy_rows_once() -> None:
    from app.db import SessionLocal, engine
    from app.models import User
    from app.services.auth_service import PLAN_LIFETIME, PLAN_TRIAL, hash_password
    from app.services.entitlement_migration import LIFETIME_UIDS, run_entitlement_migration

    with TestClient(app):  # lifespan creates the table (and runs the migration once)
        pass

    lifetime_uid = LIFETIME_UIDS[0]
    with SessionLocal() as db:
        # Simulate legacy rows: no entitlement yet (plan default, expires NULL).
        db.add(
            User(
                uid=lifetime_uid,
                uid_key=lifetime_uid.lower(),
                password_hash=hash_password("secret123"),
                plan=PLAN_TRIAL,
                expires_at=None,
            )
        )
        db.add(
            User(
                uid="legacy_user",
                uid_key="legacy_user",
                password_hash=hash_password("secret123"),
                plan=PLAN_TRIAL,
                expires_at=None,
            )
        )
        db.commit()

    run_entitlement_migration(engine, SessionLocal)

    with SessionLocal() as db:
        vip = db.query(User).filter(User.uid_key == lifetime_uid.lower()).one()
        assert vip.plan == PLAN_LIFETIME
        assert vip.expires_at is None

        legacy = db.query(User).filter(User.uid_key == "legacy_user").one()
        assert legacy.plan == PLAN_TRIAL
        expires = legacy.expires_at.replace(tzinfo=UTC) if legacy.expires_at.tzinfo is None else legacy.expires_at
        assert expires > datetime.now(UTC) + timedelta(days=6)

        # Idempotent: a second run must not extend the trial.
        first_expiry = legacy.expires_at

    run_entitlement_migration(engine, SessionLocal)
    with SessionLocal() as db:
        legacy = db.query(User).filter(User.uid_key == "legacy_user").one()
        assert legacy.expires_at == first_expiry

        # Cleanup so other tests' assumptions about the shared sqlite file hold.
        db.query(User).filter(User.uid_key.in_([lifetime_uid.lower(), "legacy_user"])).delete()
        db.commit()
