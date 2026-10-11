"""Private, immutable submission snapshots and separately saved teacher feedback."""
from sqlalchemy import DateTime, ForeignKey, Integer, LargeBinary, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db import Base


class JournalReview(Base):
    __tablename__ = "journal_reviews"
    __table_args__ = (UniqueConstraint("student_id", "request_key", name="uq_review_request"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    journal_id: Mapped[int | None] = mapped_column(ForeignKey("journals.id"), nullable=True, index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    previous_id: Mapped[int | None] = mapped_column(ForeignKey("journal_reviews.id"), nullable=True)
    request_key: Mapped[str] = mapped_column(String(36))
    round_number: Mapped[int] = mapped_column(Integer, default=1)
    title: Mapped[str] = mapped_column(String(200))
    snapshot_json: Mapped[str] = mapped_column(Text)
    question: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(16), default="pending", index=True)
    feedback_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    comments_json: Mapped[str] = mapped_column(Text, default="[]")
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    returned_at: Mapped[object] = mapped_column(DateTime(timezone=True), nullable=True)


class ReviewImage(Base):
    __tablename__ = "journal_review_images"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    review_id: Mapped[int] = mapped_column(ForeignKey("journal_reviews.id"), index=True)
    kind: Mapped[str] = mapped_column(String(12))  # snapshot or feedback
    content_type: Mapped[str] = mapped_column(String(32))
    data: Mapped[bytes] = mapped_column(LargeBinary)


class ReviewNotification(Base):
    __tablename__ = "journal_review_notifications"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    review_id: Mapped[int] = mapped_column(ForeignKey("journal_reviews.id"), index=True)
    recipient_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    kind: Mapped[str] = mapped_column(String(16))
    read_at: Mapped[object] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
