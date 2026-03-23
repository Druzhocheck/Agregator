import { useState } from 'react'
import { Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { useQuery, useQueries } from '@tanstack/react-query'
import { fetchPositions, fetchClosedPositions, type DataPosition } from '@/shared/api/polymarket'
import {
  fetchPredictMarketById,
  fetchPredictMarketStats,
  fetchPredictPositions,
  fetchPredictPositionsByAddress,
  getPredictMarketEndDate,
  type PredictPosition,
} from '@/shared/api/predict'
import { fetchUnifiedEvents } from '@/shared/api/aggregated-markets'
import { usePredictAuth } from '@/shared/context/predict-auth-context'
import { usePolymarketProxy } from '@/shared/hooks/use-polymarket-proxy'
import { cn } from '@/shared/lib/cn'
import { resolveUnifiedPositionTarget } from '@/shared/lib/unified-position-routing'
import { getPlatformLabel, getPlatformLogoUrl } from '@/shared/lib/platform-utils'

/** Positions are loaded by proxy address (Data API), not EOA (same as reference). */
export function PositionsSection() {
  const { address, isConnected } = useAccount()
  const { jwt: predictJwtFromContext } = usePredictAuth()
  const { proxy, isLoading: proxyLoading } = usePolymarketProxy(address ?? undefined)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'open' | 'closed'>('open')
  const envPredictJwt =
    typeof import.meta !== 'undefined'
      ? ((import.meta.env as Record<string, string | undefined>).VITE_PREDICT_JWT ?? '')
      : ''
  const predictJwt = predictJwtFromContext || envPredictJwt

  const user = proxy ?? undefined

  const { data: openPositions = [], isLoading: openLoading } = useQuery({
    queryKey: ['positions', 'open', user],
    queryFn: () => fetchPositions({ user: user!, limit: 100 }),
    enabled: !!user && filter !== 'closed',
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })

  const { data: closedPositions = [], isLoading: closedLoading } = useQuery({
    queryKey: ['positions', 'closed', user],
    queryFn: () => fetchClosedPositions({ user: user!, limit: 100 }),
    enabled: !!user && filter !== 'open',
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })

  const { data: predictPositions = [], isLoading: predictLoading } = useQuery({
    queryKey: ['positions', 'predict', address, predictJwt],
    queryFn: async () => {
      if (predictJwt) return fetchPredictPositions(predictJwt, { first: 100 })
      if (address) return fetchPredictPositionsByAddress(address, { first: 100 })
      return []
    },
    enabled: !!address,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })

  const { data: unifiedEvents = [] } = useQuery({
    queryKey: ['unifiedEvents', 'positions-routing'],
    queryFn: () => fetchUnifiedEvents({ limit: 500, active: true, closed: false }),
    enabled: !!address,
    staleTime: 15_000,
  })

  type UnifiedPositionRow =
    | ({ platform: 'polymarket' } & DataPosition)
    | ({
        platform: 'predict'
        id: string
        title?: string
        outcome?: string
        size?: number
        curPrice?: number
        cashPnl?: number
        percentPnl?: number
        eventSlug?: string
        marketId?: number
        categorySlug?: string
      })

  const basePoly: UnifiedPositionRow[] =
    filter === 'open'
      ? openPositions.map((p) => ({ ...p, platform: 'polymarket' as const }))
      : filter === 'closed'
        ? closedPositions.map((p) => ({ ...p, platform: 'polymarket' as const }))
        : [...openPositions, ...closedPositions].map((p) => ({ ...p, platform: 'polymarket' as const }))

  const basePredict: Extract<UnifiedPositionRow, { platform: 'predict' }>[] = predictPositions.map((p: PredictPosition) => ({
    platform: 'predict',
    id: p.id,
    title: p.market?.question || p.market?.title,
    outcome: p.outcome?.name,
    size: Number(p.amount ?? 0),
    curPrice: undefined,
    cashPnl: undefined,
    percentPnl: undefined,
    marketId: Number(p.market?.id),
    categorySlug: p.market?.categorySlug ?? undefined,
  }))

  const predictMetaQueries = useQueries({
    queries: basePredict
      .filter((p) => p.platform === 'predict' && p.marketId != null)
      .map((p) => ({
        queryKey: ['predict-market-meta', p.marketId],
        queryFn: async () => {
          const [market, stats] = await Promise.all([
            fetchPredictMarketById(p.marketId!),
            fetchPredictMarketStats(p.marketId!),
          ])
          return {
            market,
            stats,
            marketEndDate: market ? getPredictMarketEndDate(market) : null,
          }
        },
        staleTime: 60_000,
      })),
  })

  const predictMetaByMarketId = new Map<number, { marketEndDate: string | null; statsVolume: number | null }>()
  predictMetaQueries.forEach((query) => {
    const marketId = Number((query.data?.market?.id ?? NaN))
    if (!Number.isFinite(marketId)) return
    predictMetaByMarketId.set(marketId, {
      marketEndDate: query.data?.marketEndDate ?? null,
      statsVolume: query.data?.stats?.volumeTotalUsd ?? null,
    })
  })

  const rows = [...basePoly, ...basePredict]
  const filtered = search.trim() ? rows.filter((p) => (p.title ?? '').toLowerCase().includes(search.toLowerCase())) : rows
  const isLoading =
    (isConnected && !!address && proxyLoading && !user) ||
    (filter === 'open' ? openLoading : filter === 'closed' ? closedLoading : openLoading || closedLoading) ||
    predictLoading

  return (
    <>
      <h2 className="text-h3 font-bold text-text-primary mb-4">Your Positions</h2>
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-9 pr-3 rounded-panel bg-bg-secondary border border-white/10 text-body outline-none focus:border-accent-violet/50"
          />
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as 'all' | 'open' | 'closed')}
          className="h-10 px-3 rounded-panel bg-bg-secondary border border-white/10 text-body"
        >
          <option value="open">Open</option>
          <option value="closed">Closed</option>
          <option value="all">All</option>
        </select>
      </div>

      {!isConnected || !address ? (
        <div className="rounded-panel bg-bg-secondary/80 backdrop-blur-panel border border-white/10 p-8 text-center">
          <p className="text-text-muted text-body">Connect your wallet to see positions.</p>
        </div>
      ) : isLoading ? (
        <div className="rounded-panel bg-bg-secondary/80 backdrop-blur-panel border border-white/10 p-8 text-center">
          <p className="text-text-muted text-body">Loading positions...</p>
        </div>
      ) : !proxyLoading && !user && isConnected && address ? (
        <div className="rounded-panel bg-bg-secondary/80 backdrop-blur-panel border border-white/10 p-8 text-center">
          <p className="text-text-muted text-body">No Polymarket proxy found for this wallet.</p>
          <p className="text-tiny text-text-muted mt-1">Link Polymarket in Connected Platforms to trade and see positions.</p>
          <Link to="/profile" className="mt-2 inline-block text-accent-violet hover:underline text-small">
            Go to Profile
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-panel bg-bg-secondary/80 backdrop-blur-panel border border-white/10 p-8 text-center">
          <p className="text-text-muted text-body">No positions yet.</p>
          <Link to="/" className="mt-2 inline-block text-accent-violet hover:underline text-small">
            Browse markets
          </Link>
        </div>
      ) : (
        <div className="rounded-panel bg-bg-secondary/80 backdrop-blur-panel border border-white/10 overflow-hidden">
          <div className="divide-y divide-white/5">
            {filtered.map((pos) => {
              const target =
                pos.platform === 'predict'
                  ? resolveUnifiedPositionTarget({
                      platform: 'predict',
                      marketId: pos.marketId ?? null,
                      categorySlug: pos.categorySlug ?? null,
                      title: pos.title ?? null,
                      unified: unifiedEvents,
                    })
                  : resolveUnifiedPositionTarget({
                      platform: 'polymarket',
                      eventSlug: pos.eventSlug ?? null,
                      title: pos.title ?? null,
                      unified: unifiedEvents,
                    })
              const href = target
                ? `/market/${target.canonicalId}`
                : pos.platform === 'predict' && pos.categorySlug
                  ? `/market/predict-${pos.categorySlug}`
                  : pos.platform === 'predict' && pos.marketId != null
                    ? `/market/predict-${pos.marketId}`
                  : pos.eventSlug
                    ? `/market/${pos.eventSlug}`
                    : '#'
              const state =
                pos.platform === 'predict'
                  ? {
                      preferredPlatform: 'predict',
                      predictMarketId: pos.marketId ?? null,
                      predictOutcome:
                        String(pos.outcome || '').toLowerCase() === 'no' ? 'no' : 'yes',
                    }
                  : undefined
              const keyId =
                pos.platform === 'predict'
                  ? pos.id
                  : `${pos.conditionId ?? 'condition'}-${pos.asset ?? 'asset'}`
              const avgPrice = pos.platform === 'polymarket' ? pos.avgPrice : undefined
              const targetEvent = target ? unifiedEvents.find((u) => u.canonicalId === target.canonicalId) : null
              const platformsToShow = targetEvent?.platforms?.length ? targetEvent.platforms : [pos.platform]
              const predictMeta =
                pos.platform === 'predict' && pos.marketId != null ? predictMetaByMarketId.get(pos.marketId) : null
              const resolvedVolume =
                targetEvent?.aggregated.volume && targetEvent.aggregated.volume > 0
                  ? targetEvent.aggregated.volume
                  : predictMeta?.statsVolume ?? null
              const resolvedEndDate = targetEvent?.aggregated.endDate ?? predictMeta?.marketEndDate ?? null
              return (
              <div
                key={`${pos.platform}-${keyId}`}
                className="p-4 hover:bg-white/5 flex flex-wrap items-center gap-4"
              >
                <div className="flex-1 min-w-0">
                  <Link
                    to={href}
                    state={state}
                    className="font-medium text-text-primary hover:text-accent-violet break-words"
                  >
                    {target?.title ?? pos.title ?? 'Unknown'}
                  </Link>
                  <div className="text-tiny text-text-muted mt-0.5 break-words">
                    {pos.outcome} · {pos.size != null ? pos.size.toFixed(2) : '—'} shares
                    {avgPrice != null && ` @ ${(avgPrice * 100).toFixed(1)}¢`}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-tiny text-text-muted">
                    <div className="flex items-center gap-1.5">
                      {platformsToShow.map((platform) => (
                        <img
                          key={platform}
                          src={getPlatformLogoUrl(platform)}
                          alt={getPlatformLabel(platform)}
                          title={getPlatformLabel(platform)}
                          className="w-3.5 h-3.5 rounded-sm opacity-90"
                        />
                      ))}
                    </div>
                    <span>
                      Vol {resolvedVolume != null && resolvedVolume > 0 ? `$${resolvedVolume.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}
                    </span>
                    <span>
                      Resolves {resolvedEndDate ? new Date(resolvedEndDate).toLocaleDateString() : '—'}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  {pos.curPrice != null && (
                    <span className="text-small text-text-body">{(pos.curPrice * 100).toFixed(1)}¢</span>
                  )}
                  {pos.cashPnl != null && (
                    <div className={cn('text-small font-mono', pos.cashPnl >= 0 ? 'text-status-success' : 'text-status-error')}>
                      {pos.cashPnl >= 0 ? '+' : ''}{pos.cashPnl.toFixed(2)} ({pos.percentPnl != null ? `${pos.percentPnl >= 0 ? '+' : ''}${pos.percentPnl.toFixed(1)}%` : '—'})
                    </div>
                  )}
                </div>
                <Link
                  to={href}
                  state={state}
                  className="text-small text-accent-violet hover:underline"
                >
                  View
                </Link>
              </div>
            )})}
          </div>
        </div>
      )}
    </>
  )
}
