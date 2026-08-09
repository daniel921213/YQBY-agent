from fastapi import APIRouter, Depends

from app.api.v1.routes.auth import require_lifetime_user
from app.schemas.yokai import YokaiResponse
from app.services.scan_cache import scan_cache
from app.services.yokai_service import yokai_cache


router = APIRouter(tags=["yokai"], dependencies=[Depends(require_lifetime_user)])


@router.get("/yokai", response_model=YokaiResponse)
def yokai_overview() -> YokaiResponse:
    """Narrative intelligence overlaid with the latest authoritative Gate scan."""

    return yokai_cache.response(scan_cache.latest)
