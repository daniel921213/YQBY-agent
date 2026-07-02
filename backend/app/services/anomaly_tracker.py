"""In-memory lifecycle tracker for anomaly alerts.

The scoring engine is stateless — every scan is recomputed from scratch — so on
its own it can only ever show "this is anomalous right now". This tracker adds
the time dimension the dashboard needs: when an alert was first seen, the price
back then, how the price has moved since, and how many scans it has persisted
through. It also keeps a short rolling history of resolved alerts (for 歷史紀錄)
and of the altseason index (for a "vs 稍早" delta).

Deliberately in-memory + thread-safe, matching the project's no-DB design. State
is lost on restart; swap in SQLite if durable history is ever needed.
"""

from __future__ import annotations

import threading
import time
from collections import deque
from dataclasses import dataclass, field

from app.schemas.scoring import (
    AltseasonIndex,
    AnomalyHistoryItem,
    FrequencyTier,
    ScanItem,
)
from app.utils.numeric import pct_change

# An alert that hasn't reappeared for this long is considered resolved and moved
# to history. Generous so a single missed scan (rate limit, transient error)
# doesn't prematurely close a still-valid alert.
_STALE_AFTER_SECONDS = 1_800.0
_HISTORY_MAXLEN = 300
_ALTSEASON_SNAPSHOTS_MAXLEN = 600
# Minimum span before we expose a "previous" altseason value to compare against.
_ALTSEASON_BASELINE_MIN_SECONDS = 300.0

# "觸發次數" is a rolling 1h count, with at most one trigger logged per cooldown.
# The cooldown makes the count independent of how often the frontend polls
# (30s) — a still-live alert counts ~once per 5 min, matching the live scan
# cadence — instead of inflating with every poll.
_TRIGGER_WINDOW_SECONDS = 3_600.0
_TRIGGER_COOLDOWN_SECONDS = 300.0


def _frequency_tier(trigger_count: int) -> FrequencyTier:
    if trigger_count >= 6:
        return "high"
    if trigger_count >= 3:
        return "mid"
    return "low"


def _altseason_label(index: int) -> str:
    if index <= 12:
        return "BTC季"
    if index <= 38:
        return "偏BTC"
    if index <= 62:
        return "中性"
    if index <= 82:
        return "偏山寨"
    return "山寨季"


@dataclass
class _LiveEvent:
    symbol: str
    direction: str
    stage: str
    first_seen_ts: int
    first_seen_price: float
    last_seen_ts: int
    last_price: float
    peak_score: float = 0.0
    # Deduped trigger timestamps (pruned to the rolling window) + lifetime total.
    trigger_times: deque[int] = field(default_factory=deque)
    total_triggers: int = 0

    def register_trigger(self, now: int) -> int:
        """Log a trigger if past the cooldown, prune the window, return the
        count of triggers still inside the rolling window."""
        if not self.trigger_times or now - self.trigger_times[-1] >= _TRIGGER_COOLDOWN_SECONDS:
            self.trigger_times.append(now)
            self.total_triggers += 1
        cutoff = now - _TRIGGER_WINDOW_SECONDS
        while self.trigger_times and self.trigger_times[0] < cutoff:
            self.trigger_times.popleft()
        return len(self.trigger_times)


class AnomalyTracker:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._live: dict[tuple[str, str], _LiveEvent] = {}
        self._history: deque[AnomalyHistoryItem] = deque(maxlen=_HISTORY_MAXLEN)
        self._altseason_snapshots: deque[tuple[float, int]] = deque(
            maxlen=_ALTSEASON_SNAPSHOTS_MAXLEN
        )

    def record(self, items: list[ScanItem], now_ts: int | None = None) -> None:
        """Update lifecycle state from an authoritative scan and write the
        first-seen / change-since / trigger-count fields back onto each item."""
        now = int(time.time()) if now_ts is None else now_ts
        seen: set[tuple[str, str]] = set()

        with self._lock:
            for item in items:
                key = (item.symbol, item.direction)
                seen.add(key)
                event = self._live.get(key)
                if event is None:
                    event = _LiveEvent(
                        symbol=item.symbol,
                        direction=item.direction,
                        stage=item.stage,
                        first_seen_ts=now,
                        first_seen_price=item.price,
                        last_seen_ts=now,
                        last_price=item.price,
                        peak_score=item.score,
                    )
                    self._live[key] = event
                    is_new = True
                else:
                    event.last_seen_ts = now
                    event.last_price = item.price
                    event.stage = item.stage
                    event.peak_score = max(event.peak_score, item.score)
                    is_new = False

                windowed_triggers = event.register_trigger(now)

                item.first_seen_ts = event.first_seen_ts
                item.minutes_since_first = max(0, (now - event.first_seen_ts) // 60)
                item.first_seen_price = round(event.first_seen_price, 8)
                item.change_since_first = round(
                    pct_change(event.first_seen_price, item.price), 6
                )
                item.alert_trigger_count = windowed_triggers
                item.frequency_tier = _frequency_tier(windowed_triggers)
                item.is_new = is_new

            self._expire_stale(now, seen)

    def _expire_stale(self, now: int, seen: set[tuple[str, str]]) -> None:
        for key in [k for k in self._live if k not in seen]:
            event = self._live[key]
            if now - event.last_seen_ts < _STALE_AFTER_SECONDS:
                continue
            self._history.appendleft(
                AnomalyHistoryItem(
                    symbol=event.symbol,
                    direction=event.direction,  # type: ignore[arg-type]
                    stage=event.stage,  # type: ignore[arg-type]
                    first_seen_ts=event.first_seen_ts,
                    resolved_ts=event.last_seen_ts,
                    duration_minutes=max(
                        0, (event.last_seen_ts - event.first_seen_ts) // 60
                    ),
                    first_seen_price=round(event.first_seen_price, 8),
                    last_price=round(event.last_price, 8),
                    change_over_life=round(
                        pct_change(event.first_seen_price, event.last_price), 6
                    ),
                    peak_score=round(event.peak_score, 2),
                    trigger_count=event.total_triggers,
                )
            )
            del self._live[key]

    @property
    def history(self) -> list[AnomalyHistoryItem]:
        with self._lock:
            return list(self._history)

    def record_altseason(self, index: int) -> int | None:
        """Log the latest altseason reading; return a baseline to compare with."""
        now = time.monotonic()
        with self._lock:
            self._altseason_snapshots.append((now, index))
            for ts, value in self._altseason_snapshots:
                if now - ts >= _ALTSEASON_BASELINE_MIN_SECONDS:
                    return value
            return None

    def build_altseason(
        self, outperform: int, total: int, record: bool = True
    ) -> AltseasonIndex:
        index = round((outperform / total) * 100) if total else 50
        previous = self.record_altseason(index) if record else None
        return AltseasonIndex(
            index=index,
            label=_altseason_label(index),  # type: ignore[arg-type]
            outperform_count=outperform,
            total=total,
            previous_index=previous,
        )


anomaly_tracker = AnomalyTracker()
