import type { EventsOrder } from '@/shared/api/polymarket'
import { fetchEvents } from '@/shared/api/polymarket'
import { fetchAllPredictMarkets } from '@/shared/api/predict'
import { buildUnifiedEvents } from '@/shared/lib/event-aggregation'
import type { PolymarketEvent, PredictMarket, UnifiedEvent } from '@/entities/market/types'
import { logger } from '@/shared/lib/logger'

export type PlatformFilter = 'all' | 'polymarket' | 'predict'

export type UnifiedEventsParams = {
  limit?: number
  offset?: number
  tag_slug?: string
  active?: boolean
  closed?: boolean
  liquidity_min?: number
  volume_min?: number
  end_date_min?: string
  end_date_max?: string
  order?: EventsOrder
  ascending?: boolean
  featured?: boolean
  platformFilter?: PlatformFilter
  enrichPredictStats?: boolean
  predictPageSize?: number
  predictMaxPages?: number
}

/** Fetch and merge Polymarket + Predict events into UnifiedEvents */
export async function fetchUnifiedEvents(params: UnifiedEventsParams = {}): Promise<UnifiedEvent[]> {
  const debugMatch =
    typeof import.meta !== 'undefined'
      ? (import.meta.env as Record<string, string | undefined>).VITE_DEBUG_MATCH === '1'
      : false
  const limit = params.limit ?? 50
  const platformFilter = params.platformFilter ?? 'all'
  const enrichPredictStats = params.enrichPredictStats ?? false
  const predictPageSize = params.predictPageSize ?? 200
  const predictMaxPages = params.predictMaxPages ?? 10
  const predictStatus = params.closed === true ? 'RESOLVED' : 'OPEN'
  const fetchPoly = platformFilter === 'all' || platformFilter === 'polymarket'
  const fetchPredict = platformFilter === 'all' || platformFilter === 'predict'

  const [polyEvents, predictMarketsResult] = await Promise.all([
    fetchPoly
      ? fetchEvents({
          limit,
          offset: params.offset ?? 0,
          tag_slug: params.tag_slug,
          active: params.active,
          closed: params.closed,
          liquidity_min: params.liquidity_min,
          volume_min: params.volume_min,
          end_date_min: params.end_date_min,
          end_date_max: params.end_date_max,
          order: params.order ?? 'volume',
          ascending: params.ascending ?? false,
          featured: params.featured,
        })
      : Promise.resolve([]),
    fetchPredict
      ? fetchAllPredictMarkets({
          status: predictStatus,
          pageSize: predictPageSize,
          maxPages: predictMaxPages,
          includeStats: enrichPredictStats,
        })
      : Promise.resolve([]),
  ])
  const predictMarkets = predictMarketsResult ?? []
  let unified = buildUnifiedEvents(polyEvents, predictMarkets, { enableHeuristic: true })
  unified = sortUnifiedEvents(unified, polyEvents, predictMarkets, params.order ?? 'volume', params.ascending ?? false)
  if (debugMatch) {
    logger.info(
      'fetchUnifiedEvents: merge result',
      {
        polyCount: polyEvents.length,
        predictCount: predictMarkets.length,
        unifiedCount: unified.length,
        multiPlatformCount: unified.filter((u: UnifiedEvent) => u.platforms.length > 1).length,
      },
      { component: 'aggregated-markets', function: 'fetchUnifiedEvents' }
    )
  }

  // Keep list endpoint lightweight: avoid N orderbook calls for all Predict-only cards.
  // Orderbook is loaded on-demand on detail page / orderbook panel.
  if (debugMatch) {
    logger.info(
      'fetchUnifiedEvents: final sample',
      { sample: unified.slice(0, 5).map((u: UnifiedEvent) => ({ canonicalId: u.canonicalId, title: u.title, platforms: u.platforms })) },
      { component: 'aggregated-markets', function: 'fetchUnifiedEvents' }
    )
    const predictMissingMeta = unified
      .filter((u) => u.platforms.length === 1 && u.platforms[0] === 'predict')
      .filter((u: UnifiedEvent) => !u.aggregated.endDate && !u.aggregated.volume)
      .slice(0, 8)
      .map((u: UnifiedEvent) => ({ canonicalId: u.canonicalId, title: u.title, instances: u.instances.length }))
    if (predictMissingMeta.length > 0) {
      logger.info(
        'fetchUnifiedEvents: predict cards without volume/endDate',
        { count: predictMissingMeta.length, sample: predictMissingMeta },
        { component: 'aggregated-markets', function: 'fetchUnifiedEvents' }
      )
    }
  }

  return unified
}

function getUnifiedCreatedAt(event: UnifiedEvent): number {
  const values = event.instances
    .map((instance) => {
      const record = instance.event as unknown as Record<string, unknown>
      const raw = String(record.createdAt ?? record.startDate ?? '').trim()
      const ts = raw ? Date.parse(raw) : NaN
      return Number.isFinite(ts) ? ts : null
    })
    .filter((v): v is number => v != null)
  return values.length ? Math.max(...values) : 0
}

function getPolymarketLiquidityValue(event: PolymarketEvent | null | undefined): number {
  if (!event) return 0
  const direct = event.liquidityNum ?? Number(event.liquidity ?? 0) ?? 0
  if (Number.isFinite(direct) && direct > 0) return direct
  const marketLiquidity = (event.markets ?? [])
    .map((market) => market.liquidityNum ?? Number(market.liquidity ?? 0) ?? 0)
    .filter((value) => Number.isFinite(value) && value > 0)
  return marketLiquidity.length ? Math.max(...marketLiquidity) : 0
}

function getPredictLiquidityValue(markets: PredictMarket[]): number {
  const values = markets
    .map((market) => market.stats?.totalLiquidityUsd ?? 0)
    .filter((value) => Number.isFinite(value) && value > 0)
  return values.length ? values.reduce((sum, value) => sum + value, 0) : 0
}

function getUnifiedLiquidity(event: UnifiedEvent): number {
  const poly = event.instances.find((instance) => instance.platform === 'polymarket')?.event as PolymarketEvent | undefined
  if (poly) return getPolymarketLiquidityValue(poly)
  const predictMarkets = event.instances
    .filter((instance) => instance.platform === 'predict')
    .map((instance) => instance.event as PredictMarket)
  return getPredictLiquidityValue(predictMarkets)
}

function sortUnifiedEvents(
  unified: UnifiedEvent[],
  _polyEvents: PolymarketEvent[],
  _predictMarkets: PredictMarket[],
  order: EventsOrder,
  ascending: boolean
): UnifiedEvent[] {
  const sorted = [...unified]
  const compare = (left: number, right: number) => (ascending ? left - right : right - left)
  sorted.sort((a, b) => {
    if (order === 'liquidity') return compare(getUnifiedLiquidity(a), getUnifiedLiquidity(b))
    if (order === 'end_date_asc') {
      const aTs = a.aggregated.endDate ? Date.parse(a.aggregated.endDate) : Number.POSITIVE_INFINITY
      const bTs = b.aggregated.endDate ? Date.parse(b.aggregated.endDate) : Number.POSITIVE_INFINITY
      return aTs - bTs
    }
    if (order === 'newest') return compare(getUnifiedCreatedAt(a), getUnifiedCreatedAt(b))
    return compare(a.aggregated.volume ?? 0, b.aggregated.volume ?? 0)
  })
  return sorted
}

