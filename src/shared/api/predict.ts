import type {
  PredictMarket,
  PredictMarketStats,
  PredictConnectedAccount,
  OrderBookSummary,
  OrderBookLevel,
} from '@/entities/market/types'
import { PREDICT_API, PREDICT_API_KEY } from '@/shared/config/api'
import { ONBOARD_API } from '@/shared/api/onboard'
import { logger } from '@/shared/lib/logger'

const API_BASE = PREDICT_API

function normalizeSlug(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase()
}

function getHeaders(includeApiKey = true, jwt?: string): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (includeApiKey && PREDICT_API_KEY) h['x-api-key'] = PREDICT_API_KEY
  if (jwt) h.Authorization = `Bearer ${jwt}`
  return h
}

export interface PredictApiResponse<T> {
  success: boolean
  data?: T
  cursor?: string | null
}

function filterPredictMarketsByStatus(markets: PredictMarket[], status: 'OPEN' | 'RESOLVED'): PredictMarket[] {
  return markets.filter((m) => {
    if (m.isVisible === false) return false
    if (status === 'RESOLVED') return m.status === 'RESOLVED' || m.tradingStatus === 'CLOSED'
    return m.tradingStatus === 'OPEN'
  })
}

export interface PredictOrderbookData {
  marketId: number
  updateTimestampMs: number
  lastOrderSettled?: {
    id: string
    price: string
    kind: string
    marketId: number
    side: 'Ask' | 'Bid'
    outcome: 'Yes' | 'No'
  } | null
  asks: [number, number][]
  bids: [number, number][]
}

function normalizeOrderbookRow(row: [number, number] | { price: number; size: number }): OrderBookLevel {
  if (Array.isArray(row)) return { price: String(row[0] ?? ''), size: String(row[1] ?? '') }
  const r = row as { price: number; size: number }
  return { price: String(r?.price ?? ''), size: String(r?.size ?? '') }
}

function clampProbability(value: number): number {
  if (!Number.isFinite(value)) return 0.5
  return Math.max(0, Math.min(1, value))
}

function parseBookPrices(levels: OrderBookLevel[] | undefined, mode: 'min' | 'max'): number | null {
  const values = (levels ?? [])
    .map((level) => Number(level.price))
    .filter((price) => Number.isFinite(price) && price >= 0 && price <= 1)
  if (!values.length) return null
  return mode === 'min' ? Math.min(...values) : Math.max(...values)
}

export function getPredictOrderbookPrices(
  book: OrderBookSummary | null | undefined
): { yesPrice: number; noPrice: number } {
  const bestAskYes = parseBookPrices(book?.asks, 'min')
  const bestBidYes = parseBookPrices(book?.bids, 'max')
  const lastPrice = Number(book?.last_trade_price ?? NaN)
  const lastYes = Number.isFinite(lastPrice) ? clampProbability(lastPrice) : null

  const yesPrice = clampProbability(bestAskYes ?? bestBidYes ?? lastYes ?? 0.5)
  const noPrice = clampProbability(
    bestBidYes != null ? 1 - bestBidYes : bestAskYes != null ? 1 - bestAskYes : lastYes != null ? 1 - lastYes : 0.5
  )

  return { yesPrice, noPrice }
}

/** Fetch Predict orderbook for market. Orderbook is in Yes prices. No = complement(Yes). */
export async function fetchPredictOrderbook(marketId: number): Promise<OrderBookSummary | null> {
  const url = `${API_BASE}/v1/markets/${marketId}/orderbook`
  try {
    const res = await fetch(url, { headers: getHeaders() })
    if (!res.ok) {
      logger.warn('fetchPredictOrderbook: not ok', { marketId, status: res.status }, { component: 'predict', function: 'fetchPredictOrderbook' })
      return null
    }
    const json = (await res.json()) as PredictApiResponse<PredictOrderbookData>
    if (!json.success || !json.data) return null
    const d = json.data
    const asks = (d.asks ?? []).map(normalizeOrderbookRow)
    const bids = (d.bids ?? []).map(normalizeOrderbookRow)
    const lastPrice = d.lastOrderSettled?.price ?? ''
    return {
      market: String(d.marketId),
      asset_id: String(d.marketId),
      timestamp: String(d.updateTimestampMs ?? ''),
      hash: '',
      bids,
      asks,
      min_order_size: '1',
      tick_size: '0.01',
      neg_risk: false,
      last_trade_price: lastPrice,
    }
  } catch {
    logger.error('fetchPredictOrderbook failed', { marketId }, undefined, { component: 'predict', function: 'fetchPredictOrderbook' })
    return null
  }
}

