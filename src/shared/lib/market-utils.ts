import type { PolymarketEvent, PolymarketMarket } from '@/entities/market/types'
import { logger } from '@/shared/lib/logger'

/** Detect placeholder outcome names (Person X, Team X, etc.) */
function looksLikePlaceholder(name: string): boolean {
  const s = name.trim()
  return /^(Person|Team|Outcome)\s+[A-Za-z0-9]+$/i.test(s) || /^Outcome\s*\d*$/i.test(s) || s.length <= 3
}

/** Convert slug segment to title (e.g. "jd-vance" -> "J.D. Vance"). */
function slugToDisplayName(slugPart: string): string {
  const s = slugPart.trim().toLowerCase().replace(/-+/g, ' ')
  if (!s) return ''
  const twoLetter = s.match(/^([a-z]{2})\s+(.+)$/)
  if (twoLetter) {
    const abbr = twoLetter[1]
    const rest = twoLetter[2]
    const restTitle = rest.replace(/\b\w/g, (c) => c.toUpperCase())
    return `${abbr[0].toUpperCase()}.${abbr[1].toUpperCase()}. ${restTitle}`
  }
  return s.replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Extract outcome name from market slug (e.g. "will-jd-vance-win-the-..." -> "J.D. Vance"). */
function outcomeNameFromSlug(slug: string | null | undefined): string {
  if (!slug || typeof slug !== 'string') return ''
  const s = slug.trim().toLowerCase()
  const match =
    s.match(/^will-(.+?)-(?:win|be|become|get|receive)/) ??
    s.match(/^(.+?)-to-win(?:-|$)/) ??
    s.match(/^who-will-(.+?)-(?:win|be)/) ??
    s.match(/^(.+?)-winner(?:-|$)/)
  if (!match || !match[1]) return ''
  const segment = match[1].trim()
  if (/^person-[a-z0-9]+$/i.test(segment) || /^team-[a-z0-9]+$/i.test(segment)) return ''
  return slugToDisplayName(segment)
}

/** Extract outcome name from market question (e.g. "Will J.D. Vance win?" -> "J.D. Vance"). */
function outcomeNameFromQuestion(question: string | null | undefined): string {
  if (!question || typeof question !== 'string') return ''
  const q = question.trim()
  const patterns = [
    /\b(?:Will\s+)?([^?]+?)\s+(?:win|won|be\s+nominee|be\s+winner|win the|wins?)\b/i,
    /([^?]+?)\s+to\s+win\b/i,
    /^([^?]+?)\s+wins\s+/i,
    /^([^?]+?)\s+be(?:comes)?\s+(?:the\s+)?(?:nominee|winner)/i,
    /^([^?]+?)\s+is\s+(?:elected|nominated)/i,
  ]
  for (const re of patterns) {
    const m = q.match(re)
    if (m && m[1]) {
      const name = m[1].trim()
      if (name.length > 2 && !looksLikePlaceholder(name)) return name
    }
  }
  const beforeQ = q.replace(/\?+$/, '').trim()
  if (beforeQ.length > 2 && !looksLikePlaceholder(beforeQ)) return beforeQ
  return ''
}

/** Display name for a market outcome (used in cards and OutcomesPanel). Resolves placeholders via slug/question. */
export function getMarketOutcomeDisplayName(market: PolymarketMarket): string {
  const raw = (market.groupItemTitle ?? market.outcome ?? '').trim()
  const fromSlug = outcomeNameFromSlug(market.slug)
  const fromQuestion = outcomeNameFromQuestion(market.question)

  if (fromSlug) return fromSlug
  let name = raw || fromQuestion
  if (!name && market.outcomePricesByOutcome) {
    const key = Object.keys(market.outcomePricesByOutcome).find((k) => k.toLowerCase() !== 'no' && k.toLowerCase() !== 'yes')
    if (key) name = key.trim()
  }
  if (!name) name = fromQuestion || (market.question ?? '').replace(/\?+$/, '').trim()
  if (looksLikePlaceholder(name) && fromQuestion && !looksLikePlaceholder(fromQuestion)) name = fromQuestion
  return name || (market.question ?? '').replace(/\?+$/, '').trim() || 'Outcome'
}

export interface OutcomeToken {
  outcome: string
  tokenId: string
  market: PolymarketMarket
}

/** Normalize token ID: Gamma may return JSON array string or ids with quotes */
function normalizeTokenId(id: string): string {
  const s = String(id).trim().replace(/^["'\s]+|["'\s]+$/g, '')
  return s
}

/** Parse clobTokenIds: can be "id1,id2", ["id1","id2"], or JSON string "[\"id1\",\"id2\"]" */
function parseClobTokenIds(raw: string | null | undefined): string[] {
  if (raw == null) return []
  if (Array.isArray(raw)) return raw.map((x) => normalizeTokenId(String(x))).filter(Boolean)
  const s = String(raw).trim()
  if (!s) return []
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s) as unknown[]
      return (Array.isArray(arr) ? arr : []).map((x) => normalizeTokenId(String(x))).filter(Boolean)
    } catch {
      // fallback to comma split
    }
  }
  return s.split(',').map((x) => normalizeTokenId(x)).filter(Boolean)
}

