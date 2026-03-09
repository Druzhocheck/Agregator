import type { PolymarketEvent, PolymarketMarket } from '@/entities/market/types'
import { logger } from '@/shared/lib/logger'

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

function isTradableMarket(m: PolymarketMarket): boolean {
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
