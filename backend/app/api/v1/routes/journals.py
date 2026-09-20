"""Private block journals, explicit teacher publishing, and in-app update events."""

import json
from datetime import UTC, date, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.v1.routes.auth import require_active_user
from app.db import get_db
from app.models import Journal, JournalEvent, JournalImage, JournalRead, User
from app.services.auth_service import PLAN_LIFETIME

router = APIRouter(prefix="/journals", tags=["journals"])


class Block(BaseModel):
    type: Literal["paragraph", "heading", "bullet", "image"]
    text: str = Field(default="", max_length=10000)
    image_id: int | None = Field(default=None, gt=0)


class JournalInput(BaseModel):
    title: str = Field(default="未命名日誌", max_length=200)
    journal_date: date = Field(default_factory=lambda: datetime.now(UTC).date())
    tags: list[str] = Field(default_factory=list, max_length=10)
    blocks: list[Block] = Field(default_factory=list, max_length=200)


class ReadEventsInput(BaseModel):
    cursor: int = Field(ge=0)


def display_name(user: User) -> str:
    return user.display_name or user.uid


def mine(db: Session, journal_id: int, owner_id: int) -> Journal:
    row = db.scalar(select(Journal).where(Journal.id == journal_id, Journal.owner_id == owner_id))
    if row is None:
        raise HTTPException(status_code=404, detail="journal_not_found")
    return row


def public(db: Session, journal_id: int) -> Journal:
    row = db.scalar(select(Journal).where(Journal.id == journal_id, Journal.is_published.is_(True)))
    if row is None:
        raise HTTPException(status_code=404, detail="journal_not_found")
    return row


def row_json(row: Journal, author: User, published: bool = False) -> dict:
    def utc(value: datetime | None) -> str | None:
        if value is None:
            return None
        return (value if value.tzinfo else value.replace(tzinfo=UTC)).isoformat()
    return {
        "id": row.id,
        "author_id": author.id,
        "author_name": display_name(author),
        "title": row.published_title if published else row.title,
        "journal_date": (row.published_date if published else row.journal_date) or row.created_at.date(),
        "tags": json.loads((row.published_tags_json if published else row.tags_json) or "[]"),
        "blocks": json.loads(row.published_blocks_json or "[]") if published else json.loads(row.blocks_json),
        "is_published": row.is_published,
        "created_at": utc(row.created_at),
        "updated_at": utc(row.published_at if published else row.updated_at),
    }


def validate_images(db: Session, journal_id: int, blocks: list[Block]) -> None:
    image_ids = {block.image_id for block in blocks if block.type == "image" and block.image_id is not None}
    if not image_ids:
        return
    rows = db.scalars(select(JournalImage).where(JournalImage.id.in_(image_ids), JournalImage.journal_id == journal_id)).all()
    if len(rows) != len(image_ids):
        raise HTTPException(status_code=422, detail="invalid_journal_image")


@router.get("/mine")
def list_mine(user=Depends(require_active_user), db: Session = Depends(get_db)) -> list[dict]:
    rows = db.scalars(select(Journal).where(Journal.owner_id == user.id).order_by(Journal.updated_at.desc(), Journal.id.desc())).all()
    return [row_json(row, user) for row in rows]


@router.post("/mine", status_code=201)
def create_journal(data: JournalInput, user=Depends(require_active_user), db: Session = Depends(get_db)) -> dict:
    if any(block.type == "image" for block in data.blocks):
        raise HTTPException(status_code=422, detail="create_before_adding_images")
    row = Journal(owner_id=user.id, title=data.title.strip() or "未命名日誌", journal_date=data.journal_date, tags_json=json.dumps([tag.strip()[:30] for tag in data.tags if tag.strip()], ensure_ascii=False), blocks_json=json.dumps([block.model_dump() for block in data.blocks], ensure_ascii=False))
    db.add(row)
    db.commit()
    db.refresh(row)
    return row_json(row, user)


@router.get("/mine/{journal_id}")
def get_mine(journal_id: int, user=Depends(require_active_user), db: Session = Depends(get_db)) -> dict:
    return row_json(mine(db, journal_id, user.id), user)


@router.put("/mine/{journal_id}")
def update_journal(journal_id: int, data: JournalInput, user=Depends(require_active_user), db: Session = Depends(get_db)) -> dict:
    row = mine(db, journal_id, user.id)
    validate_images(db, row.id, data.blocks)
    row.title = data.title.strip() or "未命名日誌"
    row.journal_date = data.journal_date
    row.tags_json = json.dumps([tag.strip()[:30] for tag in data.tags if tag.strip()], ensure_ascii=False)
    row.blocks_json = json.dumps([block.model_dump() for block in data.blocks], ensure_ascii=False)
    row.updated_at = datetime.now(UTC)
    db.commit()
    return row_json(row, user)


@router.delete("/mine/{journal_id}", status_code=204)
def delete_journal(journal_id: int, user=Depends(require_active_user), db: Session = Depends(get_db)) -> None:
    row = mine(db, journal_id, user.id)
    db.query(JournalEvent).filter(JournalEvent.journal_id == row.id).delete()
    db.query(JournalImage).filter(JournalImage.journal_id == row.id).delete()
    db.delete(row)
    db.commit()


