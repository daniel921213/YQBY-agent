"""Forex Factory weekly calendar: parsing, Chinese labels, importance ranking.

The public feed (nfs.faireconomy.media/ff_calendar_thisweek.xml) only carries
the current Forex Factory week (Sunday-Saturday, US Eastern) with forecast and
previous values. Times are GMT. There is no next-week file and no actuals.
"""

from __future__ import annotations

import hashlib
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

TAIPEI = timezone(timedelta(hours=8))
EASTERN = ZoneInfo("America/New_York")
WEEKDAY_ZH = ("一", "二", "三", "四", "五", "六", "日")

COUNTRY_ZH = {
    "USD": "美國",
    "EUR": "歐元區",
    "GBP": "英國",
    "JPY": "日本",
    "CNY": "中國",
    "AUD": "澳洲",
    "NZD": "紐西蘭",
    "CAD": "加拿大",
    "CHF": "瑞士",
    "ALL": "全球",
}

_COUNTRY_WEIGHT = {"USD": 1.0, "CNY": 0.6, "JPY": 0.55, "EUR": 0.55, "GBP": 0.45}
_IMPACT_WEIGHT = {"High": 3.0, "Medium": 1.6, "Low": 0.5}

# Full-title translations (checked before the suffix/prefix rules below).
_TITLES = {
    "Non-Farm Employment Change": "非農新增就業",
    "ADP Non-Farm Employment Change": "ADP 小非農",
    "Unemployment Rate": "失業率",
    "Unemployment Claims": "初領失業金人數",
    "Federal Funds Rate": "聯準會利率決議",
    "FOMC Statement": "FOMC 聲明",
    "FOMC Press Conference": "FOMC 記者會",
    "FOMC Meeting Minutes": "FOMC 會議紀要",
    "FOMC Economic Projections": "FOMC 經濟預測",
    "Main Refinancing Rate": "ECB 主要再融資利率",
    "Monetary Policy Statement": "貨幣政策聲明",
    "Monetary Policy Summary": "貨幣政策摘要",
    "Monetary Policy Meeting Minutes": "貨幣政策會議紀要",
    "BOJ Policy Rate": "日銀利率決議",
    "BOJ Outlook Report": "日銀展望報告",
    "BOJ Press Conference": "日銀記者會",
    "BOE Monetary Policy Report": "英銀貨幣政策報告",
    "MPC Official Bank Rate Votes": "英銀利率投票",
    "Official Bank Rate": "英銀利率決議",
    "Cash Rate": "現金利率決議",
    "Overnight Rate": "隔夜利率決議",
    "Official Cash Rate": "官方現金利率決議",
    "RBA Rate Statement": "澳洲聯準會利率聲明",
    "RBA Monetary Policy Statement": "澳洲聯準會貨幣政策聲明",
    "RBA Press Conference": "澳洲聯準會記者會",
    "ISM Manufacturing PMI": "ISM 製造業 PMI",
    "ISM Manufacturing Prices": "ISM 製造業物價",
    "ISM Services PMI": "ISM 服務業 PMI",
    "ISM Services Prices": "ISM 服務業物價",
    "JOLTS Job Openings": "JOLTS 職缺數",
    "Prelim UoM Consumer Sentiment": "密大消費者信心初值",
    "Prelim UoM Inflation Expectations": "密大通膨預期初值",
    "Revised UoM Consumer Sentiment": "密大消費者信心終值",
    "Revised UoM Inflation Expectations": "密大通膨預期終值",
    "CB Consumer Confidence": "諮商會消費者信心",
    "Empire State Manufacturing Index": "紐約州製造業指數",
    "Philly Fed Manufacturing Index": "費城聯儲製造業指數",
    "Richmond Manufacturing Index": "里奇蒙聯儲製造業指數",
    "Crude Oil Inventories": "EIA 原油庫存",
    "Natural Gas Storage": "天然氣庫存",
    "API Weekly Statistical Bulletin": "API 原油庫存",
    "Bank Holiday": "銀行假日",
    "Daylight Saving Time Shift": "日光節約時間轉換",
    "Congressional Elections": "國會選舉",
    "Parliamentary Elections": "國會選舉",
    "Presidential Election": "總統大選",
    "Loan Officer Survey": "銀行放款調查",
    "Treasury Currency Report": "財政部匯率報告",
    "Federal Budget Balance": "聯邦預算收支",
    "Gov Budget Balance": "政府預算收支",
    "Annual Budget Release": "年度預算公布",
    "Beige Book": "褐皮書",
    "Jackson Hole Symposium": "Jackson Hole 年會",
    "G20 Meetings": "G20 會議",
    "OPEC Meetings": "OPEC 會議",
    "OPEC-JMMC Meetings": "OPEC 監督委員會會議",
    "Ivey PMI": "Ivey PMI",
    "GDT Price Index": "全球乳製品價格指數",
    "RCM/TIPP Economic Optimism": "RCM/TIPP 經濟樂觀指數",
    "Challenger Job Cuts y/y": "挑戰者裁員人數年增率",
    "Claimant Count Change": "申請失業救濟人數變化",
    "Employment Change": "就業人數變化",
    "Spanish Unemployment Change": "西班牙失業人數變化",
    "Foreign Currency Reserves": "外匯存底",
    "SECO Consumer Climate": "SECO 消費者信心",
    "Omdia Total Vehicle Sales": "Omdia 汽車銷售",
    "Construction PMI": "營建業 PMI",
    "Manufacturing PMI": "製造業 PMI",
    "Services PMI": "服務業 PMI",
    "Final Manufacturing PMI": "製造業 PMI 終值",
    "Final Services PMI": "服務業 PMI 終值",
    "Flash Manufacturing PMI": "製造業 PMI 初值",
    "Flash Services PMI": "服務業 PMI 初值",
    "RatingDog Manufacturing PMI": "RatingDog 製造業 PMI",
    "RatingDog Services PMI": "RatingDog 服務業 PMI",
    "Caixin Manufacturing PMI": "財新製造業 PMI",
    "Caixin Services PMI": "財新服務業 PMI",
    "Trade Balance": "貿易收支",
    "Goods Trade Balance": "商品貿易收支",
    "MPC Official Bank Rate": "英銀利率決議",
}

