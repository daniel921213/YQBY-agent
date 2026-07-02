"""YQBY 分析師 — a Claude agent grounded in our own scan/analysis tools.

Phase 1: public data only. It exposes two tools that call our existing scoring
engine, so the analyst speaks OUR numbers (the same the dashboard shows). No
Binance keys, no trading, no account access. If ANTHROPIC_API_KEY is unset it
degrades gracefully so the app still runs.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx

from app.core.config import get_settings
from app.core.constants import (
    DEFAULT_LOOKBACK_CANDLES,
    PRIMARY_TIMEFRAME,
    TREND_TIMEFRAME,
    TRIGGER_TIMEFRAME,
)
from app.schemas.scoring import ScanResponse
from app.services.analysis_service import AnalysisService
from app.services.scan_cache import scan_cache

# ── Gate public API skills (read-only) ───────────────────────────────
# Bundled SKILL.md docs are injected into the system prompt; the agent calls the
# documented public endpoints via the scoped gate_query tool below. Adding a
# skill = drop its SKILL.md here + whitelist its host(s). NO API keys, NO trading.
_SKILLS_DIR = Path(__file__).resolve().parent.parent / "analyst_skills"
# Public read-only host the skills document. NO auth is ever sent, so even a
# POST here cannot execute a trade (those require signed/authenticated requests).
_ALLOWED_GATE_HOSTS = {"api.gateio.ws"}
_GATE_HEADERS = {"Accept": "application/json"}
_GATE_LIST_CAP = 10      # keep at most N items from a list payload
_GATE_MAX_CHARS = 12000  # final guard on serialized tool output


def _load_skill_reference() -> str:
    if not _SKILLS_DIR.is_dir():
        return ""
    docs = []
    for path in sorted(_SKILLS_DIR.glob("*.md")):
        docs.append(path.read_text(encoding="utf-8"))
    if not docs:
        return ""
    return (
        "你可使用以下 Gate 公開 API 技能(皆為公開、唯讀端點，無需金鑰)。"
        "需要查代幣/價格/行情/資金費率/OI/多空比/市場排行時，依說明用 gate_query 工具呼叫對應的 URL：\n\n"
        + "\n\n---\n\n".join(docs)
    )


_SKILL_REFERENCE = _load_skill_reference()


def _trim_list(payload: Any) -> Any:
    """Cap big list payloads (Gate often returns top-level arrays) so one query
    doesn't blow the context."""
    if isinstance(payload, list) and len(payload) > _GATE_LIST_CAP:
        return payload[:_GATE_LIST_CAP] + [
            {"_note": f"已截斷為前 {_GATE_LIST_CAP} 筆（原共 {len(payload)} 筆）"}
        ]
    if isinstance(payload, dict) and isinstance(payload.get("data"), list):
        full = len(payload["data"])
        if full > _GATE_LIST_CAP:
            payload["data"] = payload["data"][:_GATE_LIST_CAP]
            payload["_note"] = f"已截斷為前 {_GATE_LIST_CAP} 筆（原共 {full} 筆）"
    return payload


def _tool_gate_query(url: str, method: str = "GET", body: Any = None) -> dict[str, Any]:
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in _ALLOWED_GATE_HOSTS:
        return {"error": f"host not allowed: {parsed.hostname}. 僅允許 {sorted(_ALLOWED_GATE_HOSTS)}"}
    method = (method or "GET").upper()
    if method not in ("GET", "POST"):
        return {"error": f"method not allowed: {method}（僅 GET/POST，且永不帶金鑰）"}
    try:
        if method == "POST":
            resp = httpx.post(url, headers=_GATE_HEADERS, json=body or {}, timeout=20.0)
        else:
            resp = httpx.get(url, headers=_GATE_HEADERS, timeout=20.0)
        resp.raise_for_status()
        try:
            payload = _trim_list(resp.json())
        except ValueError:
            return {"text": resp.text[:_GATE_MAX_CHARS]}
        serialized = json.dumps(payload, ensure_ascii=False)
        if len(serialized) > _GATE_MAX_CHARS:
            return {"text": serialized[:_GATE_MAX_CHARS] + " …（截斷）"}
        return {"data": payload}
    except Exception as exc:
        return {"error": f"{type(exc).__name__}: {exc}"}

