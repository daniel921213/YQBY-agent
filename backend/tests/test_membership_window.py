"""Scheduled access is enforced on the server, including exact date boundaries."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.db import SessionLocal
from app.models import User
from app.services import auth_service
from app.services.entitlement_migration import run_entitlement_migration

ADMIN = {"X-Admin-Key": "test-admin-secret"}
PATH = "/api/v1/admin/users/membership-window"
START = datetime.fromisoformat("2026-10-01T00:00:00+08:00")
END = datetime.fromisoformat("2026-10-31T00:00:00+08:00")


def register(client):
    uid = "window_" + uuid.uuid4().hex[:10]
    result = client.post("/api/v1/auth/register", json={"uid": uid, "password": "secret123"})
    assert result.status_code == 200
    return uid, {"Authorization": f"Bearer {result.json()['token']}"}


def payload(*uids, apply=False):
    return {"uids": list(uids), "starts_at": START.isoformat(), "expires_at": END.isoformat(), "apply": apply}


def freeze(monkeypatch, now):
    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return now.astimezone(tz) if tz else now.replace(tzinfo=None)
    monkeypatch.setattr(auth_service, "datetime", Clock)
    monkeypatch.setattr("app.services.activation_service.datetime", Clock)


@pytest.mark.parametrize("now,active,scheduled,days", [
    (START - timedelta(seconds=1), False, True, 30),
    (START, True, False, 30),
    (END - timedelta(seconds=1), True, False, 1),
    (END, False, False, 0),
])
def test_taipei_window_boundaries(monkeypatch, now, active, scheduled, days):
    freeze(monkeypatch, now)
    user = User(plan="member", starts_at=START, expires_at=END)
    assert auth_service.is_active(user) is active
    assert auth_service.is_scheduled(user) is scheduled
    assert auth_service.days_left(user) == days
    # SQLite returns naive timestamps; they must still be interpreted as UTC.
    user.starts_at = START.astimezone(UTC).replace(tzinfo=None)
    user.expires_at = END.astimezone(UTC).replace(tzinfo=None)
    assert auth_service.is_active(user) is active


def test_preview_apply_and_protected_endpoints(monkeypatch):
    with TestClient(app) as client:
        uid, headers = register(client)
        other, other_headers = register(client)
        preview = client.put(PATH, json=payload(uid.upper()), headers=ADMIN)
        assert preview.status_code == 200
        assert preview.json()["applied"] is False
        assert client.get("/api/v1/auth/me", headers=headers).json()["plan"] == "unactivated"
        result = client.put(PATH, json=payload(uid, apply=True), headers=ADMIN)
        assert result.status_code == 200
        assert result.json()["count"] == 1
        assert result.json()["users"][0]["previous"]["plan"] == "unactivated"
        assert client.get("/api/v1/auth/me", headers=other_headers).json()["plan"] == "unactivated"

        freeze(monkeypatch, START - timedelta(seconds=1))
        me = client.get("/api/v1/auth/me", headers=headers).json()
        assert me["scheduled"] is True and me["active"] is False
        assert me["days_left"] == 30 and me["plan"] == "member"
        assert datetime.fromisoformat(me["starts_at"]) == START
        for route in ("/scan", "/yokai", "/trades", "/journals/mine", "/journals/published"):
            assert client.get("/api/v1" + route, headers=headers).status_code == 403

        freeze(monkeypatch, START)
        assert client.get("/api/v1/auth/me", headers=headers).json()["active"] is True
        assert client.get("/api/v1/trades", headers=headers).status_code == 200
        freeze(monkeypatch, END)
        assert client.get("/api/v1/trades", headers=headers).status_code == 403


def test_batch_missing_or_lifetime_does_not_partially_apply():
    with TestClient(app) as client:
        uid, headers = register(client)
        vip, _ = register(client)
        with SessionLocal() as db:
            user = auth_service.get_user(db, vip)
            user.plan = "lifetime"
            db.commit()
        for partner, reason in (("missing_" + uuid.uuid4().hex, "users_not_found"), (vip, "cannot_replace_lifetime")):
            result = client.put(PATH, json=payload(uid, partner, apply=True), headers=ADMIN)
            assert result.status_code == 409
            assert result.json()["detail"]["reason"] == reason
            me = client.get("/api/v1/auth/me", headers=headers).json()
            assert me["plan"] == "unactivated" and me["starts_at"] is None


def test_admin_auth_and_window_validation():
    with TestClient(app) as client:
        uid, _ = register(client)
        assert client.put(PATH, json=payload(uid, apply=True)).status_code == 404
        assert client.put(PATH, json=payload(uid, uid.upper()), headers=ADMIN).status_code == 422
        bad = payload(uid)
        bad["expires_at"] = START.isoformat()
        assert client.put(PATH, json=bad, headers=ADMIN).status_code == 422
        bad = payload(uid)
        bad["starts_at"] = "2026-10-01T00:00:00"
        assert client.put(PATH, json=bad, headers=ADMIN).status_code == 422


def test_existing_members_and_lifetime_stay_active(monkeypatch):
    freeze(monkeypatch, START)
    assert auth_service.is_active(User(plan="member", starts_at=None, expires_at=END))
    assert auth_service.is_active(User(plan="lifetime", starts_at=END, expires_at=None))
    assert not auth_service.is_scheduled(User(plan="lifetime", starts_at=END))


def test_redeeming_code_preserves_scheduled_start_and_lifetime_clears_it(monkeypatch):
    with TestClient(app) as client:
        uid, headers = register(client)
        assert client.put(PATH, json=payload(uid, apply=True), headers=ADMIN).status_code == 200
        freeze(monkeypatch, START - timedelta(days=1))
        code = client.post("/api/v1/admin/codes", json={"tier": "30d", "count": 1}, headers=ADMIN).json()["codes"][0]
        result = client.post("/api/v1/auth/redeem", json={"code": code}, headers=headers).json()
        assert result["scheduled"] is True and result["active"] is False
        assert result["days_left"] == 60
        assert datetime.fromisoformat(result["starts_at"]) == START
        code = client.post("/api/v1/admin/codes", json={"tier": "lifetime", "count": 1}, headers=ADMIN).json()["codes"][0]
        result = client.post("/api/v1/auth/redeem", json={"code": code}, headers=headers).json()
        assert result["active"] is True and result["scheduled"] is False
        assert result["starts_at"] is None and result["expires_at"] is None


def test_migration_adds_nullable_start_once(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'legacy.db'}")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY, uid VARCHAR, uid_key VARCHAR, password_hash VARCHAR, created_at DATETIME, plan VARCHAR, expires_at DATETIME, auth_version INTEGER, display_name VARCHAR)"))
        connection.execute(text("INSERT INTO users (uid, uid_key, plan, expires_at) VALUES ('legacy', 'legacy', 'member', '2026-11-01 00:00:00')"))
    sessions = sessionmaker(bind=engine)
    run_entitlement_migration(engine, sessions)
    run_entitlement_migration(engine, sessions)
    assert "starts_at" in {column["name"] for column in inspect(engine).get_columns("users")}
    with sessions() as db:
        user = auth_service.get_user(db, "legacy")
        assert user.starts_at is None
        assert user.expires_at == datetime(2026, 11, 1)
    engine.dispose()
