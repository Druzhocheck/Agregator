import type {
  CanonicalEventId,
  PlatformEventInstance,
  PolymarketEvent,
  PredictMarket,
  UnifiedEvent,
} from '@/entities/market/types'
import { getPredictGroupTitle, predictGroupMatchesPolymarketEvent } from '@/shared/lib/unified-event-matching'
import { logger } from '@/shared/lib/logger'

function parsePolymarketYesPrice(event: PolymarketEvent): number {
  const market = event.markets?.[0]
  if (!market?.outcomePrices) return 0.5
  try {
    const arr = JSON.parse(market.outcomePrices) as string[]
    return arr[0] ? Number(arr[0]) : 0.5
  } catch {
    return 0.5
  }
}

function parsePredictYesPrice(market: PredictMarket): number {
  const orderbook = (market as unknown as Record<string, unknown>).orderbook
  if (orderbook && typeof orderbook === 'object') {
    const asks = (orderbook as { asks?: [number, number][] }).asks
    const bids = (orderbook as { bids?: [number, number][] }).bids
    if (asks?.[0] != null) return asks[0][0]
    if (bids?.[0] != null) return bids[0][0]
  }
  return 0.5
}

function getPolymarketConditionIds(event: PolymarketEvent): string[] {
  const ids: string[] = []
  for (const market of event.markets ?? []) {
    if (market.conditionId) ids.push(market.conditionId.trim().toLowerCase())
  }
  return ids
}

function getPredictConditionIds(market: PredictMarket): string[] {
  const ids = [...(market.polymarketConditionIds ?? [])]
  if (market.conditionId) ids.push(market.conditionId)
  return ids.map((id) => String(id || '').trim().toLowerCase()).filter(Boolean)
}

function getFirstPolymarketSlug(event: PolymarketEvent): string {
  return (event.slug ?? event.id ?? '').toString()
}

function groupPredictMarketsByEvent(markets: PredictMarket[]): Map<string, PredictMarket[]> {
  const map = new Map<string, PredictMarket[]>()
  for (const market of markets) {
    const key = market.categorySlug?.trim() || `_single_${market.id}`
    const current = map.get(key) ?? []
    current.push(market)
    map.set(key, current)
  }
  return map
}

function collectObjectNodes(root: unknown, maxDepth = 3): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  const queue: Array<{ node: unknown; depth: number }> = [{ node: root, depth: 0 }]
  while (queue.length) {
    const current = queue.shift()
    if (!current?.node || typeof current.node !== 'object' || Array.isArray(current.node)) continue
    const record = current.node as Record<string, unknown>
    out.push(record)
    if (current.depth >= maxDepth) continue
    for (const value of Object.values(record)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        queue.push({ node: value, depth: current.depth + 1 })
      }
    }
  }
  return out
}

function parsePredictNumericField(market: PredictMarket, keys: string[]): number | null {
  for (const node of collectObjectNodes(market, 3)) {
    for (const key of keys) {
      const parsed = Number(node[key])
      if (Number.isFinite(parsed) && parsed >= 0) return parsed
    }
  }
  return null
}

function parsePredictDateField(market: PredictMarket, keys: string[]): string | null {
  for (const node of collectObjectNodes(market, 3)) {
    for (const key of keys) {
      const raw = String(node[key] ?? '').trim()
      if (!raw) continue
      const ts = Date.parse(raw)
      if (Number.isFinite(ts)) return new Date(ts).toISOString()
    }
  }
  return null
}

function inferPredictDateFromDescription(markets: PredictMarket[]): string | null {
  const patterns = [
    /to ([A-Z][a-z]{2} \d{1,2}, \d{4} \d{1,2}:\d{2} [AP]M ET)/,
    /ends? at ([A-Z][a-z]{2} \d{1,2}, \d{4} \d{1,2}:\d{2} [AP]M ET)/,
    /until ([A-Z][a-z]{2} \d{1,2}, \d{4} \d{1,2}:\d{2} [AP]M ET)/,
  ]
  for (const market of markets) {
    const description = String(market.description || '')
    for (const pattern of patterns) {
      const match = description.match(pattern)
      if (!match?.[1]) continue
      const parsed = Date.parse(match[1])
      if (Number.isFinite(parsed)) return new Date(parsed).toISOString()
    }
  }
  return null
}

function getPredictGroupAggregates(markets: PredictMarket[]): { volume: number; endDate: string | null; image: string | null } {
  const volumeKeys = [
    'volumeNum',
    'volume',
    'volumeUsd',
    'volumeUSDC',
    'totalVolume',
    'liquidity',
    'volumeTotalUsd',
    'volume24hUsd',
    'totalLiquidityUsd',
  ]
  const dateKeys = ['endDate', 'endsAt', 'closeTime', 'closedAt', 'resolveDate', 'resolvesAt']
  const volumes = markets.map((m) => parsePredictNumericField(m, volumeKeys)).filter((v): v is number => v != null)
  const dates = markets.map((m) => parsePredictDateField(m, dateKeys)).filter((v): v is string => Boolean(v)).sort()
  const image = markets.find((m) => Boolean(m.imageUrl?.trim()))?.imageUrl?.trim() ?? null
  return {
    volume: volumes.reduce((sum, value) => sum + value, 0),
    endDate: dates[0] ?? inferPredictDateFromDescription(markets),
    image,
  }
}

