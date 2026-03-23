import type { PolymarketEvent, PredictMarket, UnifiedEvent } from '@/entities/market/types'
import { getMarketOutcomeDisplayName, isTradableMarket } from '@/shared/lib/market-utils'

export function normalizeMatchText(value: string | null | undefined): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/gi, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

function overlapCount(left: string[], right: string[]): number {
  const set = new Set(right)
  return left.reduce((acc, value) => acc + (set.has(value) ? 1 : 0), 0)
}

function tokenOverlap(a: string, b: string): number {
  const ta = normalizeMatchText(a).split(' ').filter((x) => x.length >= 3)
  const tb = normalizeMatchText(b).split(' ').filter((x) => x.length >= 3)
  return overlapCount(ta, tb)
}

function slugToTitle(slug: string): string {
  const acronymTokens = new Set(['nba', 'nfl', 'mlb', 'nhl', 'ufc', 'f1', 'pgl', 'usa', 'uk', 'eu', 'btc', 'eth'])
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => {
      const token = part.trim()
      if (!token) return ''
      if (acronymTokens.has(token.toLowerCase())) return token.toUpperCase()
      return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase()
    })
    .filter(Boolean)
    .join(' ')
}

function looksLikeSlugOrId(value: string): boolean {
  const s = String(value || '').trim().toLowerCase()
  if (!s) return true
  if (s.length <= 3) return true
  if (/^\d+(-\d+)?[a-z]{0,3}$/.test(s)) return true
  if (/^[a-z0-9]{2,5}$/.test(s) && !/\s/.test(s)) return true
  return false
}

export function getPredictGroupTitle(markets: PredictMarket[]): string {
  const first = markets[0]
  if (!first) return ''
  const categorySlugs = dedupe(markets.map((m) => String(m.categorySlug || '').trim()).filter(Boolean))
  const sharedCategorySlug = categorySlugs.length === 1 ? categorySlugs[0] : ''
  const question = first.question?.trim() || ''
  const title = first.title?.trim() || ''

  if (markets.length > 1 && sharedCategorySlug && !looksLikeSlugOrId(sharedCategorySlug)) {
    return slugToTitle(sharedCategorySlug)
  }

  if (question.length >= 6 && !looksLikeSlugOrId(question)) return question
  if (title.length >= 6 && !looksLikeSlugOrId(title)) return title
  if (sharedCategorySlug && !looksLikeSlugOrId(sharedCategorySlug)) return slugToTitle(sharedCategorySlug)
  if (categorySlugs[0] && !looksLikeSlugOrId(categorySlugs[0])) return slugToTitle(categorySlugs[0])
  if (question && !looksLikeSlugOrId(question)) return question
  if (title && !looksLikeSlugOrId(title)) return title
  return `Market ${first.id}`
}

export function getPredictGroupOutcomeKeys(markets: PredictMarket[]): string[] {
  return dedupe(markets.map((m) => normalizeMatchText(m.title || m.question || '')))
}

export function getPolymarketEventOutcomeKeys(event: PolymarketEvent): string[] {
  return dedupe(
    (event.markets ?? [])
      .filter(isTradableMarket)
      .map((m) => normalizeMatchText(getMarketOutcomeDisplayName(m) || m.question || ''))
  )
}

export function predictGroupMatchesPolymarketEvent(
  predictMarkets: PredictMarket[],
  polymarketEvent: PolymarketEvent
): boolean {
  if (predictMarkets.length === 0) return false

  const polyConditionIds = new Set(
    (polymarketEvent.markets ?? [])
      .map((m) => m.conditionId?.trim().toLowerCase())
      .filter((v): v is string => Boolean(v))
  )
  for (const market of predictMarkets) {
    const ids = [...(market.polymarketConditionIds ?? []), market.conditionId]
    for (const conditionId of ids) {
      const normalized = String(conditionId || '').trim().toLowerCase()
      if (normalized && polyConditionIds.has(normalized)) return true
    }
  }

  if (predictMarkets.length < 2) return false

  const predictTitle = getPredictGroupTitle(predictMarkets)
  const polyTitle = polymarketEvent.title || polymarketEvent.slug || polymarketEvent.ticker || ''
  const normalizedPredictTitle = normalizeMatchText(predictTitle)
  const normalizedPolyTitle = normalizeMatchText(polyTitle)
  const titleOk =
    normalizedPredictTitle === normalizedPolyTitle ||
    normalizedPredictTitle.includes(normalizedPolyTitle) ||
    normalizedPolyTitle.includes(normalizedPredictTitle) ||
    tokenOverlap(predictTitle, polyTitle) >= 3

  const predictOutcomeKeys = getPredictGroupOutcomeKeys(predictMarkets)
  const polyOutcomeKeys = getPolymarketEventOutcomeKeys(polymarketEvent)
  if (predictOutcomeKeys.length < 2 || polyOutcomeKeys.length < 2) return false
  const overlap = overlapCount(predictOutcomeKeys, polyOutcomeKeys)
  const minLen = Math.min(predictOutcomeKeys.length, polyOutcomeKeys.length)
  const outcomesOk = overlap >= Math.max(2, Math.ceil(minLen * 0.6))
  return titleOk && outcomesOk
}

export function getUnifiedEventSearchText(event: UnifiedEvent): string {
  const chunks: string[] = [event.title]
  for (const instance of event.instances) {
    if (instance.platform === 'polymarket') {
      const e = instance.event as PolymarketEvent
      chunks.push(e.title || '', e.ticker || '', e.slug || '')
      chunks.push(...getPolymarketEventOutcomeKeys(e))
    } else if (instance.platform === 'predict') {
      const m = instance.event as PredictMarket
      chunks.push(m.title || '', m.question || '', m.categorySlug || '')
    }
  }
  return normalizeMatchText(chunks.join(' '))
}

export function unifiedEventMatchesQuery(event: UnifiedEvent, query: string): boolean {
  const q = normalizeMatchText(query)
  if (!q) return true
  return getUnifiedEventSearchText(event).includes(q)
}
