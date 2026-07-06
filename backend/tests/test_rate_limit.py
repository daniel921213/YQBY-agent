import uuid

from fastapi.testclient import TestClient

from app.main import app


def test_register_blocks_after_limit() -> None:
    client = TestClient(app)
    # 限流對「所有嘗試」計數（成功或 uid 重複都算），所以無論前 8 次結果如何，
    # 第 9 次一定被 429。不強求 200：sqlite 檔跨次保留，重跑時舊 uid 會回 400，
    # 仍計為一次 hit。
    tag = uuid.uuid4().hex[:8]
    for i in range(8):
        r = client.post(
            "/api/v1/auth/register",
            json={"uid": f"rl{tag}{i}", "password": "secret123"},
        )
        assert r.status_code in (200, 400), r.text
    blocked = client.post(
        "/api/v1/auth/register", json={"uid": f"rl{tag}over", "password": "secret123"}
    )
    assert blocked.status_code == 429


def test_login_blocks_after_failures() -> None:
    client = TestClient(app)
    client.post("/api/v1/auth/register", json={"uid": "rlvictim", "password": "secret123"})
    for _ in range(15):
        client.post("/api/v1/auth/login", json={"uid": "rlvictim", "password": "wrongpass"})
    blocked = client.post("/api/v1/auth/login", json={"uid": "rlvictim", "password": "wrongpass"})
    assert blocked.status_code == 429
