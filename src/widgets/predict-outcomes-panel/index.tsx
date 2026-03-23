import { useQueries } from '@tanstack/react-query'
import type { PredictMarket } from '@/entities/market/types'
import { fetchPredictOrderbook, getPredictOrderbookPrices } from '@/shared/api/predict'
import { getPredictOutcomeLabels } from '@/shared/lib/market-utils'
import { cn } from '@/shared/lib/cn'
import { logger } from '@/shared/lib/logger'

interface PredictOutcomesPanelProps {
  markets: PredictMarket[]
  selectedIndex: number
  onSelectOutcome: (index: number) => void
}

function fmtPrice(price: number): string {
  const pct = Math.round(price * 100)
  if (pct < 1 && pct > 0) return '<1%'
  return `${pct}%`
}

export function PredictOutcomesPanel({ markets, selectedIndex, onSelectOutcome }: PredictOutcomesPanelProps) {
  logger.debug(
    'PredictOutcomesPanel: rows',
    {
      count: markets.length,
      uniqueCategorySlugs: [...new Set(markets.map((m) => m.categorySlug || ''))].slice(0, 12),
      sample: markets.slice(0, 6).map((m) => ({ id: m.id, title: m.title, question: m.question, categorySlug: m.categorySlug })),
    },
    { component: 'predict-outcomes-panel', function: 'render' }
  )
  if (!markets.length) {
    return (
      <div className="rounded-panel bg-bg-secondary/80 backdrop-blur-panel border border-white/10 p-4">
        <h3 className="text-base font-bold text-text-primary mb-2">Outcomes</h3>
        <p className="text-small text-text-muted">No Predict outcomes</p>
      </div>
    )
  }
  const priceQueries = useQueries({
    queries: markets.map((market) => ({
      queryKey: ['predict-outcomes-book', market.id],
      queryFn: async () => {
        const book = await fetchPredictOrderbook(market.id)
        return getPredictOrderbookPrices(book)
      },
      staleTime: 15_000,
    })),
  })
  return (
    <div className="rounded-panel bg-bg-secondary/80 backdrop-blur-panel border border-white/10 p-4">
      <h3 className="text-base font-bold text-text-primary mb-2">Outcome options</h3>
      <div className="flex flex-col gap-2">
        {markets.map((m, idx) => {
          const yesIndex = idx * 2
          const noIndex = yesIndex + 1
          const rowSelected = selectedIndex === yesIndex || selectedIndex === noIndex
          const [yesLabel, noLabel] = getPredictOutcomeLabels(m)
          const prices = priceQueries[idx]?.data ?? { yesPrice: 0.5, noPrice: 0.5 }
          return (
            <div
              key={m.id}
              className={cn(
                'flex items-center gap-3 py-3 px-4 rounded-xl border border-white/10 bg-bg-tertiary/50',
                rowSelected && 'ring-2 ring-accent-violet/50 border-accent-violet/50'
              )}
            >
              <div
                className="min-w-0 flex-1 cursor-pointer select-none"
                onClick={() => onSelectOutcome(yesIndex)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelectOutcome(yesIndex)
                  }
                }}
                role="button"
                tabIndex={0}
                title="Select outcome row"
              >
                <p className="text-base font-semibold text-text-primary break-words">{m.title || m.question || `Market ${m.id}`}</p>
                <p className="text-tiny text-text-muted mt-0.5">{m.question && m.question !== m.title ? m.question : `${yesLabel} vs ${noLabel}`}</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onSelectOutcome(yesIndex)}
                  className={cn('px-3 py-1.5 rounded text-small font-medium bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/40', selectedIndex === yesIndex && 'ring-2 ring-white/60')}
                >
                  Buy {yesLabel} {fmtPrice(prices.yesPrice)}
                </button>
                <button
                  type="button"
                  onClick={() => onSelectOutcome(noIndex)}
                  className={cn('px-3 py-1.5 rounded text-small font-medium bg-[#ef4444]/20 text-[#ef4444] border border-[#ef4444]/40', selectedIndex === noIndex && 'ring-2 ring-white/60')}
                >
                  Buy {noLabel} {fmtPrice(prices.noPrice)}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

