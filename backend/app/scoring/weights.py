from dataclasses import dataclass


@dataclass(frozen=True)
class ScoringWeights:
    # Five-pillar factor model. Weights sum to 100 and are a starting point —
    # re-calibrate with scripts/backtest.py once the new factors have history.
    # Pillars: 市場結構 (cvd+oi), 動能 (momentum), 資金費率, 多空比, 相對強弱.
    cvd_divergence: float = 14.0        # 市場結構
    open_interest_relation: float = 14.0  # 市場結構
    momentum: float = 20.0              # 動能 (1h + 4h)
    funding_extreme: float = 10.0       # 資金費率
    participant_contrast: float = 12.0  # 多空比
    relative_strength: float = 30.0     # 相對 BTC 強弱 (alpha vs beta)


DEFAULT_WEIGHTS = ScoringWeights()


# Confluence multiplier: a high score must come from several agreeing pillars,
# not one factor screaming. Keyed by how many of the 5 pillars point the same way.
CONFLUENCE_MULTIPLIER = {0: 0.0, 1: 0.5, 2: 0.75, 3: 1.0, 4: 1.1, 5: 1.2}
# A pillar "agrees" when its directional strength clears this bar.
CONFLUENCE_STRENGTH_THRESHOLD = 0.5
