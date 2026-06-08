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
        assert me.json()["uid"] == uid

        assert client.get("/api/v1/auth/me").status_code == 401


def test_register_validation() -> None:
    with TestClient(app) as client:
        short_uid = client.post("/api/v1/auth/register", json={"uid": "ab", "password": "secret123"})
        assert short_uid.status_code == 400
        short_pw = client.post("/api/v1/auth/register", json={"uid": _uid(), "password": "123"})
        assert short_pw.status_code == 400