@router.post("/mine/{journal_id}/publish")
def publish_journal(journal_id: int, user=Depends(require_active_user), db: Session = Depends(get_db)) -> dict:
    if user.plan != PLAN_LIFETIME:
        raise HTTPException(status_code=403, detail="lifetime_required")
    row = mine(db, journal_id, user.id)
    if not row.title.strip() or not json.loads(row.blocks_json):
        raise HTTPException(status_code=422, detail="journal_content_required")
    row.published_title = row.title
    row.published_date = row.journal_date
    row.published_tags_json = row.tags_json
    row.published_blocks_json = row.blocks_json
    row.is_published = True
    row.published_at = datetime.now(UTC)
    db.add(JournalEvent(journal_id=row.id, author_id=user.id))
    db.commit()
    return row_json(row, user)


@router.post("/mine/{journal_id}/unpublish")
def unpublish_journal(journal_id: int, user=Depends(require_active_user), db: Session = Depends(get_db)) -> dict:
    row = mine(db, journal_id, user.id)
    row.is_published = False
    row.published_title = None
    row.published_date = None
    row.published_tags_json = None
    row.published_blocks_json = None
    row.published_at = None
    db.commit()
    return row_json(row, user)


@router.get("/teachers")
def teachers(user=Depends(require_active_user), db: Session = Depends(get_db)) -> list[dict]:
    rows = db.execute(select(User.id, User.uid, User.display_name, func.count(Journal.id)).join(Journal, Journal.owner_id == User.id).where(Journal.is_published.is_(True)).group_by(User.id, User.uid, User.display_name).order_by(User.display_name, User.uid)).all()
    return [{"id": item[0], "name": item[2] or item[1], "count": item[3]} for item in rows]


@router.get("/published")
def list_published(teacher_id: int | None = None, user=Depends(require_active_user), db: Session = Depends(get_db)) -> list[dict]:
    query = select(Journal, User).join(User, Journal.owner_id == User.id).where(Journal.is_published.is_(True))
    if teacher_id is not None:
        query = query.where(User.id == teacher_id)
    rows = db.execute(query.order_by(Journal.published_at.desc(), Journal.id.desc())).all()
    return [row_json(journal, author, True) for journal, author in rows]


@router.get("/published/{journal_id}")
def get_published(journal_id: int, user=Depends(require_active_user), db: Session = Depends(get_db)) -> dict:
    row = public(db, journal_id)
    author = db.get(User, row.owner_id)
    return row_json(row, author, True)


@router.post("/mine/{journal_id}/images", status_code=201)
async def upload_image(journal_id: int, request: Request, user=Depends(require_active_user), db: Session = Depends(get_db)) -> dict:
    mine(db, journal_id, user.id)
    content_type = request.headers.get("content-type", "").split(";")[0].lower()
    if content_type not in {"image/png", "image/jpeg", "image/webp", "image/gif"}:
        raise HTTPException(status_code=415, detail="unsupported_image_type")
    data = await request.body()
    if not data or len(data) > 5_000_000:
        raise HTTPException(status_code=413, detail="image_size_limit_5mb")
    signatures = {"image/png": data.startswith(b"\x89PNG\r\n\x1a\n"), "image/jpeg": data.startswith(b"\xff\xd8\xff"), "image/webp": data.startswith(b"RIFF") and data[8:12] == b"WEBP", "image/gif": data.startswith((b"GIF87a", b"GIF89a"))}
    if not signatures[content_type]:
        raise HTTPException(status_code=415, detail="invalid_image")
    image = JournalImage(journal_id=journal_id, content_type=content_type, data=data)
    db.add(image)
    db.commit()
    db.refresh(image)
    return {"id": image.id}


@router.get("/images/{image_id}")
def get_image(image_id: int, user=Depends(require_active_user), db: Session = Depends(get_db)) -> Response:
    image = db.get(JournalImage, image_id)
    if image is None:
        raise HTTPException(status_code=404, detail="image_not_found")
    journal = db.get(Journal, image.journal_id)
    if journal is None:
        raise HTTPException(status_code=404, detail="image_not_found")
    if journal.owner_id != user.id:
        if not journal.is_published or not any(block.get("image_id") == image_id for block in json.loads(journal.published_blocks_json or "[]")):
            raise HTTPException(status_code=404, detail="image_not_found")
    return Response(content=image.data, media_type=image.content_type, headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})


@router.get("/events")
def new_events(user=Depends(require_active_user), db: Session = Depends(get_db)) -> dict:
    read = db.get(JournalRead, user.id)
    latest = db.scalar(select(func.max(JournalEvent.id))) or 0
    if read is None:
        read = JournalRead(user_id=user.id, last_event_id=0)
        db.add(read)
        db.commit()
    rows = db.execute(select(JournalEvent, Journal, User).join(Journal, JournalEvent.journal_id == Journal.id).join(User, JournalEvent.author_id == User.id).where(JournalEvent.id > read.last_event_id, JournalEvent.author_id != user.id, Journal.is_published.is_(True)).order_by(JournalEvent.id).limit(20)).all()
    cursor = rows[-1][0].id if len(rows) == 20 else latest
    return {"events": [{"id": event.id, "journal_id": journal.id, "teacher_name": display_name(author), "title": journal.published_title} for event, journal, author in rows], "cursor": cursor, "needs_ack": cursor > read.last_event_id}


@router.post("/events/read")
def mark_events_read(data: ReadEventsInput, user=Depends(require_active_user), db: Session = Depends(get_db)) -> dict:
    latest = db.scalar(select(func.max(JournalEvent.id))) or 0
    cursor = min(data.cursor, latest)
    read = db.get(JournalRead, user.id)
    if read is None:
        read = JournalRead(user_id=user.id, last_event_id=cursor)
        db.add(read)
    else:
        read.last_event_id = max(read.last_event_id, cursor)
    db.commit()
    return {"cursor": read.last_event_id}