export interface PredictMarketsParams {
  first?: number
  after?: string
  status?: 'OPEN' | 'RESOLVED'
  tagIds?: string | number[]
  sort?: string
  categorySlug?: string
  includeStats?: boolean
  statsConcurrency?: number
}

async function fetchPredictMarketsPage(
  params: PredictMarketsParams = {}
): Promise<{ data: PredictMarket[]; cursor: string | null }> {
  const search = new URLSearchParams()
  if (params.first != null) search.set('first', String(params.first))
  if (params.after) search.set('after', params.after)
  if (params.status) search.set('status', params.status)
  if (params.sort) search.set('sort', params.sort)
  if (params.tagIds != null) {
    const ids = Array.isArray(params.tagIds) ? params.tagIds : String(params.tagIds).split(',')
    ids.forEach((id) => search.append('tagIds', String(id)))
  }
  // Predict GET /v1/markets does not support categorySlug as a query filter.
  // We filter by category client-side after pagination.
  const url = `${API_BASE}/v1/markets${search.toString() ? `?${search}` : ''}`
  try {
    const res = await fetch(url, { headers: getHeaders() })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      logger.error(
        'fetchPredictMarkets failed',
        {
          url,
          status: res.status,
          statusText: res.statusText,
          hasFrontendApiKey: Boolean(PREDICT_API_KEY),
          responsePreview: body.slice(0, 300),
        },
        undefined,
        { component: 'predict', function: 'fetchPredictMarkets' }
      )
      return { data: [], cursor: null }
    }
    const json = (await res.json()) as PredictApiResponse<PredictMarket[]>
    if (!json.success || !Array.isArray(json.data)) return { data: [], cursor: null }
    return { data: json.data, cursor: json.cursor ?? null }
  } catch (e) {
    logger.error(
      'fetchPredictMarkets failed',
      { url, hasFrontendApiKey: Boolean(PREDICT_API_KEY), error: String(e) },
      undefined,
      { component: 'predict', function: 'fetchPredictMarkets' }
    )
    return { data: [], cursor: null }
  }
}

export async function fetchPredictMarkets(params: PredictMarketsParams = {}): Promise<PredictMarket[]> {
  const page = await fetchPredictMarketsPage(params)
  const status = params.status ?? 'OPEN'
  const categoryFilter = normalizeSlug(params.categorySlug)
  return filterPredictMarketsByStatus(page.data, status).filter((m) => {
    if (categoryFilter && normalizeSlug(m.categorySlug) !== categoryFilter) return false
    return true
  })
}

export async function fetchAllPredictMarkets(
  params: Omit<PredictMarketsParams, 'after' | 'first'> & { pageSize?: number; maxPages?: number } = {}
): Promise<PredictMarket[]> {
  const pageSize = params.pageSize ?? 200
  const maxPages = params.maxPages ?? 10
  const results: PredictMarket[] = []
  let after: string | undefined

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const page = await fetchPredictMarketsPage({
      ...params,
      first: pageSize,
      after,
    })
    if (page.data.length === 0) break
    results.push(...page.data)
    if (!page.cursor) break
    after = page.cursor
  }

  const status = params.status ?? 'OPEN'
  const categoryFilter = normalizeSlug(params.categorySlug)
  const filtered = filterPredictMarketsByStatus(results, status).filter((m) => {
    if (categoryFilter && normalizeSlug(m.categorySlug) !== categoryFilter) return false
    return true
  })
  if (!params.includeStats) return filtered
  return enrichPredictMarketsWithStats(filtered, params.statsConcurrency)
}

export async function enrichPredictMarketsWithStats(
  markets: PredictMarket[],
  statsConcurrency = 10
): Promise<PredictMarket[]> {
  if (!markets.length) return []
  const output = [...markets]
  let cursor = 0
  const worker = async () => {
    while (cursor < output.length) {
      const index = cursor
      cursor += 1
      const market = output[index]
      if (!market || market.stats) continue
      const stats = await fetchPredictMarketStats(market.id)
      if (stats) {
        output[index] = { ...market, stats }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(statsConcurrency, output.length) }, () => worker()))
  return output
}

