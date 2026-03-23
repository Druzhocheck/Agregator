import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { fetchUnifiedEvents } from '@/shared/api/aggregated-markets'
import { getPlatformLabel, getPlatformLogoUrl } from '@/shared/lib/platform-utils'
import type { UnifiedEvent } from '@/entities/market/types'

function FeaturedCard({ event }: { event: UnifiedEvent }) {
  return (
    <Link
      to={`/market/${event.canonicalId}`}
      className="block rounded-2xl overflow-hidden border border-white/10 bg-bg-secondary/80 backdrop-blur-panel p-4 transition-all duration-200 hover:scale-[1.02] hover:border-accent-violet/30 hover:shadow-glow-strong"
    >
      <div className="flex items-start gap-2">
        <div className="w-9 h-9 rounded bg-bg-tertiary overflow-hidden shrink-0">
          {event.aggregated.image ? (
            <img src={event.aggregated.image} alt="" className="w-full h-full object-cover" />
          ) : null}
        </div>
        <h3 className="flex-1 min-w-0 line-clamp-2 font-semibold text-text-primary">{event.title}</h3>
      </div>
      <div className="flex items-center justify-between mt-4">
        <div className="text-tiny text-text-muted">
          <span>Vol ${(event.aggregated.volume / 1e6).toFixed(2)}M</span>
        </div>
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
      </div>
    </Link>
  )
}

interface FeaturedMarketsProps {
  excludeFromGrid?: boolean
}

export function FeaturedMarkets(_props: FeaturedMarketsProps) {
  const { data: events = [], isLoading } = useQuery({
    queryKey: ['unifiedEvents', 'featured', { limit: 3 }],
    queryFn: () => fetchUnifiedEvents({ limit: 3, featured: true, active: true, closed: false }),
  })
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
          <FeaturedCard key={event.canonicalId} event={event} />
        ))}
      </div>
    </section>
  )
}

export function getFeaturedIds(events: UnifiedEvent[]): string[] {
  return events.map((e) => e.canonicalId).filter(Boolean)
}

