import { Fragment } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { fetchEvents } from '@/shared/api/polymarket'
import type { PolymarketEvent } from '@/entities/market/types'
import { getMarketOutcomeDisplayName, getMarketYesProbability, isTradableMarket } from '@/shared/lib/market-utils'
import { cn } from '@/shared/lib/cn'

function eventToSlug(e: PolymarketEvent): string {
  return (e.slug ?? e.id).toString()
}

function parsePrices(outcomePrices?: string | null): { yes: number; no: number } {
  if (!outcomePrices) return { yes: 0.5, no: 0.5 }
  try {
    const arr = JSON.parse(outcomePrices) as string[]
    const yes = arr[0] ? Number(arr[0]) : 0.5
    const no = arr[1] ? Number(arr[1]) : 1 - yes
    return { yes, no }
  } catch {
    return { yes: 0.5, no: 0.5 }
  }
}

function formatOutcomePct(p: number): string {
  const pct = Math.round(p * 100)
  if (pct === 0 || (pct > 0 && pct < 1)) return '<1%'
  return `${pct}%`
}

/** Two most likely outcomes for multi-outcome events; null = single binary (show bar). */
function getTopTwoOutcomes(event: PolymarketEvent): { name: string; prob: number }[] | null {
  const markets = event.markets ?? []
  if (markets.length < 2) return null
  const withProb = markets
    .filter((m) => isTradableMarket(m) && m.clobTokenIds && String(m.clobTokenIds).split(',').length >= 2)
    .map((m) => {
      const prob = getMarketYesProbability(m)
      const name = getMarketOutcomeDisplayName(m) || 'Outcome'
      return { name, prob }
    })
    .filter((x): x is { name: string; prob: number } => Boolean(x.name) && x.prob != null && x.prob >= 0)
  if (withProb.length < 2) return null
  withProb.sort((a, b) => b.prob - a.prob)
  return withProb.slice(0, 2)
}

