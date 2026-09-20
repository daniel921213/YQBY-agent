"""Add the optional public display name to existing Railway accounts."""

from sqlalchemy import inspect, text


def run_journal_migration(engine) -> None:
    columns = {column["name"] for column in inspect(engine).get_columns("users")}
    if "display_name" not in columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE users ADD COLUMN display_name VARCHAR(64)"))
    if "journals" in inspect(engine).get_table_names():
        journal_columns = {column["name"] for column in inspect(engine).get_columns("journals")}
        additions = {
            "journal_date": "DATE",
            "tags_json": "TEXT DEFAULT '[]'",
            "published_date": "DATE",
            "published_tags_json": "TEXT",
        }
        with engine.begin() as connection:
            for name, definition in additions.items():
                if name not in journal_columns:
                    connection.execute(text(f"ALTER TABLE journals ADD COLUMN {name} {definition}"))
            connection.execute(text("UPDATE journals SET journal_date = DATE(created_at) WHERE journal_date IS NULL"))