SYSTEM_PROMPT = (
    "你是 CT_Trader（CONFLUENCE THEORY）的加密貨幣分析師，用繁體中文、簡潔專業地回答。\n\n"
    "【最重要】使用者的問題是要『答案』，不是功能介紹。"
    "回答任何關於市場、個別幣、或代幣的問題時，你『必須』先呼叫對應工具取得真實資料，再依資料回答。"
    "在還沒呼叫工具拿到資料前，絕不憑空作答，也不要列出你的功能清單或自我介紹。\n\n"
    "工具選擇：\n"
    "- 問市場整體、推薦、轉多/轉空/疑似反轉、或某交易對(如 BTCUSDT)的支柱打分 → 用 get_market_scan 或 analyze_symbol（我們自己的即時掃描數據）。\n"
    "- 問某幣的價格、24h漲跌、資金費率、未平倉(OI)、多空比、主動買賣、K線、市場排行/最熱/漲跌榜 → 依系統提示中的『Gate 公開 API 技能』說明，用 gate_query 呼叫(合約代號要轉成 BTC_USDT 格式)。\n\n"
    "誠實框架（務必遵守）：分數代表『訊號異常強度』，不是上漲機率；"
    "這是數據判讀，不是投資建議；必要時提醒使用者風險自負。\n\n"
    "回答風格：像朋友跟你講重點，不是寫報告。"
    "先在心裡消化工具拿到的數據，只挑出最重要的 1～3 件事；結論先講，再用一兩句補上關鍵理由。"
    "不要把所有數字、所有支柱都列出來，只講會影響判斷的那幾項。"
    "長度拿捏適中——大約一個短段落、2～5 句話就好，不要太短也不要太長。"
    "自然口語、簡潔親切；不要 Markdown 大標題、表格、分隔線或一堆 emoji。"
    "只有使用者明確要求『詳細分析』時才展開講細節。"
)

TOOLS: list[dict[str, Any]] = [
    {
        "name": "get_market_scan",
        "description": (
            "取得目前全市場掃描結果：高把握推薦(分數≥80)與分類異常"
            "(轉多/轉空/疑似反轉)，含每檔的分數、方向、共振支柱數。"
            "問『市場現在如何 / 有什麼值得注意 / 有哪些推薦或異常』時使用。"
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "analyze_symbol",
        "description": (
            "取得單一交易對的 5 支柱分析：分數、方向、信心、共振、各支柱證據"
            "(CVD背離/OI/動能/資金費率/多空比/相對強弱)。問某個幣時使用。"
        ),
        "input_schema": {
            "type": "object",
            "properties": {"symbol": {"type": "string", "description": "例如 BTCUSDT"}},
            "required": ["symbol"],
        },
    },
    {
        "name": "gate_query",
        "description": (
            "對 Gate 公開 v4 端點發出 GET 請求(免金鑰、唯讀)。用於系統提示中『Gate 公開 API 技能』"
            "所記載的端點：永續行情/市場排行(tickers)、K線(candlesticks)、未平倉與多空比(contract_stats)、"
            "資金費率(funding_rate)、現貨價格(spot)。合約代號用 BTC_USDT 格式。"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "完整 https URL，須為技能文件所列的 api.gateio.ws 公開端點"},
                "method": {"type": "string", "enum": ["GET", "POST"], "description": "預設 GET"},
                "body": {"type": "object", "description": "POST 時的 JSON body(一般用不到)"},
            },
            "required": ["url"],
        },
    },
]


def _item(i: Any) -> dict[str, Any]:
    return {
        "symbol": i.symbol,
        "score": round(i.score, 1),
        "direction": i.direction,
        "confluence": i.confluence_pillars,
        "stage": i.stage,
        "stage_reasons": i.stage_reasons[:3],
    }


def _get_scan() -> ScanResponse:
    cached = scan_cache.latest
    if cached is not None:
        return cached
    service = AnalysisService()
    symbols = (
        None
        if service.settings.data_provider.lower() == "mock"
        else service.market_data.list_symbols()[:30]
    )
    return service.scan_market(
        symbols, PRIMARY_TIMEFRAME, TRIGGER_TIMEFRAME, TREND_TIMEFRAME, DEFAULT_LOOKBACK_CANDLES
    )


