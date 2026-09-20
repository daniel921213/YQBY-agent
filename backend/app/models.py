from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, LargeBinary, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # `uid` is the display value as entered; `uid_key` is the lowercased form
    # used for uniqueness + lookup so UIDs are case-insensitive.
    uid: Mapped[str] = mapped_column(String(64), nullable=False)
    uid_key: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # Entitlement: `trial`/`member` expire at `expires_at`; `lifetime` never
    # expires (expires_at stays NULL). Accounts are never deleted — access is gated.
    plan: Mapped[str] = mapped_column(String(16), nullable=False, server_default="trial")
    expires_at: Mapped[object] = mapped_column(DateTime(timezone=True), nullable=True)
    # Included in JWTs. Password reset increments it so every older login token
    # becomes invalid without touching the user's entitlement.
    auth_version: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    display_name: Mapped[str | None] = mapped_column(String(64), nullable=True)


class Trade(Base):
    __tablename__ = "trades"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    symbol: Mapped[str] = mapped_column(String(64), nullable=False)
    market: Mapped[str] = mapped_column(String(16), nullable=False)
    currency: Mapped[str] = mapped_column(String(12), nullable=False)
    side: Mapped[str] = mapped_column(String(5), nullable=False)
    entry_at: Mapped[object] = mapped_column(DateTime(timezone=True), nullable=False)
    exit_at: Mapped[object] = mapped_column(DateTime(timezone=True), nullable=False)
    entry_price: Mapped[object] = mapped_column(Numeric(24, 8), nullable=False)
    exit_price: Mapped[object] = mapped_column(Numeric(24, 8), nullable=False)
    quantity: Mapped[object] = mapped_column(Numeric(24, 8), nullable=False)
    point_value: Mapped[object] = mapped_column(Numeric(24, 8), nullable=False)
    fees: Mapped[object] = mapped_column(Numeric(24, 8), nullable=False)
    net_pnl: Mapped[object] = mapped_column(Numeric(24, 8), nullable=False)
    strategy: Mapped[str | None] = mapped_column(String(100), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Journal(Base):
    __tablename__ = "journals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    journal_date: Mapped[object] = mapped_column(Date, nullable=True)
    tags_json: Mapped[str] = mapped_column(Text, nullable=False, server_default="[]")
    blocks_json: Mapped[str] = mapped_column(Text, nullable=False, server_default="[]")
    document_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    published_title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    published_date: Mapped[object] = mapped_column(Date, nullable=True)
    published_tags_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    published_blocks_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    published_document_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_published: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="0")
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    published_at: Mapped[object] = mapped_column(DateTime(timezone=True), nullable=True)


class JournalImage(Base):
    __tablename__ = "journal_images"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    journal_id: Mapped[int] = mapped_column(ForeignKey("journals.id"), index=True, nullable=False)
    content_type: Mapped[str] = mapped_column(String(32), nullable=False)
    data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)


class JournalEvent(Base):
    __tablename__ = "journal_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    journal_id: Mapped[int] = mapped_column(ForeignKey("journals.id"), index=True, nullable=False)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())


class JournalRead(Base):
    __tablename__ = "journal_reads"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    last_event_id: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")


class ActivationCode(Base):
    """一次性啟用碼：預先產好存表，兌換時標記使用者與時間（即客戶名單）。"""

    __tablename__ = "activation_codes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    tier: Mapped[str] = mapped_column(String(16), nullable=False)  # "30d" | "lifetime"
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    used_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    used_at: Mapped[object] = mapped_column(DateTime(timezone=True), nullable=True)


class PasswordResetCode(Base):
    """Activation-code-style, single-use password-reset inventory."""

    __tablename__ = "password_reset_codes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # Deliberately readable in Railway, matching the activation-code workflow.
    # Nullable only so the startup migration can backfill already-deployed rows.
    code: Mapped[str | None] = mapped_column(String(32), unique=True, index=True, nullable=True)
    nonce: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    code_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    assigned_uid_key: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    issued_at: Mapped[object] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[object] = mapped_column(DateTime(timezone=True), nullable=True)
    used_at: Mapped[object] = mapped_column(DateTime(timezone=True), nullable=True)


class YokaiSnapshot(Base):
    """Latest external narrative intelligence, persisted across Railway restarts."""

    __tablename__ = "yokai_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    generated_at: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    payload: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
