import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchEventBySlug } from '@/shared/api/polymarket'
import { getEventOutcomeTokens } from '@/shared/lib/market-utils'
import { logger } from '@/shared/lib/logger'
import { OrderbookPanel } from '@/widgets/orderbook-panel'
import { MarketInfoPanel } from '@/widgets/market-info-panel'
import { OrderFormPanel } from '@/widgets/order-form-panel'
import { OutcomesPanel } from '@/widgets/outcomes-panel'

export function MarketDetailPage() {
  const { marketSlug } = useParams<{ marketSlug: string }>()
  const [selectedOutcomeIndex, setSelectedOutcomeIndex] = useState(0)

  const { data: event, isLoading, error } = useQuery({
    queryKey: ['event', marketSlug],
    queryFn: () => fetchEventBySlug(marketSlug ?? ''),
    enabled: !!marketSlug,
  })

  const outcomeTokens = event ? getEventOutcomeTokens(event) : []
  useEffect(() => {
    if (!outcomeTokens.length) return
    if (selectedOutcomeIndex <= outcomeTokens.length - 1) return
    logger.warn('MarketDetail: selectedOutcomeIndex out of bounds, reset to 0', {
      selectedOutcomeIndex,
      outcomeTokensLength: outcomeTokens.length,
    }, { component: 'market-detail', function: 'selectionGuard' })
    setSelectedOutcomeIndex(0)
  }, [outcomeTokens.length, selectedOutcomeIndex])

  useEffect(() => {
    logger.info('MarketDetail: outcome tokens mapped', {
      count: outcomeTokens.length,
      firstOutcomes: outcomeTokens.slice(0, 6).map((x) => ({ outcome: x.outcome, token: `${x.tokenId.slice(0, 10)}…` })),
    }, { component: 'market-detail', function: 'mapping' })
  }, [outcomeTokens])
  const selectedTokenId = outcomeTokens[selectedOutcomeIndex]?.tokenId ?? outcomeTokens[0]?.tokenId ?? null
  const marketIndex = outcomeTokens.length >= 2 ? Math.min(Math.floor(selectedOutcomeIndex / 2), Math.floor((outcomeTokens.length - 1) / 2)) : 0
  const yesTokenId = outcomeTokens[marketIndex * 2]?.tokenId ?? null
  const noTokenId = outcomeTokens[marketIndex * 2 + 1]?.tokenId ?? null

  if (isLoading) {
    return (
      <div className="max-w-[1920px] mx-auto px-6 py-6 flex gap-6">
        <div className="w-[30%] h-[500px] rounded-panel bg-bg-secondary/50 animate-pulse" />
        <div className="flex-1 h-[500px] rounded-panel bg-bg-secondary/50 animate-pulse" />
        <div className="w-[30%] h-[500px] rounded-panel bg-bg-secondary/50 animate-pulse" />
      </div>
    )
  }

  if (error || !event) {
    return (
      <div className="max-w-[1920px] mx-auto px-6 py-12 text-center">
        <p className="text-status-error">Market not found</p>
      </div>
    )
  }

  const handleOrderbookTabChange = (tab: 'yes' | 'no') => {
    const index = marketIndex * 2 + (tab === 'no' ? 1 : 0)
    setSelectedOutcomeIndex(index)
    logger.info('MarketDetail: orderbook tab changed', { tab, selectedOutcomeIndex: index, tokenId: outcomeTokens[index]?.tokenId?.slice(0, 24) + '…' }, { component: 'market-detail', function: 'handleOrderbookTabChange' })
  }

  const handleSelectOutcome = (index: number) => {
    setSelectedOutcomeIndex(index)
    const tokenId = outcomeTokens[index]?.tokenId ?? null
    logger.info('MarketDetail: outcome selected', { selectedOutcomeIndex: index, tokenId: tokenId?.slice(0, 24) + '…', outcome: outcomeTokens[index]?.outcome }, { component: 'market-detail', function: 'handleSelectOutcome' })
  }

  return (
    <div className="max-w-[1920px] mx-auto px-6 py-6 flex gap-4">
      <div className="w-[24%] min-w-[220px] max-w-[280px] shrink-0">
        <OrderbookPanel
          yesTokenId={yesTokenId}
          noTokenId={noTokenId}
          activeTab={selectedOutcomeIndex % 2 === 0 ? 'yes' : 'no'}
          onTabChange={handleOrderbookTabChange}
        />
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        <h1 className="text-h3 font-bold text-text-primary leading-tight">
          {event.title ?? event.ticker ?? event.id}
        </h1>
        {outcomeTokens.length > 0 && (
          <OutcomesPanel
            event={event}
            outcomeTokens={outcomeTokens}
            selectedIndex={selectedOutcomeIndex}
            onSelectOutcome={handleSelectOutcome}
          />
        )}
        <MarketInfoPanel event={event} tokenId={selectedTokenId} />
      </div>
      <div className="w-[24%] min-w-[240px] max-w-[300px] shrink-0">
        <OrderFormPanel
          event={event}
          yesTokenId={yesTokenId}
          noTokenId={noTokenId}
          selectedOutcomeIndex={selectedOutcomeIndex}
          marketIndex={marketIndex}
          onSelectOutcome={setSelectedOutcomeIndex}
          tokenId={selectedTokenId}
          outcomeLabel={outcomeTokens[selectedOutcomeIndex]?.outcome ?? 'YES'}
        />
      </div>
    </div>
  )
}
