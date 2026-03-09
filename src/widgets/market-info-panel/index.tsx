import type { PolymarketEvent } from '@/entities/market/types'
import { useQuery } from '@tanstack/react-query'
import { fetchOrderBook } from '@/shared/api/polymarket'
import { useMarketWs } from '@/shared/hooks/use-market-ws'
import { cn } from '@/shared/lib/cn'

function parsePrices(outcomePrices?: string | null): number[] {
  if (!outcomePrices) return [0.5, 0.5]
  try {
    const arr = JSON.parse(outcomePrices) as string[]
    return arr.map((x) => Number(x))
  } catch {
    return [0.5, 0.5]
  }
}

function formatTradeTime(ts: number) {
  const d = new Date(ts)
  const now = Date.now()
  const diff = now - d.getTime()
  if (diff < 60_000) return 'Just now'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

interface MarketInfoPanelProps {
  event: PolymarketEvent
  tokenId?: string | null
}

export function MarketInfoPanel({ event, tokenId }: MarketInfoPanelProps) {
  const firstMarket = event.markets?.[0]
  const resolvedTokenId = tokenId ?? (firstMarket?.clobTokenIds
    ? (typeof firstMarket.clobTokenIds === 'string'
        ? firstMarket.clobTokenIds.split(',')[0]
        : (firstMarket.clobTokenIds as string[])?.[0])
    : undefined)

  const { data: book } = useQuery({
    queryKey: ['orderbook', resolvedTokenId],
    queryFn: () => fetchOrderBook(resolvedTokenId!),
    enabled: !!resolvedTokenId,
  })
  const { book: wsBook, trades: liveTrades } = useMarketWs(resolvedTokenId ?? null)

  const prices = firstMarket?.outcomePrices ? parsePrices(firstMarket.outcomePrices) : [0.5, 0.5]
  const lastPrice = wsBook?.lastTradePrice
    ? Number(wsBook.lastTradePrice)
    : book?.last_trade_price
      ? Number(book.last_trade_price)
      : prices[0]
  const vol = event.volumeNum ?? Number(event.volume ?? 0) ?? 0
  const endDate = event.endDate ?? firstMarket?.endDate

  return (
    <div className="rounded-panel bg-bg-secondary/80 backdrop-blur-panel border border-white/10 overflow-hidden">
      <div className="p-4 border-b border-white/10">
        <h1 className="text-h2 font-bold text-text-primary">
          {event.title ?? event.ticker ?? event.id}
        </h1>
        <div className="flex flex-wrap gap-4 mt-2 text-body">
          <span>
            Last price:{' '}
            <span className={cn('font-mono', lastPrice >= 0.5 ? 'text-status-success' : 'text-status-error')}>
              {(lastPrice * 100).toFixed(1)}¢
            </span>
          </span>
          <span className="text-text-muted">24h Vol: ${(vol / 1e6).toFixed(2)}M</span>
          <span className="text-text-muted">Resolves: {endDate ? new Date(endDate).toLocaleString() : '—'}</span>
        </div>
      </div>
      <div className="p-4">
        <h3 className="text-small font-semibold text-text-primary mb-2 flex items-center gap-2">
          Recent Trades
          {liveTrades.length > 0 && <span className="w-2 h-2 rounded-full bg-status-success animate-pulse" />}
        </h3>
        <div className="rounded border border-white/10 overflow-hidden">
          <table className="w-full text-tiny font-mono">
            <thead>
              <tr className="border-b border-white/10 text-text-muted">
                <th className="text-left p-2">Time</th>
                <th className="text-left p-2">Side</th>
                <th className="text-right p-2">Size</th>
                <th className="text-right p-2">Price</th>
              </tr>
            </thead>
            <tbody>
              {liveTrades.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-4 text-center text-text-muted">
                    Trades will appear here in real time (WebSocket)
                  </td>
                </tr>
              ) : (
                liveTrades.slice(0, 20).map((t, i) => (
                  <tr key={`${t.time}-${i}`} className="border-b border-white/5">
                    <td className="p-2 text-text-muted">{formatTradeTime(t.time)}</td>
                    <td className={cn('p-2 font-medium', t.side === 'BUY' ? 'text-status-success' : 'text-status-error')}>
                      {t.side}
                    </td>
                    <td className="p-2 text-right">{Number(t.size).toFixed(2)}</td>
                    <td className="p-2 text-right">{(Number(t.price) * 100).toFixed(1)}¢</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
