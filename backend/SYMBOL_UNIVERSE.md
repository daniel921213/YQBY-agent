# Bitget / Gate shared perpetual universe

With `DATA_PROVIDER=gate`, Bitget provides eligibility and Gate continues to
provide every price, candle, derivative metric and volume ranking. Indicator,
scoring, recommendation and risk formulas are unchanged.

- Bitget: `GET https://api.bitget.com/api/v3/market/instruments?category=USDT-FUTURES`.
- Require `category=USDT-FUTURES`, `type=perpetual`, `status=online`,
  `symbolType=crypto`, `quoteCoin=USDT`, and `symbol == baseCoin + USDT`.
- Match Gate's existing active crypto USDT contract list using exact symbols.
  Underscores are normalized; renamed coins and numeric multipliers are never
  guessed or removed. Gate-only and Bitget-only contracts are excluded.
- Keep Gate's existing descending quote-volume order, with **no universe size
  cap**, even if an older deployment still sets `SCAN_UNIVERSE_SIZE=150`.
  Binance/mock behavior is unchanged. Startup warm-up remains a temporary
  partial scan, followed by the full intersection. Recommendation display
  counts, thresholds, request concurrency and rate limits are unchanged.

## Catalog availability

One process-wide, locked cache refreshes the intersection every 5 minutes on
use. A failed refresh retries after 30 seconds; a last-good catalog may be
used for at most 30 minutes from its successful fetch. Empty/invalid responses
never expand the universe to Gate-only. No usable catalog produces HTTP 503;
unsupported requested symbols produce HTTP 422. A restart requires a new
successful fetch.

Single-symbol analysis, explicit scans, AI Gate queries, current scan results
and displayed anomaly history all use the same eligibility. Cached scans
containing removed symbols are withheld until replaced; underlying historical
records are retained. Broad AI ticker/contract responses are filtered before
the existing output truncation. AI uses the background scan while it is enabled
and reports warming up if no eligible scan is ready.

Yokai news collectors remain unchanged. If catalog lookup fails, the news
response remains available without a market scan overlay. Personal backtest
and journal records are not rewritten or constrained by the live universe.

## Verification and operations

`scripts/check_symbol_universe.py --baseline <pre-change-commit> --report <path>`
fetches live catalogs, reports exact inclusions/exclusions and compares the
old and new analysis implementation using the same frozen Gate frames for
BTC/ETH/SOL. Add `--full-scan` to measure a complete read-only scan; it does not
record anomaly history or modify account data. Run from the backend directory.

Logs report catalog counts and full scan requested/analyzed counts, elapsed
seconds and whether the scan is only a warm-up. A failed single-coin data fetch
continues to follow existing scanner behavior; this change does not fabricate
missing data. Actual counts change with exchange listings and status updates.
