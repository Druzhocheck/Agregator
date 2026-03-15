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

export type PlatformId = 'polymarket' | 'azuro' | 'native'
