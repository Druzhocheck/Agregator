import { ArrowLeftRight, ArrowDownToLine } from 'lucide-react'
import { useAccount } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { useBalance } from 'wagmi'
import { useBridgeModals } from '@/shared/context/bridge-modals'
import { fetchPredictPositions, fetchPredictPositionsByAddress } from '@/shared/api/predict'
import { usePredictAuth } from '@/shared/context/predict-auth-context'
import { usePolymarketProxy } from '@/shared/hooks/use-polymarket-proxy'
import { usePolymarketBalance } from '@/shared/hooks/use-polymarket-balance'
import { BNB_CHAIN_ID, USDT_BNB } from '@/shared/config/api'

function formatUsd(n: number) {
  if (!Number.isFinite(n)) return '0.00'
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function BalancesSection() {
  const { address, isConnected } = useAccount()
  const { jwt: predictJwt, account: predictAccount } = usePredictAuth()
  const { openDeposit, openWithdraw } = useBridgeModals()
  const { proxy } = usePolymarketProxy(address ?? undefined)
  const { cash, positionsValue, total, isLoading } = usePolymarketBalance(proxy)
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

  const polymarketRow = isConnected && address
    ? {
        platform: 'Polymarket',
        network: 'Polygon',
        cash: isLoading ? '…' : formatUsd(cash),
        positions: isLoading ? '…' : formatUsd(positionsValue),
        total: isLoading ? '…' : formatUsd(total),
      }
    : null

  const predictCash = predictUsdtBalance ? Number(predictUsdtBalance.formatted) : 0
  const predictPositionsValue = predictPositions.reduce((sum, position) => sum + Number(position.valueUsd ?? 0), 0)
  const predictTotal = predictCash + predictPositionsValue
  const predictRow = isConnected && predictAddress
    ? {
        platform: 'Predict',
        network: 'BNB Chain',
        cash: formatUsd(predictCash),
        positions: formatUsd(predictPositionsValue),
        total: formatUsd(predictTotal),
      }
    : null

  const portfolioTotal = (polymarketRow && !isLoading ? total : 0) + (predictRow ? predictTotal : 0)
  const totalDisplay =
    isLoading ? '…' : formatUsd(portfolioTotal)

  return (
    <>
      <h2 className="text-h3 font-bold text-text-primary mb-4">Balances</h2>
      <div className="rounded-panel bg-bg-secondary/80 backdrop-blur-panel border border-white/10 overflow-hidden">
        <table className="w-full text-small">
          <thead>
            <tr className="border-b border-white/10 text-text-muted">
              <th className="text-left p-3">Platform</th>
              <th className="text-right p-3">Cash</th>
              <th className="text-right p-3">Positions</th>
              <th className="text-right p-3">Total</th>
              <th className="w-24" />
            </tr>
          </thead>
          <tbody>
            {!isConnected || !address ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-text-muted">
                  Connect wallet to see balances.
                </td>
              </tr>
            ) : !proxy ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-text-muted">
                  No Polymarket proxy for this wallet. Link in Connected Platforms to see balance.
                </td>
              </tr>
            ) : (
              <>
              {polymarketRow ? (
              <tr className="border-b border-white/5 hover:bg-white/5">
                <td className="p-3">
                  <span className="text-text-primary">{polymarketRow.platform}</span>
                  <span className="text-tiny text-text-muted block">{polymarketRow.network}</span>
                </td>
                <td className="p-3 text-right font-mono">{polymarketRow.cash}</td>
                <td className="p-3 text-right font-mono">{polymarketRow.positions}</td>
                <td className="p-3 text-right font-mono text-text-primary">{polymarketRow.total}</td>
                <td className="p-2">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={openDeposit}
                      className="p-2 rounded hover:bg-white/10 text-text-muted hover:text-text-body"
                      title="Deposit"
                    >
                      <ArrowDownToLine className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={openWithdraw}
                      className="p-2 rounded hover:bg-white/10 text-text-muted hover:text-text-body"
                      title="Withdraw"
                    >
                      <ArrowLeftRight className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
              ) : null}
              {predictRow ? (
              <tr className="border-b border-white/5 hover:bg-white/5">
                <td className="p-3">
                  <span className="text-text-primary">{predictRow.platform}</span>
                  <span className="text-tiny text-text-muted block">{predictRow.network}</span>
                </td>
                <td className="p-3 text-right font-mono">{predictRow.cash}</td>
                <td className="p-3 text-right font-mono">{predictRow.positions}</td>
                <td className="p-3 text-right font-mono text-text-primary">{predictRow.total}</td>
                <td className="p-2">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={openDeposit}
                      className="p-2 rounded hover:bg-white/10 text-text-muted hover:text-text-body"
                      title="Deposit to Predict"
                    >
                      <ArrowDownToLine className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={openWithdraw}
                      className="p-2 rounded hover:bg-white/10 text-text-muted hover:text-text-body"
                      title="Withdraw from Predict"
                    >
                      <ArrowLeftRight className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
              ) : null}
              </>
            )}
          </tbody>
          <tfoot>
            <tr className="bg-accent-violet/10 font-semibold">
              <td className="p-3 text-text-primary">TOTAL PORTFOLIO VALUE</td>
              <td colSpan={2} className="p-3 text-right" />
              <td className="p-3 text-right text-text-primary">${totalDisplay}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  )
}
