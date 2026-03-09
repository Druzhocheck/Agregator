import { useState } from 'react'
import { useAccount } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { fetchUserTrades, fetchActivity, type DataTrade, type DataActivityItem } from '@/shared/api/polymarket'
import { usePolymarketProxy } from '@/shared/hooks/use-polymarket-proxy'
import { cn } from '@/shared/lib/cn'

const TABS = ['Activity', 'Trades'] as const

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

export function TransactionHistory() {
  const { address, isConnected } = useAccount()
  const { proxy } = usePolymarketProxy(address ?? undefined)
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>('Activity')
  const user = proxy ?? undefined

  const { data: activity = [], isLoading: activityLoading } = useQuery({
    queryKey: ['activity', user],
    queryFn: () => fetchActivity({ user: user!, limit: 50, sortBy: 'timestamp', sortDirection: 'desc' }),
    enabled: !!user,
  })

  const { data: trades = [], isLoading: tradesLoading } = useQuery({
    queryKey: ['userTrades', user],
    queryFn: () => fetchUserTrades({ user: user!, limit: 50 }),
    enabled: !!user,
  })

  const isLoading = activeTab === 'Activity' ? activityLoading : tradesLoading
  const emptyMessage =
    !isConnected || !address
      ? 'Connect wallet to see history.'
      : !user
        ? 'Link Polymarket in Profile to see activity.'
        : activeTab === 'Activity'
          ? (activity as DataActivityItem[]).length === 0
            ? 'No activity yet.'
            : null
          : (trades as DataTrade[]).length === 0
            ? 'No trades yet.'
            : null

  return (
    <>
      <h2 className="text-h3 font-bold text-text-primary mb-4">Transaction History</h2>
      <div className="flex gap-2 mb-4 border-b border-white/10">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-3 py-2 text-small border-b-2 transition-colors',
              activeTab === tab ? 'border-accent-violet text-accent-violet' : 'border-transparent text-text-muted hover:text-text-body'
            )}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="rounded-panel bg-bg-secondary/80 backdrop-blur-panel border border-white/10 overflow-hidden">
        <table className="w-full text-small">
          <thead>
            <tr className="border-b border-white/10 text-text-muted">
              <th className="text-left p-3">Date</th>
              <th className="text-left p-3">Type</th>
              <th className="text-left p-3">Market</th>
              <th className="text-right p-3">Size</th>
              <th className="text-right p-3">Price / Value</th>
              <th className="text-left p-3">Tx</th>
            </tr>
          </thead>
          <tbody>
            {emptyMessage && !isLoading ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-text-muted">
                  {emptyMessage}
                </td>
              </tr>
            ) : isLoading ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-text-muted">
                  Loading...
                </td>
              </tr>
            ) : activeTab === 'Activity' ? (
              (activity as DataActivityItem[]).map((a, i) => (
                <tr key={a.id ?? a.transactionHash ?? i} className="border-b border-white/5 hover:bg-white/5">
                  <td className="p-3 text-text-muted">{formatTime(a.timestamp)}</td>
                  <td className="p-3">
                    <span className={cn('font-medium', a.side === 'BUY' ? 'text-status-success' : a.side === 'SELL' ? 'text-status-error' : 'text-text-body')}>
                      {a.type ?? a.side ?? '—'}
                    </span>
                  </td>
                  <td className="p-3 text-text-body max-w-[200px] truncate" title={a.title}>
                    {a.title ?? a.market ?? '—'}
                  </td>
                  <td className="p-3 text-right font-mono">{a.size != null ? Number(a.size).toFixed(2) : '—'}</td>
                  <td className="p-3 text-right font-mono">{a.price != null ? (Number(a.price) * 100).toFixed(1) + '¢' : a.value != null ? `$${Number(a.value).toFixed(2)}` : '—'}</td>
                  <td className="p-3">
                    {a.transactionHash ? (
                      <a href={`https://polygonscan.com/tx/${a.transactionHash}`} target="_blank" rel="noopener noreferrer" className="text-accent-blue hover:underline font-mono text-tiny">
                        {String(a.transactionHash).slice(0, 10)}…
                      </a>
                    ) : '—'}
                  </td>
                </tr>
              ))
            ) : (
              (trades as DataTrade[]).map((t, i) => (
                <tr key={t.transactionHash ?? i} className="border-b border-white/5 hover:bg-white/5">
                  <td className="p-3 text-text-muted">{formatTime(t.timestamp)}</td>
                  <td className="p-3">
                    <span className={cn('font-medium', t.side === 'BUY' ? 'text-status-success' : 'text-status-error')}>
                      {t.side ?? '—'}
                    </span>
                  </td>
                  <td className="p-3 text-text-body max-w-[200px] truncate" title={t.title}>
                    {t.title ?? t.slug ?? '—'}
                  </td>
                  <td className="p-3 text-right font-mono">{t.size != null ? t.size.toFixed(2) : '—'}</td>
                  <td className="p-3 text-right font-mono">{t.price != null ? (t.price * 100).toFixed(1) + '¢' : '—'}</td>
                  <td className="p-3">
                    {t.transactionHash ? (
                      <a href={`https://polygonscan.com/tx/${t.transactionHash}`} target="_blank" rel="noopener noreferrer" className="text-accent-blue hover:underline font-mono text-tiny">
                        {t.transactionHash.slice(0, 10)}…
                      </a>
                    ) : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
