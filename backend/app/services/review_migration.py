from sqlalchemy import inspect, text


def run_review_migration(engine):
    columns = {column["name"] for column in inspect(engine).get_columns("users")}
    if "ct_prime" not in columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE users ADD COLUMN ct_prime BOOLEAN NOT NULL DEFAULT FALSE"))
