"""Force the deterministic mock provider for tests.

Set before any app import so it overrides backend/.env (which may select the
live Binance provider for local dev). Keeps the suite fast and network-free.
"""

import os

os.environ["DATA_PROVIDER"] = "mock"
os.environ["SCAN_BACKGROUND"] = "false"
os.environ["YOKAI_BACKGROUND"] = "false"
# Isolate the auth DB to a throwaway sqlite file (not the dev yqby_auth.db).
os.environ["DATABASE_URL"] = "sqlite:///./test_auth.db"
# Enable the hidden admin (code-minting) endpoints in tests.
os.environ["ADMIN_SECRET"] = "test-admin-secret"

import pytest


@pytest.fixture(autouse=True)
def _reset_rate_limit():
    from app.services import rate_limit
    rate_limit.reset()
    yield
    rate_limit.reset()