function MarketCard({ event, className }: { event: PolymarketEvent; className?: string }) {
  const navigate = useNavigate()
  const slug = eventToSlug(event)
  const markets = event.markets ?? []
  const first = markets.find(isTradableMarket) ?? markets[0]
  const prices = first?.outcomePrices ? parsePrices(first.outcomePrices) : parsePrices(null)
  const vol = event.volumeNum ?? Number(event.volume ?? 0) ?? 0
  const endDate = event.endDate ?? first?.endDate
  const topTwo = getTopTwoOutcomes(event)

  const handleYes = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    navigate(`/market/${slug}`, { state: { outcome: 'yes' } })
  }
  const handleNo = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    navigate(`/market/${slug}`, { state: { outcome: 'no' } })
  }

  return (
    <Link
      to={`/market/${slug}`}
      className={cn(
        'block rounded-2xl overflow-hidden border border-white/10 bg-bg-secondary/80 backdrop-blur-panel p-4 transition-all duration-200 hover:scale-[1.02] hover:border-accent-violet/30 hover:shadow-glow-strong w-full min-h-[160px] flex flex-col',
        className
      )}
    >
      <div className="flex flex-col gap-2 w-full flex-1 min-h-0">
        <div className="flex items-start gap-2 w-full shrink-0">
          <div className="w-9 h-9 shrink-0 rounded bg-bg-tertiary flex items-center justify-center overflow-hidden">
            {event.image ? (
              <img src={event.image} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-sm text-text-muted">?</span>
            )}
          </div>
          <h3 className="flex-1 min-w-0 font-semibold text-text-primary line-clamp-2 text-body">
            {event.title ?? event.ticker ?? event.id}
          </h3>
        </div>
        {topTwo ? (
          <>
            <div className="flex-1 min-h-[12px]" aria-hidden />
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-2 gap-y-1.5 items-center w-full shrink-0">
              {topTwo.map((outcome, i) => (
                <Fragment key={i}>
                  <span className={i === 0 ? 'text-status-success text-tiny truncate min-w-0' : 'text-status-error text-tiny truncate min-w-0'}>
                    {outcome.name}
                  </span>
                  <span className="font-mono text-tiny font-medium text-right tabular-nums w-8">
                    {formatOutcomePct(outcome.prob)}
                  </span>
                  <div className="flex gap-1 justify-end">
                    <button type="button" onClick={handleYes} className="px-2 py-0.5 rounded text-tiny font-medium bg-[#10b981]/20 text-[#10b981] hover:bg-[#10b981]/30 border border-[#10b981]/40">
                      Yes
                    </button>
                    <button type="button" onClick={handleNo} className="px-2 py-0.5 rounded text-tiny font-medium bg-[#ef4444]/20 text-[#ef4444] hover:bg-[#ef4444]/30 border border-[#ef4444]/40">
                      No
                    </button>
                  </div>
                </Fragment>
              ))}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center w-full min-h-0 py-2">
            <div className="w-full min-w-0 h-2.5 rounded-full overflow-hidden flex self-stretch">
              <div
                className="h-full bg-status-success transition-all duration-300 shrink-0 min-w-[4px] flex items-center justify-center overflow-hidden"
                style={{ width: `${Math.max(2, prices.yes * 100)}%` }}
              >
                {(prices.yes * 100 >= 10 || prices.yes >= 0.5) && (
                  <span className="text-[10px] font-mono font-semibold text-white drop-shadow-[0_0_1px_rgba(0,0,0,0.8)] whitespace-nowrap px-0.5">
                    {formatOutcomePct(prices.yes)} Yes
                  </span>
                )}
              </div>
              <div
                className="h-full bg-status-error/90 transition-all duration-300 shrink-0 min-w-[4px] flex items-center justify-center overflow-hidden"
                style={{ width: `${Math.max(2, (1 - prices.yes) * 100)}%` }}
              >
                {((1 - prices.yes) * 100 >= 10 || prices.yes <= 0.5) && (
                  <span className="text-[10px] font-mono font-semibold text-white drop-shadow-[0_0_1px_rgba(0,0,0,0.8)] whitespace-nowrap px-0.5">
                    {formatOutcomePct(1 - prices.yes)} No
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
        <div className="flex gap-4 text-tiny text-text-muted w-full justify-end text-right mt-auto shrink-0">
          <span>Vol ${(vol / 1e6).toFixed(2)}M</span>
          <span>Resolves {endDate ? new Date(endDate).toLocaleDateString() : '—'}</span>
        </div>
      </div>
    </Link>
  )
}

interface FeaturedMarketsProps {
  /** Reserved for future: exclude these from main grid */
  excludeFromGrid?: boolean
}

function isEventActive(e: PolymarketEvent): boolean {
  if (e.closed === true) return false
  const m = e.markets?.[0]
  if (m?.closed === true) return false
  const endDate = e.endDate ?? m?.endDate
  if (endDate && new Date(endDate).getTime() < Date.now()) return false
  return true
}

export function FeaturedMarkets(_props: FeaturedMarketsProps) {
  const { data: rawEvents = [], isLoading } = useQuery({
    queryKey: ['events', 'featured', { limit: 3, featured: true, active: true, closed: false }],
    queryFn: () => fetchEvents({ limit: 3, featured: true, active: true, closed: false }),
  })
  const events = rawEvents.filter(isEventActive).slice(0, 3)

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-2xl bg-bg-secondary/50 animate-pulse" />
        ))}
      </div>
    )
  }

  if (events.length === 0) return null

  return (
    <section className="mb-8">
      <h2 className="text-h3 font-bold text-text-primary mb-4">Featured Markets</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {events.slice(0, 3).map((event) => (
          <MarketCard key={event.id} event={event} />
        ))}
      </div>
    </section>
  )
}

export function getFeaturedIds(events: PolymarketEvent[]): string[] {
  return events.map((e) => e.id).filter(Boolean)
}
