import { ArrowLeftRight, ArrowDownToLine } from 'lucide-react'
import { useAccount } from 'wagmi'
import { useBridgeModals } from '@/shared/context/bridge-modals'
import { usePolymarketProxy } from '@/shared/hooks/use-polymarket-proxy'
import { usePolymarketBalance } from '@/shared/hooks/use-polymarket-balance'

function formatUsd(n: number) {
  if (!Number.isFinite(n)) return '0.00'
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function BalancesSection() {
  const { address, isConnected } = useAccount()
  const { openDeposit, openWithdraw } = useBridgeModals()
  const { proxy } = usePolymarketProxy(address ?? undefined)
  const { cash, positionsValue, total, isLoading } = usePolymarketBalance(proxy)

  const polymarketRow = isConnected && address
    ? {
        platform: 'Polymarket',
        network: 'Polygon',
        cash: isLoading ? '…' : formatUsd(cash),
        positions: isLoading ? '…' : formatUsd(positionsValue),
        total: isLoading ? '…' : formatUsd(total),
      }
    : null

  const totalDisplay = polymarketRow && !isLoading ? formatUsd(total) : (isLoading ? '…' : '0.00')

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
            ) : polymarketRow ? (
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