# Base names for "<base> m/m|y/y|q/q" titles.
_BASES = {
    "CPI": "CPI",
    "Core CPI": "核心 CPI",
    "CPI Flash Estimate": "CPI 快報",
    "Core CPI Flash Estimate": "核心 CPI 快報",
    "PPI": "PPI",
    "Core PPI": "核心 PPI",
    "PCE Price Index": "PCE 物價指數",
    "Core PCE Price Index": "核心 PCE 物價指數",
    "Retail Sales": "零售銷售",
    "Core Retail Sales": "核心零售銷售",
    "Average Hourly Earnings": "平均時薪",
    "Average Cash Earnings": "平均現金收入",
    "Advance GDP": "GDP 初值",
    "Prelim GDP": "GDP 修正值",
    "Final GDP": "GDP 終值",
    "GDP": "GDP",
    "Advance GDP Price Index": "GDP 物價指數初值",
    "Industrial Production": "工業生產",
    "Building Permits": "營建許可",
    "Building Approvals": "建築許可",
    "Building Consents": "建築許可",
    "Housing Starts": "新屋開工",
    "Durable Goods Orders": "耐久財訂單",
    "Core Durable Goods Orders": "核心耐久財訂單",
    "Factory Orders": "工廠訂單",
    "Construction Spending": "營建支出",
    "Consumer Credit": "消費信貸",
    "Household Spending": "家庭支出",
    "Personal Spending": "個人支出",
    "Personal Income": "個人所得",
    "Employment Change": "就業人數變化",
    "Employment Cost Index": "就業成本指數",
    "Labor Cost Index": "勞動成本指數",
    "Prelim Nonfarm Productivity": "非農生產力初值",
    "Prelim Unit Labor Costs": "單位勞動成本初值",
    "Import Prices": "進口物價",
    "Monetary Base": "貨幣基數",
    "Lloyds HPI": "Lloyds 房價指數",
    "HPI": "房價指數",
    "MI Inflation Gauge": "MI 通膨指標",
    "ANZ Commodity Prices": "ANZ 商品價格",
    "Commodity Prices": "商品價格",
    "Challenger Job Cuts": "挑戰者裁員人數",
    "M2 Money Supply": "M2 貨幣供給",
    "Wage Price Index": "薪資價格指數",
    "Trimmed Mean CPI": "截尾均值 CPI",
    "Median CPI": "中位數 CPI",
}

