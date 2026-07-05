"""Activation codes: hidden admin minting + single-use redemption."""

import re
import uuid

from fastapi.testclient import TestClient

from app.main import app

ADMIN_HEADERS = {"X-Admin-Key": "test-admin-secret"}


def _register(client: TestClient) -> tuple[str, dict[str, str]]:
    uid = "t_" + uuid.uuid4().hex[:10]
    res = client.post("/api/v1/auth/register", json={"uid": uid, "password": "secret123"})
    assert res.status_code == 200
    return uid, {"Authorization": f"Bearer {res.json()['token']}"}


def _mint(client: TestClient, tier: str, count: int = 1) -> list[str]:
    res = client.post(
        "/api/v1/admin/codes", json={"tier": tier, "count": count}, headers=ADMIN_HEADERS
    )
    assert res.status_code == 200
    return res.json()["codes"]


def _expire(uid: str) -> None:
    from datetime import UTC, datetime, timedelta

    from app.db import SessionLocal
    from app.models import User

    with SessionLocal() as db:
        user = db.query(User).filter(User.uid_key == uid.lower()).one()
        user.expires_at = datetime.now(UTC) - timedelta(hours=1)
        db.commit()


def test_admin_endpoint_is_invisible_without_the_key() -> None:
    with TestClient(app) as client:
        assert client.post("/api/v1/admin/codes", json={"tier": "30d", "count": 1}).status_code == 404
        wrong = client.post(
            "/api/v1/admin/codes",
            json={"tier": "30d", "count": 1},
            headers={"X-Admin-Key": "nope"},
        )
        assert wrong.status_code == 404


def test_admin_mints_unique_wellformed_codes() -> None:
    with TestClient(app) as client:
        codes = _mint(client, "30d", 20)
        assert len(codes) == len(set(codes)) == 20
        assert all(re.fullmatch(r"NOVA-[A-Z2-9]{4}-[A-Z2-9]{4}", c) for c in codes)
        bad_tier = client.post(
            "/api/v1/admin/codes", json={"tier": "7d", "count": 1}, headers=ADMIN_HEADERS
        )
        assert bad_tier.status_code == 400


def test_redeem_30d_reactivates_expired_user_and_is_single_use() -> None:
    with TestClient(app) as client:
        uid, headers = _register(client)
        _expire(uid)
        assert client.get("/api/v1/scan", headers=headers).status_code == 403

        code = _mint(client, "30d")[0]
        res = client.post("/api/v1/auth/redeem", json={"code": code}, headers=headers)
        assert res.status_code == 200
        body = res.json()
        assert body["active"] is True
        assert body["plan"] == "member"
        assert body["days_left"] == 30

        # 解鎖後資料端點立即可用
        assert client.get("/api/v1/anomaly-history", headers=headers).status_code == 200

        # 同一組碼第二個人再用 → 拒絕
        _, headers2 = _register(client)
        reuse = client.post("/api/v1/auth/redeem", json={"code": code}, headers=headers2)
        assert reuse.status_code == 400
        assert "已被使用" in reuse.json()["detail"]


def test_redeem_30d_stacks_on_running_trial() -> None:
    with TestClient(app) as client:
        _, headers = _register(client)  # 新帳號 = 試用 7 天
        code = _mint(client, "30d")[0]
        res = client.post("/api/v1/auth/redeem", json={"code": code}, headers=headers)
        assert res.status_code == 200
        # 疊加：7 + 30 = 37 天
        assert res.json()["days_left"] == 37


def test_redeem_lifetime_code() -> None:
    with TestClient(app) as client:
        uid, headers = _register(client)
        _expire(uid)
        code = _mint(client, "lifetime")[0]
        res = client.post("/api/v1/auth/redeem", json={"code": code}, headers=headers)
        assert res.status_code == 200
        assert res.json()["plan"] == "lifetime"
        assert res.json()["days_left"] is None
        assert res.json()["active"] is True


def test_redeem_rate_limit_locks_after_5_bad_attempts() -> None:
    with TestClient(app) as client:
        _, headers = _register(client)
        for _ in range(5):
            bad = client.post(
                "/api/v1/auth/redeem", json={"code": "NOVA-FAKE-CODE"}, headers=headers
            )
            assert bad.status_code == 400
        locked = client.post(
            "/api/v1/auth/redeem", json={"code": "NOVA-FAKE-CODE"}, headers=headers
        )
        assert locked.status_code == 429
