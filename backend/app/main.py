from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.routes.admin import router as admin_router
from app.api.v1.routes.analysis import router as analysis_router
from app.api.v1.routes.analyst import router as analyst_router
from app.api.v1.routes.auth import router as auth_router
from app.api.v1.routes.yokai import router as yokai_router
from app.core.config import get_settings
from app.db import SessionLocal, engine, init_db
from app.services.auth_security_migration import run_auth_security_migration
from app.services.entitlement_migration import run_entitlement_migration
from app.services.password_reset_service import ensure_inventory
from app.services.scan_cache import scan_cache
from app.services.yokai_service import yokai_cache


settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create the accounts table if missing. Wrapped so a DB hiccup never blocks
    # the (public) dashboard from starting — only auth would be affected.
    try:
        init_db()
        run_auth_security_migration(engine)
        # 冪等的資格遷移：補欄位 + 幫「還沒有資格設定」的舊帳號 backfill
        # （永久名單 → lifetime、其他 → 試用 +7 天）。套用過就是 no-op。
        run_entitlement_migration(engine, SessionLocal)
        with SessionLocal() as db:
            stock = ensure_inventory(db)
            print(f"[startup] password reset code stock ready: {stock}")
    except Exception as exc:  # pragma: no cover
        print(f"[startup] init_db skipped: {type(exc).__name__}: {exc}")
    # Start the background full-universe scanner for any live provider
    # (binance/gate); the mock provider is fast enough to scan per request.
    if settings.is_live_provider and settings.scan_background:
        scan_cache.start()
    if settings.yokai_background:
        yokai_cache.start()
    yield
    yokai_cache.stop()
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
app.include_router(admin_router, prefix=settings.api_v1_prefix)
app.include_router(yokai_router, prefix=settings.api_v1_prefix)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

