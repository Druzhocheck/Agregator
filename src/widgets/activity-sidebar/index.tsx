import { useState } from 'react'
import { useAccount } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { Wallet, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { fetchLeaderboard, fetchActivity, type LeaderboardEntry, type DataActivityItem } from '@/shared/api/polymarket'
import { usePolymarketProxy } from '@/shared/hooks/use-polymarket-proxy'
import { usePolymarketBalance } from '@/shared/hooks/use-polymarket-balance'
import { cn } from '@/shared/lib/cn'

/** Data API uses timePeriod: WEEK | MONTH | ALL (same as reference). */
export type LeaderboardPeriod = 'WEEK' | 'MONTH' | 'ALL'

const PERIODS: { label: string; value: LeaderboardPeriod }[] = [
  { label: 'Week', value: 'WEEK' },
  { label: 'Month', value: 'MONTH' },
  { label: 'All time', value: 'ALL' },
]

function truncateUsername(s: string, maxLen = 14) {
  if (!s || s.length <= maxLen) return s
  return `${s.slice(0, maxLen - 3)}...`
}

function formatTime(ts?: number) {
  if (ts == null) return '—'
  const d = new Date(typeof ts === 'number' && ts < 1e12 ? ts * 1000 : ts)
  const now = Date.now()
  const diff = now - d.getTime()
  if (diff < 60_000) return 'Just now'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`
  return d.toLocaleDateString()
}

export function ActivitySidebar() {
  const [period, setPeriod] = useState<LeaderboardPeriod>('WEEK')
  const { address, isConnected } = useAccount()
  const { proxy } = usePolymarketProxy(address ?? undefined)
  const user = proxy ?? undefined
  const { cash: proxyBalance } = usePolymarketBalance(proxy)

  const { data: activity = [], isLoading: activityLoading } = useQuery({
    queryKey: ['activity', user],
    queryFn: () => fetchActivity({ user: user!, limit: 20, sortBy: 'timestamp', sortDirection: 'desc' }),
    enabled: !!user,
  })

  const {
    data: leaderboard = [],
    isLoading: leaderboardLoading,
    isError: leaderboardError,
    refetch: refetchLeaderboard,
  } = useQuery({
    queryKey: ['leaderboard', { limit: 10, timePeriod: period }],
    queryFn: () => fetchLeaderboard({ limit: 10, timePeriod: period, orderBy: 'PNL', category: 'OVERALL' }),
    refetchInterval: 5 * 60 * 1000,
  })

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-tiny uppercase tracking-wider text-text-muted mb-3">Activity</h2>
        <div className="rounded-panel bg-bg-secondary/80 backdrop-blur-panel border border-white/10 p-4 max-h-60 overflow-y-auto scrollbar-hover">
          {!isConnected || !address ? (
            <>
              <p className="text-small text-text-muted">Connect wallet to see activity.</p>
              <p className="text-tiny text-text-muted mt-1">Recent trades and deposits will appear here.</p>
            </>
          ) : !user ? (
            <>
              <p className="text-small text-text-muted">Link Polymarket in Profile to see activity.</p>
            </>
          ) : activityLoading ? (
            <div className="flex items-center gap-2 py-2">
              <div className="h-2 w-2 rounded-full bg-accent-violet animate-pulse" />
              <span className="text-small text-text-muted">Loading…</span>
            </div>
          ) : activity.length === 0 ? (
            <>
              <p className="text-small text-text-muted">No activity yet.</p>
              <p className="text-tiny text-text-muted mt-1">Recent trades and deposits will appear here.</p>
            </>
          ) : (
            <div className="space-y-2">
              {(activity as DataActivityItem[]).slice(0, 10).map((a, i) => (
                <div key={a.id ?? a.transactionHash ?? i} className="text-tiny border-b border-white/5 pb-2 last:border-0">
                  <span className={cn('font-medium', a.side === 'BUY' ? 'text-status-success' : a.side === 'SELL' ? 'text-status-error' : 'text-text-body')}>
                    {a.type ?? a.side ?? '—'}
                  </span>
                  <span className="text-text-muted ml-2 truncate block" title={a.title}>{a.title ?? a.market ?? '—'}</span>
                  <span className="text-text-muted">{formatTime(a.timestamp)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-tiny uppercase tracking-wider text-text-muted mb-3">Leaderboard</h2>
        <div className="flex gap-2 mb-2">
          {PERIODS.map(({ label, value }) => (
            <button
              key={value}
              type="button"
              onClick={() => setPeriod(value)}
              className={cn(
                'px-2 py-1 rounded text-tiny transition-colors',
                period === value ? 'bg-accent-violet/20 text-accent-violet' : 'text-text-muted hover:bg-white/5'
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="rounded-panel bg-bg-secondary/80 backdrop-blur-panel border border-white/10 divide-y divide-white/5 max-h-80 overflow-y-auto scrollbar-hover">
          {leaderboardLoading ? (
            <div className="p-4 flex items-center justify-center gap-2">
              <div className="h-2 w-2 rounded-full bg-accent-violet animate-pulse" />
              <span className="text-small text-text-muted">Loading...</span>
            </div>
          ) : leaderboardError ? (
            <div className="p-4 text-center">
              <p className="text-small text-status-error">Failed to load leaderboard</p>
              <button
                type="button"
                onClick={() => refetchLeaderboard()}
                className="mt-2 inline-flex items-center gap-2 px-3 py-2 rounded-panel bg-bg-tertiary border border-white/10 text-small hover:bg-white/5"
              >
                <RefreshCw className="w-4 h-4" />
                Retry
              </button>
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="p-4 text-small text-text-muted">No traders yet</div>
          ) : (
            (leaderboard as LeaderboardEntry[]).slice(0, 10).map((row, i) => {
              const name = row.userName ?? row.proxyWallet ?? ''
              const displayName = truncateUsername(name)
              const pnlVal = row.pnl ?? row.vol ?? row.volume ?? 0
              return (
                <div
                  key={row.proxyWallet ?? row.userName ?? i}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors text-left"
                >
                  <span className="text-tiny text-text-muted shrink-0 w-5">
                    {i < 3 ? ['🥇', '🥈', '🥉'][i] : (row.rank ?? i + 1)}
                  </span>
                  <span
                    className="font-mono text-tiny overflow-hidden text-ellipsis whitespace-nowrap min-w-0"
                    title={name}
                  >
                    {displayName}
                  </span>
                  {(row.pnl != null || row.vol != null || row.volume != null) && (
                    <span className={cn('text-tiny shrink-0', pnlVal >= 0 ? 'text-status-success' : 'text-status-error')}>
                      {pnlVal >= 0 ? '+' : ''}${pnlVal.toLocaleString()}
                    </span>
                  )}
                </div>
              )
            })
          )}
        </div>
      </section>

      <section>
        <h2 className="text-tiny uppercase tracking-wider text-text-muted mb-3">Portfolio</h2>
        <div className="rounded-panel bg-bg-secondary/80 backdrop-blur-panel border border-white/10 p-4">
          {!isConnected || !address ? (
            <>
              <p className="text-small text-text-muted">Connect wallet to see portfolio.</p>
              <Link
                to="/profile"
                className="mt-2 inline-flex items-center gap-2 text-small text-accent-violet hover:underline"
              >
                <Wallet className="w-4 h-4" />
                Deposit
              </Link>
            </>
          ) : !user ? (
            <>
              <p className="text-small text-text-muted">Link Polymarket in Profile to see portfolio.</p>
              <Link
                to="/profile"
                className="mt-2 inline-flex items-center gap-2 text-small text-accent-violet hover:underline"
              >
                <Wallet className="w-4 h-4" />
                Link Polymarket
              </Link>
            </>
          ) : (
            <>
              <p className="text-small text-text-primary font-mono">Proxy: ${typeof proxyBalance === 'number' ? proxyBalance.toFixed(2) : '0.00'} USDC</p>
              <Link
                to="/profile"
                className="mt-2 inline-flex items-center gap-2 text-small text-accent-violet hover:underline"
              >
                <Wallet className="w-4 h-4" />
                Deposit
              </Link>
            </>
          )}
        </div>
      </section>
    </div>
  )
}
