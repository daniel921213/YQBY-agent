"""Stable market taxonomy for Yokai narrative discovery.

The universe deliberately separates long-lived sectors from their narrower
sub-sectors.  A token may belong to several narratives; this is expected and
lets the UI show, for example, STX in Bitcoin, Bitcoin L2 and BTCFi without
flattening those distinct market stories into one label.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


NarrativeGroup = Literal["INFRA", "FINANCE", "APPLICATION", "CULTURE", "ECOSYSTEM"]


@dataclass(frozen=True)
class NarrativeDefinition:
    id: str
    name: str
    english_name: str
    summary: str
    group: NarrativeGroup
    parent_id: str | None
    keywords: tuple[str, ...]
    category_terms: tuple[str, ...]
    tokens: tuple[str, ...]


NARRATIVES: tuple[NarrativeDefinition, ...] = (
    # ── Infrastructure ────────────────────────────────────────────────────
    NarrativeDefinition(
        "layer1", "Layer 1 公鏈", "LAYER 1 NETWORKS",
        "智能合約公鏈、共識網路與基礎結算層。", "INFRA", None,
        ("layer 1 blockchain", "layer1 blockchain", "smart contract platform", "new mainnet", "proof of stake blockchain"),
        ("layer 1", "smart contract platform", "proof of stake", "proof of work"),
        ("ETH", "SOL", "BNB", "AVAX", "SUI", "APT", "ADA", "TRX", "TON", "NEAR", "SEI", "INJ"),
    ),
    NarrativeDefinition(
        "layer2", "Ethereum Layer 2", "ETHEREUM SCALING",
        "Rollup、Validium 與以太坊二層擴容生態。", "INFRA", None,
        ("ethereum layer 2", "ethereum layer2", "ethereum scaling", "optimistic rollup", "zk rollup", "rollup network"),
        ("layer 2", "rollup", "optimism superchain", "zero knowledge"),
        ("ARB", "OP", "STRK", "ZK", "MANTA", "METIS", "IMX", "MNT", "POL", "SCR"),
    ),
    NarrativeDefinition(
        "zk", "ZK 零知識證明", "ZERO KNOWLEDGE",
        "ZK Rollup、證明系統與可驗證運算。", "INFRA", "layer2",
        ("zero knowledge proof", "zero-knowledge proof", "zk proof", "zk rollup", "zk-rollup", "validity proof"),
        ("zero knowledge", "zk", "zk rollup", "validity"),
        ("ZK", "STRK", "MINA", "MANTA", "POL", "LRC", "IMX", "SCR"),
    ),
    NarrativeDefinition(
        "modular", "模組化與資料可用性", "MODULAR & DATA AVAILABILITY",
        "模組化區塊鏈、資料可用性與 Rollup-as-a-Service。", "INFRA", None,
        ("modular blockchain", "data availability", "rollup as a service", "rollups as a service", "raas", "modular rollup"),
        ("data availability", "modular blockchain", "rollups-as-a-service", "rollup as a service"),
        ("TIA", "DYM", "ALT", "AVAIL", "EIGEN", "CELR"),
    ),
    NarrativeDefinition(
        "interop", "跨鏈與抽象層", "INTEROPERABILITY",
        "跨鏈通訊、橋接、Intent 與 Chain Abstraction。", "INFRA", None,
        ("cross-chain", "cross chain", "interoperability", "chain abstraction", "bridge protocol", "intent network"),
        ("cross-chain communication", "bridge governance", "chain abstraction", "intent", "interoperability"),
        ("ZRO", "W", "AXL", "ATOM", "DOT", "QNT", "OMNI", "CELR", "SYN"),
    ),
    NarrativeDefinition(
        "oracle", "預言機與鏈上數據", "ORACLE & DATA",
        "價格預言機、索引、分析與鏈上資料基礎設施。", "INFRA", None,
        ("blockchain oracle", "oracle network", "onchain data", "on-chain data", "blockchain indexing", "data indexing"),
        ("oracle", "analytics", "indexing", "data infrastructure"),
        ("LINK", "PYTH", "API3", "BAND", "TRB", "DIA", "GRT", "ARKM"),
    ),
    NarrativeDefinition(
        "depin", "DePIN 實體基礎設施", "DECENTRALIZED PHYSICAL INFRASTRUCTURE",
        "去中心化算力、儲存、無線網路與實體基礎設施。", "INFRA", None,
        ("depin", "decentralized physical infrastructure", "decentralized compute", "decentralized storage", "wireless network"),
        ("depin", "decentralized infrastructure", "physical infrastructure"),
        ("RENDER", "FIL", "AR", "THETA", "AKT", "AIOZ", "HNT", "IO", "GRASS"),
    ),
    NarrativeDefinition(
        "compute-storage", "算力與去中心化儲存", "COMPUTE & STORAGE",
        "GPU 算力、雲端、資料儲存與頻寬市場。", "INFRA", "depin",
        ("decentralized compute", "gpu marketplace", "decentralized storage", "distributed storage", "decentralized cloud", "compute network"),
        ("storage", "compute", "decentralized ai", "distributed computing"),
        ("RENDER", "FIL", "AR", "AKT", "IO", "AIOZ", "GLM", "ATH"),
    ),
    NarrativeDefinition(
        "privacy", "隱私運算", "PRIVACY COMPUTING",
        "隱私交易、資料保護與合規型隱私基礎設施。", "INFRA", None,
        ("privacy coin", "privacy protocol", "privacy blockchain", "confidential transaction", "private transaction", "encrypted balance"),
        ("privacy", "privacy coin", "privacy blockchain", "privacy infrastructure"),
        ("ZEC", "XMR", "ROSE", "SCRT", "MINA", "NYM", "AZERO"),
    ),
    NarrativeDefinition(
        "identity-wallet", "錢包與數位身分", "WALLETS & IDENTITY",
        "錢包、Account Abstraction、DID 與鏈上憑證。", "INFRA", None,
        ("account abstraction", "smart wallet", "crypto wallet", "decentralized identity", "digital identity", "onchain identity"),
        ("wallets", "account abstraction", "decentralized identifier", "identity"),
        ("SAFE", "TWT", "ENS", "C98", "ID", "CYBER", "MASK", "KEY"),
    ),

    # ── Finance ───────────────────────────────────────────────────────────
    NarrativeDefinition(
        "defi", "DeFi 去中心化金融", "DECENTRALIZED FINANCE",
        "鏈上交易、借貸、衍生品與資本效率協議。", "FINANCE", None,
        ("decentralized finance", "defi protocol", "onchain finance", "on-chain finance", "defi market"),
        ("decentralized finance", "defi"),
        ("AAVE", "UNI", "CRV", "LDO", "ENA", "MKR", "SKY", "JUP", "RAY", "DYDX", "HYPE"),
    ),
    NarrativeDefinition(
        "dex-perps", "DEX 與永續合約", "DEX & PERPETUALS",
        "現貨 DEX、AMM、聚合器與鏈上永續合約市場。", "FINANCE", "defi",
        ("decentralized exchange", "perp dex", "perpetual dex", "onchain exchange", "automated market maker", "dex aggregator"),
        ("decentralized exchange", "perpetuals", "derivatives", "automated market maker", "dex aggregator"),
        ("UNI", "JUP", "RAY", "DYDX", "HYPE", "GMX", "CAKE", "1INCH", "AERO", "SUSHI"),
    ),
    NarrativeDefinition(
        "lending", "鏈上借貸", "LENDING & CREDIT",
        "抵押借貸、CDP、信用市場與風險管理。", "FINANCE", "defi",
        ("defi lending", "lending protocol", "onchain lending", "on-chain lending", "collateralized debt", "credit protocol"),
        ("lending", "borrowing", "cdp", "rwa lending", "credit"),
        ("AAVE", "MORPHO", "COMP", "SKY", "MKR", "CRV", "ENA", "SPELL"),
    ),
    NarrativeDefinition(
        "yield", "收益與鏈上固定利率", "YIELD & FIXED INCOME",
        "收益交易、固定利率、Basis Trading 與資產管理。", "FINANCE", "defi",
        ("yield protocol", "fixed yield", "fixed income defi", "yield trading", "basis trading", "onchain yield"),
        ("yield", "yield farming", "yield aggregator", "basis trading", "fixed income"),
        ("PENDLE", "ENA", "ETHFI", "AAVE", "MORPHO", "CRV", "FXS", "SKY"),
    ),
    NarrativeDefinition(
        "stablecoins", "穩定幣與合成美元", "STABLECOINS",
        "法幣穩定幣、收益型穩定幣與合成美元。", "FINANCE", None,
        ("stablecoin", "stablecoins", "synthetic dollar", "yield bearing stablecoin", "yield-bearing stablecoin", "dollar token"),
        ("stablecoin", "synthetic dollar", "yield-bearing stablecoin", "stablecoin issuer"),
        ("ENA", "SKY", "MKR", "FXS", "USUAL", "CRV", "LQTY", "AAVE"),
    ),
    NarrativeDefinition(
        "rwa", "RWA 實體資產", "REAL WORLD ASSETS",
        "國債、股票、信貸、房地產與商品的鏈上代幣化。", "FINANCE", None,
        ("real world asset", "real-world asset", "tokenized asset", "tokenization", "tokenised asset", "rwa protocol"),
        ("real world asset", "rwa", "tokenized asset", "rwa protocol"),
        ("ONDO", "LINK", "OM", "POLYX", "PENDLE", "TRU", "PLUME", "CFG", "CHEX"),
    ),
    NarrativeDefinition(
        "tokenized-markets", "代幣化股票與國債", "TOKENIZED MARKETS",
        "代幣化股票、國債、私募信貸、黃金與商品市場。", "FINANCE", "rwa",
        ("tokenized stock", "tokenized stocks", "tokenized treasury", "tokenized treasuries", "tokenized gold", "tokenized private credit"),
        ("tokenized stock", "tokenized treasury", "tokenized gold", "tokenized private credit", "tokenized commodities"),
        ("ONDO", "PLUME", "CFG", "POLYX", "CHEX", "TRU", "PENDLE"),
    ),
    NarrativeDefinition(
        "payfi", "PayFi 與支付", "PAYMENTS & PAYFI",
        "穩定幣支付、跨境結算、支付融資與加密卡。", "FINANCE", None,
        ("payfi", "stablecoin payment", "crypto payment", "cross-border payment", "cross border payment", "crypto card"),
        ("payment solutions", "payments", "crypto card issuer", "payfi"),
        ("XRP", "XLM", "HBAR", "CELO", "ACH", "COTI", "ALGO", "HUMA", "TRX"),
    ),
    NarrativeDefinition(
        "restaking", "質押與再質押", "STAKING & RESTAKING",
        "流動性質押、再質押與共享安全協議。", "FINANCE", None,
        ("restaking", "liquid restaking", "liquid staking", "shared security", "eigenlayer", "restaked bitcoin"),
        ("restaking", "liquid restaking", "liquid staking", "restaked btc"),
        ("EIGEN", "ETHFI", "REZ", "PENDLE", "LDO", "SSV", "ANKR", "BABY", "SOLV"),
    ),
    NarrativeDefinition(
        "liquid-staking", "流動性質押", "LIQUID STAKING",
        "可交易質押憑證與鏈上質押收益市場。", "FINANCE", "restaking",
        ("liquid staking", "liquid staked", "staking derivative", "lst token", "liquid staking token"),
        ("liquid staking", "liquid staking governance", "liquid staked eth"),
        ("LDO", "JTO", "RPL", "ANKR", "SSV", "ETHFI", "PENDLE"),
    ),
    NarrativeDefinition(
        "prediction", "預測市場", "PREDICTION MARKETS",
        "事件交易、資訊市場與群體機率定價。", "FINANCE", None,
        ("prediction market", "prediction markets", "event market", "event contracts", "onchain prediction"),
        ("prediction market", "event market"),
        ("UMA", "GNO", "AZUR", "SX", "HYPE"),
    ),
    NarrativeDefinition(
        "cex", "交易所與平台幣", "EXCHANGE TOKENS",
        "中心化交易所、平台幣與交易基礎設施。", "FINANCE", None,
        ("exchange token", "centralized exchange", "crypto exchange", "exchange launchpool", "exchange launchpad"),
        ("exchange-based token", "centralized exchange", "launchpool", "launchpad"),
        ("BNB", "GT", "OKB", "LEO", "CRO", "BGB", "MX", "KCS"),
    ),

    # ── Applications ──────────────────────────────────────────────────────
    NarrativeDefinition(
        "ai", "AI 人工智慧", "ARTIFICIAL INTELLIGENCE",
        "鏈上 AI、模型、資料、推論與自治代理應用。", "APPLICATION", None,
        ("artificial intelligence", "decentralized ai", "machine learning", "crypto ai", "blockchain ai", "ai inference"),
        ("artificial intelligence", "decentralized ai", "machine learning", "ai applications"),
        ("FET", "TAO", "RENDER", "WLD", "ARKM", "AIOZ", "VIRTUAL", "KAITO", "NEAR"),
    ),
    NarrativeDefinition(
        "ai-agents", "AI Agents", "AUTONOMOUS AGENTS",
        "自治代理、Agent Framework 與機器支付經濟。", "APPLICATION", "ai",
        ("ai agent", "ai agents", "autonomous agent", "agentic", "agent framework", "machine payment"),
        ("ai agents", "ai framework", "agentic", "x402 ecosystem"),
        ("VIRTUAL", "KAITO", "COOKIE", "AIXBT", "FET", "TAO", "OLAS", "GRIFFAIN"),
    ),
    NarrativeDefinition(
        "gaming", "GameFi 鏈遊", "ONCHAIN GAMING",
        "鏈上遊戲、遊戲資產與玩家經濟。", "APPLICATION", None,
        ("blockchain game", "web3 gaming", "gamefi", "onchain game", "gaming token", "play to earn"),
        ("gaming", "gamefi", "play to earn", "game studio"),
        ("IMX", "GALA", "AXS", "SAND", "MANA", "RON", "PIXEL", "YGG", "BIGTIME", "BEAM"),
    ),
    NarrativeDefinition(
        "metaverse", "元宇宙與虛擬世界", "METAVERSE",
        "虛擬世界、數位土地與沉浸式鏈上體驗。", "APPLICATION", "gaming",
        ("metaverse", "virtual world", "digital land", "immersive world", "web3 metaverse"),
        ("metaverse", "virtual world"),
        ("SAND", "MANA", "APE", "AXS", "GALA", "ENJ", "MAGIC"),
    ),
    NarrativeDefinition(
        "nft", "NFT 與 NFTFi", "NFT & COLLECTIBLES",
        "數位收藏品、NFT 市場、借貸與資產金融化。", "APPLICATION", None,
        ("non-fungible token", "nft marketplace", "nft lending", "nftfi", "digital collectible", "collectibles fi"),
        ("nft", "nft marketplace", "nft lending", "nftfi"),
        ("BLUR", "APE", "IMX", "MAGIC", "LOOKS", "X2Y2", "MOCA"),
    ),
    NarrativeDefinition(
        "socialfi", "SocialFi 與 InfoFi", "SOCIAL & ATTENTION MARKETS",
        "社交金融、創作者經濟與注意力／資訊市場。", "APPLICATION", None,
        ("socialfi", "social finance", "infofi", "attention market", "creator economy", "social protocol"),
        ("socialfi", "creator economy", "social", "analytics"),
        ("KAITO", "COOKIE", "CYBER", "DEGEN", "MASK", "DESO", "TON"),
    ),
    NarrativeDefinition(
        "telegram-apps", "Telegram 與 Mini Apps", "TELEGRAM MINI APPS",
        "Telegram 應用、交易機器人與消費級 Mini Apps。", "APPLICATION", "socialfi",
        ("telegram app", "telegram mini app", "telegram bot", "ton mini app", "telegram trading bot"),
        ("telegram apps", "telegram bot", "ton ecosystem"),
        ("TON", "NOT", "DOGS", "CATI", "HMSTR", "MAJOR", "BANANA"),
    ),
    NarrativeDefinition(
        "desci", "DeSci 去中心化科學", "DECENTRALIZED SCIENCE",
        "研究募資、健康資料、生技與開放科學協作。", "APPLICATION", None,
        ("decentralized science", "desci", "biotech dao", "research dao", "onchain science", "bio protocol"),
        ("decentralized science", "desci", "desci healthcare"),
        ("BIO", "TRAC", "RSC", "VITA", "GENOME"),
    ),
    NarrativeDefinition(
        "ip", "IP 與創作者資產", "INTELLECTUAL PROPERTY",
        "智慧財產權代幣化、授權、版稅與內容資產。", "APPLICATION", None,
        ("intellectual property token", "tokenized ip", "onchain ip", "creator royalties", "ip protocol", "story protocol"),
        ("intellectual property", "ip", "music", "creator"),
        ("IP", "MOCA", "AUDIO", "DEGEN"),
    ),

    # ── Culture ───────────────────────────────────────────────────────────
    NarrativeDefinition(
        "meme", "Meme 迷因", "MEME CULTURE",
        "社群注意力快速聚集的迷因與文化型資產。", "CULTURE", None,
        ("meme coin", "memecoin", "meme token", "dogecoin", "shiba inu", "pepe coin"),
        ("meme", "memecoin", "dog themed", "cat themed", "politifi", "ai meme"),
        ("DOGE", "SHIB", "PEPE", "BONK", "WIF", "FLOKI", "BRETT", "PENGU", "POPCAT"),
    ),
    NarrativeDefinition(
        "gamblefi", "GambleFi 娛樂市場", "GAMBLEFI",
        "鏈上博弈、投注平台與高風險娛樂型協議。", "CULTURE", None,
        ("gamblefi", "crypto gambling", "onchain casino", "on-chain casino", "decentralized betting", "blockchain betting"),
        ("gambling", "gamblefi", "luck games", "decentralized lottery"),
        ("ROLL", "WIN", "FUN", "SX", "GNO"),
    ),
    NarrativeDefinition(
        "refi", "ReFi 氣候金融", "REGENERATIVE FINANCE",
        "碳權、氣候資產與再生型金融市場。", "CULTURE", None,
        ("regenerative finance", "refi", "tokenized carbon", "carbon credit", "climate finance", "green blockchain"),
        ("regenerative finance", "refi", "carbon credits"),
        ("C3", "KLIMA", "MCO2", "CELO", "ALGO"),
    ),

    # ── Ecosystem rotation ────────────────────────────────────────────────
    NarrativeDefinition(
        "bitcoin", "Bitcoin 生態", "BITCOIN ECOSYSTEM",
        "Bitcoin、Ordinals、Runes 與原生資產發行生態。", "ECOSYSTEM", None,
        ("bitcoin ecosystem", "ordinals", "bitcoin runes", "runes protocol", "brc-20", "bitcoin native"),
        ("bitcoin ecosystem", "ordinals", "runes", "brc-20"),
        ("BTC", "STX", "ORDI", "SATS", "RATS", "DOG", "CORE", "MERL"),
    ),
    NarrativeDefinition(
        "bitcoin-l2", "Bitcoin Layer 2", "BITCOIN SCALING",
        "Bitcoin Layer 2、Sidechain、BitVM 與可程式化執行層。", "ECOSYSTEM", "bitcoin",
        ("bitcoin layer 2", "bitcoin layer2", "bitcoin sidechain", "bitvm", "bitcoin rollup", "bitcoin scaling"),
        ("bitcoin layer 2", "bitcoin sidechain", "bitcoin scaling"),
        ("STX", "CORE", "MERL", "RIF", "BTR", "CKB"),
    ),
    NarrativeDefinition(
        "btcfi", "BTCFi 與 Bitcoin 質押", "BITCOIN FINANCE",
        "Bitcoin 借貸、收益、再質押與生產性 BTC 資本。", "ECOSYSTEM", "bitcoin",
        ("btcfi", "bitcoin defi", "bitcoin staking", "restaked bitcoin", "bitcoin lending", "bitcoin yield"),
        ("restaked btc", "decentralized btc", "anchor btc", "bitcoin finance"),
        ("BABY", "SOLV", "STX", "CORE", "BADGER", "MERL", "PENDLE"),
    ),
    NarrativeDefinition(
        "ethereum", "Ethereum 生態", "ETHEREUM ECOSYSTEM",
        "Ethereum 結算層、應用與機構採用敘事。", "ECOSYSTEM", None,
        ("ethereum ecosystem", "ethereum network", "ether staking", "ethereum upgrade", "ethereum foundation"),
        ("ethereum ecosystem", "ether.fi ecosystem"),
        ("ETH", "LDO", "AAVE", "UNI", "ENS", "ENA", "EIGEN", "ETHFI"),
    ),
    NarrativeDefinition(
        "solana", "Solana 生態", "SOLANA ECOSYSTEM",
        "Solana 應用、DeFi、支付、迷因與消費市場。", "ECOSYSTEM", None,
        ("solana ecosystem", "solana network", "solana defi", "solana foundation", "solana validator"),
        ("solana ecosystem", "solana meme", "pump.fun ecosystem"),
        ("SOL", "JUP", "RAY", "JTO", "PYTH", "BONK", "WIF", "PENGU", "GRASS"),
    ),
    NarrativeDefinition(
        "bnb", "BNB Chain 生態", "BNB CHAIN ECOSYSTEM",
        "BNB Chain、交易、Launchpool 與迷因應用。", "ECOSYSTEM", None,
        ("bnb chain ecosystem", "bnb chain", "binance smart chain", "bsc ecosystem", "four.meme"),
        ("bnb chain ecosystem", "four.meme ecosystem", "binance launchpool"),
        ("BNB", "CAKE", "TWT", "LISTA", "XVS", "FLOKI", "THE"),
    ),
    NarrativeDefinition(
        "base", "Base 生態", "BASE ECOSYSTEM",
        "Base 原生應用、SocialFi、DeFi 與消費型市場。", "ECOSYSTEM", None,
        ("base ecosystem", "base chain", "base network", "coinbase layer 2", "base app"),
        ("base ecosystem", "base native"),
        ("AERO", "DEGEN", "BRETT", "VIRTUAL", "MORPHO", "WELL"),
    ),
    NarrativeDefinition(
        "ton", "TON 生態", "TON ECOSYSTEM",
        "TON、Telegram Mini Apps、遊戲與社交應用。", "ECOSYSTEM", None,
        ("ton ecosystem", "ton blockchain", "the open network", "telegram blockchain", "ton foundation"),
        ("ton ecosystem", "ton meme", "telegram apps"),
        ("TON", "NOT", "DOGS", "CATI", "HMSTR", "MAJOR"),
    ),
)


DEFINITION_BY_ID = {item.id: item for item in NARRATIVES}
TOKEN_TO_NARRATIVES: dict[str, list[str]] = {}
for definition in NARRATIVES:
    for token in definition.tokens:
        TOKEN_TO_NARRATIVES.setdefault(token, []).append(definition.id)