function extractMarketsFromCategoryPayload(payload: unknown): PredictMarket[] {
  if (Array.isArray(payload)) return payload as PredictMarket[]
  if (!payload || typeof payload !== 'object') return []
  const record = payload as Record<string, unknown>
  const direct = record.markets
  if (Array.isArray(direct)) return direct as PredictMarket[]
  if (Array.isArray(record.data)) return record.data as PredictMarket[]
  const nestedData = record.data
  if (nestedData && typeof nestedData === 'object') {
    const nestedRecord = nestedData as Record<string, unknown>
    if (Array.isArray(nestedRecord.markets)) return nestedRecord.markets as PredictMarket[]
  }
  return []
}

export async function fetchPredictMarketsByCategorySlug(
  categorySlug: string,
  params?: { status?: 'OPEN' | 'RESOLVED' }
): Promise<PredictMarket[]> {
  const normalized = normalizeSlug(categorySlug)
  if (!normalized) return []
  const status = params?.status ?? 'OPEN'
  const url = `${API_BASE}/v1/categories/${encodeURIComponent(categorySlug)}`
  try {
    const res = await fetch(url, { headers: getHeaders() })
    if (!res.ok) {
      logger.warn(
        'fetchPredictMarketsByCategorySlug: not ok',
        { categorySlug, statusCode: res.status },
        { component: 'predict', function: 'fetchPredictMarketsByCategorySlug' }
      )
      return []
    }
    const json = (await res.json()) as PredictApiResponse<unknown>
    if (!json.success) return []
    const markets = extractMarketsFromCategoryPayload(json.data)
    return filterPredictMarketsByStatus(markets, status).filter(
      (m) => normalizeSlug(m.categorySlug) === normalized
    )
  } catch (error) {
    logger.error(
      'fetchPredictMarketsByCategorySlug failed',
      { categorySlug, error: String(error) },
      undefined,
      { component: 'predict', function: 'fetchPredictMarketsByCategorySlug' }
    )
    return []
  }
}

export interface PredictPosition {
  id: string
  market: { id: number; question?: string; title?: string; categorySlug?: string }
  outcome: { name: string; indexSet?: number; status?: 'WON' | 'LOST' | null }
  amount: string
  valueUsd: string
}

export interface PredictAuthMessage {
  message: string
}

export interface PredictBuildOrderParams {
  strategy: 'LIMIT' | 'MARKET'
  side: 'BUY' | 'SELL'
  signer: string
  tokenId: string
  quantity?: string
  amountUsd?: string
  limitPrice?: string
  slippageBps?: number
  feeRateBps?: number
  isNegRisk?: boolean
  isYieldBearing?: boolean
  marketId?: number
  orderbook?: { asks: [number, number][]; bids: [number, number][] }
}

export interface PredictBuiltOrder {
  order: Record<string, unknown>
  typedData: {
    types: Record<string, Array<{ name: string; type: string }>>
    domain: Record<string, unknown>
    message: Record<string, unknown>
    primaryType: string
  }
  hash: string
  pricePerShare: string
  makerAmount: string
  takerAmount: string
  lastPrice: string
  slippageBps: string
}

function getAuthHeaders(jwt?: string): Record<string, string> {
  return getHeaders(true, jwt)
}

async function parseJsonSafe<T>(res: Response): Promise<PredictApiResponse<T> | null> {
  try {
    return (await res.json()) as PredictApiResponse<T>
  } catch {
    return null
  }
}

function parsePredictDate(value: string): string | null {
  const raw = String(value || '').trim()
  if (!raw) return null
  const direct = Date.parse(raw)
  if (Number.isFinite(direct)) return new Date(direct).toISOString()
  const normalized = raw
    .replace(/\bET\b/g, 'America/New_York')
    .replace(/\bUTC\b/g, 'UTC')
  const second = Date.parse(normalized)
  if (Number.isFinite(second)) return new Date(second).toISOString()
  return null
}

