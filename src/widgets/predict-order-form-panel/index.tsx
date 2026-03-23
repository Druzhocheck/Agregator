import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAccount, useBalance, useWalletClient } from 'wagmi'
import type { PredictMarket } from '@/entities/market/types'
import {
  buildPredictOrder,
  createPredictOrder,
  fetchPredictOrderbook,
  fetchPredictPositions,
  fetchPredictPositionsByAddress,
} from '@/shared/api/predict'
import { BNB_CHAIN_ID, USDT_BNB } from '@/shared/config/api'
import { usePredictAuth } from '@/shared/context/predict-auth-context'
import { useEnsureNetwork } from '@/shared/hooks/use-ensure-network'
import { cn } from '@/shared/lib/cn'
import { BarChart3, Zap } from 'lucide-react'

interface PredictOrderFormPanelProps {
  market: PredictMarket | null
  outcomeLabel: string
  yesLabel?: string
  noLabel?: string
}

export function PredictOrderFormPanel({
  market,
  outcomeLabel,
  yesLabel = 'Yes',
  noLabel = 'No',
}: PredictOrderFormPanelProps) {
  const { address, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()
  const { ensureNetwork, chainId } = useEnsureNetwork()
  const { jwt, isConnected: predictConnected, connect, isConnecting, error: predictError, account } = usePredictAuth()
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET')
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [selectedOutcomeName, setSelectedOutcomeName] = useState<string>(outcomeLabel)
  const [amountUsd, setAmountUsd] = useState('')
  const [quantity, setQuantity] = useState('')
  const [limitPrice, setLimitPrice] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  useEffect(() => {
    setSelectedOutcomeName(outcomeLabel)
  }, [outcomeLabel])

  const selectedOutcome =
    market?.outcomes.find((outcome) => outcome.name.trim().toLowerCase() === selectedOutcomeName.trim().toLowerCase()) ??
    null
  const predictAddress = account?.address ?? address ?? undefined

  const { data: orderbook } = useQuery({
    queryKey: ['predict-order-form-book', market?.id],
    queryFn: () => fetchPredictOrderbook(market!.id),
    enabled: !!market?.id,
    staleTime: 15_000,
  })

  const { data: predictPositions = [] } = useQuery({
    queryKey: ['predict-order-form-positions', predictAddress, jwt],
    queryFn: async () => {
      if (jwt) return fetchPredictPositions(jwt, { first: 100 })
      if (predictAddress) return fetchPredictPositionsByAddress(predictAddress, { first: 100 })
      return []
    },
    enabled: !!predictAddress,
    staleTime: 30_000,
  })

  const { data: usdtBalance } = useBalance({
    address: predictAddress as `0x${string}` | undefined,
    token: USDT_BNB as `0x${string}`,
    chainId: BNB_CHAIN_ID,
  })

  const usdtCash = Number(usdtBalance?.formatted ?? 0)
  const positionShares = useMemo(() => {
    if (!market) return 0
    const matched = predictPositions.find(
      (position) =>
        Number(position.market?.id) === Number(market.id) &&
        String(position.outcome?.name || '').trim().toLowerCase() === selectedOutcomeName.trim().toLowerCase()
    )
    return Number(matched?.amount ?? 0)
  }, [predictPositions, market, selectedOutcomeName])

  const handleConnect = async () => {
    if (!address) return
    const ok = await ensureNetwork(BNB_CHAIN_ID)
    if (!ok) {
      setResult({ success: false, message: 'Switch to BNB Chain to connect Predict.' })
      return
    }
    const connected = await connect(address)
    if (!connected) {
      setResult({ success: false, message: 'Failed to connect Predict.' })
    }
  }

  const handleSubmit = async () => {
    if (!market || !selectedOutcome || !address) return
    const onBnb = await ensureNetwork(BNB_CHAIN_ID)
    if (!onBnb) {
      setResult({ success: false, message: 'Switch to BNB Chain to place Predict orders.' })
      return
    }
    if (!predictConnected || !jwt) {
      setResult({ success: false, message: 'Link Predict first in Connected Platforms.' })
      return
    }
    setIsSubmitting(true)
    setResult(null)
    try {
      const isBuy = side === 'buy'
      const built = await buildPredictOrder({
        strategy: orderType,
        side: isBuy ? 'BUY' : 'SELL',
        signer: address,
        tokenId: selectedOutcome.onChainId,
        amountUsd: orderType === 'MARKET' && isBuy ? amountUsd : undefined,
        quantity: orderType === 'LIMIT' || !isBuy ? quantity || undefined : undefined,
        limitPrice: orderType === 'LIMIT' ? limitPrice : undefined,
        slippageBps: orderType === 'MARKET' ? 100 : undefined,
        feeRateBps: market.feeRateBps ?? 0,
        isNegRisk: market.isNegRisk,
        isYieldBearing: market.isYieldBearing,
        marketId: market.id,
        orderbook: orderbook
          ? {
              asks: orderbook.asks.map((level) => [Number(level.price), Number(level.size)] as [number, number]),
              bids: orderbook.bids.map((level) => [Number(level.price), Number(level.size)] as [number, number]),
            }
          : undefined,
      })
      if (!built) throw new Error('Failed to build Predict order')
      if (!walletClient) throw new Error('Wallet client unavailable')
      const signature = await (walletClient as unknown as {
        signTypedData: (args: Record<string, unknown>) => Promise<string>
      }).signTypedData({
        account: address as `0x${string}`,
        domain: built.typedData.domain,
        types: built.typedData.types,
        primaryType: built.typedData.primaryType,
        message: built.typedData.message,
      })
      const created = await createPredictOrder(jwt, {
        data: {
          order: {
            ...built.order,
            hash: built.hash,
            signature,
            signatureType: 0,
          },
          pricePerShare: built.pricePerShare,
          strategy: orderType,
          ...(orderType === 'MARKET' ? { isFillOrKill: false, slippageBps: built.slippageBps } : {}),
        },
      })
      if (!created) {
        throw new Error('Predict order was rejected. Ensure BNB gas and approvals are set for your wallet.')
      }
      setResult({ success: true, message: `Predict order submitted: ${created.orderHash}` })
      setAmountUsd('')
      setQuantity('')
      setLimitPrice('')
    } catch (e) {
      setResult({
        success: false,
        message: e instanceof Error ? e.message : 'Predict order failed',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const setMarketPreset = (value: string) => {
    if (side === 'buy') setAmountUsd(value)
    else setQuantity(value)
  }

  const marketPresets =
    side === 'buy'
      ? [
          { label: '25%', value: String(Math.floor(usdtCash * 0.25 * 100) / 100) },
          { label: '50%', value: String(Math.floor(usdtCash * 0.5 * 100) / 100) },
          { label: '75%', value: String(Math.floor(usdtCash * 0.75 * 100) / 100) },
          { label: 'MAX', value: String(Math.floor(usdtCash * 100) / 100) },
        ]
      : [
          { label: '25%', value: String(Math.floor(positionShares * 0.25 * 100) / 100) },
          { label: '50%', value: String(Math.floor(positionShares * 0.5 * 100) / 100) },
          { label: '75%', value: String(Math.floor(positionShares * 0.75 * 100) / 100) },
          { label: 'MAX', value: String(Math.floor(positionShares * 100) / 100) },
        ]

  const valid =
    orderType === 'MARKET'
      ? side === 'buy'
        ? Number(amountUsd || 0) > 0
        : Number(quantity || 0) > 0 && Number(quantity || 0) <= positionShares
      : Number(quantity || 0) > 0 &&
        Number(limitPrice || 0) > 0 &&
        Number(limitPrice || 0) <= 1 &&
        (side === 'buy' || Number(quantity || 0) <= positionShares)

  return (
    <div className="rounded-panel bg-bg-secondary/80 backdrop-blur-panel border border-white/10 p-4">
      <h3 className="text-base font-bold text-text-primary mb-2">Predict</h3>
      {!predictConnected && chainId !== BNB_CHAIN_ID && isConnected && (
        <div className="mb-4 p-3 rounded-panel bg-status-warning/25 border border-status-warning/50 text-status-warning text-small font-medium">
          Switch network to BNB Chain to trade on Predict.
        </div>
      )}

      {!isConnected ? (
        <p className="text-small text-text-muted">Connect wallet to trade on Predict.</p>
      ) : !predictConnected ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleConnect}
            disabled={isConnecting}
            className="w-full h-10 rounded-panel bg-accent-violet text-white text-small font-medium disabled:opacity-50"
          >
            {isConnecting ? 'Connecting Predict…' : 'Link Predict'}
          </button>
          {chainId !== BNB_CHAIN_ID && (
            <p className="text-tiny text-status-warning">Switch to BNB Chain, then link Predict.</p>
          )}
          {predictError && <p className="text-tiny text-status-error">{predictError}</p>}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
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
                  onClick={() => setOrderType('MARKET')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-panel text-small font-medium transition-all',
                    orderType === 'MARKET' ? 'bg-accent-violet/20 text-accent-violet border border-accent-violet/40' : 'bg-bg-tertiary text-text-muted border border-transparent hover:bg-white/5'
                  )}
                >
                  <Zap className="w-4 h-4" />
                  Market
                </button>
                <button
                  type="button"
                  onClick={() => setOrderType('LIMIT')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-panel text-small font-medium transition-all',
                    orderType === 'LIMIT' ? 'bg-accent-violet/20 text-accent-violet border border-accent-violet/40' : 'bg-bg-tertiary text-text-muted border border-transparent hover:bg-white/5'
                  )}
                >
                  <BarChart3 className="w-4 h-4" />
                  Limit
                </button>
              </div>
            </div>
          </div>

          <div>
            <p className="text-tiny text-text-muted mb-1.5">Outcome</p>
            <div className="flex gap-2">
              <button
                type="button"
                  onClick={() => setSelectedOutcomeName(yesLabel)}
                className={cn(
                  'flex-1 py-2.5 rounded-panel text-small font-medium transition-all',
                    selectedOutcomeName.trim().toLowerCase() === yesLabel.trim().toLowerCase() ? 'bg-status-success/20 text-status-success border border-status-success/40' : 'bg-bg-tertiary text-text-muted border border-transparent hover:bg-white/5'
                )}
              >
                  {yesLabel}
              </button>
              <button
                type="button"
                  onClick={() => setSelectedOutcomeName(noLabel)}
                className={cn(
                  'flex-1 py-2.5 rounded-panel text-small font-medium transition-all',
                    selectedOutcomeName.trim().toLowerCase() === noLabel.trim().toLowerCase() ? 'bg-status-error/20 text-status-error border border-status-error/40' : 'bg-bg-tertiary text-text-muted border border-transparent hover:bg-white/5'
                )}
              >
                  {noLabel}
              </button>
            </div>
          </div>

          {orderType === 'MARKET' ? (
            <div>
              <label className="text-small text-text-body block mb-1.5">
                {side === 'buy' ? 'Amount (USDT)' : 'Quantity (shares)'}
              </label>
              <div className="flex flex-wrap gap-2 items-stretch">
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={side === 'buy' ? amountUsd : quantity}
                  onChange={(e) => side === 'buy' ? setAmountUsd(e.target.value) : setQuantity(e.target.value)}
                  placeholder={side === 'buy' ? '0.00' : '0'}
                  className="min-w-0 flex-1 min-w-[180px] h-14 px-4 rounded-panel bg-bg-tertiary border border-white/10 font-mono text-body text-lg outline-none"
                />
                <div className="flex gap-1.5 shrink-0">
                  {marketPresets.map(({ label, value }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setMarketPreset(value)}
                      className="h-14 min-w-[3.5rem] px-3 rounded-panel bg-bg-tertiary border border-white/10 text-small hover:bg-white/5"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {side === 'buy' ? (
                <p className="text-tiny text-text-muted mt-1">Wallet USDT balance: ${usdtCash.toFixed(2)}</p>
              ) : (
                <p className="text-tiny text-text-muted mt-1">Available: {positionShares.toFixed(2)} shares</p>
              )}
            </div>
          ) : (
            <>
              <div>
                <label className="text-small text-text-body block mb-1">Price (per share)</label>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value)}
                  className="w-full h-11 px-3 rounded-panel bg-bg-tertiary border border-white/10 font-mono text-body outline-none"
                  placeholder="0.50"
                />
              </div>
              <div>
                <label className="text-small text-text-body block mb-1">Quantity (shares)</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full h-11 px-3 rounded-panel bg-bg-tertiary border border-white/10 font-mono text-body outline-none"
                  placeholder="10"
                />
              </div>
              {side === 'sell' && <p className="text-tiny text-text-muted mt-1">Available: {positionShares.toFixed(2)} shares</p>}
            </>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={
              isSubmitting ||
              !market ||
              !selectedOutcome ||
              !valid
            }
            className={cn(
              'w-full h-11 rounded-panel text-white text-small font-medium disabled:opacity-50',
              side === 'buy' ? 'bg-status-success hover:bg-status-success/90' : 'bg-status-error hover:bg-status-error/90'
            )}
          >
            {isSubmitting ? 'Submitting…' : orderType === 'MARKET' ? 'Trade' : `${side === 'buy' ? 'Buy' : 'Sell'} ${selectedOutcomeName}`}
          </button>

          <p className="text-tiny text-text-muted">
            If your wallet has not approved Predict contracts yet, the order may fail until approvals are set on BNB Chain.
          </p>
          {result && (
            <p className={`text-tiny ${result.success ? 'text-status-success' : 'text-status-error'}`}>
              {result.message}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