function parseOutcomes(raw: string | null | undefined): string[] {
  if (!raw) return []
  const s = String(raw).trim()
  if (!s) return []
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s) as unknown[]
      return (Array.isArray(arr) ? arr : []).map((x) => String(x).trim()).filter(Boolean)
    } catch {
      // fallback
    }
  }
  return s.split(',').map((x) => x.trim()).filter(Boolean)
}

export function isTradableMarket(m: PolymarketMarket): boolean {
  if (m.enableOrderBook === false) return false
  if (m.active === false) return false
  if (m.closed === true) return false
  return true
}

/** Extract outcome label and CLOB token ID for each outcome (Yes/No) in the event */
export function getEventOutcomeTokens(event: PolymarketEvent | null): OutcomeToken[] {
  if (!event?.markets?.length) return []
  const tokens: OutcomeToken[] = []
  const outcomesDefault = ['Yes', 'No']
  const tradableMarkets = event.markets.filter(isTradableMarket)
  logger.info('market-utils: getEventOutcomeTokens markets', {
    totalMarkets: event.markets.length,
    tradableMarkets: tradableMarkets.length,
  }, { component: 'market-utils', function: 'getEventOutcomeTokens' })
  for (let i = 0; i < tradableMarkets.length; i++) {
    const m = tradableMarkets[i]
    const ids = parseClobTokenIds(m.clobTokenIds)
    const outcomes = parseOutcomes(m.outcomes)
    // This app currently supports binary rows (Yes/No style). Skip malformed/non-binary token sets.
    if (ids.length < 2) {
      logger.debug('market-utils: skip market with <2 token ids', {
        marketId: m.id,
        question: m.question ?? m.groupItemTitle ?? '',
        tokenCount: ids.length,
      }, { component: 'market-utils', function: 'getEventOutcomeTokens' })
      continue
    }
    const firstOutcome = outcomes[0] ?? outcomesDefault[0]
    const secondOutcome = outcomes[1] ?? outcomesDefault[1]
    tokens.push({ outcome: firstOutcome, tokenId: ids[0], market: m })
    tokens.push({ outcome: secondOutcome, tokenId: ids[1], market: m })
  }
  logger.info('market-utils: getEventOutcomeTokens result', { tokenPairs: Math.floor(tokens.length / 2), totalTokens: tokens.length }, { component: 'market-utils', function: 'getEventOutcomeTokens' })
  return tokens
}

export function parseOutcomePrices(outcomePrices?: string | null): number[] {
  if (!outcomePrices) return [0.5, 0.5]
  const raw = String(outcomePrices).trim()
  if (!raw) return [0.5, 0.5]
  try {
    const arr = JSON.parse(raw) as unknown[]
    return arr.map((x) => {
      if (typeof x === 'number') return x
      return Number.parseFloat(String(x).replace('%', '').trim())
    })
  } catch {
    const parts = raw.split(',').map((x) => Number.parseFloat(String(x).replace('%', '').trim()))
    return parts.length ? parts : [0.5, 0.5]
  }
}

function parsePercentLike(value: unknown): number | null {
  if (value == null) return null
  const n = Number.parseFloat(String(value).replace('%', '').trim())
  if (!Number.isFinite(n)) return null
  if (n > 1 && n <= 100) return n / 100
  if (n >= 0 && n <= 1) return n
  return null
}

/** Returns current Yes probability only for tradable markets with actual pricing. */
export function getMarketYesProbability(market: PolymarketMarket): number | null {
  if (!isTradableMarket(market)) return null

  const mapped = market.outcomePricesByOutcome ?? null
  if (mapped) {
    const yesKey = Object.keys(mapped).find((k) => k.toLowerCase() === 'yes')
    const yesValue = yesKey ? parsePercentLike(mapped[yesKey]) : null
    if (yesValue != null) return yesValue
  }

  const rawPrices = typeof market.outcomePrices === 'string' ? market.outcomePrices.trim() : ''
  if (!rawPrices) return null

  const first = parsePercentLike(parseOutcomePrices(rawPrices)[0])
  if (first != null) return first

  return null
}