function parsePredictDateFromText(text: string): string | null {
  const raw = String(text || '').trim()
  if (!raw) return null

  const exactPatterns = [
    /\b([A-Z][a-z]{2,8} \d{1,2}, \d{4}(?: \d{1,2}:\d{2} [AP]M ET)?)\b/,
    /\b([A-Z][a-z]{2,8} \d{1,2} \d{4})\b/,
  ]
  for (const pattern of exactPatterns) {
    const match = raw.match(pattern)
    const parsed = parsePredictDate(match?.[1] || '')
    if (parsed) return parsed
  }

  const monthYearMatch = raw.match(/\b(?:before|by|in|during|through|thru|until)?\s*([A-Z][a-z]{2,8})\s+(\d{4})\b/)
  if (monthYearMatch?.[1] && monthYearMatch[2]) {
    const monthIndex = Date.parse(`${monthYearMatch[1]} 1, ${monthYearMatch[2]}`)
    if (Number.isFinite(monthIndex)) {
      const date = new Date(monthIndex)
      const endOfMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999))
      return endOfMonth.toISOString()
    }
  }

  return null
}

function inferPredictEndDate(market: PredictMarket): string | null {
  const directCandidates = [
    (market as unknown as Record<string, unknown>).endDate,
    (market as unknown as Record<string, unknown>).endsAt,
    (market as unknown as Record<string, unknown>).resolveDate,
    (market as unknown as Record<string, unknown>).resolvesAt,
    (market as unknown as Record<string, unknown>).closeTime,
    (market as unknown as Record<string, unknown>).closedAt,
    (market.variantData as Record<string, unknown> | null)?.endDate,
    (market.variantData as Record<string, unknown> | null)?.endsAt,
  ]
  for (const candidate of directCandidates) {
    const parsed = parsePredictDate(String(candidate ?? ''))
    if (parsed) return parsed
  }

  const textCandidates = [
    String(market.description || ''),
    String(market.question || ''),
    String(market.title || ''),
    String(market.categorySlug || '').replace(/-/g, ' '),
  ]
  for (const text of textCandidates) {
    const parsed = parsePredictDateFromText(text)
    if (parsed) return parsed
  }
  return null
}

export function getPredictMarketEndDate(market: PredictMarket): string | null {
  return inferPredictEndDate(market)
}

export async function fetchPredictAuthMessage(): Promise<PredictAuthMessage | null> {
  const url = `${API_BASE}/v1/auth/message`
  try {
    const res = await fetch(url, { headers: getAuthHeaders() })
    if (!res.ok) return null
    const json = await parseJsonSafe<PredictAuthMessage>(res)
    return json?.success && json.data ? json.data : null
  } catch {
    logger.error('fetchPredictAuthMessage failed', {}, undefined, { component: 'predict', function: 'fetchPredictAuthMessage' })
    return null
  }
}

export async function createPredictJwt(params: {
  signer: string
  message: string
  signature: string
}): Promise<string | null> {
  const url = `${API_BASE}/v1/auth`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(params),
    })
    if (!res.ok) return null
    const json = await parseJsonSafe<{ token: string }>(res)
    return json?.success && json.data?.token ? json.data.token : null
  } catch {
    logger.error('createPredictJwt failed', { signer: params.signer }, undefined, { component: 'predict', function: 'createPredictJwt' })
    return null
  }
}