def _tool_get_market_scan() -> dict[str, Any]:
    scan = _get_scan()
    anomalies = [i for i in scan.items if not i.is_recommend]
    return {
        "universe_total": scan.breadth.total,
        "long_count": scan.breadth.long_count,
        "short_count": scan.breadth.short_count,
        "recommendations": [_item(i) for i in scan.items if i.is_recommend],
        "anomalies": {
            stage: [_item(i) for i in anomalies if i.stage == stage][:15]
            for stage in ("早期異動", "趨勢啟動", "趨勢延續", "過熱風險", "反轉警訊", "觀察")
        },
    }


def _tool_analyze_symbol(symbol: str) -> dict[str, Any]:
    a = AnalysisService().analyze(
        symbol.upper(), PRIMARY_TIMEFRAME, TRIGGER_TIMEFRAME, TREND_TIMEFRAME,
        DEFAULT_LOOKBACK_CANDLES,
    )
    r = a.recommendation
    return {
        "symbol": r.symbol,
        "score": round(r.score, 1),
        "direction": r.direction,
        "confidence": r.confidence_level,
        "confluence_pillars": r.confluence_pillars,
        "summary": r.summary,
        "evidence": [
            {
                "pillar": e.pillar,
                "label": e.label,
                "direction": e.direction,
                "strength": round(e.strength, 2),
                "description": e.description,
            }
            for e in a.evidence
        ],
    }


def _run_tool(name: str, args: dict[str, Any]) -> dict[str, Any]:
    try:
        if name == "get_market_scan":
            return _tool_get_market_scan()
        if name == "analyze_symbol":
            return _tool_analyze_symbol(args.get("symbol", ""))
        if name == "gate_query":
            return _tool_gate_query(args.get("url", ""), args.get("method", "GET"), args.get("body"))
        return {"error": f"unknown tool {name}"}
    except Exception as exc:  # never let a tool failure break the chat
        return {"error": f"{type(exc).__name__}: {exc}"}


def chat(messages: list[dict[str, str]]) -> dict[str, Any]:
    """Run one analyst turn. messages: [{role: 'user'|'assistant', content: str}]."""
    settings = get_settings()
    if not settings.anthropic_api_key:
        return {
            "reply": "（CT_Trader 分析師尚未啟用：請在 backend/.env 設定 ANTHROPIC_API_KEY 後重啟後端。）",
            "tools_used": [],
        }

    try:
        import anthropic
    except ImportError:
        return {"reply": "（後端未安裝 anthropic 套件。）", "tools_used": []}

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    # System = persona + the (large, static) skill docs, cached so repeat calls
    # don't re-pay for the skill reference tokens.
    system_blocks: list[dict[str, Any]] = [{"type": "text", "text": SYSTEM_PROMPT}]
    if _SKILL_REFERENCE:
        system_blocks.append(
            {"type": "text", "text": _SKILL_REFERENCE, "cache_control": {"type": "ephemeral"}}
        )
    conv: list[dict[str, Any]] = [
        {"role": m["role"], "content": m["content"]} for m in messages
    ]
    tools_used: list[str] = []

    try:
        for _ in range(8):  # cap tool-use rounds (gate lookups may chain calls)
            resp = client.messages.create(
                model=settings.analyst_model,
                max_tokens=settings.analyst_max_tokens,
                system=system_blocks,
                tools=TOOLS,
                messages=conv,
            )
            if resp.stop_reason == "tool_use":
                conv.append({"role": "assistant", "content": resp.content})
                results = []
                for block in resp.content:
                    if block.type == "tool_use":
                        tools_used.append(block.name)
                        out = _run_tool(block.name, dict(block.input))
                        results.append({
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": json.dumps(out, ensure_ascii=False),
                        })
                conv.append({"role": "user", "content": results})
                continue
            text = "".join(b.text for b in resp.content if b.type == "text")
            return {"reply": text, "tools_used": tools_used}
        return {"reply": "（分析步驟過多，已中止。）", "tools_used": tools_used}
    except Exception as exc:
        return {"reply": f"（分析師錯誤：{type(exc).__name__}）", "tools_used": tools_used}
