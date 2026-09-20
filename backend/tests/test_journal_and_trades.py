import base64
import uuid

from fastapi.testclient import TestClient

from app.db import SessionLocal
from app.main import app
from app.models import User


def account(client: TestClient, plan: str) -> tuple[str, dict[str, str]]:
    uid = "j_" + uuid.uuid4().hex[:10]
    token = client.post("/api/v1/auth/register", json={"uid": uid, "password": "secret123"}).json()["token"]
    with SessionLocal() as db:
        user = db.query(User).filter(User.uid_key == uid.lower()).one()
        user.plan = plan
        db.commit()
    return uid, {"Authorization": f"Bearer {token}"}


def test_trade_math_and_private_ownership():
    with TestClient(app) as client:
        _, owner = account(client, "lifetime")
        _, other = account(client, "lifetime")
        data = {
            "symbol": "mnq", "market": "futures", "currency": "USD", "side": "short",
            "entry_at": "2026-09-19T10:00:00+08:00", "exit_at": "2026-09-19T10:30:00+08:00",
            "entry_price": "100", "exit_price": "90", "quantity": "2", "point_value": "2", "fees": "3",
        }
        created = client.post("/api/v1/trades", json=data, headers=owner)
        assert created.status_code == 201
        row = created.json()
        assert row["symbol"] == "MNQ"
        assert row["net_pnl"] == "37.00000000"
        assert client.get("/api/v1/trades", headers=other).json() == []
        assert client.put(f"/api/v1/trades/{row['id']}", json=data, headers=other).status_code == 404
        assert client.delete(f"/api/v1/trades/{row['id']}", headers=other).status_code == 404
        assert client.post("/api/v1/trades", json={**data, "exit_at": "2026-09-19T09:00:00+08:00"}, headers=owner).status_code == 422


def test_journal_private_publish_snapshot_name_and_events():
    with TestClient(app) as client:
        teacher_uid, teacher = account(client, "lifetime")
        _, member = account(client, "lifetime")
        ordinary_uid, ordinary = account(client, "trial")
        # A trial account can write privately but cannot publish.
        from datetime import UTC, datetime, timedelta
        with SessionLocal() as db:
            user = db.query(User).filter(User.uid_key == ordinary_uid.lower()).one()
            user.expires_at = datetime.now(UTC) + timedelta(days=2)
            db.commit()
        own_draft = client.post("/api/v1/journals/mine", json={"title": "私人日誌", "blocks": [{"type": "paragraph", "text": "只給自己看"}]}, headers=ordinary)
        assert own_draft.status_code == 201
        assert client.post(f"/api/v1/journals/mine/{own_draft.json()['id']}/publish", headers=ordinary).status_code == 403
        name = client.put(f"/api/v1/admin/users/{teacher_uid}/display-name", json={"display_name": "吉吉"}, headers={"X-Admin-Key": "test-admin-secret"})
        assert name.status_code == 200
        assert name.json()["display_name"] == "吉吉"

        entry = client.post("/api/v1/journals/mine", json={"title": "SP500", "journal_date": "2026-09-18", "tags": ["ICT"], "blocks": [{"type": "paragraph", "text": "第一版"}]}, headers=teacher)
        assert entry.status_code == 201
        journal_id = entry.json()["id"]
        assert client.get("/api/v1/journals/mine", headers=member).json() == []
        assert client.get(f"/api/v1/journals/mine/{journal_id}", headers=member).status_code == 404
        assert client.get(f"/api/v1/journals/published/{journal_id}", headers=member).status_code == 404
        assert client.get("/api/v1/journals/events", headers=member).json()["events"] == []

        assert client.post(f"/api/v1/journals/mine/{journal_id}/publish", headers=teacher).status_code == 200
        visible = client.get(f"/api/v1/journals/published/{journal_id}", headers=member).json()
        assert visible["author_name"] == "吉吉"
        assert visible["blocks"][0]["text"] == "第一版"
        assert visible["journal_date"] == "2026-09-18"
        assert visible["tags"] == ["ICT"]
        events = client.get("/api/v1/journals/events", headers=member).json()["events"]
        assert len(events) == 1 and events[0]["teacher_name"] == "吉吉"

        changed = client.put(f"/api/v1/journals/mine/{journal_id}", json={"title": "SP500 新版", "journal_date": "2026-09-19", "tags": ["SMC"], "blocks": [{"type": "paragraph", "text": "尚未發布"}]}, headers=teacher)
        assert changed.status_code == 200
        assert client.get(f"/api/v1/journals/published/{journal_id}", headers=member).json()["blocks"][0]["text"] == "第一版"
        assert client.get(f"/api/v1/journals/published/{journal_id}", headers=member).json()["tags"] == ["ICT"]
        client.post(f"/api/v1/journals/mine/{journal_id}/publish", headers=teacher)
        assert client.get(f"/api/v1/journals/published/{journal_id}", headers=member).json()["blocks"][0]["text"] == "尚未發布"
        assert client.get(f"/api/v1/journals/published/{journal_id}", headers=member).json()["journal_date"] == "2026-09-19"
        # Reading the first event must not swallow a publication created meanwhile.
        client.post("/api/v1/journals/events/read", json={"cursor": events[0]["id"]}, headers=member)
        next_events = client.get("/api/v1/journals/events", headers=member).json()
        assert len(next_events["events"]) == 1
        assert next_events["events"][0]["id"] > events[0]["id"]
        assert next_events["needs_ack"] is True
        assert client.post(f"/api/v1/journals/mine/{journal_id}/unpublish", headers=teacher).status_code == 200
        assert client.get(f"/api/v1/journals/published/{journal_id}", headers=member).status_code == 404