_SUFFIX = {"m/m": "月增率", "y/y": "年增率", "q/q": "季增率"}

_PREFIX = {
    "German": "德國",
    "French": "法國",
    "Italian": "義大利",
    "Spanish": "西班牙",
}

_SPEAKER_ROLES = (
    (r"^Fed Chair (.+)$", "聯準會主席 {}"),
    (r"^Fed Vice Chair(?: for Supervision)? (.+)$", "聯準會副主席 {}"),
    (r"^FOMC Member (.+)$", "FOMC 委員 {}"),
    (r"^ECB President (.+)$", "ECB 總裁 {}"),
    (r"^BOE Gov (.+)$", "英銀總裁 {}"),
    (r"^BOJ Gov (.+)$", "日銀總裁 {}"),
    (r"^BOC Gov (.+)$", "加拿大央行總裁 {}"),
    (r"^RBA Gov (.+)$", "澳洲聯準會總裁 {}"),
    (r"^RBA Deputy Gov (.+)$", "澳洲聯準會副總裁 {}"),
    (r"^SNB Chairman (.+)$", "瑞士央行主席 {}"),
    (r"^MPC Member (.+)$", "英銀 MPC 委員 {}"),
    (r"^German Buba President (.+)$", "德國央行總裁 {}"),
    (r"^Gov Board Member (.+)$", "瑞士央行理事 {}"),
)

_RATE_DECISIONS = (
    r"^(Official Bank Rate|Main Refinancing Rate|Cash Rate|Overnight Rate|Official Cash Rate"
    r"|BOJ Policy Rate|SNB Policy Rate)$"
)

# Importance multipliers for the 主導因素 ranking. US-specific rules only apply
# to USD events (a Canadian unemployment rate is not the US jobs report).
_US_EVENT_WEIGHTS: tuple[tuple[str, float], ...] = (
    (r"^(Federal Funds Rate|FOMC Statement|FOMC Press Conference)$", 1.65),
    (r"^Fed Chair .+ Speaks$", 1.25),
    (r"^(Core )?CPI (m/m|y/y)$", 1.5),
    (r"^(Non-Farm Employment Change|Unemployment Rate|Average Hourly Earnings m/m)$", 1.5),
    (r"^Core PCE Price Index", 1.35),
    (r"(Advance|Prelim|Final) GDP q/q$", 1.2),
    (r"^(Core )?PPI m/m$", 1.15),
    (r"^(Core )?Retail Sales m/m$", 1.15),
    (r"^ISM (Manufacturing|Services) PMI$", 1.05),
    (r"^FOMC Meeting Minutes$", 1.0),
    (r"^JOLTS Job Openings$", 0.95),
    (r"^Unemployment Claims$", 0.8),
    (r"UoM", 0.8),
    (r"^FOMC Member .+ Speaks$", 0.6),
)
_GLOBAL_EVENT_WEIGHTS: tuple[tuple[str, float], ...] = (
    (_RATE_DECISIONS, 1.3),
    (r"Speaks$", 0.7),
    (r"Bond Auction$", 0.5),
)

# Release families: grouped events at the same moment get one headline
# (None = use the matching event's own label).
_FAMILIES: tuple[tuple[str, str | None], ...] = (
    (r"^(Federal Funds Rate|FOMC Statement)$", "FOMC 利率決議"),
    (_RATE_DECISIONS, None),
    (r"^Non-Farm Employment Change$", "非農就業報告"),
    (r"^(Core )?CPI (m/m|y/y)$", "CPI 消費者物價"),
    (r"^(Core )?PPI m/m$", "PPI 生產者物價"),
    (r"^Core PCE Price Index", "PCE 物價"),
    (r"^(Core )?Retail Sales m/m$", "零售銷售"),
    (r"GDP q/q$", "GDP"),
)

_SKIP_TITLES = {"Daylight Saving Time Shift"}


@dataclass(frozen=True)
class _RawEvent:
    title: str
    country: str
    date_text: str
    time_text: str
    impact: str
    forecast: str
    previous: str
    url: str


