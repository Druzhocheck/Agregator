import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, Plus } from 'lucide-react'
import { useAccount } from 'wagmi'
import { useBalance } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { fetchPredictPositions, fetchPredictPositionsByAddress } from '@/shared/api/predict'
import { usePredictAuth } from '@/shared/context/predict-auth-context'
import { useBridgeModals } from '@/shared/context/bridge-modals'
import { usePolymarketProxy } from '@/shared/hooks/use-polymarket-proxy'
import { usePolymarketBalance } from '@/shared/hooks/use-polymarket-balance'
import { BNB_CHAIN_ID, USDT_BNB } from '@/shared/config/api'

function formatUsd(n: number) {
  if (!Number.isFinite(n)) return '0.00'
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function BalanceDropdown() {
  const [open, setOpen] = useState(false)
  const { address, isConnected } = useAccount()
  const { jwt: predictJwt, account: predictAccount } = usePredictAuth()
  const { openDeposit, openWithdraw } = useBridgeModals()
  const { proxy } = usePolymarketProxy(address ?? undefined)
  const { cash, positionsValue, isLoading } = usePolymarketBalance(proxy)
  const predictAddress = predictAccount?.address ?? address ?? undefined

  const { data: predictUsdtBalance } = useBalance({
    address: predictAddress as `0x${string}` | undefined,
    token: USDT_BNB as `0x${string}`,
    chainId: BNB_CHAIN_ID,
  })

  const { data: predictPositions = [] } = useQuery({
    queryKey: ['balances', 'predict-positions', predictAddress, predictJwt],
    queryFn: async () => {
      if (predictJwt) return fetchPredictPositions(predictJwt, { first: 100 })
      if (predictAddress) return fetchPredictPositionsByAddress(predictAddress, { first: 100 })
      return []
    },
    enabled: !!predictAddress,
    staleTime: 30_000,
  })

  const predictCash = predictUsdtBalance ? Number(predictUsdtBalance.formatted) : 0
  const predictPositionsValue = predictPositions.reduce((sum, position) => sum + Number(position.valueUsd ?? 0), 0)
  const polymarketTotal = proxy && !isLoading ? cash + positionsValue : 0
  const predictTotal = predictAddress ? predictCash + predictPositionsValue : 0
  const displayTotal = isConnected && address ? (isLoading ? '…' : `$${formatUsd(polymarketTotal + predictTotal)}`) : '$0.00'
  const breakdown = isConnected
    ? [
        { platform: 'Polymarket (cash)', value: formatUsd(cash) },
        { platform: 'Polymarket (positions)', value: formatUsd(positionsValue) },
        ...(predictAddress
          ? [
              { platform: 'Predict (cash)', value: formatUsd(predictCash) },
              { platform: 'Predict (positions)', value: formatUsd(predictPositionsValue) },
            ]
          : []),
      ].filter((row) => !(row.platform.startsWith('Polymarket') && !proxy))
    : []

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 h-10 px-3 rounded-panel bg-gradient-to-r from-accent-violet/30 to-accent-blue/30 border border-white/10 hover:border-accent-violet/40 transition-all duration-200"
      >
        <span className="text-small font-medium text-text-primary">{displayTotal}</span>
        <ChevronDown className="w-4 h-4 text-text-muted" />
        <span className="ml-1 p-0.5 rounded bg-white/10 hover:bg-white/20">
          <Plus className="w-4 h-4" />
        </span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute top-full right-0 mt-1 z-50 w-56 rounded-panel bg-bg-secondary/95 backdrop-blur-panel border border-white/10 shadow-xl py-2">
            <div className="px-3 py-1 text-tiny text-text-muted uppercase">By platform</div>
            {breakdown.length === 0 ? (
              <div className="px-3 py-2 text-small text-text-muted">
                {!isConnected ? 'Connect wallet to see balance.' : 'Link Polymarket or Predict in Profile.'}
              </div>
            ) : (
              breakdown.map((row) => (
                <div key={row.platform} className="flex justify-between px-3 py-1.5 text-small">
                  <span className="text-text-body">{row.platform}</span>
                  <span className="text-text-primary font-mono">${row.value}</span>
                </div>
              ))
            )}
            <div className="border-t border-white/10 mt-2 pt-2 px-3 space-y-1">
              <div>
                <button type="button" onClick={() => { openDeposit(); setOpen(false) }} className="text-small text-accent-violet hover:underline">
                  Deposit
                </button>
                <span className="mx-2 text-text-muted">·</span>
                <button type="button" onClick={() => { openWithdraw(); setOpen(false) }} className="text-small text-accent-blue hover:underline">
                  Withdraw
                </button>
              </div>
              <Link to="/profile#copy-trading" onClick={() => setOpen(false)} className="block text-small text-accent-violet/90 hover:underline">
                Copy Trading Vault
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
