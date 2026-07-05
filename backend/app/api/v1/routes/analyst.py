from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.api.v1.routes.auth import require_active_user
from app.services import analyst_service

# LLM 對話每一次都是真金白銀的 API 費用，門檢跟資料端點同一套。
router = APIRouter(tags=["analyst"], dependencies=[Depends(require_active_user)])


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(..., max_length=40)


class ChatResponse(BaseModel):
    reply: str
    tools_used: list[str] = []


@router.post("/analyst/chat", response_model=ChatResponse)
def analyst_chat(request: ChatRequest) -> ChatResponse:
    result = analyst_service.chat([m.model_dump() for m in request.messages])
    return ChatResponse(**result)
