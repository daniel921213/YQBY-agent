"""Idempotent startup migration for authentication security fields."""

from sqlalchemy import inspect, text


def run_auth_security_migration(engine) -> None:
    existing = {col["name"] for col in inspect(engine).get_columns("users")}
    if "auth_version" in existing:
        return

    with engine.begin() as conn:
        conn.execute(
            text("ALTER TABLE users ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 0")
        )
    print("[auth] added users.auth_version")
