import { useMemo, Fragment, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { fetchUnifiedEvents, type PlatformFilter } from '@/shared/api/aggregated-markets'
import {
  fetchPredictMarketById,
  fetchPredictMarketStats,
  fetchPredictOrderbook,
  getPredictMarketEndDate,
  getPredictOrderbookPrices,
} from '@/shared/api/predict'
import type { EventsOrder } from '@/shared/api/polymarket'
import type { PolymarketEvent, UnifiedEvent } from '@/entities/market/types'
import { getMarketOutcomeDisplayName, getMarketYesProbability, isTradableMarket } from '@/shared/lib/market-utils'
import { getPlatformLogoUrl, getPlatformLabel } from '@/shared/lib/platform-utils'
import { unifiedEventMatchesQuery } from '@/shared/lib/unified-event-matching'

const PAGE_SIZE = 48

function formatCompactUsd(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—'
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`
  return `$${value.toFixed(0)}`
}

function formatOutcomePct(p: number): string {
  const pct = Math.round(p * 100)
  if (pct === 0 || (pct > 0 && pct < 1)) return '<1%'
  return `${pct}%`
}

function getTopTwoOutcomes(event: PolymarketEvent): { name: string; prob: number }[] | null {
  const markets = event.markets ?? []
  if (markets.length < 2) return null
  const withProb = markets
    .filter((m) => isTradableMarket(m) && m.clobTokenIds && String(m.clobTokenIds).split(',').length >= 2)
    .map((m) => ({ name: getMarketOutcomeDisplayName(m) || 'Outcome', prob: getMarketYesProbability(m) }))
    .filter((x): x is { name: string; prob: number } => Boolean(x.name) && x.prob != null && x.prob >= 0)
  if (withProb.length < 2) return null
  withProb.sort((a, b) => b.prob - a.prob)
  return withProb.slice(0, 2)
}

function getTopTwoFromUnified(u: UnifiedEvent): { name: string; prob: number }[] | null {
  const poly = u.instances.find((i) => i.platform === 'polymarket')?.event as PolymarketEvent | undefined
  if (poly?.markets) return getTopTwoOutcomes(poly)
  return null
}

function MarketCard({ event }: { event: UnifiedEvent }) {
  const navigate = useNavigate()
  const prices = { yes: event.aggregated.yesPrice, no: event.aggregated.noPrice }
  const topTwo = getTopTwoFromUnified(event)
  const firstPredictMarketId = Number(
    event.instances.find((instance) => instance.platform === 'predict')?.platformId ?? NaN
  )
  const shouldFetchPredictMeta =
    event.platforms.length === 1 &&
    event.platforms[0] === 'predict' &&
    (!event.aggregated.volume || !event.aggregated.endDate || Math.abs((event.aggregated.yesPrice ?? 0.5) - 0.5) < 0.001)
  const { data: predictMeta } = useQuery({
    queryKey: ['market-card-predict-meta', event.canonicalId, firstPredictMarketId],
    queryFn: async () => {
      if (!Number.isFinite(firstPredictMarketId)) return null
      const [market, stats, orderbook] = await Promise.all([
        fetchPredictMarketById(firstPredictMarketId),
        fetchPredictMarketStats(firstPredictMarketId),
        fetchPredictOrderbook(firstPredictMarketId),
      ])
      const prices = getPredictOrderbookPrices(orderbook)
      return {
        volume: stats?.volumeTotalUsd ?? 0,
        endDate: market ? getPredictMarketEndDate(market) : null,
        yesPrice: prices.yesPrice,
        noPrice: prices.noPrice,
      }
    },
    enabled: shouldFetchPredictMeta && Number.isFinite(firstPredictMarketId),
    staleTime: 60_000,
  })
  const vol = event.aggregated.volume || predictMeta?.volume || 0
  const endDate = event.aggregated.endDate || predictMeta?.endDate || null
  const displayPrices =
    event.platforms.length === 1 && event.platforms[0] === 'predict' && predictMeta
      ? { yes: predictMeta.yesPrice, no: predictMeta.noPrice }
      : prices

  const handleYes = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    navigate(`/market/${event.canonicalId}`, { state: { outcome: 'yes' } })
  }
  const handleNo = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    navigate(`/market/${event.canonicalId}`, { state: { outcome: 'no' } })
  }

  return (
    <Link
      to={`/market/${event.canonicalId}`}
      className="block rounded-panel overflow-hidden border border-white/10 bg-bg-secondary/80 backdrop-blur-panel p-4 transition-all duration-200 hover:border-accent-violet/30 hover:shadow-glow hover:-translate-y-0.5 w-full min-h-[140px] flex flex-col"
    >
      <div className="flex flex-col gap-2 w-full flex-1 min-h-0">
        <div className="flex items-start gap-2 w-full shrink-0">
          <div className="w-8 h-8 shrink-0 rounded bg-bg-tertiary flex items-center justify-center overflow-hidden">
            {event.aggregated.image ? (
              <img src={event.aggregated.image} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-xs text-text-muted">?</span>
            )}
          </div>
          <h3 className="flex-1 min-w-0 font-semibold text-text-primary line-clamp-2 text-small">{event.title}</h3>
        </div>
        {topTwo ? (
          <>
            <div className="flex-1 min-h-[8px]" aria-hidden />
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-2 gap-y-1 items-center w-full shrink-0">
              {topTwo.map((outcome, i) => (
                <Fragment key={i}>
                  <span className={i === 0 ? 'text-status-success text-tiny truncate min-w-0' : 'text-status-error text-tiny truncate min-w-0'}>{outcome.name}</span>
                  <span className="font-mono text-tiny font-medium text-right tabular-nums w-8">{formatOutcomePct(outcome.prob)}</span>
                  <div className="flex gap-1 justify-end">
                    <button type="button" onClick={handleYes} className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-[#10b981]/20 text-[#10b981] hover:bg-[#10b981]/30 border border-[#10b981]/40">Yes</button>
                    <button type="button" onClick={handleNo} className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-[#ef4444]/20 text-[#ef4444] hover:bg-[#ef4444]/30 border border-[#ef4444]/40">No</button>
                  </div>
                </Fragment>
              ))}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center w-full min-h-0 py-2">
            <div className="w-full min-w-0 h-2.5 rounded-full overflow-hidden flex self-stretch">
              <div className="h-full bg-status-success transition-all duration-300 shrink-0 min-w-[4px] flex items-center justify-center overflow-hidden" style={{ width: `${Math.max(2, displayPrices.yes * 100)}%` }}>
                {(displayPrices.yes * 100 >= 10 || displayPrices.yes >= 0.5) && <span className="text-[10px] font-mono font-semibold text-white drop-shadow-[0_0_1px_rgba(0,0,0,0.8)] whitespace-nowrap px-0.5">{formatOutcomePct(displayPrices.yes)} Yes</span>}
              </div>
              <div className="h-full bg-status-error/90 transition-all duration-300 shrink-0 min-w-[4px] flex items-center justify-center overflow-hidden" style={{ width: `${Math.max(2, displayPrices.no * 100)}%` }}>
                {(displayPrices.no * 100 >= 10 || displayPrices.yes <= 0.5) && <span className="text-[10px] font-mono font-semibold text-white drop-shadow-[0_0_1px_rgba(0,0,0,0.8)] whitespace-nowrap px-0.5">{formatOutcomePct(displayPrices.no)} No</span>}
              </div>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between gap-2 mt-auto shrink-0">
          <div className="flex gap-2">
            {event.platforms.map((platform) => (
              <img
                key={platform}
                src={getPlatformLogoUrl(platform)}
                title={getPlatformLabel(platform)}
                className="w-4 h-4 rounded-sm opacity-90"
                alt={platform}
              />
            ))}
          </div>
          <div className="flex gap-3 text-tiny text-text-muted text-right">
            <span>Vol {formatCompactUsd(vol)}</span>
            <span>Resolves {endDate ? new Date(endDate).toLocaleDateString() : '—'}</span>
          </div>
        </div>
      </div>
    </Link>
  )
}

interface MarketsGridProps {
  categorySlug?: string
  liquidityMin?: number
  endingSoon?: boolean
  highRoi?: boolean
  liveNow?: boolean
  trending?: boolean
  sort?: EventsOrder
  hideSports?: boolean
  hideCrypto?: boolean
  hidePolitics?: boolean
  searchQuery?: string
  status?: 'Active' | 'Pending' | 'Resolved' | 'All'
  platformFilter?: PlatformFilter
}

export function MarketsGrid({
  categorySlug,
  liquidityMin,
  liveNow,
  sort = 'volume',
  hideSports,
  hideCrypto,
  hidePolitics,
  searchQuery,
  status,
  platformFilter = 'all',
}: MarketsGridProps) {
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const active = status === 'Resolved' ? false : status === 'Active' || liveNow ? true : undefined
  const closed = status === 'Resolved' ? true : status === 'Active' || liveNow ? false : undefined

  const { data: events = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['unifiedEvents', { categorySlug, liquidityMin, active, closed, platformFilter, sort }],
    queryFn: () =>
      fetchUnifiedEvents({
        limit: 500,
        tag_slug: categorySlug,
        liquidity_min: liquidityMin,
        active,
        closed,
        platformFilter,
        order: sort,
        enrichPredictStats: true,
        predictPageSize: 200,
        predictMaxPages: 10,
      }),
    staleTime: 15_000,
  })

  const filtered = useMemo(() => {
    let list = [...events]
    const q = (searchQuery ?? '').toLowerCase().trim()
    if (q) list = list.filter((u) => unifiedEventMatchesQuery(u, q))
    if (hideSports) {
      list = list.filter((u) => !u.title.toLowerCase().includes('nba') && !u.title.toLowerCase().includes('sport'))
    }
    if (hideCrypto) {
      list = list.filter((u) => !u.title.toLowerCase().includes('bitcoin') && !u.title.toLowerCase().includes('crypto'))
    }
    if (hidePolitics) {
      list = list.filter((u) => !u.title.toLowerCase().includes('election') && !u.title.toLowerCase().includes('party'))
    }
    return list
  }, [events, searchQuery, hideSports, hideCrypto, hidePolitics])

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [categorySlug, liquidityMin, active, closed, platformFilter, sort, searchQuery, hideSports, hideCrypto, hidePolitics])

  useEffect(() => {
    const el = loadMoreRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return
        setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, filtered.length))
      },
      { rootMargin: '200px', threshold: 0.1 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [filtered.length])

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-28 rounded-panel bg-bg-secondary/50 animate-pulse" />
        ))}
      </div>
    )
  }
  if (isError) {
    return (
      <div className="rounded-panel bg-bg-secondary/50 border border-white/10 p-12 text-center">
        <p className="text-status-error text-body">Failed to load markets</p>
        <button type="button" onClick={() => refetch()} className="mt-2 px-4 py-2 rounded-panel bg-bg-tertiary border border-white/10 text-small hover:bg-white/5">
          Retry
        </button>
      </div>
    )
  }
  if (filtered.length === 0) {
    return (
      <div className="rounded-panel bg-bg-secondary/50 border border-white/10 p-12 text-center">
        <p className="text-text-muted text-body">No markets found</p>
      </div>
    )
  }
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.slice(0, visibleCount).map((event) => (
        <MarketCard key={event.canonicalId} event={event} />
      ))}
      </div>
      <div ref={loadMoreRef} className="min-h-[24px] flex items-center justify-center py-4">
        {visibleCount < filtered.length ? (
          <span className="text-small text-text-muted">Loading more...</span>
        ) : filtered.length > PAGE_SIZE ? (
          <span className="text-small text-text-muted">No more markets</span>
        ) : null}
      </div>
    </>
  )
}

