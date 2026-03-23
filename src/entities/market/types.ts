export interface PolymarketEvent {
  id: string
  ticker?: string | null
  slug?: string | null
  title?: string | null
  subtitle?: string | null
  description?: string | null
  startDate?: string | null
  endDate?: string | null
  image?: string | null
  icon?: string | null
  active?: boolean
  closed?: boolean
  archived?: boolean
  featured?: boolean
  liquidity?: string | null
  volume?: string | null
  volumeNum?: number | null
  volumeNum24hr?: number | null
  volumeNum7d?: number | null
  liquidityNum?: number | null
  markets?: PolymarketMarket[]
  tags?: { slug?: string; label?: string }[]
}

export interface PolymarketMarket {
  id: string
  question?: string | null
  conditionId?: string | null
  slug?: string | null
  resolutionSource?: string | null
  endDate?: string | null
  liquidity?: string | null
  liquidityNum?: number | null
  volume?: string | null
  volumeNum?: number | null
  active?: boolean
  closed?: boolean
  closedTime?: string | null
  marketMakerAddress?: string | null
  outcomePrices?: string | null
  outcomePricesByOutcome?: Record<string, string> | null
  bestBid?: string | null
  bestAsk?: string | null
  groupItemTitle?: string | null
  groupItemThreshold?: string | null
  clobTokenIds?: string | null
  outcomes?: string | null
  outcome?: string | null
  enableOrderBook?: boolean
  orderPrice?: number | null
  orderType?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  image?: string | null
  icon?: string | null
  description?: string | null
  tags?: { slug?: string; label?: string }[]
  eventSlug?: string | null
  eventId?: string | null
  negRisk?: boolean
}

export interface OrderBookLevel {
  price: string
  size: string
}

export interface OrderBookSummary {
  market: string
  asset_id: string
  timestamp: string
  hash: string
  bids: OrderBookLevel[]
  asks: OrderBookLevel[]
  min_order_size: string
  tick_size: string
  neg_risk: boolean
  last_trade_price: string
}

export interface MarketCardData {
  id: string
  title: string
  slug?: string
  image?: string | null
  icon?: string | null
  yesPrice: number
  noPrice: number
  volume: number
  volumeNum?: number
  liquidityNum?: number
  endDate?: string | null
  outcomePrices?: string
  eventSlug?: string
  eventId?: string
  clobTokenIds?: string
  conditionId?: string
  outcomes?: string
  tags?: { slug?: string; label?: string }[]
}

export type PlatformId = 'polymarket' | 'predict' | 'azuro' | 'native'

/** Canonical event ID for aggregator (slug or predict-{marketId}/{categorySlug}) */
export type CanonicalEventId = string

/** Predict outcome (Yes/No style) */
export interface PredictOutcome {
  name: string
  indexSet?: number
  onChainId: string
  status?: 'WON' | 'LOST' | null
}

/** Predict market (from API) */
export interface PredictMarket {
  id: number
  imageUrl?: string
  title: string
  question: string
  description?: string
  tradingStatus: 'OPEN' | 'MATCHING_NOT_ENABLED' | 'CANCEL_ONLY' | 'CLOSED'
  status: string
  isVisible?: boolean
  isNegRisk?: boolean
  isYieldBearing?: boolean
  feeRateBps?: number
  resolution?: { name: string; indexSet: number; onChainId: string; status?: 'WON' | 'LOST' | null } | null
  oracleQuestionId?: string
  conditionId: string
  resolverAddress?: string
  outcomes: PredictOutcome[]
  questionIndex?: number | null
  spreadThreshold?: number
  shareThreshold?: number
  isBoosted?: boolean
  boostStartsAt?: string | null
  boostEndsAt?: string | null
  polymarketConditionIds?: string[]
  kalshiMarketTicker?: string | null
  /** Groups multi-outcome markets (e.g. "2026-nba-champion") — used for event aggregation */
  categorySlug?: string | null
  stats?: PredictMarketStats | null
  createdAt?: string
  decimalPrecision?: 2 | 3
  marketVariant?: string
  variantData?: unknown
}

export interface PredictMarketStats {
  totalLiquidityUsd: number
  volumeTotalUsd: number
  volume24hUsd: number
}

export interface PredictConnectedAccount {
  name: string
  address: string
  imageUrl: string | null
  referral: { code: string | null; status: 'LOCKED' | 'UNLOCKED' }
  points: { total: number }
}

/** Predict event = single market (Predict uses market as event) */
export type PredictEvent = PredictMarket

/** Event instance on a specific platform */
export interface PlatformEventInstance {
  platform: PlatformId
  platformId: string
  event: PolymarketEvent | PredictEvent
}

/** Unified event — one card per event */
export interface UnifiedEvent {
  canonicalId: CanonicalEventId
  title: string
  platforms: PlatformId[]
  instances: PlatformEventInstance[]
  aggregated: {
    volume: number
    endDate?: string | null
    image?: string | null
    yesPrice: number
    noPrice: number
  }
}
