import uuid

from fastapi.testclient import TestClient

from app.main import app


def _uid() -> str:
    return "t_" + uuid.uuid4().hex[:10]


def test_register_login_me_roundtrip() -> None:
    # `with` triggers the lifespan so init_db() creates the users table.
    with TestClient(app) as client:
        uid = _uid()
        pw = "secret123"

        reg = client.post("/api/v1/auth/register", json={"uid": uid, "password": pw})
        assert reg.status_code == 200
        assert reg.json()["uid"] == uid
        assert reg.json()["token"]

        # Duplicate UID is rejected.
        dup = client.post("/api/v1/auth/register", json={"uid": uid.upper(), "password": pw})
        assert dup.status_code == 400

        login = client.post("/api/v1/auth/login", json={"uid": uid, "password": pw})
        assert login.status_code == 200
        token = login.json()["token"]

        bad = client.post("/api/v1/auth/login", json={"uid": uid, "password": "wrong"})
        assert bad.status_code == 401

        me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me.status_code == 200
        body = me.json()
        assert body["uid"] == uid
        # New accounts start as a 7-day trial.
        assert body["plan"] == "trial"
        assert body["active"] is True
        assert body["days_left"] == 7
        assert body["expires_at"] is not None

        assert client.get("/api/v1/auth/me").status_code == 401


def test_expired_trial_gets_403_on_data_and_can_still_login() -> None:
    from datetime import UTC, datetime, timedelta

    from app.db import SessionLocal
    from app.models import User

    with TestClient(app) as client:
        uid = _uid()
        reg = client.post("/api/v1/auth/register", json={"uid": uid, "password": "secret123"})
        token = reg.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Force the trial into the past.
        with SessionLocal() as db:
            user = db.query(User).filter(User.uid_key == uid.lower()).one()
            user.expires_at = datetime.now(UTC) - timedelta(hours=1)
            db.commit()

        # Login still works (the expired user must reach the wall / enter a code).
        login = client.post("/api/v1/auth/login", json={"uid": uid, "password": "secret123"})
        assert login.status_code == 200

        # /me reports the expired state.
        me = client.get("/api/v1/auth/me", headers=headers)
        assert me.status_code == 200
        assert me.json()["active"] is False
        assert me.json()["days_left"] == 0

        # Data endpoints are gated with the machine-readable 403.
        scan = client.get("/api/v1/scan", headers=headers)
        assert scan.status_code == 403
        assert scan.json()["detail"] == "expired"

        chat = client.post("/api/v1/analyst/chat", json={"messages": []}, headers=headers)
        assert chat.status_code == 403


def test_lifetime_user_never_expires() -> None:
    from app.db import SessionLocal
    from app.models import User
    from app.services.auth_service import PLAN_LIFETIME

    with TestClient(app) as client:
        uid = _uid()
        reg = client.post("/api/v1/auth/register", json={"uid": uid, "password": "secret123"})
        headers = {"Authorization": f"Bearer {reg.json()['token']}"}

        with SessionLocal() as db:
            user = db.query(User).filter(User.uid_key == uid.lower()).one()
            user.plan = PLAN_LIFETIME
            user.expires_at = None
            db.commit()

        me = client.get("/api/v1/auth/me", headers=headers)
        assert me.status_code == 200
        assert me.json()["plan"] == "lifetime"
        assert me.json()["active"] is True
        assert me.json()["days_left"] is None

        assert client.get("/api/v1/anomaly-history", headers=headers).status_code == 200


def test_register_validation() -> None:
    with TestClient(app) as client:
        short_uid = client.post("/api/v1/auth/register", json={"uid": "ab", "password": "secret123"})
        assert short_uid.status_code == 400
        short_pw = client.post("/api/v1/auth/register", json={"uid": _uid(), "password": "123"})
        assert short_pw.status_code == 400