def translate_title(title: str) -> str:
    """Best-effort Traditional Chinese label; unknown titles stay in English."""

    title = " ".join(title.split())
    if title in _TITLES:
        return _TITLES[title]
    if title.endswith(" Speaks"):
        who = title[: -len(" Speaks")]
        for pattern, template in _SPEAKER_ROLES:
            match = re.match(pattern, who)
            if match:
                return f"{template.format(match.group(1))} 談話"
        return f"{who} 談話"
    for prefix, prefix_zh in _PREFIX.items():
        if title.startswith(prefix + " "):
            rest = translate_title(title[len(prefix) + 1 :])
            return f"{prefix_zh}{rest}" if rest != title[len(prefix) + 1 :] else title
    match = re.match(r"^(.*) (m/m|y/y|q/q)$", title)
    if match and match.group(1) in _BASES:
        return f"{_BASES[match.group(1)]} {_SUFFIX[match.group(2)]}"
    if title in _BASES:
        return _BASES[title]
    match = re.match(r"^(\d+)-y Bond Auction$", title)
    if match:
        return f"{match.group(1)} 年期公債標售"
    return title


def event_weight(event: dict[str, Any]) -> float:
    title = str(event.get("title", ""))
    country = str(event.get("country", ""))
    impact = str(event.get("impact", ""))
    if impact == "Holiday":
        return 2.4 if country == "USD" else 0.0
    base = _IMPACT_WEIGHT.get(impact, 0.0) * _COUNTRY_WEIGHT.get(country, 0.35)
    rules = (_US_EVENT_WEIGHTS if country == "USD" else ()) + _GLOBAL_EVENT_WEIGHTS
    for pattern, weight in rules:
        if re.search(pattern, title):
            return base * weight
    return base


def is_data_release(event: dict[str, Any]) -> bool:
    """Numbers with a forecast/previous, as opposed to speeches or elections."""

    return bool(event.get("forecast") or event.get("previous"))


def _parse_xml(content: bytes) -> list[_RawEvent]:
    root = ET.fromstring(content)
    rows: list[_RawEvent] = []
    for node in root.findall("event"):
        rows.append(
            _RawEvent(
                title=(node.findtext("title") or "").strip(),
                country=(node.findtext("country") or "").strip().upper(),
                date_text=(node.findtext("date") or "").strip(),
                time_text=(node.findtext("time") or "").strip(),
                impact=(node.findtext("impact") or "").strip(),
                forecast=(node.findtext("forecast") or "").strip(),
                previous=(node.findtext("previous") or "").strip(),
                url=(node.findtext("url") or "").strip(),
            )
        )
    return rows


def _parse_moment(date_text: str, time_text: str) -> tuple[date | None, int | None]:
    try:
        day = datetime.strptime(date_text, "%m-%d-%Y").date()
    except ValueError:
        return None, None
    match = re.match(r"^(\d{1,2}):(\d{2})\s*([ap]m)$", time_text.lower())
    if not match:
        return day, None
    hour = int(match.group(1)) % 12 + (12 if match.group(3) == "pm" else 0)
    moment = datetime(day.year, day.month, day.day, hour, int(match.group(2)), tzinfo=timezone.utc)
    return day, int(moment.timestamp())


def _time_label(time_text: str) -> str:
    lowered = time_text.lower()
    if lowered == "all day":
        return "全天"
    if lowered == "tentative":
        return "時間未定"
    match = re.match(r"^day (\d+)$", lowered)
    if match:
        return f"第 {match.group(1)} 天"
    return time_text or "時間未定"


def holiday_note(event: dict[str, Any]) -> str | None:
    if event.get("impact") != "Holiday" or event.get("title") != "Bank Holiday":
        return None
    country = event.get("country", "")
    if country != "USD":
        return f"{COUNTRY_ZH.get(country, country)}銀行休假"
    day = date.fromisoformat(event["date"])
    # Columbus Day and Veterans Day close the bond market but not NYSE.
    bonds_only = (day.month == 11 and day.day == 11) or (
        day.month == 10 and day.weekday() == 0 and 8 <= day.day <= 14
    )
    return "美股照常交易、債市休市，流動性較差" if bonds_only else "美股與債市休市"


