"""CT_Prime submissions; membership activation never grants this capability."""
import copy
import json
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.v1.routes.auth import require_prime_user
from app.api.v1.routes.journals import document_has_content, document_image_ids, display_name, row_json
from app.db import get_db
from app.models import Journal, JournalImage, User
from app.review_models import JournalReview, ReviewImage, ReviewNotification

router = APIRouter(prefix="/reviews", tags=["reviews"], dependencies=[Depends(require_prime_user)])


class SubmitInput(BaseModel):
    journal_id: int = Field(gt=0)
    teacher_id: int = Field(gt=0)
    question: str = Field(default="", max_length=4000)
    request_key: UUID


class CommentInput(BaseModel):
    anchor: str = Field(pattern=r"^\d+(\.\d+)*$", max_length=120)
    text: str = Field(min_length=1, max_length=5000)


class FeedbackInput(BaseModel):
    version: int = Field(ge=1)
    document: dict
    comments: list[CommentInput] = Field(default_factory=list, max_length=200)


def teacher_criteria():
    # display_name is the existing administrator-managed teacher marker.
    return User.ct_prime.is_(True), func.length(func.trim(User.display_name)) > 0


def is_teacher(db, user_id):
    return db.scalar(select(User.id).where(User.id == user_id, *teacher_criteria())) is not None


def accessible(db, review_id, user, *, edit=False):
    query = select(JournalReview).where(JournalReview.id == review_id)
    if edit:
        query = query.with_for_update()
    review = db.scalar(query)
    if review is None or user.id not in {review.student_id, review.teacher_id}:
        raise HTTPException(404, "review_not_found")
    if user.id == review.teacher_id and not is_teacher(db, user.id):
        raise HTTPException(404, "review_not_found")
    if edit and user.id != review.teacher_id:
        raise HTTPException(404, "review_not_found")
    return review


def summary(db, row):
    student, teacher = db.get(User, row.student_id), db.get(User, row.teacher_id)
    return {"id": row.id, "journal_id": row.journal_id, "student_id": row.student_id,
            "student_name": display_name(student), "student_uid": student.uid,
            "teacher_id": row.teacher_id, "teacher_name": display_name(teacher),
            "title": row.title, "status": row.status, "round_number": row.round_number,
            "previous_id": row.previous_id, "created_at": utc(row.created_at),
            "updated_at": utc(row.updated_at), "returned_at": utc(row.returned_at)}


def utc(value):
    return (value if value.tzinfo else value.replace(tzinfo=UTC)).isoformat() if value else None


def details(db, row, user):
    visible = user.id == row.teacher_id or row.status == "returned"
    return {**summary(db, row), "snapshot": json.loads(row.snapshot_json), "question": row.question,
            "is_student": user.id == row.student_id,
            "can_edit": user.id == row.teacher_id and row.status != "returned",
            "version": row.version, "feedback": json.loads(row.feedback_json) if visible and row.feedback_json else None,
            "comments": json.loads(row.comments_json) if visible else []}


def snapshot_document(journal):
    if journal.document_json:
        return json.loads(journal.document_json)
    nodes = []
    for block in json.loads(journal.blocks_json):
        if block["type"] == "image":
            nodes.append({"type": "journalImage", "attrs": {"imageId": block["image_id"], "alt": block.get("text", "")}})
        else:
            node = {"type": "heading" if block["type"] == "heading" else "paragraph",
                    "content": [{"type": "text", "text": block["text"]}] if block.get("text") else []}
            if block["type"] == "heading":
                node["attrs"] = {"level": 2}
            if block["type"] == "bullet":
                node = {"type": "bulletList", "content": [{"type": "listItem", "content": [node]}]}
            nodes.append(node)
    return {"type": "doc", "content": nodes}


@router.get("/meta")
def meta(user=Depends(require_prime_user), db: Session = Depends(get_db)):
    users = db.scalars(select(User).where(*teacher_criteria()).order_by(User.display_name, User.uid)).all()
    return {"user_id": user.id, "can_review": is_teacher(db, user.id),
            "teachers": [{"id": u.id, "name": display_name(u)} for u in users if u.id != user.id]}


