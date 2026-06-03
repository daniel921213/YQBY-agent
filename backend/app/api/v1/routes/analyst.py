from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.services import analyst_service

router = APIRouter(tags=["analyst"])


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
