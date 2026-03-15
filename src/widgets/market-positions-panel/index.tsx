import { useState } from 'react'
import { useAccount } from 'wagmi'
import { X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import {
  fetchPositions,
  fetchActivity,
  type DataPosition,
  type DataActivityItem,
} from '@/shared/api/polymarket'
import { usePolymarketProxy } from '@/shared/hooks/use-polymarket-proxy'
import type { PolymarketEvent } from '@/entities/market/types'
import { cn } from '@/shared/lib/cn'

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

interface MarketPositionsPanelProps {
  event: PolymarketEvent
}

function MarketPositionsContent({ event }: { event: PolymarketEvent }) {
  const { address, isConnected } = useAccount()
  const { proxy } = usePolymarketProxy(address ?? undefined)
  const user = proxy ?? undefined
  const eventSlug = event.slug ?? event.id

  const { data: positions = [] } = useQuery({
    queryKey: ['positions', 'open', user],
    queryFn: () => fetchPositions({ user: user!, limit: 100 }),
    enabled: !!user,
  })

  const { data: activity = [] } = useQuery({
    queryKey: ['activity', user],
    queryFn: () => fetchActivity({ user: user!, limit: 30, sortBy: 'timestamp', sortDirection: 'desc' }),
    enabled: !!user,
  })

  const eventPositions = (positions as DataPosition[]).filter((p) => p.eventSlug === eventSlug)
  const eventActivity = (activity as DataActivityItem[]).filter(
    (a) => a.eventId === event.id || (a.eventSlug === eventSlug) || (a.title && event.title && a.title.includes(event.title))
  )
  const canShowData = isConnected && !!address && !!user

  return (
    <div className="space-y-4">
      {!canShowData ? (
          <p className="text-small text-text-muted">Connect wallet and link Polymarket to track your positions and activity here.</p>
        ) : eventPositions.length > 0 ? (
          <div>
            <h4 className="text-tiny uppercase tracking-wider text-text-muted mb-2">Positions</h4>
            <div className="space-y-2">
              {eventPositions.map((pos) => (
                <div
                  key={`${pos.conditionId}-${pos.asset}`}
                  className="p-3 rounded-lg bg-bg-tertiary/50 border border-white/5"
                >
                  <div className="text-small text-text-primary">{pos.outcome ?? '—'}</div>
                  <div className="text-tiny text-text-muted">
                    {pos.size != null ? pos.size.toFixed(2) : '—'} @{' '}
                    {pos.avgPrice != null ? `${(pos.avgPrice * 100).toFixed(1)}¢` : '—'}
                  </div>
                  {pos.cashPnl != null && (
                    <div
                      className={cn(
                        'text-tiny font-mono mt-0.5',
                        pos.cashPnl >= 0 ? 'text-status-success' : 'text-status-error'
                      )}
                    >
                      {pos.cashPnl >= 0 ? '+' : ''}${pos.cashPnl.toFixed(2)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-tiny text-text-muted">No positions in this event</p>
        )}
        {canShowData && eventActivity.length > 0 ? (
          <div>
            <h4 className="text-tiny uppercase tracking-wider text-text-muted mb-2">Recent activity</h4>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {eventActivity.slice(0, 10).map((a, i) => (
                <div
                  key={a.id ?? a.transactionHash ?? i}
                  className="flex items-center justify-between text-tiny py-1 border-b border-white/5 last:border-0"
                >
                  <span
                    className={cn(
                      'font-medium',
                      a.side === 'BUY' ? 'text-status-success' : a.side === 'SELL' ? 'text-status-error' : 'text-text-body'
                    )}
                  >
                    {a.type ?? a.side ?? '—'}
                  </span>
                  <span className="text-text-muted">{formatTime(a.timestamp)}</span>
                </div>
              ))}
            </div>
          </div>
      ) : canShowData ? (
        <p className="text-tiny text-text-muted">No recent activity in this event</p>
      ) : null}
    </div>
  )
}

export function MarketPositionsPanel({ event }: MarketPositionsPanelProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-panel bg-bg-tertiary border border-white/10 text-small font-medium text-text-primary hover:bg-white/5 transition-colors"
      >
        Positions & activity in this event
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div
            className="rounded-panel bg-bg-secondary border border-white/10 shadow-xl max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <h3 className="text-base font-bold text-text-primary">Positions & activity in this event</h3>
              <button type="button" onClick={() => setOpen(false)} className="p-1 rounded hover:bg-white/10 text-text-muted hover:text-text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto">
              <MarketPositionsContent event={event} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