@router.get("")
def list_reviews(inbox: bool = False, user=Depends(require_prime_user), db: Session = Depends(get_db)):
    if inbox and not is_teacher(db, user.id):
        raise HTTPException(404, "not_found")
    query = select(JournalReview).where(JournalReview.teacher_id == user.id if inbox else JournalReview.student_id == user.id)
    return [summary(db, row) for row in db.scalars(query.order_by(JournalReview.created_at.desc(), JournalReview.id.desc()))]


@router.post("", status_code=201)
def submit(data: SubmitInput, user=Depends(require_prime_user), db: Session = Depends(get_db)):
    # Lock the source journal to serialize duplicate tabs and resubmissions.
    journal = db.scalar(select(Journal).where(Journal.id == data.journal_id, Journal.owner_id == user.id).with_for_update())
    if journal is None:
        raise HTTPException(404, "journal_not_found")
    existing = db.scalar(select(JournalReview).where(JournalReview.student_id == user.id, JournalReview.request_key == str(data.request_key)))
    if existing:
        if existing.journal_id != journal.id or existing.teacher_id != data.teacher_id:
            raise HTTPException(409, "request_conflict")
        return details(db, existing, user)
    teacher = db.get(User, data.teacher_id)
    if not teacher or not teacher.ct_prime or teacher.id == user.id or not is_teacher(db, teacher.id):
        raise HTTPException(422, "teacher_unavailable")
    previous = db.scalar(select(JournalReview).where(JournalReview.journal_id == journal.id).order_by(JournalReview.id.desc()).limit(1))
    if previous and previous.status != "returned":
        raise HTTPException(409, "review_already_pending")
    document = copy.deepcopy(snapshot_document(journal))
    image_ids = document_image_ids(document)
    if not document_has_content(document):
        raise HTTPException(422, "journal_content_required")
    snapshot = row_json(journal, user)
    snapshot["blocks"] = []
    snapshot["document"] = document
    row = JournalReview(journal_id=journal.id, student_id=user.id, teacher_id=teacher.id,
                        previous_id=previous.id if previous and previous.teacher_id == teacher.id else None,
                        round_number=previous.round_number + 1 if previous and previous.teacher_id == teacher.id else 1,
                        request_key=str(data.request_key), title=journal.title, question=data.question.strip(), snapshot_json="{}")
    db.add(row)
    db.flush()
    replacements = {}
    for image_id in image_ids:
        image = db.get(JournalImage, image_id)
        if not image or image.journal_id != journal.id:
            raise HTTPException(422, "invalid_journal_image")
        frozen = ReviewImage(review_id=row.id, kind="snapshot", content_type=image.content_type, data=image.data)
        db.add(frozen)
        db.flush()
        replacements[image_id] = frozen.id
    def remap(node):
        if node.get("type") == "journalImage":
            node["attrs"]["imageId"] = replacements[node["attrs"]["imageId"]]
        for child in node.get("content", []):
            remap(child)
    remap(document)
    row.snapshot_json = json.dumps(snapshot, ensure_ascii=False, default=str)
    db.add(ReviewNotification(review_id=row.id, recipient_id=teacher.id, kind="submitted"))
    db.commit()
    db.refresh(row)
    return details(db, row, user)


@router.get("/notifications")
def notifications(user=Depends(require_prime_user), db: Session = Depends(get_db)):
    result = []
    for event in db.scalars(select(ReviewNotification).where(ReviewNotification.recipient_id == user.id, ReviewNotification.read_at.is_(None)).order_by(ReviewNotification.id.desc()).limit(50)):
        row = db.get(JournalReview, event.review_id)
        if event.kind == "submitted" and not is_teacher(db, user.id):
            continue
        actor = db.get(User, row.student_id if event.kind == "submitted" else row.teacher_id)
        result.append({"id": event.id, "review_id": row.id, "kind": event.kind, "name": display_name(actor), "title": row.title})
    return result


@router.post("/notifications/{event_id}/read")
def read_notification(event_id: int, user=Depends(require_prime_user), db: Session = Depends(get_db)):
    event = db.get(ReviewNotification, event_id)
    if not event or event.recipient_id != user.id:
        raise HTTPException(404, "not_found")
    event.read_at = datetime.now(UTC)
    db.commit()
    return {"ok": True}


