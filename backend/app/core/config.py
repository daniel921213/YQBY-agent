from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Crypto Divergence Analyzer"
    environment: str = "local"
    api_v1_prefix: str = "/api/v1"
    cors_origins_raw: str = Field(
        default=(
            "http://localhost:3000,http://127.0.0.1:3000,"
            "http://localhost:3001,http://127.0.0.1:3001"
        ),
        alias="CORS_ORIGINS",
    )
    # "mock" => deterministic synthetic data; "binance" => live Binance futures API.
    data_provider: str = "mock"

    binance_api_key: str | None = None
    binance_api_secret: str | None = None
    coinglass_api_key: str | None = None

    # YQBY 分析師 (LLM). Leave the key blank to scaffold without a live model.
    anthropic_api_key: str | None = None
    analyst_model: str = "claude-sonnet-4-6"
    analyst_max_tokens: int = 1024

    # Live Binance fetch tuning (only used when data_provider == "binance").
    binance_base_url: str = "https://fapi.binance.com"
    binance_request_timeout: float = 10.0
    # Top-N USDT perpetuals by 24h quote volume to scan. 0 => the ENTIRE
    # tradable universe (only feasible with the background refresher below,
    # since a full scan far exceeds Binance's per-request rate limits).
    scan_universe_size: int = 0
    # Per-response cache TTL (seconds). The frontend polls every 30s, so a TTL
    # above that makes repeat scans essentially free.
    data_cache_ttl_seconds: float = 90.0
    # Max in-flight requests during a full-universe scan fan-out.
    scan_max_workers: int = 8
    # Soft cap on outbound requests/sec to stay under Binance IP limits.
    binance_max_requests_per_second: float = 8.0

    # Background full-universe scan: refresh the cached top-20/direction every N
    # seconds so the frontend reads a fresh result instantly instead of each page
    # load triggering a multi-minute scan.
    scan_background: bool = True
    scan_refresh_seconds: float = 300.0
    # Symbols in the quick warm-up scan that runs immediately at startup so the
    # dashboard has data within ~1 min while the full scan builds in background.
    scan_warmup_size: int = 60

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins_raw.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