export function buildUnifiedEvents(
  polymarketEvents: PolymarketEvent[],
  predictMarkets: PredictMarket[],
  options?: { enableHeuristic?: boolean }
): UnifiedEvent[] {
  const enableHeuristic = options?.enableHeuristic ?? true
  const result: UnifiedEvent[] = []
  const usedPolymarketIds = new Set<string>()
  const polyByConditionId = new Map<string, PolymarketEvent>()
  const polyBySlug = new Map<string, PolymarketEvent>()

  for (const event of polymarketEvents) {
    const slugKey = String(event.slug || '').trim().toLowerCase()
    if (slugKey && !polyBySlug.has(slugKey)) polyBySlug.set(slugKey, event)
    for (const conditionId of getPolymarketConditionIds(event)) {
      if (!polyByConditionId.has(conditionId)) polyByConditionId.set(conditionId, event)
    }
  }

  const predictGroups = groupPredictMarketsByEvent(predictMarkets)

  for (const [groupKey, groupMarkets] of predictGroups) {
    let matchedPoly: PolymarketEvent | null = null

    for (const market of groupMarkets) {
      for (const conditionId of getPredictConditionIds(market)) {
        const poly = polyByConditionId.get(conditionId)
        if (poly) {
          matchedPoly = poly
          break
        }
      }
      if (matchedPoly) break
    }

    if (!matchedPoly) {
      const bySlug = polyBySlug.get(String(groupKey || '').trim().toLowerCase())
      if (bySlug) matchedPoly = bySlug
    }

    if (!matchedPoly && enableHeuristic) {
      matchedPoly =
        polymarketEvents
          .filter((event) => !usedPolymarketIds.has(event.id))
          .find((event) => predictGroupMatchesPolymarketEvent(groupMarkets, event)) ?? null
    }

    if (matchedPoly) {
      const polySlug = getFirstPolymarketSlug(matchedPoly)
      const predictInstances: PlatformEventInstance[] = groupMarkets.map((market) => ({
        platform: 'predict',
        platformId: String(market.id),
        event: market,
      }))
      result.push({
        canonicalId: polySlug,
        title: matchedPoly.title ?? matchedPoly.ticker ?? matchedPoly.id ?? '',
        platforms: ['polymarket', 'predict'],
        instances: [{ platform: 'polymarket', platformId: polySlug, event: matchedPoly }, ...predictInstances],
        aggregated: {
          volume: matchedPoly.volumeNum ?? Number(matchedPoly.volume ?? 0) ?? 0,
          endDate: matchedPoly.endDate ?? matchedPoly.markets?.[0]?.endDate ?? null,
          image: matchedPoly.image ?? matchedPoly.markets?.[0]?.image ?? null,
          yesPrice: parsePolymarketYesPrice(matchedPoly),
          noPrice: 1 - parsePolymarketYesPrice(matchedPoly),
        },
      })
      usedPolymarketIds.add(matchedPoly.id)
      continue
    }

    const first = groupMarkets[0]
    if (!first) continue
    const isGrouped = !groupKey.startsWith('_single_')
    const canonicalId: CanonicalEventId = isGrouped ? `predict-${groupKey}` : `predict-${first.id}`
    const aggregated = getPredictGroupAggregates(groupMarkets)
    const yes = parsePredictYesPrice(first)
    result.push({
      canonicalId,
      title: getPredictGroupTitle(groupMarkets) || first.question || first.title || String(first.id),
      platforms: ['predict'],
      instances: groupMarkets.map((market) => ({ platform: 'predict', platformId: String(market.id), event: market })),
      aggregated: {
        volume: aggregated.volume,
        endDate: aggregated.endDate,
        image: aggregated.image ?? first.imageUrl ?? null,
        yesPrice: yes,
        noPrice: 1 - yes,
      },
    })
  }

  for (const event of polymarketEvents) {
    if (usedPolymarketIds.has(event.id)) continue
    const slug = getFirstPolymarketSlug(event)
    const yes = parsePolymarketYesPrice(event)
    result.push({
      canonicalId: slug,
      title: event.title ?? event.ticker ?? event.id ?? '',
      platforms: ['polymarket'],
      instances: [{ platform: 'polymarket', platformId: slug, event }],
      aggregated: {
        volume: event.volumeNum ?? Number(event.volume ?? 0) ?? 0,
        endDate: event.endDate ?? event.markets?.[0]?.endDate ?? null,
        image: event.image ?? event.markets?.[0]?.image ?? null,
        yesPrice: yes,
        noPrice: 1 - yes,
      },
    })
  }

  return result
}

