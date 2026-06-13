from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.routes.analysis import router as analysis_router
from app.api.v1.routes.analyst import router as analyst_router
from app.api.v1.routes.auth import router as auth_router
from app.core.config import get_settings
from app.db import init_db
from app.services.scan_cache import scan_cache


settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create the accounts table if missing. Wrapped so a DB hiccup never blocks
    # the (public) dashboard from starting — only auth would be affected.
    try:
        init_db()
    except Exception as exc:  # pragma: no cover
        print(f"[startup] init_db skipped: {type(exc).__name__}: {exc}")
    # Start the background full-universe scanner for any live provider
    # (binance/gate); the mock provider is fast enough to scan per request.
    if settings.is_live_provider and settings.scan_background:
        scan_cache.start()
    yield
    scan_cache.stop()


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analysis_router, prefix=settings.api_v1_prefix)
app.include_router(analyst_router, prefix=settings.api_v1_prefix)
app.include_router(auth_router, prefix=settings.api_v1_prefix)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

