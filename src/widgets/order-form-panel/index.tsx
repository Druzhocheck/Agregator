import { useState, useEffect } from 'react'
import { useAccount, useChainId } from 'wagmi'
import { useEnsureNetwork } from '@/shared/hooks/use-ensure-network'
import type { PolymarketEvent } from '@/entities/market/types'
import { useQuery } from '@tanstack/react-query'
import { fetchOrderBook } from '@/shared/api/polymarket'
import { useTrading } from '@/shared/context/trading-context'
import { usePolymarketProxy } from '@/shared/hooks/use-polymarket-proxy'
import { usePolymarketBalance } from '@/shared/hooks/use-polymarket-balance'
import { POLYGON_CHAIN_ID } from '@/shared/config/api'
import { cn } from '@/shared/lib/cn'
import { logger } from '@/shared/lib/logger'
import { Zap, BarChart3, Copy, Check, ExternalLink } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { fetchPositions, type DataPosition } from '@/shared/api/polymarket'

const MIN_ORDER_SHARES = 5
const MIN_ORDER_USD = 1
const POLYGON_SCAN = 'https://polygonscan.com'

function truncateHash(h: string, head = 6, tail = 4) {
  if (!h || h.length <= head + tail + 2) return h
  return `${h.slice(0, head)}…${h.slice(-tail)}`
}

function extractTxHash(message: string): string | null {
  const m = message.match(/0x[a-fA-F0-9]{64}/)
  return m ? m[0] : null
}

interface OrderFormPanelProps {
  event: PolymarketEvent
  tokenId?: string | null
  yesTokenId?: string | null
  noTokenId?: string | null
  /** When set, form outcome (Yes/No) is controlled by parent (sync with selected outcome). */
  selectedOutcomeIndex?: number
  marketIndex?: number
  onSelectOutcome?: (index: number) => void
  outcomeLabel?: string
}

