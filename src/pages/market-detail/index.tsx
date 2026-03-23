import { useEffect, useMemo, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { PlatformId, PolymarketEvent, PredictMarket } from '@/entities/market/types'
import { fetchEventBySlug } from '@/shared/api/polymarket'
import {
  fetchAllPredictMarkets,
  fetchPredictMarketById,
  fetchPredictMarketsByCategorySlug,
  fetchPredictOrderbook,
} from '@/shared/api/predict'
import { getUnifiedOutcomeTokens } from '@/shared/lib/market-utils'
import { resolveUnifiedEvent } from '@/shared/lib/event-aggregation'
import { logger } from '@/shared/lib/logger'
import { OrderbookPanel } from '@/widgets/orderbook-panel'
import { MarketInfoPanel } from '@/widgets/market-info-panel'
import { MarketPositionsPanel } from '@/widgets/market-positions-panel'
import { OrderFormPanel } from '@/widgets/order-form-panel'
import { OutcomesPanel } from '@/widgets/outcomes-panel'
import { PredictOutcomesPanel } from '@/widgets/predict-outcomes-panel'
import { PredictOrderFormPanel } from '@/widgets/predict-order-form-panel'
import { getPlatformLabel } from '@/shared/lib/platform-utils'
import { cn } from '@/shared/lib/cn'

export function MarketDetailPage() {
  const { marketSlug } = useParams<{ marketSlug: string }>()
  const location = useLocation()
  const navigationState = (location.state ?? {}) as {
    preferredPlatform?: PlatformId
    predictMarketId?: number | null
    predictOutcome?: 'yes' | 'no'
  }
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformId>('polymarket')
  const [selectedOutcomeIndex, setSelectedOutcomeIndex] = useState(0)

  const { data: unified, isLoading, error } = useQuery({
    queryKey: ['unifiedEvent', marketSlug],
    queryFn: () =>
      resolveUnifiedEvent(marketSlug ?? '', {
        fetchPolymarketEventBySlug: fetchEventBySlug,
        fetchPredictMarketById,
        fetchPredictMarkets: () => fetchAllPredictMarkets({ status: 'OPEN', pageSize: 200, maxPages: 10 }),
        fetchPredictMarketsByCategorySlug: (categorySlug) =>
          fetchPredictMarketsByCategorySlug(categorySlug, { status: 'OPEN' }),
        fetchPredictOrderbook: fetchPredictOrderbook,
      }),
    enabled: !!marketSlug,
  })

  useEffect(() => {
    if (!unified) return
    const preferredPlatform =
      navigationState.preferredPlatform && unified.platforms.includes(navigationState.preferredPlatform)
        ? navigationState.preferredPlatform
        : unified.platforms.includes('polymarket')
          ? 'polymarket'
          : unified.platforms[0]
    setSelectedPlatform(preferredPlatform)
  }, [unified, navigationState.preferredPlatform])

  const outcomeTokens = useMemo(
    () => getUnifiedOutcomeTokens(unified ?? null, selectedPlatform),
    [unified, selectedPlatform]
  )
  useEffect(() => {
    if (!outcomeTokens.length) return
    if (selectedOutcomeIndex <= outcomeTokens.length - 1) return
    setSelectedOutcomeIndex(0)
  }, [outcomeTokens.length, selectedOutcomeIndex])

  useEffect(() => {
    if (!unified || selectedPlatform !== 'predict' || !outcomeTokens.length) return
    const requestedMarketId = Number(navigationState.predictMarketId ?? NaN)
    if (!Number.isFinite(requestedMarketId)) return
    const requestedOutcome = navigationState.predictOutcome === 'no' ? 'No' : 'Yes'
    const nextIndex = outcomeTokens.findIndex((token) => {
      const market = token.market as PredictMarket
      return Number(market.id) === requestedMarketId && token.outcome === requestedOutcome
    })
    if (nextIndex >= 0) setSelectedOutcomeIndex(nextIndex)
  }, [unified, selectedPlatform, outcomeTokens, navigationState.predictMarketId, navigationState.predictOutcome])

  const selectedToken = outcomeTokens[selectedOutcomeIndex]
  const selectedTokenId = selectedToken?.tokenId ?? outcomeTokens[0]?.tokenId ?? null
  const marketIndex = outcomeTokens.length >= 2 ? Math.min(Math.floor(selectedOutcomeIndex / 2), Math.floor((outcomeTokens.length - 1) / 2)) : 0
  const yesOutcomeLabel = outcomeTokens[marketIndex * 2]?.outcome ?? 'Yes'
  const noOutcomeLabel = outcomeTokens[marketIndex * 2 + 1]?.outcome ?? 'No'
  const yesTokenId = outcomeTokens[marketIndex * 2]?.tokenId ?? null
  const noTokenId = outcomeTokens[marketIndex * 2 + 1]?.tokenId ?? null
  const selectedPredictMarketId =
    selectedPlatform === 'predict'
      ? Number((selectedToken?.market as PredictMarket | undefined)?.id ?? NaN)
      : null
  const selectedPredictMarket =
    selectedPlatform === 'predict' ? ((selectedToken?.market as PredictMarket | undefined) ?? null) : null

  useEffect(() => {
    const predictInstances = unified?.instances.filter((i) => i.platform === 'predict') ?? []
    const predictCategories = [...new Set(predictInstances.map((i) => (i.event as PredictMarket).categorySlug || ''))]
    const predictMarketsCount = predictInstances.length
    const outcomeTokenCount = outcomeTokens.length
    logger.info(
      'MarketDetail: unified loaded',
      {
        canonicalId: unified?.canonicalId,
        platforms: unified?.platforms,
        selectedPlatform,
        outcomeCount: outcomeTokenCount,
        outcomeTokenCount,
        outcomeMarketPairs: Math.floor(outcomeTokenCount / 2),
        outcomeCountNote: selectedPlatform === 'predict' ? 'predict outcomes are logged as tokens (Yes+No per market)' : undefined,
        predictMarketsCount,
        predictCategoryCount: predictCategories.length,
        predictCategoriesSample: predictCategories.slice(0, 12),
      },
      { component: 'market-detail', function: 'load' }
    )
  }, [unified, selectedPlatform, outcomeTokens.length])

  if (isLoading) {
    return (
      <div className="max-w-[1920px] mx-auto px-6 py-6 flex gap-6">
        <div className="w-[30%] h-[500px] rounded-panel bg-bg-secondary/50 animate-pulse" />
        <div className="flex-1 h-[500px] rounded-panel bg-bg-secondary/50 animate-pulse" />
        <div className="w-[30%] h-[500px] rounded-panel bg-bg-secondary/50 animate-pulse" />
      </div>
    )
  }
  if (error || !unified) {
    return (
      <div className="max-w-[1920px] mx-auto px-6 py-12 text-center">
        <p className="text-status-error">Market not found</p>
      </div>
    )
  }

  const polyEvent = unified.instances.find((i) => i.platform === 'polymarket')?.event as PolymarketEvent | undefined
  const predictMarkets = unified.instances.filter((i) => i.platform === 'predict').map((i) => i.event as PredictMarket)
  const hasSinglePredictCategory =
    new Set(predictMarkets.map((m) => String(m.categorySlug || '').trim().toLowerCase()).filter(Boolean)).size === 1
  const isPredictGroupedEvent = predictMarkets.length > 1 && hasSinglePredictCategory
  const predictDescription =
    selectedPlatform === 'predict'
      ? predictMarkets.find((m: PredictMarket) => Boolean(m.description?.trim()))?.description?.trim() ||
        (isPredictGroupedEvent ? '' : predictMarkets.find((m: PredictMarket) => Boolean(m.question?.trim()))?.question?.trim()) ||
        ''
      : ''

  const handleOrderbookTabChange = (tab: 'yes' | 'no') => {
    const index = marketIndex * 2 + (tab === 'no' ? 1 : 0)
    setSelectedOutcomeIndex(index)
  }

  return (
    <div className="max-w-[1920px] mx-auto px-6 py-6 flex gap-4">
      <div className="w-[24%] min-w-[220px] max-w-[280px] shrink-0">
        <OrderbookPanel
          platform={selectedPlatform === 'predict' ? 'predict' : 'polymarket'}
          predictMarketId={selectedPredictMarketId}
          yesTokenId={yesTokenId}
          noTokenId={noTokenId}
          yesLabel={yesOutcomeLabel}
          noLabel={noOutcomeLabel}
          activeTab={selectedOutcomeIndex % 2 === 0 ? 'yes' : 'no'}
          onTabChange={handleOrderbookTabChange}
        />
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        <div className="rounded-panel bg-bg-secondary/80 backdrop-blur-panel border border-white/10 p-4">
          <h1 className="text-h3 font-bold text-text-primary leading-tight">{unified.title}</h1>
          {predictDescription && (
            <p className="mt-2 text-small text-text-muted leading-relaxed">
              {predictDescription}
            </p>
          )}
          <div className="flex flex-wrap gap-4 mt-3 text-tiny text-text-muted">
            {unified.aggregated.endDate && <span>Resolves: {new Date(unified.aggregated.endDate).toLocaleString()}</span>}
            {unified.aggregated.volume > 0 && <span>Volume: ${(unified.aggregated.volume / 1e6).toFixed(2)}M</span>}
          </div>
        </div>
        {selectedPlatform === 'polymarket' && polyEvent && (
          <OutcomesPanel
            event={polyEvent}
            outcomeTokens={outcomeTokens}
            selectedIndex={selectedOutcomeIndex}
            onSelectOutcome={setSelectedOutcomeIndex}
          />
        )}
        {selectedPlatform === 'predict' && (
          <PredictOutcomesPanel
            markets={predictMarkets}
            selectedIndex={selectedOutcomeIndex}
            onSelectOutcome={setSelectedOutcomeIndex}
          />
        )}
        {selectedPlatform === 'polymarket' && polyEvent && <MarketPositionsPanel event={polyEvent} />}
        {selectedPlatform === 'polymarket' && polyEvent && <MarketInfoPanel event={polyEvent} tokenId={selectedTokenId} />}
      </div>
      <div className="w-[24%] min-w-[240px] max-w-[300px] shrink-0 flex flex-col gap-3">
        {unified.platforms.length > 1 && (
          <div className="rounded-panel bg-bg-secondary/80 backdrop-blur-panel border border-white/10 p-3">
            <p className="text-tiny text-text-muted mb-2">Platform for placing order</p>
            <div className="flex items-center gap-2">
              {unified.platforms.map((platform: PlatformId) => (
                <button
                  key={platform}
                  type="button"
                  onClick={() => {
                    setSelectedPlatform(platform)
                    setSelectedOutcomeIndex(0)
                  }}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-small border',
                    selectedPlatform === platform
                      ? 'border-accent-violet/60 bg-accent-violet/20 text-text-primary'
                      : 'border-white/10 bg-bg-tertiary/50 text-text-muted'
                  )}
                >
                  {getPlatformLabel(platform)}
                </button>
              ))}
            </div>
          </div>
        )}
        {selectedPlatform === 'polymarket' && polyEvent ? (
          <OrderFormPanel
            event={polyEvent}
            yesTokenId={yesTokenId}
            noTokenId={noTokenId}
            yesLabel={yesOutcomeLabel}
            noLabel={noOutcomeLabel}
            selectedOutcomeIndex={selectedOutcomeIndex}
            marketIndex={marketIndex}
            onSelectOutcome={setSelectedOutcomeIndex}
            tokenId={selectedTokenId}
            outcomeLabel={outcomeTokens[selectedOutcomeIndex]?.outcome ?? 'YES'}
          />
        ) : (
          <PredictOrderFormPanel
            market={selectedPredictMarket}
            outcomeLabel={outcomeTokens[selectedOutcomeIndex]?.outcome ?? 'YES'}
            yesLabel={yesOutcomeLabel}
            noLabel={noOutcomeLabel}
          />
        )}
      </div>
    </div>
  )
}

