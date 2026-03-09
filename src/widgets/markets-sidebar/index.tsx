import { Link } from 'react-router-dom'
import { Building2, Bitcoin, Trophy, Atom, Film } from 'lucide-react'
import { cn } from '@/shared/lib/cn'

const CATEGORIES = [
  { slug: 'politics', label: 'Politics', icon: Building2 },
  { slug: 'crypto', label: 'Crypto', icon: Bitcoin },
  { slug: 'sports', label: 'Sports', icon: Trophy },
  { slug: 'science', label: 'Science', icon: Atom },
  { slug: 'entertainment', label: 'Entertainment', icon: Film },
] as const

interface MarketsSidebarProps {
  categorySlug?: string
  liquidityMin?: number
  endingSoon: boolean
  highRoi: boolean
  liveNow: boolean
  trending: boolean
  onCategoryChange: (slug: string | undefined) => void
  onLiquidityChange: (v: number) => void
  onEndingSoonChange: (v: boolean) => void
  onHighRoiChange: (v: boolean) => void
  onLiveNowChange: (v: boolean) => void
  onTrendingChange: (v: boolean) => void
  onResetFilters: () => void
}

export function MarketsSidebar({
  categorySlug,
  liquidityMin = 0,
  endingSoon,
  highRoi,
  liveNow,
  trending,
  onCategoryChange,
  onLiquidityChange,
  onEndingSoonChange,
  onHighRoiChange,
  onLiveNowChange,
  onTrendingChange,
  onResetFilters,
}: MarketsSidebarProps) {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-tiny uppercase tracking-wider text-text-muted mb-3">Categories</h2>
        <nav className="space-y-0.5">
          {CATEGORIES.map(({ slug, label, icon: Icon }) => (
            <button
              key={slug}
              type="button"
              onClick={() => onCategoryChange(categorySlug === slug ? undefined : slug)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-panel text-left text-body transition-all duration-200',
                categorySlug === slug
                  ? 'bg-accent-violet/20 border border-accent-violet/40 text-accent-violet'
                  : 'text-text-body hover:bg-white/5 border border-transparent'
              )}
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span className="flex-1">{label}</span>
              <span className="text-tiny text-text-muted">—</span>
            </button>
          ))}
        </nav>
      </section>

      <section>
        <h2 className="text-tiny uppercase tracking-wider text-text-muted mb-3">Filters</h2>
        <div className="space-y-4">
          <div>
            <label className="text-small text-text-body block mb-1">Liquidity</label>
            <input
              type="range"
              min={0}
              max={100000}
              step={1000}
              value={liquidityMin}
              onChange={(e) => onLiquidityChange(Number(e.target.value))}
              className="w-full h-2 rounded-full appearance-none bg-bg-tertiary accent-accent-violet"
            />
            <div className="flex justify-between text-tiny text-text-muted mt-1">
              <span>0</span>
              <span>{liquidityMin.toLocaleString()}</span>
            </div>
          </div>
          <div className="space-y-2">
            {[
              { key: 'endingSoon', label: 'Ending soon', value: endingSoon, set: onEndingSoonChange },
              { key: 'highRoi', label: 'High ROI', value: highRoi, set: onHighRoiChange },
              { key: 'liveNow', label: 'Live now', value: liveNow, set: onLiveNowChange },
              { key: 'trending', label: 'Trending', value: trending, set: onTrendingChange },
            ].map(({ key, label, value, set }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer text-small text-text-body">
                <input
                  type="checkbox"
                  checked={value}
                  onChange={(e) => set(e.target.checked)}
                  className="w-4 h-4 rounded border-white/20 bg-bg-tertiary text-accent-violet focus:ring-accent-violet"
                />
                {label}
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={onResetFilters}
            className="text-small text-accent-violet hover:underline"
          >
            Reset all filters
          </button>
        </div>
      </section>

      <section>
        <h2 className="text-tiny uppercase tracking-wider text-text-muted mb-3">Related</h2>
        <nav className="space-y-0.5">
          {[
            { to: '/', label: 'Markets' },
            { to: '/profile', label: 'Profile' },
            { to: '/profile#deposit', label: 'Deposit' },
            { to: '/profile#history', label: 'History' },
          ].map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className="block w-full px-3 py-2 rounded-panel text-body text-text-body hover:bg-white/5 transition-colors"
            >
              {label}
            </Link>
          ))}
        </nav>
      </section>
    </div>
  )
}
