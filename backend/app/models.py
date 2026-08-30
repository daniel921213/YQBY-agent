from sqlalchemy import DateTime, Integer, String, Text, func
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
