from datetime import UTC, datetime, timedelta
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.db import Base, SessionLocal
from app.main import app
from app.models import PasswordResetCode, User


ADMIN_HEADERS = {"X-Admin-Key": "test-admin-secret"}
OLD_PASSWORD = "secret123"
NEW_PASSWORD = "changed456"


def test_fresh_database_is_seeded_once_with_exactly_100_codes() -> None:
    from app.services.password_reset_service import ensure_inventory

    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    with Session(engine) as db:
        assert ensure_inventory(db) == 100
        assert ensure_inventory(db) == 100


def _register(client: TestClient) -> tuple[str, str]:
    uid = "reset_" + uuid.uuid4().hex[:10]
    response = client.post(
        "/api/v1/auth/register", json={"uid": uid, "password": OLD_PASSWORD}
    )
    assert response.status_code == 200
    return uid, response.json()["token"]


def _issue(client: TestClient, uid: str) -> dict:
    response = client.post(
        "/api/v1/admin/password-resets/issue",
        json={"uid": uid},
        headers=ADMIN_HEADERS,
    )
    assert response.status_code == 200
    return response.json()


@pytest.mark.parametrize(
    ("plan", "expires_delta"),
    [
        ("unactivated", None),
        ("trial", timedelta(days=7)),
        ("member", timedelta(days=30)),
        ("lifetime", None),
    ],
)
def test_reset_preserves_entitlement_and_revokes_old_token(plan, expires_delta) -> None:
    with TestClient(app) as client:
        uid, old_token = _register(client)
        with SessionLocal() as db:
            user = db.query(User).filter(User.uid_key == uid.lower()).one()
            user.plan = plan
            user.expires_at = datetime.now(UTC) + expires_delta if expires_delta else None
            db.commit()

        old_headers = {"Authorization": f"Bearer {old_token}"}
        before = client.get("/api/v1/auth/me", headers=old_headers)
        assert before.status_code == 200

        issued = _issue(client, uid)
        assert issued["code"].startswith("RESET-")
        assert issued["stock_remaining"] >= 100

        reset = client.post(
            "/api/v1/auth/password-reset",
            json={"uid": uid, "code": issued["code"], "new_password": NEW_PASSWORD},
        )
        assert reset.status_code == 200

        # Every token issued before the reset is rejected immediately.
        revoked = client.get("/api/v1/auth/me", headers=old_headers)
        assert revoked.status_code == 401
        assert revoked.json()["detail"] == "session_revoked"

        assert client.post(
            "/api/v1/auth/login", json={"uid": uid, "password": OLD_PASSWORD}
        ).status_code == 401
        login = client.post(
            "/api/v1/auth/login", json={"uid": uid, "password": NEW_PASSWORD}
        )
        assert login.status_code == 200
        after = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {login.json()['token']}"},
        )
        assert after.status_code == 200
        assert after.json()["plan"] == before.json()["plan"]
        assert after.json()["expires_at"] == before.json()["expires_at"]

        # The reset code is one-time only.
        reused = client.post(
            "/api/v1/auth/password-reset",
            json={"uid": uid, "code": issued["code"], "new_password": "third-password"},
        )
        assert reused.status_code == 400


def test_inventory_is_hidden_preseeded_and_replenished() -> None:
    with TestClient(app) as client:
        hidden = client.get("/api/v1/admin/password-resets/status")
        assert hidden.status_code == 404

        status = client.get(
            "/api/v1/admin/password-resets/status", headers=ADMIN_HEADERS
        )
        assert status.status_code == 200
        assert status.json()["stock"] >= 100

        uid, _ = _register(client)
        _issue(client, uid)
        replenished = client.get(
            "/api/v1/admin/password-resets/status", headers=ADMIN_HEADERS
        )
        assert replenished.json()["stock"] >= 100
        assert replenished.json()["active"] >= 1


def test_code_is_uid_bound_and_expires_after_15_minutes() -> None:
    with TestClient(app) as client:
        uid_a, _ = _register(client)
        uid_b, _ = _register(client)
        issued = _issue(client, uid_a)

        wrong_user = client.post(
            "/api/v1/auth/password-reset",
            json={"uid": uid_b, "code": issued["code"], "new_password": NEW_PASSWORD},
        )
        assert wrong_user.status_code == 400

        with SessionLocal() as db:
            row = (
                db.query(PasswordResetCode)
                .filter(PasswordResetCode.assigned_uid_key == uid_a.lower())
                .order_by(PasswordResetCode.id.desc())
                .first()
            )
            assert row is not None
            row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
            db.commit()

        expired = client.post(
            "/api/v1/auth/password-reset",
            json={"uid": uid_a, "code": issued["code"], "new_password": NEW_PASSWORD},
        )
        assert expired.status_code == 400


def test_public_reset_is_rate_limited() -> None:
    with TestClient(app) as client:
        uid, _ = _register(client)
        for _ in range(5):
            response = client.post(
                "/api/v1/auth/password-reset",
                json={"uid": uid, "code": "RESET-FAKE-FAKE-FAKE", "new_password": NEW_PASSWORD},
            )
            assert response.status_code == 400
        locked = client.post(
            "/api/v1/auth/password-reset",
            json={"uid": uid, "code": "RESET-FAKE-FAKE-FAKE", "new_password": NEW_PASSWORD},
        )
        assert locked.status_code == 429