export async function buildPredictOrder(params: PredictBuildOrderParams): Promise<PredictBuiltOrder | null> {
  try {
    const res = await fetch(`${ONBOARD_API}/predict/build-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
    const json = await parseJsonSafe<PredictBuiltOrder>(res)
    if (!res.ok) {
      const err = (json as { error?: string } | null)?.error ?? 'Failed to build Predict order'
      throw new Error(err)
    }
    return json?.success && json.data ? json.data : null
  } catch (error) {
    logger.error('buildPredictOrder failed', { error: String(error) }, undefined, { component: 'predict', function: 'buildPredictOrder' })
    return null
  }
}

export async function createPredictOrder(
  jwt: string,
  body: {
    data: {
      order: Record<string, unknown>
      pricePerShare: string
      strategy: 'LIMIT' | 'MARKET'
      slippageBps?: string
      isFillOrKill?: boolean
    }
  }
): Promise<{ orderId: string; orderHash: string } | null> {
  if (!jwt) return null
  try {
    const res = await fetch(`${API_BASE}/v1/orders`, {
      method: 'POST',
      headers: getAuthHeaders(jwt),
      body: JSON.stringify(body),
    })
    const json = await parseJsonSafe<{ orderId: string; orderHash: string }>(res)
    if (!res.ok) {
      const err = (json as { error?: string } | null)?.error ?? 'Failed to create Predict order'
      throw new Error(err)
    }
    return json?.success && json.data ? json.data : null
  } catch (error) {
    logger.error('createPredictOrder failed', { error: String(error) }, undefined, { component: 'predict', function: 'createPredictOrder' })
    return null
  }
}

export async function fetchPredictConnectedAccount(jwt: string): Promise<PredictConnectedAccount | null> {
  if (!jwt) return null
  const url = `${API_BASE}/v1/account`
  try {
    const res = await fetch(url, { headers: getAuthHeaders(jwt) })
    if (!res.ok) return null
    const json = await parseJsonSafe<PredictConnectedAccount>(res)
    return json?.success && json.data ? json.data : null
  } catch {
    logger.error('fetchPredictConnectedAccount failed', {}, undefined, { component: 'predict', function: 'fetchPredictConnectedAccount' })
    return null
  }
}

export async function fetchPredictMarketStats(marketId: number | string): Promise<PredictMarketStats | null> {
  const id = typeof marketId === 'string' ? marketId.replace(/^predict-/, '') : String(marketId)
  const url = `${API_BASE}/v1/markets/${id}/stats`
  try {
    const res = await fetch(url, { headers: getAuthHeaders() })
    if (!res.ok) return null
    const json = await parseJsonSafe<PredictMarketStats>(res)
    return json?.success && json.data ? json.data : null
  } catch {
    logger.error('fetchPredictMarketStats failed', { marketId }, undefined, { component: 'predict', function: 'fetchPredictMarketStats' })
    return null
  }
}

export async function fetchPredictPositions(
  jwt?: string,
  params?: { first?: number; after?: string }
): Promise<PredictPosition[]> {
  if (!jwt) return []
  const search = new URLSearchParams()
  if (params?.first != null) search.set('first', String(params.first))
  if (params?.after) search.set('after', params.after)
  const url = `${API_BASE}/v1/positions${search.toString() ? `?${search}` : ''}`
  try {
    const res = await fetch(url, { headers: getHeaders(true, jwt) })
    if (!res.ok) return []
    const json = (await res.json()) as PredictApiResponse<PredictPosition[]>
    return json.success && Array.isArray(json.data) ? json.data : []
  } catch {
    logger.error('fetchPredictPositions failed', {}, undefined, { component: 'predict', function: 'fetchPredictPositions' })
    return []
  }
}

export async function fetchPredictPositionsByAddress(address: string, params?: { first?: number; after?: string }): Promise<PredictPosition[]> {
  if (!address?.startsWith('0x')) return []
  const search = new URLSearchParams()
  if (params?.first != null) search.set('first', String(params.first))
  if (params?.after) search.set('after', params.after)
  const url = `${API_BASE}/v1/positions/${address}${search.toString() ? `?${search}` : ''}`
  try {
    const res = await fetch(url, { headers: getHeaders() })
    if (!res.ok) return []
    const json = (await res.json()) as PredictApiResponse<PredictPosition[]>
    return json.success && Array.isArray(json.data) ? json.data : []
  } catch {
    logger.error('fetchPredictPositionsByAddress failed', { address }, undefined, { component: 'predict', function: 'fetchPredictPositionsByAddress' })
    return []
  }
}

export async function fetchPredictMarketById(marketId: number | string): Promise<PredictMarket | null> {
  const id = typeof marketId === 'string' ? marketId.replace(/^predict-/, '') : String(marketId)
  const url = `${API_BASE}/v1/markets/${id}`
  try {
    const res = await fetch(url, { headers: getHeaders() })
    if (!res.ok) return null
    const json = (await res.json()) as PredictApiResponse<PredictMarket>
    return json.success && json.data ? json.data : null
  } catch {
    logger.error('fetchPredictMarketById failed', { marketId }, undefined, { component: 'predict', function: 'fetchPredictMarketById' })
    return null
  }
}

