"""Idempotent startup migration for authentication security fields."""

from sqlalchemy import inspect, text


def run_auth_security_migration(engine) -> None:
    inspector = inspect(engine)
    user_columns = {col["name"] for col in inspector.get_columns("users")}
    if "auth_version" not in user_columns:
        with engine.begin() as conn:
            conn.execute(
                text("ALTER TABLE users ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 0")
            )
        print("[auth] added users.auth_version")

    # Existing Railway deployments created the reset inventory with hashes
    # only. Add a readable code column, then the inventory service backfills it.
    inspector = inspect(engine)
    if not inspector.has_table("password_reset_codes"):
        return
    reset_columns = {
        col["name"] for col in inspector.get_columns("password_reset_codes")
    }
    if "code" not in reset_columns:
        with engine.begin() as conn:
            conn.execute(
                text("ALTER TABLE password_reset_codes ADD COLUMN code VARCHAR(32)")
            )
            conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS "
                    "ix_password_reset_codes_code ON password_reset_codes (code)"
                )
            )
        print("[auth] added password_reset_codes.code")
