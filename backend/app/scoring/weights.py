from dataclasses import dataclass


@dataclass(frozen=True)
class ScoringWeights:
    # Five-pillar factor model. Weights sum to 100 and are a starting point —
    # re-calibrate with scripts/backtest.py once the new factors have history.
    #
    # Rebalanced (2026-07): momentum + relative strength were 50/100 combined
    # yet both derive from the SAME price returns, so a coin already up big
    # double-counted its way to 推薦 after the move — the opposite of an early
    # radar. Price-only factors now total 28; order-flow / positioning factors
    # (divergence, thrust, volume, funding, ratios) total 72.
    #
    # Pillars: 市場結構 (divergence + OI), 動能 (price momentum + volume surge
    # + taker thrust), 資金費率, 多空比, 相對強弱.
    cvd_divergence: float = 16.0          # 市場結構
    open_interest_relation: float = 12.0  # 市場結構
    momentum: float = 12.0                # 動能 (1h + 4h price)
    volume_surge: float = 8.0             # 動能 (turnover expansion)
    cvd_thrust: float = 10.0              # 動能 (net aggressive flow)
    funding_extreme: float = 12.0         # 資金費率
    participant_contrast: float = 14.0    # 多空比
    relative_strength: float = 16.0       # 相對 BTC 強弱 (alpha vs beta)


DEFAULT_WEIGHTS = ScoringWeights()


# Confluence multiplier: a high score must come from several agreeing pillars,
# not one factor screaming. Keyed by how many of the 5 pillars point the same way.
CONFLUENCE_MULTIPLIER = {0: 0.0, 1: 0.5, 2: 0.75, 3: 1.0, 4: 1.1, 5: 1.2}
# A pillar "agrees" when its directional strength clears this bar.
CONFLUENCE_STRENGTH_THRESHOLD = 0.5