def parse_calendar(content: bytes) -> list[dict[str, Any]]:
    """Parse the Forex Factory XML into display-ready events (Taipei dates)."""

    events: list[dict[str, Any]] = []
    for raw in _parse_xml(content):
        if not raw.title or raw.title in _SKIP_TITLES:
            continue
        day, timestamp = _parse_moment(raw.date_text, raw.time_text)
        if day is None:
            continue
        if timestamp is not None:
            local = datetime.fromtimestamp(timestamp, TAIPEI)
            local_date = local.date()
            label = local.strftime("%H:%M")
        else:
            local_date = day
            label = _time_label(raw.time_text)
        key = f"{raw.title}|{raw.country}|{raw.date_text}|{raw.time_text}"
        event = {
            "id": hashlib.sha1(key.encode()).hexdigest()[:12],
            "title": raw.title,
            "title_zh": translate_title(raw.title),
            "country": raw.country,
            "country_zh": COUNTRY_ZH.get(raw.country, raw.country),
            "impact": raw.impact,
            "timestamp": timestamp,
            "source_date": day.isoformat(),
            "date": local_date.isoformat(),
            "weekday": WEEKDAY_ZH[local_date.weekday()],
            "time_label": label,
            "forecast": raw.forecast,
            "previous": raw.previous,
            "url": raw.url or None,
        }
        events.append(event)
    events.sort(key=lambda item: (item["date"], item["timestamp"] or 0, item["title"]))
    return events


def week_monday(events: list[dict[str, Any]]) -> date | None:
    """Monday of the Forex Factory week (weeks run Sunday-Saturday, US Eastern)."""

    sundays: dict[date, int] = {}
    for event in events:
        if event.get("timestamp") is not None:
            day = datetime.fromtimestamp(int(event["timestamp"]), EASTERN).date()
        else:
            day = date.fromisoformat(event["source_date"])
        sunday = day - timedelta(days=(day.weekday() + 1) % 7)
        sundays[sunday] = sundays.get(sunday, 0) + 1
    if not sundays:
        return None
    sunday = max(sundays.items(), key=lambda item: (item[1], item[0]))[0]
    return sunday + timedelta(days=1)


def week_label(monday: date) -> str:
    friday = monday + timedelta(days=4)
    start = f"{monday.strftime('%b').upper()} {monday.day}"
    if friday.month == monday.month:
        return f"{start}–{friday.day}"
    return f"{start} – {friday.strftime('%b').upper()} {friday.day}"


def _family(events: list[dict[str, Any]]) -> str | None:
    for pattern, label in _FAMILIES:
        for event in events:
            if re.search(pattern, str(event.get("title", ""))):
                return label or str(event.get("title_zh") or event.get("title"))
    return None


def rank_factors(events: list[dict[str, Any]], limit: int = 5) -> list[dict[str, Any]]:
    """Group simultaneous releases per country and rank by importance."""

    groups: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for event in events:
        if event_weight(event) <= 0 or event.get("impact") == "Low":
            continue
        moment = str(event["timestamp"]) if event.get("timestamp") is not None else event["date"]
        groups.setdefault((event["country"], moment), []).append(event)

    factors: list[dict[str, Any]] = []
    for (country, moment), members in groups.items():
        members = sorted(members, key=event_weight, reverse=True)
        lead = members[0]
        score = event_weight(lead) + 0.15 * sum(event_weight(item) > 0.5 for item in members[1:])
        family = _family(members)
        name = family or lead["title_zh"]
        factors.append(
            {
                "id": f"{country}-{moment}",
                "title": f"{lead['country_zh']} {name}",
                "country": country,
                "country_zh": lead["country_zh"],
                "impact": lead["impact"],
                "timestamp": lead.get("timestamp"),
                "date": lead["date"],
                "weekday": lead["weekday"],
                "time_label": lead["time_label"],
                "score": round(score, 3),
                "holiday_note": holiday_note(lead),
                "event_ids": [item["id"] for item in members],
            }
        )
    factors.sort(key=lambda item: item["score"], reverse=True)
    top = factors[:limit]
    for rank, factor in enumerate(top, start=1):
        factor["rank"] = rank
    return top