export function OrderFormPanel({
  event: _event,
  tokenId: _tokenId,
  yesTokenId,
  noTokenId,
  selectedOutcomeIndex,
  marketIndex = 0,
  onSelectOutcome,
  outcomeLabel: _outcomeLabel = 'YES',
}: OrderFormPanelProps) {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { ensureNetwork } = useEnsureNetwork()
  const { proxy } = usePolymarketProxy(address ?? undefined)
  const { cash: proxyCash } = usePolymarketBalance(proxy)
  const { creds, isDeriving, deriveError, deriveApiKey, placeMarketOrder, placeLimitOrder, openOrders, refreshOpenOrders, cancelOrder } = useTrading()

  const [orderType, setOrderType] = useState<'market' | 'limit'>('market')
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [internalOutcomeYes, setInternalOutcomeYes] = useState(true)
  const [amount, setAmount] = useState('')
  const [limitPrice, setLimitPrice] = useState('')
  const [quantityShares, setQuantityShares] = useState('')

  const isOutcomeControlled = selectedOutcomeIndex !== undefined && onSelectOutcome
  const outcomeYes = isOutcomeControlled ? (selectedOutcomeIndex % 2 === 0) : internalOutcomeYes
  const tokenId = outcomeYes ? (yesTokenId ?? _tokenId) : (noTokenId ?? _tokenId)

  useEffect(() => {
    if (creds && proxy) {
      refreshOpenOrders()
    }
  }, [creds, proxy, refreshOpenOrders])

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [orderResult, setOrderResult] = useState<{ success: boolean; message: string } | null>(null)
  const [copiedHash, setCopiedHash] = useState(false)
  const queryClient = useQueryClient()

  const { data: book } = useQuery({
    queryKey: ['orderbook', tokenId],
    queryFn: () => fetchOrderBook(tokenId!),
    enabled: !!tokenId,
  })

  const bestAsk = book?.asks?.[0]?.price ? Number(book.asks[0].price) : 0.5
  const bestBid = book?.bids?.[0]?.price ? Number(book.bids[0].price) : 0.5
  const marketPrice = side === 'buy' ? bestAsk : bestBid

  const conditionIdsSet = new Set((_event?.markets?.map((m) => m.conditionId).filter(Boolean) ?? []) as string[])
  const tokenIdsSet = new Set([yesTokenId, noTokenId, _tokenId].filter(Boolean) as string[])
  const { data: allPositions = [] } = useQuery({
    queryKey: ['positions', 'market', proxy, _event?.id],
    queryFn: () => fetchPositions({ user: proxy!, limit: 200 }),
    enabled: !!proxy && !!_event?.id,
  })
  const marketPositions = allPositions.filter(
    (p) => (p.conditionId && conditionIdsSet.has(p.conditionId)) || (p.asset && tokenIdsSet.has(p.asset))
  )

  const currentPosition = marketPositions.find((p: DataPosition) => p.asset === tokenId)
  const positionShares = Number(currentPosition?.size ?? 0)

  const priceLimit = orderType === 'limit' && limitPrice ? Number(limitPrice) / 100 : marketPrice
  const amountNum = Number(amount) || 0
  const sharesNum = Number(quantityShares) || 0

  const totalLimit = priceLimit > 0 ? sharesNum * priceLimit : 0
  const shares =
    orderType === 'market'
      ? side === 'buy'
        ? marketPrice > 0
          ? amountNum / marketPrice
          : 0
        : amountNum
      : sharesNum
  const toWin = side === 'buy' && shares > 0 ? (1 - priceLimit) * shares : 0

  const validLimit =
    priceLimit > 0 &&
    priceLimit <= 1 &&
    sharesNum >= MIN_ORDER_SHARES &&
    (side === 'sell' ? sharesNum <= positionShares : totalLimit <= proxyCash)
  const maxSellShares = side === 'sell' ? positionShares : 0
  const validMarket =
    side === 'buy'
      ? amountNum >= MIN_ORDER_USD && amountNum <= 100000
      : amountNum > 0 && amountNum <= maxSellShares
  const valid = orderType === 'limit' ? validLimit : validMarket
  const onPolygon = chainId === POLYGON_CHAIN_ID

  const handleSubmit = async () => {
    if (!valid || !isConnected || !tokenId) return
    if (!onPolygon) {
      const switched = await ensureNetwork(POLYGON_CHAIN_ID)
      if (!switched) {
        setOrderResult({ success: false, message: 'Switch to Polygon to trade on Polymarket.' })
        return
      }
    }
    if (!creds) {
      setOrderResult({ success: false, message: 'Enable trading first (derive API key).' })
      return
    }
    if (!proxy) {
      setOrderResult({ success: false, message: 'Polymarket proxy required. Link your account in Profile → Connected Platforms.' })
      return
    }
    setOrderResult(null)
    setIsSubmitting(true)
    const amountToSend = side === 'buy'
      ? (orderType === 'market' ? amountNum : sharesNum * priceLimit)
      : (orderType === 'market' ? shares : sharesNum)
    if (side === 'buy' && amountToSend > proxyCash) {
      setOrderResult({
        success: false,
        message: `Not enough USDC on proxy. Need $${amountToSend.toFixed(2)}, available $${proxyCash.toFixed(2)}. Deposit to your proxy first.`,
      })
      setIsSubmitting(false)
      return
    }
    if (side === 'sell' && orderType === 'limit' && sharesNum > positionShares) {
      setOrderResult({
        success: false,
        message: `Not enough shares. Need ${sharesNum}, available ${positionShares}.`,
      })
      setIsSubmitting(false)
      return
    }
    const priceToUse = orderType === 'limit' ? priceLimit : marketPrice
    const log = (msg: string, meta?: Record<string, unknown>) =>
      logger.info(msg, meta, { component: 'order-form-panel', function: 'onSubmit' })
    log('placeOrder: step 1 — start', { orderType, side: side === 'buy' ? 'BUY' : 'SELL', amount: amountToSend, price: priceToUse, tokenId })
    try {
      let result: { orderID?: string; status?: string; errorMsg?: string }
      if (orderType === 'limit') {
        const params = {
          tokenId,
          side: side === 'buy' ? 'BUY' as const : 'SELL' as const,
          size: sharesNum,
          price: priceToUse,
          tickSize: (book as { tick_size?: string } | undefined)?.tick_size ?? '0.01',
          negRisk: (book as { neg_risk?: boolean } | undefined)?.neg_risk ?? false,
          proxy: proxy ?? undefined,
        }
        result = await placeLimitOrder(params)
      } else {
        const params = {
          tokenId,
          side: side === 'buy' ? 'BUY' as const : 'SELL' as const,
          amount: amountToSend,
          price: priceToUse,
          tickSize: (book as { tick_size?: string } | undefined)?.tick_size ?? '0.01',
          negRisk: (book as { neg_risk?: boolean } | undefined)?.neg_risk ?? false,
          proxy: proxy ?? undefined,
        }
        result = await placeMarketOrder(params)
      }
      log('placeOrder: step 2 — placeOrder result', {
        orderID: result?.orderID,
        status: result?.status,
        errorMsg: result?.errorMsg,
      })
      if (result.errorMsg) {
        setOrderResult({ success: false, message: result.errorMsg })
      } else {
        const msg = `Order ${result.status ?? 'submitted'} ${result.orderID ?? ''}`
        setOrderResult({
          success: true,
          message: orderType === 'market' ? `${msg}. FOK orders fill immediately or cancel.` : msg,
        })
        setAmount('')
        setQuantityShares('')
        if (proxy) queryClient.invalidateQueries({ queryKey: ['positions', 'market', proxy, _event?.id] })
        queryClient.invalidateQueries({ queryKey: ['positions', 'balance', proxy] })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Order failed'
      logger.error('placeOrder: failed', { error: msg }, undefined, { component: 'order-form-panel', function: 'onSubmit' })
      setOrderResult({ success: false, message: msg })
    } finally {
      setIsSubmitting(false)
      log('placeOrder: step 3 — end (isSubmitting=false)')
    }
  }

  const outcomeLabelDisplay = outcomeYes ? 'Yes' : 'No'

  return (
    <div className="rounded-panel bg-bg-secondary/80 backdrop-blur-panel border border-white/10 p-4">
      {!onPolygon && isConnected && (
        <div className="mb-4 p-3 rounded-panel bg-status-warning/25 border border-status-warning/50 text-status-warning text-small font-medium">
          Switch network to Polygon to trade on Polymarket.
        </div>
      )}

      {isConnected && onPolygon && !creds && (
        <div className="mb-4 p-3 rounded-panel bg-bg-tertiary border border-white/10">
          <p className="text-small text-text-body mb-2">Enable trading (one-time): derive API key for order signing.</p>
          {deriveError && <p className="text-tiny text-status-error mb-2">{deriveError}</p>}
          <button
            type="button"
            disabled={isDeriving}
            onClick={deriveApiKey}
            className="w-full py-2 rounded-panel bg-accent-violet/20 text-accent-violet text-small font-medium hover:bg-accent-violet/30 disabled:opacity-50"
          >
            {isDeriving ? 'Deriving...' : 'Enable trading'}
          </button>
        </div>
      )}

      {/* Row 1: Buy/Sell (left) and Limit/Market (right) */}
      <div className="flex items-center justify-between gap-4 mb-3">
        <div className="flex-1">
          <p className="text-tiny text-text-muted mb-1.5">Side</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSide('buy')}
              className={cn(
                'flex-1 py-2.5 rounded-panel text-small font-medium transition-all',
                side === 'buy' ? 'bg-status-success/20 text-status-success border border-status-success/40' : 'bg-bg-tertiary text-text-muted border border-transparent hover:bg-white/5'
              )}
            >
              Buy
            </button>
            <button
              type="button"
              onClick={() => setSide('sell')}
              className={cn(
                'flex-1 py-2.5 rounded-panel text-small font-medium transition-all',
                side === 'sell' ? 'bg-status-error/20 text-status-error border border-status-error/40' : 'bg-bg-tertiary text-text-muted border border-transparent hover:bg-white/5'
              )}
            >
              Sell
            </button>
          </div>
        </div>
        <div className="flex-1">
          <p className="text-tiny text-text-muted mb-1.5">Order type</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOrderType('market')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-panel text-small font-medium transition-all',
                orderType === 'market' ? 'bg-accent-violet/20 text-accent-violet border border-accent-violet/40' : 'bg-bg-tertiary text-text-muted border border-transparent hover:bg-white/5'
              )}
            >
              <Zap className="w-4 h-4" />
              Market
            </button>
            <button
              type="button"
              onClick={() => setOrderType('limit')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-panel text-small font-medium transition-all',
                orderType === 'limit' ? 'bg-accent-violet/20 text-accent-violet border border-accent-violet/40' : 'bg-bg-tertiary text-text-muted border border-transparent hover:bg-white/5'
              )}
            >
              <BarChart3 className="w-4 h-4" />
              Limit
            </button>
          </div>
        </div>
      </div>

      {/* Row 2: Yes / No */}
      <div className="mb-3">
        <p className="text-tiny text-text-muted mb-1.5">Outcome</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              if (!isOutcomeControlled) setInternalOutcomeYes(true)
              onSelectOutcome?.(marketIndex * 2)
            }}
            className={cn(
              'flex-1 py-2.5 rounded-panel text-small font-medium transition-all',
              outcomeYes ? 'bg-status-success/20 text-status-success border border-status-success/40' : 'bg-bg-tertiary text-text-muted border border-transparent hover:bg-white/5'
            )}
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => {
              if (!isOutcomeControlled) setInternalOutcomeYes(false)
              onSelectOutcome?.(marketIndex * 2 + 1)
            }}
            className={cn(
              'flex-1 py-2.5 rounded-panel text-small font-medium transition-all',
              !outcomeYes ? 'bg-status-error/20 text-status-error border border-status-error/40' : 'bg-bg-tertiary text-text-muted border border-transparent hover:bg-white/5'
            )}
          >
            No
          </button>
        </div>
      </div>

      {orderType === 'limit' && (
        <>
          <div className="mb-3">
            <label className="text-small text-text-body block mb-1">Price (per share, ¢)</label>
            <input
              type="number"
              min={1}
              max={99}
              step={0.1}
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              placeholder={(marketPrice * 100).toFixed(1)}
              className="w-full h-10 px-3 rounded-panel bg-bg-tertiary border border-white/10 font-mono text-body outline-none focus:border-accent-violet/50"
            />
          </div>
          <div className="mb-3">
            <label className="text-small text-text-body block mb-1">Quantity (shares)</label>
            <input
              type="number"
              min={0}
              step={1}
              value={quantityShares}
              onChange={(e) => setQuantityShares(e.target.value)}
              placeholder="0"
              className="w-full h-10 px-3 rounded-panel bg-bg-tertiary border border-white/10 font-mono text-body outline-none focus:border-accent-violet/50"
            />
          </div>
          {sharesNum > 0 && sharesNum < MIN_ORDER_SHARES && (
            <p className="text-tiny text-status-error mb-2">Min {MIN_ORDER_SHARES} shares</p>
          )}
          <div className="space-y-1 text-small text-text-muted mb-3">
            <div className="flex justify-between">
              <span>Total</span>
              <span className="text-text-body font-mono">${totalLimit.toFixed(2)}</span>
            </div>
            {side === 'buy' && (
              <div className="flex justify-between">
                <span>To win</span>
                <span className="text-text-body font-mono">${toWin.toFixed(2)}</span>
              </div>
            )}
          </div>
        </>
      )}

      {orderType === 'market' && (
        <div className="mb-4">
          <label className="text-small text-text-body block mb-1.5">
            {side === 'buy' ? 'Amount (USDC)' : 'Quantity (shares)'}
          </label>
          <div className="flex flex-wrap gap-2 items-stretch">
            <input
              type="number"
              min={0}
              step={side === 'buy' ? 0.01 : 1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={side === 'buy' ? '0.00' : '0'}
              data-order-amount
              className={cn(
                'min-w-0 flex-1 min-w-[180px] h-14 px-4 rounded-panel bg-bg-tertiary border font-mono text-body text-lg outline-none transition-colors',
                amount ? (valid ? 'border-status-success/50' : 'border-status-error/50') : 'border-white/10'
              )}
            />
            <div className="flex gap-1.5 shrink-0">
              {(side === 'buy'
                ? [
                    { label: '$25', value: '25' },
                    { label: '$50', value: '50' },
                    { label: '$75', value: '75' },
                    { label: 'MAX', value: '1000' },
                  ]
                : [
                    { label: '25%', value: String(positionShares > 0 ? Math.floor(positionShares * 0.25 * 100) / 100 : 0) },
                    { label: '50%', value: String(positionShares > 0 ? Math.floor(positionShares * 0.5 * 100) / 100 : 0) },
                    { label: '75%', value: String(positionShares > 0 ? Math.floor(positionShares * 0.75 * 100) / 100 : 0) },
                    { label: 'MAX', value: String(positionShares) },
                  ]
              ).map(({ label, value }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setAmount(value)}
                  className="h-14 min-w-[3.5rem] px-3 rounded-panel bg-bg-tertiary border border-white/10 text-small hover:bg-white/5"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {side === 'buy' && amount && !valid && (
            <p className="text-tiny text-status-error mt-1">Min ${MIN_ORDER_USD}</p>
          )}
          {side === 'sell' && positionShares > 0 && (
            <p className="text-tiny text-text-muted mt-1">
              Available: <span className="font-mono">{positionShares.toFixed(2)} shares</span>
            </p>
          )}
          {side === 'sell' && amountNum > positionShares && (
            <p className="text-tiny text-status-error mt-1">
              You only have {positionShares.toFixed(2)} shares to sell.
            </p>
          )}
          {amountNum > 0 && marketPrice > 0 && (
            <p className="text-tiny text-text-muted mt-1">
              {side === 'buy'
                ? `You buy ≈ ${shares.toFixed(2)} shares at ~$${marketPrice.toFixed(2)}`
                : `You sell ≈ ${shares.toFixed(2)} shares at ~$${marketPrice.toFixed(2)}, receive ≈ $${(
                    shares * marketPrice
                  ).toFixed(2)} USDC`}
            </p>
          )}
        </div>
      )}

      {orderResult && (
        <div
          className={cn(
            'mb-4 p-3 rounded-panel text-tiny',
            orderResult.success ? 'bg-status-success/20 text-status-success' : 'bg-status-error/20 text-status-error'
          )}
        >
          <div className="flex flex-wrap items-center gap-2 break-words">
            <span className="min-w-0">
              {(() => {
                const hash = extractTxHash(orderResult.message)
                return hash ? orderResult.message.replace(hash, '').trim() : orderResult.message
              })()}
            </span>
            {extractTxHash(orderResult.message) && (() => {
              const hash = extractTxHash(orderResult.message)!
              return (
                <span className="inline-flex items-center gap-1 shrink-0">
                  <code className="font-mono text-tiny" title={hash}>{truncateHash(hash)}</code>
                  <button
                    type="button"
                    onClick={() => { navigator.clipboard.writeText(hash); setCopiedHash(true); setTimeout(() => setCopiedHash(false), 2000) }}
                    className="p-1 rounded hover:bg-black/10"
                    title="Copy"
                  >
                    {copiedHash ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  <a href={`${POLYGON_SCAN}/tx/${hash}`} target="_blank" rel="noopener noreferrer" className="p-1 rounded hover:bg-black/10" title="PolygonScan">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </span>
              )
            })()}
          </div>
        </div>
      )}

      {proxy ? (
        <p className="mb-3 text-tiny text-text-muted">Proxy USDC balance: ${proxyCash.toFixed(2)}</p>
      ) : null}

      <button
        type="button"
        disabled={!isConnected || !valid || isSubmitting || (onPolygon && !creds)}
        onClick={handleSubmit}
        className={cn(
          'w-full h-12 rounded-panel font-medium text-small transition-colors',
          side === 'buy'
            ? 'bg-status-success hover:bg-status-success/90 text-white disabled:opacity-50 disabled:cursor-not-allowed'
            : 'bg-status-error hover:bg-status-error/90 text-white disabled:opacity-50 disabled:cursor-not-allowed'
        )}
      >
        {!isConnected
          ? 'Connect Wallet'
          : isSubmitting
            ? 'Submitting...'
            : orderType === 'market'
              ? `Trade`
              : `${side === 'buy' ? 'Buy' : 'Sell'} ${outcomeLabelDisplay}`}
      </button>

      <div className="mt-4 p-3 rounded-panel bg-bg-tertiary/50 border border-white/10">
        <h4 className="text-tiny font-semibold text-text-primary mb-2">Your Position</h4>
        {!proxy ? (
          <p className="text-small text-text-muted">Link Polymarket to see positions.</p>
        ) : marketPositions.length === 0 ? (
          <p className="text-small text-text-muted">No position on this market. Open a trade above.</p>
        ) : (
          <ul className="space-y-2 text-small">
            {marketPositions.map((p: DataPosition) => (
              <li key={p.asset ?? p.conditionId ?? Math.random()} className="flex flex-wrap justify-between gap-x-2 gap-y-1">
                <span className="text-text-body">{p.outcome ?? 'Position'}</span>
                <span className="font-mono text-text-body">{Number(p.size ?? 0).toFixed(2)} shares</span>
                {p.avgPrice != null && <span className="text-text-muted w-full">Avg price ${Number(p.avgPrice).toFixed(2)}</span>}
                {p.currentValue != null && <span className="text-text-muted">Value ${Number(p.currentValue).toFixed(2)}</span>}
                {p.cashPnl != null && (
                  <span className={Number(p.cashPnl) >= 0 ? 'text-status-success' : 'text-status-error'}>
                    PnL ${Number(p.cashPnl).toFixed(2)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {creds && openOrders.length > 0 && (
        <div className="mt-4 p-3 rounded-panel bg-bg-tertiary/50 border border-white/10">
          <h4 className="text-tiny font-semibold text-text-primary mb-2">Open Orders</h4>
          <ul className="space-y-2 text-small">
            {openOrders.map((order: any) => (
              <li key={order.id ?? Math.random()} className="flex flex-wrap justify-between gap-x-2 gap-y-1 items-center">
                <span className="text-text-body">{order.side} {order.size} @ ${order.price}</span>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await cancelOrder(order.id)
                      refreshOpenOrders()
                    } catch (e) {
                      console.error('Cancel order failed', e)
                    }
                  }}
                  className="px-2 py-1 rounded text-tiny bg-status-error/20 text-status-error hover:bg-status-error/30"
                >
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
