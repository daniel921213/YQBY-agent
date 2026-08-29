from __future__ import annotations

import hashlib
import json
import logging
import math
import re
import threading
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any
from urllib.parse import urlsplit, urlunsplit

import httpx
from sqlalchemy import delete, select

from app.core.config import get_settings
from app.db import SessionLocal
from app.models import YokaiSnapshot
from app.schemas.scoring import ScanResponse, ScreenerRow
from app.schemas.yokai import (
    YokaiArticle,
    YokaiHistoryPoint,
    YokaiNarrative,
    YokaiResponse,
    YokaiSourceStatus,
    YokaiToken,
)
from app.services.yokai_taxonomy import (
    NARRATIVES,
    TOKEN_TO_NARRATIVES as _TOKEN_TO_NARRATIVES,
)


logger = logging.getLogger(__name__)


def _now() -> int:
    return int(time.time())


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return min(max(value, low), high)


def _canonical_url(value: str) -> str:
    try:
        parts = urlsplit(value.strip())
        return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), parts.path.rstrip("/"), "", ""))
    except ValueError:
        return value.strip()


def _article_id(url: str, title: str) -> str:
    return hashlib.sha1(f"{_canonical_url(url)}|{title.strip().lower()}".encode()).hexdigest()[:16]


def _parse_timestamp(value: Any, default: int | None = None) -> int:
    fallback = _now() if default is None else default
    if isinstance(value, (int, float)):
        return int(value)
    if not value:
        return fallback
    text = str(value).strip()
    for fmt in ("%Y%m%dT%H%M%SZ", "%Y%m%d%H%M%S", "%Y-%m-%dT%H:%M:%SZ"):
        try:
            return int(datetime.strptime(text, fmt).replace(tzinfo=timezone.utc).timestamp())
        except ValueError:
            pass
    try:
        parsed = parsedate_to_datetime(text)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return int(parsed.timestamp())
    except (TypeError, ValueError, OverflowError):
        return fallback


def _term_present(text: str, term: str) -> bool:
    term = term.lower()
    if len(term) <= 3 and term.isalnum():
        return re.search(rf"(?<![a-z0-9]){re.escape(term)}(?![a-z0-9])", text) is not None
    return term in text


def _classify_title(title: str) -> list[str]:
    lowered = title.lower()
    return [
        item.id
        for item in NARRATIVES
        if any(_term_present(lowered, keyword) for keyword in item.keywords)
    ]


def _symbols_in_title(title: str) -> list[str]:
    symbols: list[str] = []
    for symbol in _TOKEN_TO_NARRATIVES:
        if re.search(rf"(?<![A-Z0-9])\${re.escape(symbol)}(?![A-Z0-9])", title.upper()):
            symbols.append(symbol)
    return symbols


