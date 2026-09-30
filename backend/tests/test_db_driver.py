"""Production engine must load the PostgreSQL driver in requirements.txt."""

from types import SimpleNamespace

import pytest
from sqlalchemy import text

from app import db


@pytest.mark.parametrize("scheme", ["postgresql", "postgresql+psycopg2"])
def test_postgres_engine_loads_installed_driver(monkeypatch, scheme):
    monkeypatch.setattr(db, "get_settings", lambda: SimpleNamespace(
        resolved_database_url=f"{scheme}://example:example@localhost/example"
    ))
    engine = db._make_engine()
    try:
        assert engine.dialect.driver == "psycopg2"
        assert engine.dialect.dbapi.__name__ == "psycopg2"
    finally:
        engine.dispose()


def test_sqlite_engine_still_connects(monkeypatch):
    monkeypatch.setattr(db, "get_settings", lambda: SimpleNamespace(
        resolved_database_url="sqlite:///:memory:"
    ))
    engine = db._make_engine()
    try:
        with engine.connect() as connection:
            assert connection.scalar(text("SELECT 1")) == 1
    finally:
        engine.dispose()