export async function resolveUnifiedEvent(
  canonicalId: string,
  fetchers: {
    fetchPolymarketEventBySlug?: (slug: string) => Promise<PolymarketEvent | null>
    fetchPredictMarketById?: (id: number) => Promise<PredictMarket | null>
    fetchPredictMarkets?: () => Promise<PredictMarket[]>
    fetchPredictMarketsByCategorySlug?: (categorySlug: string) => Promise<PredictMarket[]>
    fetchPredictOrderbook?: (marketId: number) => Promise<{ asks: { price: string }[]; bids: { price: string }[] } | null>
  }
): Promise<UnifiedEvent | null> {
  if (canonicalId.startsWith('predict-')) {
    const rest = canonicalId.replace(/^predict-/, '')
    const numericId = Number(rest)
    if (Number.isFinite(numericId) && String(numericId) === rest && fetchers.fetchPredictMarketById) {
      const market = await fetchers.fetchPredictMarketById(numericId)
      if (!market) return null
      if (market.categorySlug && fetchers.fetchPredictMarketsByCategorySlug) {
        const groupedMarkets = await fetchers.fetchPredictMarketsByCategorySlug(market.categorySlug)
        const normalizedCategory = String(market.categorySlug).trim().toLowerCase()
        const filtered = groupedMarkets.filter(
          (item) => String(item.categorySlug || '').trim().toLowerCase() === normalizedCategory
        )
        if (filtered.length) {
          const poly = fetchers.fetchPolymarketEventBySlug
            ? await fetchers.fetchPolymarketEventBySlug(market.categorySlug)
            : null
          if (poly) return { ...buildUnifiedEvents([poly], filtered, { enableHeuristic: true })[0], canonicalId }
          const aggregated = getPredictGroupAggregates(filtered)
          return {
            canonicalId,
            title: getPredictGroupTitle(filtered) || market.question || market.title || String(market.id),
            platforms: ['predict'],
            instances: filtered.map((item) => ({ platform: 'predict', platformId: String(item.id), event: item })),
            aggregated: {
              volume: aggregated.volume,
              endDate: aggregated.endDate,
              image: aggregated.image ?? filtered[0]?.imageUrl ?? null,
              yesPrice: 0.5,
              noPrice: 0.5,
            },
          }
        }
      }
      const aggregated = getPredictGroupAggregates([market])
      return {
        canonicalId,
        title: market.question || market.title || String(market.id),
        platforms: ['predict'],
        instances: [{ platform: 'predict', platformId: String(market.id), event: market }],
        aggregated: {
          volume: aggregated.volume,
          endDate: aggregated.endDate,
          image: aggregated.image ?? market.imageUrl ?? null,
          yesPrice: 0.5,
          noPrice: 0.5,
        },
      }
    }

    if (fetchers.fetchPredictMarketsByCategorySlug) {
      const markets = await fetchers.fetchPredictMarketsByCategorySlug(rest)
      const normalized = rest.trim().toLowerCase()
      const filtered = markets.filter((m) => String(m.categorySlug || '').trim().toLowerCase() === normalized)
      if (!filtered.length) return null
      const poly = fetchers.fetchPolymarketEventBySlug
        ? await fetchers.fetchPolymarketEventBySlug(rest)
        : null
      if (poly) return { ...buildUnifiedEvents([poly], filtered, { enableHeuristic: true })[0], canonicalId }
      const aggregated = getPredictGroupAggregates(filtered)
      return {
        canonicalId,
        title: getPredictGroupTitle(filtered) || rest.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        platforms: ['predict'],
        instances: filtered.map((market) => ({ platform: 'predict', platformId: String(market.id), event: market })),
        aggregated: {
          volume: aggregated.volume,
          endDate: aggregated.endDate,
          image: aggregated.image ?? filtered[0]?.imageUrl ?? null,
          yesPrice: 0.5,
          noPrice: 0.5,
        },
      }
    }
    return null
  }

  if (!fetchers.fetchPolymarketEventBySlug) return null
  const poly = await fetchers.fetchPolymarketEventBySlug(canonicalId)
  if (!poly) return null
  if (fetchers.fetchPredictMarkets) {
    try {
      const predict = await fetchers.fetchPredictMarkets()
      const merged = buildUnifiedEvents([poly], predict, { enableHeuristic: false }).find((u) => u.canonicalId === canonicalId)
      if (merged) return merged
    } catch (error) {
      logger.warn(
        'resolveUnifiedEvent: predict merge failed',
        { canonicalId, error: String(error) },
        { component: 'event-aggregation', function: 'resolveUnifiedEvent' }
      )
    }
  }
  const yes = parsePolymarketYesPrice(poly)
  return {
    canonicalId,
    title: poly.title ?? poly.ticker ?? poly.id ?? '',
    platforms: ['polymarket'],
    instances: [{ platform: 'polymarket', platformId: canonicalId, event: poly }],
    aggregated: {
      volume: poly.volumeNum ?? Number(poly.volume ?? 0) ?? 0,
      endDate: poly.endDate ?? poly.markets?.[0]?.endDate ?? null,
      image: poly.image ?? poly.markets?.[0]?.image ?? null,
      yesPrice: yes,
      noPrice: 1 - yes,
    },
  }
}
