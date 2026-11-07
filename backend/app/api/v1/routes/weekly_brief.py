from fastapi import APIRouter, Depends

from app.api.v1.routes.auth import current_session
from app.schemas.weekly_brief import WeeklyBriefResponse
from app.services.weekly_brief.service import weekly_brief_cache


# Free for every signed-in account: no plan or trial check.
router = APIRouter(tags=["weekly-brief"], dependencies=[Depends(current_session)])


@router.get("/weekly-brief", response_model=WeeklyBriefResponse)
def weekly_brief() -> WeeklyBriefResponse:
    """每週消息面：Forex Factory 經濟日曆、主要市場收盤與 AI 觀察。"""

    return weekly_brief_cache.response()
