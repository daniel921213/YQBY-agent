"""Force the deterministic mock provider for tests.

Set before any app import so it overrides backend/.env (which may select the
live Binance provider for local dev). Keeps the suite fast and network-free.
"""

import os

os.environ["DATA_PROVIDER"] = "mock"
os.environ["SCAN_BACKGROUND"] = "false"