def _dedupe_articles(articles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen_urls: set[str] = set()
    seen_titles: set[str] = set()
    output: list[dict[str, Any]] = []
    for article in sorted(articles, key=lambda item: int(item.get("published_at", 0)), reverse=True):
        title = " ".join(str(article.get("title", "")).split())
        url = _canonical_url(str(article.get("url", "")))
        fingerprint = re.sub(r"[^a-z0-9]+", "", title.lower())[:180]
        if not title or not url or url in seen_urls or (fingerprint and fingerprint in seen_titles):
            continue
        seen_urls.add(url)
        seen_titles.add(fingerprint)
        narrative_ids = _classify_title(title)
        if not narrative_ids:
            continue
        output.append(
            {
                "id": _article_id(url, title),
                "title": title,
                "url": url,
                "source": str(article.get("source") or urlsplit(url).netloc or "Unknown"),
                "published_at": int(article.get("published_at", _now())),
                "narrative_ids": narrative_ids,
                "symbols": _symbols_in_title(title),
            }
        )
    return output[:500]


def _history_counts(
    articles: list[dict[str, Any]], narrative_id: str, now: int
) -> tuple[int, list[int]]:
    bucket_seconds = 6 * 3600
    start = (now // bucket_seconds) * bucket_seconds - 27 * bucket_seconds
    counts = [0] * 28
    for article in articles:
        if narrative_id not in article.get("narrative_ids", []):
            continue
        index = (int(article["published_at"]) - start) // bucket_seconds
        if 0 <= index < len(counts):
            counts[index] += 1
    return start, counts


def _history(
    articles: list[dict[str, Any]],
    narrative_id: str,
    now: int,
    *,
    heat_score: float,
) -> list[dict[str, float | int]]:
    """Build a fixed-scale narrative pulse without local peak normalization.

    Each real six-hour event bucket is kept in ``count``.  ``value`` is a
    causal energy envelope: the event affects its own bucket and then fades
    over the following 18 hours.  A fixed four-events-per-bucket reference
    keeps quiet and active narratives visually comparable, while heat_score
    controls the final amplitude so one isolated article cannot fill a card.
    """

    bucket_seconds = 6 * 3600
    start, counts = _history_counts(articles, narrative_id, now)
    decay = (1.0, 0.58, 0.28, 0.12)
    heat_scale = 0.22 + 0.78 * _clamp(heat_score / 100.0)
    fixed_reference = math.log1p(4.0)

    values: list[float] = []
    for index in range(len(counts)):
        energy = sum(
            counts[index - lag] * weight
            for lag, weight in enumerate(decay)
            if index - lag >= 0
        )
        density = _clamp(math.log1p(energy) / fixed_reference)
        values.append(round(100.0 * density * heat_scale, 1))

    return [
        {
            "time": start + index * bucket_seconds,
            "value": values[index],
            "count": count,
        }
        for index, count in enumerate(counts)
    ]


def _build_narratives(
    articles: list[dict[str, Any]],
    trending_coins: list[dict[str, Any]],
    trending_categories: list[dict[str, Any]],
    previous: dict[str, Any] | None,
    now: int,
) -> list[dict[str, Any]]:
    previous_heat = {
        item.get("id"): float(item.get("heat_score", 0.0))
        for item in (previous or {}).get("narratives", [])
    }
    results: list[dict[str, Any]] = []
    for definition in NARRATIVES:
        relevant = [a for a in articles if definition.id in a.get("narrative_ids", [])]
        counts = {
            "1h": sum(int(a["published_at"]) >= now - 3600 for a in relevant),
            "6h": sum(int(a["published_at"]) >= now - 6 * 3600 for a in relevant),
            "24h": sum(int(a["published_at"]) >= now - 24 * 3600 for a in relevant),
            "7d": sum(int(a["published_at"]) >= now - 7 * 86400 for a in relevant),
        }
        domains = {str(a.get("source", "")).lower() for a in relevant if a.get("source")}
        latest = max((int(a["published_at"]) for a in relevant), default=0)

        trend_hits = 0.0
        for rank, coin in enumerate(trending_coins):
            if str(coin.get("symbol", "")).upper() in definition.tokens:
                trend_hits += max(0.25, 1.0 - rank * 0.07)
        for rank, category in enumerate(trending_categories):
            name = str(category.get("name", "")).lower()
            if any(term in name for term in definition.category_terms):
                trend_hits += max(0.4, 1.2 - rank * 0.12)

        baseline_1h = max(counts["7d"] / 168.0, 0.25)
        baseline_6h = max(counts["7d"] / 28.0, 0.5)
        acceleration = 0.6 * _clamp(math.log1p(counts["1h"] / baseline_1h) / math.log(9))
        acceleration += 0.4 * _clamp(math.log1p(counts["6h"] / baseline_6h) / math.log(9))
        source_factor = _clamp(len(domains) / 6.0)
        recency_factor = math.exp(-max(now - latest, 0) / (12 * 3600)) if latest else 0.0
        trend_factor = _clamp(trend_hits / 2.5)
        _, history_counts = _history_counts(articles, definition.id, now)
        active_bins = sum(count > 0 for count in history_counts[-8:])
        persistence = _clamp(active_bins / 5.0)
        breadth = _clamp(
            sum(str(coin.get("symbol", "")).upper() in definition.tokens for coin in trending_coins) / 4.0
        )
        heat = round(
            30 * acceleration
            + 20 * source_factor
            + 15 * recency_factor
            + 15 * trend_factor
            + 10 * persistence
            + 10 * breadth,
            1,
        )
        prior = previous_heat.get(definition.id, heat)
        heat_change = round(heat - prior, 1)

        if counts["7d"] and counts["24h"] == 0 and trend_hits == 0:
            lifecycle = "退散"
        elif heat >= 78 and acceleration >= 0.72:
            lifecycle = "狂熱"
        elif len(domains) >= 4 and heat >= 48 and counts["6h"] >= 2:
            lifecycle = "發酵"
        elif len(domains) >= 2 and heat >= 28:
            lifecycle = "顯形"
        else:
            lifecycle = "潛伏"

        results.append(
            {
                "id": definition.id,
                "name": definition.name,
                "english_name": definition.english_name,
                "summary": definition.summary,
                "group": definition.group,
                "parent_id": definition.parent_id,
                "lifecycle": lifecycle,
                "heat_score": heat,
                "heat_change": heat_change,
                "mentions_1h": counts["1h"],
                "mentions_6h": counts["6h"],
                "mentions_24h": counts["24h"],
                "mentions_7d": counts["7d"],
                "source_count": len(domains),
                "related_token_count": 0,
                "qualified_long_count": 0,
                "keywords": list(definition.keywords[:5]),
                "history": _history(
                    articles,
                    definition.id,
                    now,
                    heat_score=heat,
                ),
                "articles": relevant[:10],
            }
        )
    return sorted(results, key=lambda item: (item["heat_score"], item["mentions_24h"]), reverse=True)


class YokaiCollector:
    def __init__(self) -> None:
        self.settings = get_settings()

    def collect(self, previous: dict[str, Any] | None = None) -> dict[str, Any]:
        now = _now()
        previous = previous or {}
        statuses: list[dict[str, Any]] = []
        headers = {"User-Agent": "CT-Killer-Yokai/1.0"}
        with httpx.Client(timeout=self.settings.yokai_request_timeout, headers=headers) as client:
            trending_coins, trending_categories, cg_status = self._coingecko(client, previous, now)
            statuses.append(cg_status)
            gdelt_articles, gdelt_status = self._gdelt(client, previous, now)
            statuses.append(gdelt_status)
            rss_articles, rss_status = self._rss(client, previous, now)
            statuses.append(rss_status)

        articles = _dedupe_articles(gdelt_articles + rss_articles)
        # During a partial outage, retain last-good articles so one failed
        # source cannot make a whole narrative disappear between refreshes.
        if not articles and previous.get("articles"):
            articles = list(previous["articles"])

        narratives = _build_narratives(
            articles,
            trending_coins,
            trending_categories,
            previous,
            now,
        )
        return {
            "generated_at": now,
            "articles": articles,
            "trending_coins": trending_coins,
            "trending_categories": trending_categories,
            "sources": statuses,
            "narratives": narratives,
        }

    def _coingecko(
        self, client: httpx.Client, previous: dict[str, Any], now: int
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
        try:
            headers = {}
            if self.settings.coingecko_demo_api_key:
                headers["x-cg-demo-api-key"] = self.settings.coingecko_demo_api_key
            response = client.get(
                f"{self.settings.coingecko_base_url.rstrip('/')}/search/trending",
                headers=headers,
            )
            response.raise_for_status()
            payload = response.json()
            coins = [
                {
                    "name": row.get("item", {}).get("name", ""),
                    "symbol": row.get("item", {}).get("symbol", ""),
                    "rank": row.get("item", {}).get("score", index),
                }
                for index, row in enumerate(payload.get("coins", []))
            ]
            categories = [
                {"name": row.get("name", ""), "rank": index}
                for index, row in enumerate(payload.get("categories", []))
            ]
            return coins, categories, {
                "key": "coingecko",
                "name": "CoinGecko 趨勢",
                "health": "HEALTHY",
                "item_count": len(coins) + len(categories),
                "last_success_at": now,
                "note": "24h 搜尋趨勢，每 10 分鐘更新",
            }
        except Exception as exc:
            logger.warning("Yokai CoinGecko collection failed: %s", exc)
            coins = list(previous.get("trending_coins", []))
            categories = list(previous.get("trending_categories", []))
            return coins, categories, self._stale_status(
                previous, "coingecko", "CoinGecko 趨勢", len(coins) + len(categories)
            )

    def _gdelt(
        self, client: httpx.Client, previous: dict[str, Any], now: int
    ) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        try:
            response = client.get(
                self.settings.gdelt_doc_url,
                params={
                    "query": '(cryptocurrency OR "digital asset" OR blockchain)',
                    "mode": "artlist",
                    "maxrecords": 250,
                    "timespan": "7d",
                    "sort": "datedesc",
                    "format": "json",
                },
            )
            response.raise_for_status()
            payload = response.json()
            articles = [
                {
                    "title": row.get("title", ""),
                    "url": row.get("url", ""),
                    "source": row.get("domain", "GDELT"),
                    "published_at": _parse_timestamp(row.get("seendate"), now),
                }
                for row in payload.get("articles", [])
            ]
            return articles, {
                "key": "gdelt",
                "name": "GDELT 全球新聞",
                "health": "HEALTHY",
                "item_count": len(articles),
                "last_success_at": now,
                "note": "全球新聞索引",
            }
        except Exception as exc:
            logger.warning("Yokai GDELT collection failed: %s", exc)
            previous_articles = [
                article
                for article in previous.get("articles", [])
                if article.get("source") not in {name for name, _url in self.settings.yokai_rss_feeds}
            ]
            return previous_articles, self._stale_status(
                previous, "gdelt", "GDELT 全球新聞", len(previous_articles)
            )

    def _rss(
        self, client: httpx.Client, previous: dict[str, Any], now: int
    ) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        articles: list[dict[str, Any]] = []
        successful = 0
        for name, url in self.settings.yokai_rss_feeds:
            try:
                response = client.get(url, follow_redirects=True)
                response.raise_for_status()
                root = ET.fromstring(response.content)
                entries = root.findall(".//item")
                if not entries:
                    entries = root.findall(".//{http://www.w3.org/2005/Atom}entry")
                for entry in entries[:60]:
                    title = entry.findtext("title") or entry.findtext("{http://www.w3.org/2005/Atom}title") or ""
                    link = entry.findtext("link") or ""
                    if not link:
                        link_node = entry.find("{http://www.w3.org/2005/Atom}link")
                        link = link_node.get("href", "") if link_node is not None else ""
                    published = (
                        entry.findtext("pubDate")
                        or entry.findtext("published")
                        or entry.findtext("{http://www.w3.org/2005/Atom}published")
                        or entry.findtext("{http://www.w3.org/2005/Atom}updated")
                    )
                    articles.append(
                        {
                            "title": title,
                            "url": link,
                            "source": name,
                            "published_at": _parse_timestamp(published, now),
                        }
                    )
                successful += 1
            except Exception as exc:
                logger.warning("Yokai RSS collection failed (%s): %s", name, exc)
        if successful:
            return articles, {
                "key": "rss",
                "name": "官方／產業 RSS",
                "health": "HEALTHY" if successful == len(self.settings.yokai_rss_feeds) else "STALE",
                "item_count": len(articles),
                "last_success_at": now,
                "note": f"{successful}/{len(self.settings.yokai_rss_feeds)} 個來源正常",
            }
        rss_names = {name for name, _url in self.settings.yokai_rss_feeds}
        previous_articles = [a for a in previous.get("articles", []) if a.get("source") in rss_names]
        return previous_articles, self._stale_status(
            previous, "rss", "官方／產業 RSS", len(previous_articles)
        )

    @staticmethod
    def _stale_status(
        previous: dict[str, Any], key: str, name: str, count: int
    ) -> dict[str, Any]:
        old = next((item for item in previous.get("sources", []) if item.get("key") == key), {})
        return {
            "key": key,
            "name": name,
            "health": "STALE" if count else "OFFLINE",
            "item_count": count,
            "last_success_at": old.get("last_success_at"),
            "note": "目前使用上次成功快照" if count else "來源暫時無法連線",
        }


def _row_to_token(
    row: ScreenerRow,
    narrative_rows: list[dict[str, Any]],
) -> YokaiToken:
    primary = max(narrative_rows, key=lambda item: float(item.get("heat_score", 0.0)))
    external_pass = (
        primary.get("lifecycle") in {"顯形", "發酵"}
        and int(primary.get("source_count", 0)) >= 2
    )
    gate_pass = row.yokai_long_eligible and row.direction == "LONG"
    qualified = external_pass and gate_pass

    reasons: list[str] = []
    blocked: list[str] = []
    lifecycle = primary.get("lifecycle")
    source_count = int(primary.get("source_count", 0))
    lifecycle_pass = lifecycle in {"顯形", "發酵"}
    source_pass = source_count >= 2
    narrative_passed = int(lifecycle_pass) + int(source_pass)
    if external_pass:
        reasons.append(
            f"題材確認 2/2：{primary['name']}進入{lifecycle}、{source_count} 個獨立來源"
        )
    else:
        missing: list[str] = []
        if not lifecycle_pass:
            missing.append("尚未進入顯形／發酵")
        if not source_pass:
            missing.append(f"獨立來源僅 {source_count} 個")
        blocked.append(f"題材確認 {narrative_passed}/2：{'；'.join(missing)}")
        if lifecycle == "狂熱":
            blocked.append("風險否決：題材已進入狂熱階段，追價風險偏高")
        elif lifecycle == "退散":
            blocked.append("風險否決：題材熱度正在退散")

    reasons.extend(row.yokai_long_reasons)
    blocked.extend(row.yokai_long_failed_reasons)
    # Preserve order but remove repeated explanations.
    reasons = list(dict.fromkeys(reasons))
    blocked = list(dict.fromkeys(blocked))

    risk_lifecycle = primary.get("lifecycle") in {"狂熱", "退散"}
    status = "QUALIFIED" if qualified else ("RISK" if risk_lifecycle or row.direction == "SHORT" else "WATCH")
    return YokaiToken(
        symbol=row.symbol,
        narrative_ids=[item["id"] for item in narrative_rows],
        narrative_names=[item["name"] for item in narrative_rows],
        narrative_heat=float(primary.get("heat_score", 0.0)),
        narrative_lifecycle=primary.get("lifecycle", "潛伏"),
        status=status,
        qualified_long=qualified,
        price=row.price,
        change_24h=row.change_24h,
        formal_direction=row.direction,
        formal_stage=row.stage,
        formal_score=row.score,
        oi_change_1h=row.oi_change_1h,
        oi_side=row.oi_side,
        funding_rate=row.funding_rate,
        account_ratio=row.account_ratio,
        flow_quality=row.flow_quality,
        five_minute_state=row.five_minute_state,
        five_minute_direction=row.five_minute_direction,
        active_flow_direction=row.active_flow_direction,
        active_flow_strength=row.active_flow_strength,
        cvd_signal=row.cvd_signal,
        reasons=reasons,
        blocked_reasons=blocked,
    )


def build_yokai_response(
    external: dict[str, Any] | None,
    scan: ScanResponse | None,
) -> YokaiResponse:
    now = _now()
    external = external or {}
    narrative_payloads = [dict(item) for item in external.get("narratives", [])]
    active_narratives = {
        item["id"]: item
        for item in narrative_payloads
        if float(item.get("heat_score", 0.0)) > 0
        or int(item.get("mentions_7d", 0)) > 0
    }
    tokens: list[YokaiToken] = []
    if scan is not None and active_narratives:
        for row in scan.universe:
            base = row.symbol[:-4] if row.symbol.endswith("USDT") else row.symbol
            narrative_rows = [
                active_narratives[narrative_id]
                for narrative_id in _TOKEN_TO_NARRATIVES.get(base, [])
                if narrative_id in active_narratives
            ]
            if narrative_rows:
                tokens.append(_row_to_token(row, narrative_rows))

    tokens.sort(
        key=lambda item: (
            item.qualified_long,
            item.status != "RISK",
            item.narrative_heat,
            item.formal_score,
        ),
        reverse=True,
    )
    for narrative in narrative_payloads:
        related = [token for token in tokens if narrative["id"] in token.narrative_ids]
        narrative["related_token_count"] = len(related)
        narrative["qualified_long_count"] = sum(token.qualified_long for token in related)

    narratives = [YokaiNarrative(**item) for item in narrative_payloads]
    sources = [YokaiSourceStatus(**item) for item in external.get("sources", [])]
    external_ready = bool(narratives) and any(source.health != "OFFLINE" for source in sources)
    gate_ready = scan is not None and scan.breadth.total > 0
    if not external_ready:
        notice = "外部情報正在建立快照；原有主控台與 Gate 掃描不受影響。"
    elif not gate_ready:
        notice = "題材情報已就緒，Gate 全市場掃描仍在暖機。"
    elif any(source.health != "HEALTHY" for source in sources):
        notice = "部分外部來源暫時延遲，目前以最後成功快照持續服務。"
    else:
        notice = "妖氣只負責發現題材；做多推薦仍須通過 Gate 正式條件。"

    qualified = [token for token in tokens if token.qualified_long]
    return YokaiResponse(
        generated_at=now,
        external_generated_at=int(external.get("generated_at", 0)),
        gate_generated_at=scan.generated_at if scan else 0,
        refresh_interval_seconds=int(get_settings().yokai_refresh_seconds),
        external_ready=external_ready,
        gate_ready=gate_ready,
        sources=sources,
        narratives=narratives,
        tokens=tokens,
        qualified_longs=qualified,
        coverage_symbols=scan.breadth.total if scan else 0,
        notice=notice,
    )


class YokaiCache:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._latest: dict[str, Any] | None = None
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()

    @property
    def latest(self) -> dict[str, Any] | None:
        with self._lock:
            return self._latest

    def response(self, scan: ScanResponse | None) -> YokaiResponse:
        return build_yokai_response(self.latest, scan)

    def refresh_once(self) -> None:
        result = YokaiCollector().collect(self.latest)
        with self._lock:
            self._latest = result
        self._persist(result)

    def _run(self, interval: float) -> None:
        try:
            self.refresh_once()
        except Exception:
            logger.exception("Yokai first external refresh failed")
        while not self._stop.wait(interval):
            try:
                self.refresh_once()
            except Exception:
                logger.exception("Yokai external refresh failed")

    def start(self) -> None:
        if self._thread is not None:
            return
        self._load_latest()
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._run,
            args=(get_settings().yokai_refresh_seconds,),
            daemon=True,
        )
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        self._thread = None

    def _load_latest(self) -> None:
        try:
            with SessionLocal() as db:
                row = db.scalar(select(YokaiSnapshot).order_by(YokaiSnapshot.id.desc()).limit(1))
                if row is not None:
                    with self._lock:
                        self._latest = json.loads(row.payload)
        except Exception:
            logger.exception("Could not load persisted Yokai snapshot")

    @staticmethod
    def _persist(payload: dict[str, Any]) -> None:
        try:
            with SessionLocal() as db:
                row = YokaiSnapshot(
                    generated_at=int(payload.get("generated_at", _now())),
                    payload=json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
                )
                db.add(row)
                db.flush()
                keep_from = max(row.id - 95, 0)
                if keep_from:
                    db.execute(delete(YokaiSnapshot).where(YokaiSnapshot.id <= keep_from))
                db.commit()
        except Exception:
            logger.exception("Could not persist Yokai snapshot")


yokai_cache = YokaiCache()
