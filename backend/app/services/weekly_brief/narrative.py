"""AI-written notes for the weekly brief (headline, factor notes, market views).

Claude only writes words around numbers the backend already has. Every text
item is checked afterwards: one that quotes a number not present in the input
(e.g. an invented rate-hike probability) is dropped rather than shown.
"""

from __future__ import annotations

import json
import logging
import re
from decimal import Decimal, InvalidOperation
from typing import Any

logger = logging.getLogger(__name__)

MARKETS = ("美股", "台股", "幣圈", "美債", "商品")
_MAX_CHARS = 90

SYSTEM_PROMPT = """你是 CT_Trader 的總經編輯，為台灣的加密貨幣與股票交易者撰寫「每週消息面」。

規則：
1. 只能使用輸入 JSON 裡出現的數字（價格、漲跌幅、預期值、前值、實際值、日期、時間），照原樣引用。不得自行計算、換算、取整數關卡，也不得引用輸入中沒有的數據（例如升息機率、ETF 資金流、財報、法人買賣超、技術指標）。
2. 不得提及輸入中沒有的事件、公司、人物或新聞。
3. 這是資訊整理，不是投資建議：不要寫買進、賣出、目標價或進出場點。可以寫「要觀察什麼」，以及「若高於／低於預期，市場可能怎麼解讀」這類條件式說法。
4. 繁體中文、台灣用語、精簡，像交易員的週報筆記。
5. 依 mode 撰寫：
   - preview：下週即將開始，重點是接下來要注意什麼。
   - live：本週進行中，結合已公布的數據與還沒公布的事件。
   - recap：本週已結束，回顧發生了什麼、市場怎麼反應。

欄位要求：
- headline：2 行，每行 32 字以內，點出本週主軸。
- factor_notes：factors 裡每個 id 各一句，24 字以內，說明看點。
- markets：美股、台股、幣圈、美債各 2 到 3 點，每點 45 字以內；有商品資料時可加「商品」。
- one_line：2 行，每行 26 字以內，整週一句話總結。
"""

TOOL = {
    "name": "publish_weekly_brief",
    "description": "發布每週消息面的文字內容。",
    "input_schema": {
        "type": "object",
        "properties": {
            "headline": {"type": "array", "items": {"type": "string"}},
            "factor_notes": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {"id": {"type": "string"}, "note": {"type": "string"}},
                    "required": ["id", "note"],
                },
            },
            "markets": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "market": {"type": "string", "enum": list(MARKETS)},
                        "points": {"type": "array", "items": {"type": "string"}},
                    },
                    "required": ["market", "points"],
                },
            },
            "one_line": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["headline", "factor_notes", "markets", "one_line"],
    },
}

_NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?")


def _normalise(token: str) -> str | None:
    try:
        value = Decimal(token.replace(",", ""))
    except InvalidOperation:
        return None
    text = format(value.normalize(), "f")
    return text


def allowed_numbers(context: dict[str, Any]) -> set[str]:
    text = json.dumps(context, ensure_ascii=False)
    allowed = {str(n) for n in range(0, 11)}
    for token in _NUMBER.findall(text):
        normalised = _normalise(token)
        if normalised is not None:
            allowed.add(normalised)
    return allowed


def _clean(text: Any, allowed: set[str]) -> str | None:
    if not isinstance(text, str):
        return None
    text = " ".join(text.split())
    if not text or len(text) > _MAX_CHARS:
        return None
    for token in _NUMBER.findall(text):
        normalised = _normalise(token)
        if normalised is not None and normalised not in allowed:
            logger.info("Weekly brief dropped a line with unsourced number %s: %s", token, text)
            return None
    return text


def sanitize(raw: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
    allowed = allowed_numbers(context)
    factor_ids = {factor["id"] for factor in context.get("factors", [])}

    def lines(values: Any, limit: int) -> list[str]:
        cleaned = [_clean(value, allowed) for value in (values or [])]
        return [value for value in cleaned if value][:limit]

    notes: dict[str, str] = {}
    for item in raw.get("factor_notes") or []:
        if isinstance(item, dict) and item.get("id") in factor_ids:
            note = _clean(item.get("note"), allowed)
            if note:
                notes[str(item["id"])] = note

    markets: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in raw.get("markets") or []:
        if not isinstance(item, dict):
            continue
        market = item.get("market")
        if market not in MARKETS or market in seen:
            continue
        points = lines(item.get("points"), 3)
        if points:
            seen.add(market)
            markets.append({"market": market, "points": points})
    markets.sort(key=lambda item: MARKETS.index(item["market"]))

    return {
        "headline": lines(raw.get("headline"), 2),
        "factor_notes": notes,
        "markets": markets,
        "one_line": lines(raw.get("one_line"), 2),
    }


def generate(context: dict[str, Any], *, api_key: str, model: str) -> dict[str, Any]:
    """Call Claude with a forced tool so the reply is always structured JSON."""

    import anthropic

    client = anthropic.Anthropic(api_key=api_key)
    response = client.messages.create(
        model=model,
        max_tokens=2000,
        system=SYSTEM_PROMPT,
        tools=[TOOL],
        tool_choice={"type": "tool", "name": TOOL["name"]},
        messages=[
            {
                "role": "user",
                "content": "以下是本期資料（JSON）。請依規則撰寫並呼叫 publish_weekly_brief。\n\n"
                + json.dumps(context, ensure_ascii=False, indent=1),
            }
        ],
    )
    for block in response.content:
        if getattr(block, "type", None) == "tool_use" and block.name == TOOL["name"]:
            return sanitize(dict(block.input), context)
    raise ValueError("model did not return the weekly brief tool call")
