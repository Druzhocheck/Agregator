import { useState } from 'react'
import { useBalance } from 'wagmi'
import { ExternalLink } from 'lucide-react'
import { useCopyTradingVault } from '@/shared/hooks/use-copy-trading-vault'
import { USDC_AVALANCHE, COPY_TRADING_VAULT_ADDRESS, AVALANCHE_CHAIN_ID } from '@/shared/config/copy-trading-vault'
import { cn } from '@/shared/lib/cn'

function formatUsd(n: number) {
  if (!Number.isFinite(n)) return '0.00'
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function CopyTradingSection() {
  const {
    vaultBalance,
    allowance,
    isAvalanche,
    isConnected,
    address,
    approve,
    deposit,
    withdraw,
    switchToAvalanche,
    refetchVaultBalance,
  } = useCopyTradingVault()

  const { data: usdcBalance, refetch: refetchUsdcBalance } = useBalance({
    address: address ?? undefined,
    token: USDC_AVALANCHE as `0x${string}`,
    chainId: AVALANCHE_CHAIN_ID,
  })

  const [depositAmount, setDepositAmount] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<'approve' | 'deposit' | 'withdraw' | 'switch' | null>(null)

  const depositNum = Number(depositAmount?.replace(',', '.').trim()) || 0
  const withdrawNum = Number(withdrawAmount?.replace(',', '.').trim()) || 0
  const usdcOnAvalanche = usdcBalance ? Number(usdcBalance.formatted) : 0
  const needsApprove = depositNum > 0 && allowance < depositNum

  const handleApprove = async () => {
    setError(null)
    setPending('approve')
    try {
      await approve()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approve failed')
    } finally {
      setPending(null)
    }
  }

  const handleDeposit = async () => {
    setError(null)
    if (depositNum <= 0) {
      setError('Enter amount')
      return
    }
    if (depositNum > usdcOnAvalanche) {
      setError('Not enough USDC on Avalanche')
      return
    }
    if (needsApprove) {
      setError('Approve USDC first')
      return
    }
    setPending('deposit')
    try {
      await deposit(depositNum)
      setDepositAmount('')
      refetchUsdcBalance()
      setTimeout(() => refetchUsdcBalance(), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Deposit failed')
    } finally {
      setPending(null)
    }
  }

  const handleWithdraw = async () => {
    setError(null)
    if (withdrawNum <= 0) {
      setError('Enter amount')
      return
    }
    if (withdrawNum > vaultBalance) {
      setError('Not enough balance in vault')
      return
    }
    setPending('withdraw')
    try {
      await withdraw(withdrawNum)
      setWithdrawAmount('')
      refetchUsdcBalance()
      setTimeout(() => refetchUsdcBalance(), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Withdraw failed')
    } finally {
      setPending(null)
    }
  }

  return (
    <>
      <h2 className="text-h3 font-bold text-text-primary mb-4">Copy Trading Vault</h2>
      <div className="rounded-panel bg-bg-secondary/80 backdrop-blur-panel border border-white/10 overflow-hidden">
        <div className="p-4">
          <p className="text-small text-text-muted mb-4">
            Deposit USDC on Avalanche to fund copy-trading. Withdraw returns funds to your wallet. Network: Avalanche C-Chain.
          </p>

          {!isConnected || !address ? (
            <p className="text-text-muted text-body">Connect wallet to deposit or withdraw.</p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 mb-6">
                <div className="rounded-panel bg-bg-tertiary/50 border border-white/10 p-4">
                  <div className="text-tiny text-text-muted uppercase mb-1">In vault</div>
                  <div className="text-body font-mono text-text-primary">${formatUsd(vaultBalance)} USDC</div>
                  <button
                    type="button"
                    onClick={() => refetchVaultBalance()}
                    className="mt-1 text-tiny text-accent-violet hover:underline"
                  >
                    Refresh
                  </button>
                </div>
                <div className="rounded-panel bg-bg-tertiary/50 border border-white/10 p-4">
                  <div className="text-tiny text-text-muted uppercase mb-1">Your USDC on Avalanche</div>
                  <div className="text-body font-mono text-text-primary">
                    {usdcBalance != null ? `$${formatUsd(usdcOnAvalanche)} USDC` : '…'}
                  </div>
                  <button
                    type="button"
                    onClick={() => refetchUsdcBalance()}
                    className="mt-1 text-tiny text-accent-violet hover:underline"
                  >
                    Refresh
                  </button>
                  {!isAvalanche && (
                    <button
                      type="button"
                      onClick={async () => {
                        setPending('switch')
                        setError(null)
                        try {
                          const ok = await switchToAvalanche()
                          if (!ok) setError('Switch to Avalanche rejected')
                        } catch (e) {
                          setError(e instanceof Error ? e.message : 'Switch failed')
                        } finally {
                          setPending(null)
                        }
                      }}
                      disabled={pending != null}
                      className="mt-2 px-3 py-1.5 rounded-panel bg-accent-violet/20 text-accent-violet border border-accent-violet/40 text-small hover:bg-accent-violet/30 disabled:opacity-50"
                    >
                      {pending === 'switch' ? 'Switching…' : 'Switch to Avalanche'}
                    </button>
                  )}
                  {isAvalanche && usdcOnAvalanche === 0 && (
                    <p className="mt-1 text-tiny text-status-warning">
                      No USDC on Avalanche. Bridge or buy USDC on Avalanche first (e.g. via a DEX or bridge).
                    </p>
                  )}
                </div>
              </div>

              {error && (
                <p className="text-small text-status-error mb-4">{error}</p>
              )}

              <div className="space-y-4">
                <div className="flex flex-wrap gap-2 items-end">
                  <div>
                    <label className="text-tiny text-text-muted block mb-1">Deposit amount (USDC)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-32 h-10 px-3 rounded-panel bg-bg-tertiary border border-white/10 font-mono text-body outline-none focus:border-accent-violet/50"
                    />
                  </div>
                  {needsApprove && (
                    <button
                      type="button"
                      onClick={handleApprove}
                      disabled={pending != null || !isAvalanche}
                      className={cn(
                        'h-10 px-4 rounded-panel text-small font-medium',
                        'bg-accent-violet/20 text-accent-violet border border-accent-violet/40',
                        'hover:bg-accent-violet/30 disabled:opacity-50'
                      )}
                    >
                      {pending === 'approve' ? 'Approving…' : 'Approve USDC'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleDeposit}
                    disabled={pending != null || depositNum <= 0 || needsApprove || !isAvalanche}
                    className={cn(
                      'h-10 px-4 rounded-panel text-small font-medium',
                      'bg-status-success/20 text-status-success border border-status-success/40',
                      'hover:bg-status-success/30 disabled:opacity-50'
                    )}
                  >
                    {pending === 'deposit' ? 'Depositing…' : 'Deposit'}
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 items-end">
                  <div>
                    <label className="text-tiny text-text-muted block mb-1">Withdraw amount (USDC)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-32 h-10 px-3 rounded-panel bg-bg-tertiary border border-white/10 font-mono text-body outline-none focus:border-accent-violet/50"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setWithdrawAmount(String(vaultBalance))}
                    className="h-10 px-2 text-tiny text-text-muted hover:text-text-body"
                  >
                    Max
                  </button>
                  <button
                    type="button"
                    onClick={handleWithdraw}
                    disabled={pending != null || withdrawNum <= 0 || !isAvalanche}
                    className={cn(
                      'h-10 px-4 rounded-panel text-small font-medium',
                      'bg-status-error/20 text-status-error border border-status-error/40',
                      'hover:bg-status-error/30 disabled:opacity-50'
                    )}
                  >
                    {pending === 'withdraw' ? 'Withdrawing…' : 'Withdraw'}
                  </button>
                </div>
              </div>

              <a
                href={`https://snowtrace.io/address/${COPY_TRADING_VAULT_ADDRESS}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-4 text-small text-accent-blue hover:underline"
              >
                View contract on Snowtrace <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </>
          )}
        </div>
      </div>
    </>
  )
}
