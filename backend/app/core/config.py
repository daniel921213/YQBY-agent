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
    # "mock" => deterministic synthetic data; "binance" => live Binance futures
    # API; "gate" => live Gate USDT-perpetual futures API.
    data_provider: str = "mock"

    binance_api_key: str | None = None
    binance_api_secret: str | None = None
    coinglass_api_key: str | None = None

    # YQBY 分析師 (LLM). Leave the key blank to scaffold without a live model.
    anthropic_api_key: str | None = None
    analyst_model: str = "claude-sonnet-4-6"
    analyst_max_tokens: int = 1024

    # Auth / accounts. DATABASE_URL is provided by Railway's Postgres plugin in
    # production; locally it falls back to a SQLite file so dev needs no DB.
    database_url: str | None = None
    jwt_secret: str = "dev-insecure-change-me"  # MUST set JWT_SECRET in production
    jwt_expire_hours: int = 720  # 30 days
    # Optional separate HMAC key for deriving password-reset codes. Falls back
    # to the stable JWT secret so existing Railway deployments need no new env.
    password_reset_secret: str | None = None
    # 產碼管理 API 的密鑰（環境變數 ADMIN_SECRET）。未設定 = 管理端點一律 404。
    admin_secret: str | None = None

    @property
    def resolved_database_url(self) -> str:
        url = self.database_url or "sqlite:///./yqby_auth.db"
        # SQLAlchemy needs the postgresql:// scheme; some providers hand out postgres://.
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql://", 1)
        return url

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

    # Live Gate fetch tuning (only used when data_provider == "gate"). Gate's
    # public v4 market endpoints are keyless and more generous than Binance.
    gate_base_url: str = "https://api.gateio.ws/api/v4"
    gate_request_timeout: float = 10.0
    gate_max_requests_per_second: float = 15.0

    # Background full-universe scan: refresh the condition-qualified top 3 per
    # direction every N seconds so the frontend reads a fresh result instead of each page
    # load triggering a multi-minute scan.
    scan_background: bool = True
    scan_refresh_seconds: float = 300.0
    # Symbols in the quick warm-up scan that runs immediately at startup so the
    # dashboard has data within ~1 min while the full scan builds in background.
    scan_warmup_size: int = 60

    # Yokai narrative intelligence. External collectors are isolated from the
    # market scanner. A persisted last-good
    # snapshot keeps the feature useful during upstream outages/redeploys.
    yokai_background: bool = True
    yokai_refresh_seconds: float = 900.0
    yokai_request_timeout: float = 10.0
    coingecko_base_url: str = "https://api.coingecko.com/api/v3"
    coingecko_demo_api_key: str | None = None
    gdelt_doc_url: str = "https://api.gdeltproject.org/api/v2/doc/doc"
    yokai_rss_feeds_raw: str = Field(
        default=(
            "Ethereum Blog|https://blog.ethereum.org/feed.xml,"
            "CoinDesk|https://www.coindesk.com/arc/outboundfeeds/rss/"
        ),
        alias="YOKAI_RSS_FEEDS",
    )

    @property
    def yokai_rss_feeds(self) -> list[tuple[str, str]]:
        feeds: list[tuple[str, str]] = []
        for raw in self.yokai_rss_feeds_raw.split(","):
            name, separator, url = raw.strip().partition("|")
            if separator and name and url:
                feeds.append((name.strip(), url.strip()))
        return feeds

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins_raw.split(",") if origin.strip()]

    @property
    def is_live_provider(self) -> bool:
        """True for any real upstream (binance/gate) — i.e. not the mock.

        Live providers fan out hundreds of rate-limited HTTP calls per full
        scan, so they share the background scanner + cache; the mock is fast
        enough to scan per request.
        """
        return self.data_provider.lower() != "mock"


@lru_cache
def get_settings() -> Settings:
    return Settings()