@router.get("/{review_id}")
def get_review(review_id: int, user=Depends(require_prime_user), db: Session = Depends(get_db)):
    return details(db, accessible(db, review_id, user), user)


@router.post("/{review_id}/start")
def start_review(review_id: int, user=Depends(require_prime_user), db: Session = Depends(get_db)):
    row = accessible(db, review_id, user, edit=True)
    if row.status == "pending":
        row.status = "reviewing"
        row.version += 1
        row.updated_at = datetime.now(UTC)
        db.commit()
    return details(db, row, user)


def save_feedback(db, row, data, publish):
    if row.status == "returned":
        raise HTTPException(409, "review_already_returned")
    if row.version != data.version:
        raise HTTPException(409, "review_version_conflict")
    ids = document_image_ids(data.document)
    images = db.scalars(select(ReviewImage).where(ReviewImage.id.in_(ids), ReviewImage.review_id == row.id, ReviewImage.kind == "feedback")).all() if ids else []
    if len(images) != len(ids):
        raise HTTPException(422, "invalid_review_image")
    snapshot = json.loads(row.snapshot_json)["document"]
    comments = []
    for comment in data.comments:
        try:
            node = snapshot
            for part in comment.anchor.split("."):
                node = node["content"][int(part)]
            if node["type"] not in {"paragraph", "heading", "journalImage", "bulletList", "orderedList", "blockquote", "codeBlock"}:
                raise ValueError()
        except (KeyError, IndexError, ValueError, TypeError):
            raise HTTPException(422, "invalid_comment_anchor")
        if not comment.text.strip():
            raise HTTPException(422, "empty_comment")
        comments.append(comment.model_dump())
    if publish and not document_has_content(data.document) and not comments:
        raise HTTPException(422, "feedback_required")
    row.feedback_json = json.dumps(data.document, ensure_ascii=False)
    row.comments_json = json.dumps(comments, ensure_ascii=False)
    row.status = "returned" if publish else "reviewing"
    row.updated_at = datetime.now(UTC)
    row.version += 1
    if publish:
        row.returned_at = datetime.now(UTC)
        db.add(ReviewNotification(review_id=row.id, recipient_id=row.student_id, kind="returned"))
    db.commit()


@router.put("/{review_id}/feedback")
def feedback(review_id: int, data: FeedbackInput, publish: bool = False, user=Depends(require_prime_user), db: Session = Depends(get_db)):
    row = accessible(db, review_id, user, edit=True)
    save_feedback(db, row, data, publish)
    return details(db, row, user)


@router.post("/{review_id}/images", status_code=201)
async def upload_feedback_image(review_id: int, request: Request, user=Depends(require_prime_user), db: Session = Depends(get_db)):
    row = accessible(db, review_id, user, edit=True)
    if row.status == "returned":
        raise HTTPException(409, "review_already_returned")
    content_type = request.headers.get("content-type", "").split(";")[0].lower()
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > 5_000_000:
            raise HTTPException(413, "image_size_limit_5mb")
    signatures = {"image/png": data.startswith(b"\x89PNG\r\n\x1a\n"), "image/jpeg": data.startswith(b"\xff\xd8\xff"),
                  "image/webp": data.startswith(b"RIFF") and data[8:12] == b"WEBP", "image/gif": data.startswith((b"GIF87a", b"GIF89a"))}
    if not signatures.get(content_type):
        raise HTTPException(415, "invalid_image")
    image = ReviewImage(review_id=row.id, kind="feedback", content_type=content_type, data=bytes(data))
    db.add(image)
    db.commit()
    return {"id": image.id}


@router.get("/{review_id}/images/{image_id}")
def review_image(review_id: int, image_id: int, user=Depends(require_prime_user), db: Session = Depends(get_db)):
    row = accessible(db, review_id, user)
    image = db.get(ReviewImage, image_id)
    if not image or image.review_id != row.id:
        raise HTTPException(404, "image_not_found")
    if image.kind == "feedback" and user.id != row.teacher_id:
        if row.status != "returned" or image.id not in document_image_ids(json.loads(row.feedback_json or "null")):
            raise HTTPException(404, "image_not_found")
    return Response(content=image.data, media_type=image.content_type, headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})