def test_private_image_requires_published_reference():
    png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+XqaoAAAAASUVORK5CYII=")
    with TestClient(app) as client:
        _, teacher = account(client, "lifetime")
        _, reader = account(client, "lifetime")
        entry = client.post("/api/v1/journals/mine", json={"title": "Chart"}, headers=teacher).json()
        journal_id = entry["id"]
        image = client.post(f"/api/v1/journals/mine/{journal_id}/images", content=png, headers={**teacher, "Content-Type": "image/png"})
        assert image.status_code == 201
        image_id = image.json()["id"]
        assert client.get(f"/api/v1/journals/images/{image_id}", headers=reader).status_code == 404
        assert client.put(f"/api/v1/journals/mine/{journal_id}", json={"title": "Chart", "blocks": [{"type": "image", "text": "Setup", "image_id": image_id}]}, headers=teacher).status_code == 200
        assert client.post(f"/api/v1/journals/mine/{journal_id}/publish", headers=teacher).status_code == 200
        assert client.get(f"/api/v1/journals/images/{image_id}", headers=reader).content == png
        assert client.post(f"/api/v1/journals/mine/{journal_id}/unpublish", headers=teacher).status_code == 200
        assert client.get(f"/api/v1/journals/images/{image_id}", headers=reader).status_code == 404


def test_rich_journal_paste_image_and_published_snapshot():
    png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+XqaoAAAAASUVORK5CYII=")
    with TestClient(app) as client:
        _, teacher = account(client, "lifetime")
        _, reader = account(client, "lifetime")
        journal_id = client.post("/api/v1/journals/mine", json={"title": "SP500"}, headers=teacher).json()["id"]
        image_id = client.post(f"/api/v1/journals/mine/{journal_id}/images", content=png, headers={**teacher, "Content-Type": "image/png"}).json()["id"]
        first = {"type": "doc", "content": [
            {"type": "paragraph", "content": [{"type": "text", "text": "第一版分析"}]},
            {"type": "journalImage", "attrs": {"imageId": image_id, "alt": "圖表"}},
        ]}
        saved = client.put(f"/api/v1/journals/mine/{journal_id}", json={"title": "SP500", "document": first}, headers=teacher)
        assert saved.status_code == 200
        assert saved.json()["document"] == first
        assert client.get(f"/api/v1/journals/images/{image_id}", headers=reader).status_code == 404
        assert client.post(f"/api/v1/journals/mine/{journal_id}/publish", headers=teacher).status_code == 200
        assert client.get(f"/api/v1/journals/images/{image_id}", headers=reader).content == png
        second = {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "未發布修訂"}]}]}
        assert client.put(f"/api/v1/journals/mine/{journal_id}", json={"title": "SP500", "document": second}, headers=teacher).status_code == 200
        assert client.get(f"/api/v1/journals/published/{journal_id}", headers=reader).json()["document"] == first
        assert client.get(f"/api/v1/journals/images/{image_id}", headers=reader).content == png
        assert client.post(f"/api/v1/journals/mine/{journal_id}/publish", headers=teacher).status_code == 200
        assert client.get(f"/api/v1/journals/published/{journal_id}", headers=reader).json()["document"] == second
        assert client.get(f"/api/v1/journals/images/{image_id}", headers=reader).status_code == 404
