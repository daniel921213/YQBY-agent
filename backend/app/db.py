"""Database engine/session for accounts.

Postgres in production (Railway `DATABASE_URL`), SQLite file locally so dev needs
no database. Kept tiny and synchronous to match the rest of the FastAPI app.
"""

from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from app.core.config import get_settings

Base = declarative_base()


def _make_engine():
    url = make_url(get_settings().resolved_database_url)
    # Use the installed psycopg2 driver regardless of SQLAlchemy's default.
    if url.drivername == "postgresql":
        url = url.set(drivername="postgresql+psycopg2")
    connect_args = {"check_same_thread": False} if url.get_backend_name() == "sqlite" else {}
    return create_engine(url, pool_pre_ping=True, connect_args=connect_args, future=True)


engine = _make_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def init_db() -> None:
    import app.models  # noqa: F401 — register models on Base before create_all

    Base.metadata.create_all(bind=engine)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
