"""Review privacy, frozen submissions and membership isolation."""
import base64
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from app.db import SessionLocal
from app.main import app
from app.models import User
from app.services.review_migration import run_review_migration

PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=")
ROOT = "/api/v1/reviews"
JOURNALS = "/api/v1/journals"


def doc(value="Trading thesis"):
    return {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": value}]}]}


def account(client, plan="unactivated", prime=True, teacher=False, expired=False):
    uid = "review_" + uuid.uuid4().hex[:10]
    response = client.post("/api/v1/auth/register", json={"uid": uid, "password": "secret123"})
    assert response.status_code == 200, response.text
    headers = {"Authorization": "Bearer " + response.json()["token"]}
    with SessionLocal() as db:
        user = db.query(User).filter_by(uid_key=uid).one()
        user.plan, user.ct_prime = plan, prime
        user.expires_at = None if plan in {"unactivated", "lifetime"} else datetime.now(UTC) + timedelta(days=-1 if expired else 5)
        user_id = user.id
        db.commit()
    if teacher:
        journal = create_journal(client, headers)
        assert client.post(f"{JOURNALS}/mine/{journal['id']}/publish", headers=headers).status_code == 200
    return user_id, headers


def create_journal(client, headers, document=None):
    response = client.post(JOURNALS + "/mine", headers=headers, json={"title": "ES execution review", "document": document or doc()})
    assert response.status_code == 201, response.text
    return response.json()


def submit(client, headers, journal, teacher, key=None):
    return client.post(ROOT, headers=headers, json={"journal_id": journal, "teacher_id": teacher, "request_key": key or str(uuid.uuid4()), "question": "Was my entry too early?"})


def feedback(client, headers, row, document=None, comments=None, publish=False):
    return client.put(f"{ROOT}/{row['id']}/feedback", params={"publish": publish}, headers=headers, json={"version": row["version"], "document": document or doc("Wait for confirmation"), "comments": comments or []})


@pytest.mark.parametrize("plan,expired", [("unactivated", False), ("trial", False), ("member", True), ("member", False), ("lifetime", False)])
def test_prime_does_not_change_membership(plan, expired):
    with TestClient(app) as client:
        _, headers = account(client, plan, expired=expired)
        me = client.get("/api/v1/auth/me", headers=headers).json()
        assert me["ct_prime"] is True
        assert me["active"] == (plan != "unactivated" and not expired)
        assert client.get(JOURNALS + "/mine", headers=headers).status_code == 200
        assert client.get(ROOT + "/meta", headers=headers).status_code == 200
        member = plan == "lifetime" or (plan == "member" and not expired)
        for path in ("/trades", "/journals/published", "/journals/events"):
            assert client.get("/api/v1" + path, headers=headers).status_code == (200 if member else 403)
        if not me["active"]:
            for path in ("/scan", "/yokai"):
                assert client.get("/api/v1" + path, headers=headers).status_code == 403


@pytest.mark.parametrize("plan", ["unactivated", "trial", "member", "lifetime"])
def test_membership_never_grants_review(plan):
    with TestClient(app) as client:
        _, headers = account(client, plan, prime=False)
        for path in ("", "/meta", "/notifications", "/1", "/1/images/1"):
            assert client.get(ROOT + path, headers=headers).status_code == 404
        assert submit(client, headers, 1, 2).status_code == 404


def test_snapshot_draft_privacy_return_resubmit_and_deletion():
    with TestClient(app) as client:
        student_id, student = account(client)
        teacher_id, teacher = account(client, "lifetime", teacher=True)
        _, stranger = account(client, "lifetime", teacher=True)
        journal = create_journal(client, student)
        upload = client.post(f"{JOURNALS}/mine/{journal['id']}/images", headers={**student, "Content-Type": "image/png"}, content=PNG)
        assert upload.status_code == 201, upload.text
        source = doc()
        source["content"].append({"type": "journalImage", "attrs": {"imageId": upload.json()["id"]}})
        assert client.put(f"{JOURNALS}/mine/{journal['id']}", headers=student, json={"title": journal['title'], "document": source}).status_code == 200
        key = str(uuid.uuid4())
        response = submit(client, student, journal["id"], teacher_id, key)
        assert response.status_code == 201, response.text
        row = response.json()
        rid = row["id"]
        image = row["snapshot"]["document"]["content"][1]["attrs"]["imageId"]
        assert row["round_number"] == 1 and row["is_student"]
        assert submit(client, student, journal["id"], teacher_id, key).json()["id"] == rid
        assert submit(client, student, journal["id"], teacher_id).status_code == 409
        assert client.get(ROOT + "?inbox=true", headers=student).status_code == 404
        assert client.get(f"{ROOT}/{rid}", headers=stranger).status_code == 404
        assert client.get(f"{ROOT}/{rid}/images/{image}", headers=stranger).status_code == 404
        for actor in (student, teacher):
            assert client.get(f"{ROOT}/{rid}/images/{image}", headers=actor).content == PNG
        notices = client.get(ROOT + "/notifications", headers=teacher).json()
        event = next(e for e in notices if e["review_id"] == rid)
        assert client.post(f"{ROOT}/notifications/{event['id']}/read", headers=student).status_code == 404
        assert client.post(f"{ROOT}/notifications/{event['id']}/read", headers=teacher).status_code == 200
        assert client.get(ROOT + "/notifications", headers=student).json() == []
        assert feedback(client, student, row).status_code == 404
        row = client.post(f"{ROOT}/{rid}/start", headers=teacher).json()
        upload = client.post(f"{ROOT}/{rid}/images", headers={**teacher, "Content-Type": "image/png"}, content=PNG)
        assert upload.status_code == 201
        teacher_image = upload.json()["id"]
        unused_image = client.post(f"{ROOT}/{rid}/images", headers={**teacher, "Content-Type": "image/png"}, content=PNG).json()["id"]
        response_doc = doc("Wait for confirmation")
        response_doc["content"].append({"type": "journalImage", "attrs": {"imageId": teacher_image}})
        comments = [{"anchor": "0", "text": "Explain your invalidation"}, {"anchor": "1", "text": "Mark this swing low"}]
        saved = feedback(client, teacher, row, response_doc, comments)
        assert saved.status_code == 200, saved.text
        assert feedback(client, teacher, row).status_code == 409  # Stale teacher tab cannot overwrite.
        row = saved.json()
        private = client.get(f"{ROOT}/{rid}", headers=student).json()
        assert private["feedback"] is None and private["comments"] == []
        assert client.get(f"{ROOT}/{rid}/images/{teacher_image}", headers=student).status_code == 404
        assert feedback(client, teacher, row, comments=[{"anchor": "999", "text": "bad"}]).status_code == 422
        returned = feedback(client, teacher, row, response_doc, comments, publish=True)
        assert returned.status_code == 200, returned.text
        row = returned.json()
        assert row["status"] == "returned" and not row["can_edit"]
        visible = client.get(f"{ROOT}/{rid}", headers=student).json()
        assert visible["feedback"] == response_doc and visible["comments"] == comments
        assert client.get(f"{ROOT}/{rid}/images/{teacher_image}", headers=student).content == PNG
        assert client.get(f"{ROOT}/{rid}/images/{unused_image}", headers=student).status_code == 404
        assert feedback(client, teacher, row).status_code == 409
        assert any(n["review_id"] == rid for n in client.get(ROOT + "/notifications", headers=student).json())
        revised = doc("Revised thesis")
        assert client.put(f"{JOURNALS}/mine/{journal['id']}", headers=student, json={"title": journal['title'], "document": revised}).status_code == 200
        second = submit(client, student, journal["id"], teacher_id).json()
        assert second["previous_id"] == rid and second["round_number"] == 2
        assert second["snapshot"]["document"] == revised
        assert client.get(f"{ROOT}/{rid}", headers=student).json()["snapshot"]["document"]["content"][0] == source["content"][0]
        assert client.delete(f"{JOURNALS}/mine/{journal['id']}", headers=student).status_code == 204
        assert client.get(f"{ROOT}/{rid}", headers=teacher).json()["journal_id"] is None
        assert client.get(f"{ROOT}/{rid}/images/{image}", headers=student).content == PNG
        with SessionLocal() as db:
            db.get(User, student_id).ct_prime = False
            db.commit()
        assert client.get(f"{ROOT}/{rid}", headers=student).status_code == 404
        assert client.get(f"{ROOT}/{rid}", headers=teacher).status_code == 200
        with SessionLocal() as db:
            db.get(User, student_id).ct_prime = True
            db.get(User, teacher_id).ct_prime = False
            db.commit()
        assert client.get(f"{ROOT}/{rid}", headers=teacher).status_code == 404
        assert client.get(f"{ROOT}/{rid}", headers=student).status_code == 200


def test_teacher_selection_and_empty_submission():
    with TestClient(app) as client:
        _, student = account(client)
        teacher_id, teacher = account(client, "lifetime", teacher=True)
        unpublished_id, _ = account(client, "lifetime")
        nonprime_id, _ = account(client, "lifetime", prime=False, teacher=True)
        meta = client.get(ROOT + "/meta", headers=student).json()
        ids = {u["id"] for u in meta["teachers"]}
        assert teacher_id in ids and unpublished_id not in ids and nonprime_id not in ids
        journal = create_journal(client, student, {"type": "doc", "content": [{"type": "paragraph"}]})
        assert submit(client, student, journal["id"], teacher_id).status_code == 422
        assert submit(client, student, journal["id"], unpublished_id).status_code == 422
        assert submit(client, student, journal["id"], nonprime_id).status_code == 422
        assert submit(client, teacher, journal["id"], teacher_id).status_code == 404


def test_migration_is_idempotent_and_never_grants_prime(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'legacy.db'}")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY, plan VARCHAR)"))
        connection.execute(text("INSERT INTO users (id, plan) VALUES (1, 'lifetime'), (2, 'member')"))
    run_review_migration(engine)
    run_review_migration(engine)
    with engine.begin() as connection:
        assert connection.execute(text("SELECT ct_prime FROM users")).all() == [(0,), (0,)]
        connection.execute(text("UPDATE users SET ct_prime=TRUE WHERE id=1"))
    run_review_migration(engine)
    with engine.connect() as connection:
        assert connection.execute(text("SELECT ct_prime FROM users WHERE id=1")).scalar() == 1
    engine.dispose()
