import { useState, useEffect } from 'react'
import { X, ExternalLink, Copy, Check } from 'lucide-react'
import { useAccount, useBalance, useChainId, usePublicClient, useSendTransaction, useSwitchChain } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { parseUnits } from 'viem'
import { usePredictAuth } from '@/shared/context/predict-auth-context'
import { usePolymarketProxy } from '@/shared/hooks/use-polymarket-proxy'
import { getBridgeCurrencies, getBridgeQuote, type BridgeCurrency, type BridgeQuoteStep } from '@/shared/api/onboard'
import { BNB_CHAIN_ID, USDT_BNB } from '@/shared/config/api'

interface DepositModalProps {
  onClose: () => void
}

const AVALANCHE_CHAIN_ID = 43114
const POLYGON_CHAIN_ID = 137
const MIN_DEPOSIT_USD = 1
const QUOTE_EXPIRY_MS = 120_000
const SNOWTRACE_BASE = 'https://snowtrace.io'
const BSCSCAN_BASE = 'https://bscscan.com'

const PLATFORMS = [{ id: 'polymarket', name: 'Polymarket' }, { id: 'predict', name: 'Predict' }] as const

export function DepositModal({ onClose }: DepositModalProps) {
  const { address, isConnected } = useAccount()
  const { account: predictAccount } = usePredictAuth()
  const chainId = useChainId()
  const publicClient = usePublicClient()
  const { switchChainAsync } = useSwitchChain()
  const { sendTransactionAsync } = useSendTransaction()
  const queryClient = useQueryClient()
  const { proxy, refetch: refetchProxy, isLoading: proxyLoading } = usePolymarketProxy(address ?? undefined)
  const [platform, setPlatform] = useState<string>(PLATFORMS[0].id)
  const [mode, setMode] = useState<'receive' | 'spend'>('receive')
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currencies, setCurrencies] = useState<BridgeCurrency[]>([])
  const [selectedToken, setSelectedToken] = useState('')
  const [quoting, setQuoting] = useState(false)
  const [quote, setQuote] = useState<{ steps: BridgeQuoteStep[]; expectedDestinationOut?: number; expectedTokenIn?: number; quotedAt: number } | null>(null)
  const [sending, setSending] = useState(false)
  const [depositStep, setDepositStep] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [lastTxHash, setLastTxHash] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!address || !isConnected || !proxy) {
      setLoading(false)
      return
    }
    refetchProxy()
  }, [address, isConnected, refetchProxy])

  useEffect(() => {
    if (!address || !isConnected) {
      setLoading(false)
      return
    }
    let cancelled = false
    setError(null)
    setLoading(true)
    getBridgeCurrencies(AVALANCHE_CHAIN_ID)
      .then((list) => {
        if (cancelled) return
        setCurrencies(list)
        if (list.length > 0 && !selectedToken) setSelectedToken(list[0].address)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [address, isConnected, proxy, selectedToken])

  const isPolymarket = platform === 'polymarket'
  const isPredict = platform === 'predict'
  const proxyResolved = isPolymarket && !proxyLoading
  const showProxyOnlyMessage = isPolymarket && proxyResolved && !proxy && !loading && !error
  const predictDepositAddress = predictAccount?.address ?? address ?? ''
  const recipientAddress = isPredict ? predictDepositAddress : (proxy ?? '')
  const destinationChainId = isPredict ? BNB_CHAIN_ID : POLYGON_CHAIN_ID
  const destinationCurrency = isPredict ? USDT_BNB : undefined
  const destinationSymbol = isPredict ? 'USDT' : 'USDC'
  const destinationExplorerBase = isPredict ? BSCSCAN_BASE : 'https://polygonscan.com'

  const selectedAsset = currencies.find((c) => c.address === selectedToken) ?? currencies[0]
  const amountNum = Number(amount || 0)
  const isAvalanche = chainId === AVALANCHE_CHAIN_ID
  const canGetQuote = !!address && !!recipientAddress && !!selectedAsset && amountNum >= MIN_DEPOSIT_USD
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!quote) return
    const id = setInterval(() => setTick((t) => t + 1), 10_000)
    return () => clearInterval(id)
  }, [quote])
  const quoteExpired = quote && Date.now() - quote.quotedAt > QUOTE_EXPIRY_MS
  const { data: avaxBalance } = useBalance({
    address: address ?? undefined,
    chainId: AVALANCHE_CHAIN_ID,
  })
  const { data: tokenBalance } = useBalance({
    address: address ?? undefined,
    token: selectedAsset?.metadata?.isNative ? undefined : (selectedAsset?.address as `0x${string}` | undefined),
    chainId: AVALANCHE_CHAIN_ID,
  })
  const { data: predictUsdtBalance } = useBalance({
    address: predictDepositAddress ? (predictDepositAddress as `0x${string}`) : undefined,
    token: USDT_BNB as `0x${string}`,
    chainId: BNB_CHAIN_ID,
  })

  const copyAddress = async () => {
    if (!recipientAddress) return
    await navigator.clipboard.writeText(recipientAddress)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  const handleGetQuote = async () => {
    if (!address || !recipientAddress || !selectedAsset || !canGetQuote) return
    setError(null)
    setSuccess(false)
    setQuote(null)
    setQuoting(true)
    try {
      const body: {
        user: string
        recipient: string
        originCurrency: string
        amount?: string
        amountWei?: string
        exactOutputUsdc?: string
        exactOutputAmountWei?: string
        destinationChainId?: number
        destinationCurrency?: string
      } = {
        user: address,
        recipient: recipientAddress,
        originCurrency: selectedAsset.address,
        destinationChainId,
        destinationCurrency,
      }
      if (mode === 'receive') {
        if (isPredict) {
          body.exactOutputAmountWei = parseUnits(String(amountNum), 18).toString()
        } else {
          body.exactOutputUsdc = String(amountNum)
        }
      } else if (selectedAsset.symbol.toUpperCase() === 'USDC') {
        body.amount = String(amountNum)
      } else {
        body.amountWei = parseUnits(String(amountNum), selectedAsset.decimals).toString()
      }
      const q = await getBridgeQuote(body)
      const outDecimals = isPredict ? 18 : 6
      const expectedDestinationOut = q?.details?.currencyOut?.amount
        ? Number(q.details.currencyOut.amount) / 10 ** outDecimals
        : undefined
      const expectedTokenIn = q?.details?.currencyIn?.amount ? Number(q.details.currencyIn.amount) / 10 ** (selectedAsset.decimals || 18) : undefined
      setQuote({ steps: q.steps ?? [], expectedDestinationOut, expectedTokenIn, quotedAt: Date.now() })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to get quote'
      setError(msg)
    } finally {
      setQuoting(false)
    }
  }

  const handleDepositNow = async () => {
    if (!quote) return
    if (quoteExpired) {
      setError('Quote expired. Get a new quote.')
      setQuote(null)
      return
    }
    setError(null)
    setSending(true)
    setSuccess(false)
    setLastTxHash(null)
    try {
      if (!isAvalanche && switchChainAsync) {
        setDepositStep('Switching to Avalanche…')
        await switchChainAsync({ chainId: AVALANCHE_CHAIN_ID })
        setDepositStep('Sending transaction…')
      } else {
        setDepositStep('Sending transaction…')
      }
      const txSteps = quote.steps.filter((s) => s.items?.some((i) => i.data))
      for (let i = 0; i < txSteps.length; i++) {
        const step = txSteps[i]
        setDepositStep(`Transaction ${i + 1} of ${txSteps.length}…`)
        for (const item of step.items ?? []) {
          const d = item.data
          if (!d) continue
          const hash = await sendTransactionAsync({
            to: d.to as `0x${string}`,
            data: d.data as `0x${string}`,
            value: BigInt(d.value || '0'),
            chainId: d.chainId ?? AVALANCHE_CHAIN_ID,
          })
          setLastTxHash(hash)
          if (publicClient) {
            const receipt = await publicClient.waitForTransactionReceipt({ hash })
            if (receipt.status !== 'success') {
              throw new Error('Bridge transaction on Avalanche failed. Check the transaction in your wallet or on Snowtrace.')
            }
          }
        }
      }
      setSuccess(true)
      setQuote(null)
      setDepositStep(null)
      queryClient.invalidateQueries({ queryKey: ['positions'] })
      queryClient.invalidateQueries({ queryKey: ['positions', 'balance', proxy] })
      queryClient.invalidateQueries({ queryKey: ['polymarket-proxy', address?.toLowerCase()] })
      if (isPredict) {
        queryClient.invalidateQueries({ queryKey: ['balances', 'predict-positions'] })
      }
      setTimeout(onClose, 2000)
    } catch (e) {
      setDepositStep(null)
      const msg = e instanceof Error ? e.message : 'Deposit failed'
      const lower = msg.toLowerCase()
      if (lower.includes('user rejected') || lower.includes('denied transaction')) {
        setError('Transaction cancelled in wallet.')
      } else if (
        lower.includes('insufficient funds for gas') ||
        lower.includes('insufficient funds for intrinsic transaction cost')
      ) {
        setError('Not enough AVAX on Avalanche to pay gas. Top up AVAX and try again.')
      } else {
        setError(msg)
      }
    } finally {
      setSending(false)
      setDepositStep(null)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative rounded-panel-lg bg-bg-secondary border border-white/10 shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-h3 font-bold text-text-primary">Deposit</h2>
          <button type="button" onClick={onClose} className="p-2 rounded hover:bg-white/10 text-text-muted">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-4">
          <label className="text-small text-text-body block mb-1.5">Site</label>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="w-full h-10 px-3 rounded-panel bg-bg-tertiary border border-white/10 text-body outline-none focus:border-accent-violet/50"
          >
            {PLATFORMS.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {!isConnected || !address ? (
          <p className="text-body text-text-muted">Connect your wallet to get a deposit address.</p>
        ) : loading || (isPolymarket && proxyLoading) ? (
          <div className="py-8 text-center text-text-muted">
            {isPolymarket && proxyLoading ? 'Loading your proxy address...' : 'Loading deposit address...'}
          </div>
        ) : error ? (
          <p className="text-body text-status-error">{error}</p>
        ) : showProxyOnlyMessage ? (
          <p className="text-body text-text-muted">
            Link Polymarket in Profile → Connected Platforms to get your deposit (proxy) address.
          </p>
        ) : (isPredict || proxy) ? (
          <>
            <p className="text-small text-text-body mb-3">
              {isPredict ? (
                <>
                  Deposit is available via <strong>Avalanche → BNB Chain</strong> bridge. Choose token and amount, then sign transactions here.
                </>
              ) : (
                <>
                  Deposit is available only via <strong>Avalanche → Polygon</strong> bridge. Choose token and amount, then sign transactions here.
                </>
              )}
            </p>
            <div className="rounded-panel bg-bg-tertiary border border-white/10 p-3 mb-2">
              <code className="font-mono text-tiny break-all text-text-body">{recipientAddress}</code>
            </div>
            {recipientAddress && (
              <div className="flex items-center gap-2 mb-3">
                <button type="button" onClick={copyAddress} className="p-2 rounded hover:bg-white/10 text-text-muted" title="Copy address">
                  {copied ? <Check className="w-4 h-4 text-status-success" /> : <Copy className="w-4 h-4" />}
                </button>
                <a
                  href={`${destinationExplorerBase}/address/${recipientAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-tiny text-accent-blue hover:underline inline-flex items-center gap-1"
                >
                  View on Explorer <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
            <p className="text-tiny text-text-muted mb-4">
              {isPredict
                ? `Recipient on BNB Chain: your ${predictAccount?.address ? 'linked Predict account' : 'connected wallet'} above. Minimum suggested deposit: $${MIN_DEPOSIT_USD} USD.`
                : `Recipient on Polygon: your proxy wallet above. Minimum suggested deposit: $${MIN_DEPOSIT_USD} USD.`}
            </p>
            {isPredict && (
              <>
                <p className="text-tiny text-text-muted mb-1">
                  Supported collateral for the current Predict flow: <strong>USDT on BNB Chain</strong>. Keep some <strong>BNB</strong> on BNB Chain for trading gas after deposit.
                </p>
                {predictUsdtBalance && (
                  <p className="text-tiny text-text-muted mb-3">
                    Current BNB-chain USDT balance: {predictUsdtBalance.formatted} {predictUsdtBalance.symbol}
                  </p>
                )}
              </>
            )}
            <div className="mb-3">
              <label className="text-small text-text-body block mb-1.5">Mode</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setMode('receive'); setQuote(null) }}
                  className={`flex-1 py-2 rounded-panel text-small ${mode === 'receive' ? 'bg-accent-violet/20 text-accent-violet border border-accent-violet/40' : 'bg-bg-tertiary border border-white/10'}`}
                >
                  I want to receive {destinationSymbol}
                </button>
                <button
                  type="button"
                  onClick={() => { setMode('spend'); setQuote(null) }}
                  className={`flex-1 py-2 rounded-panel text-small ${mode === 'spend' ? 'bg-accent-violet/20 text-accent-violet border border-accent-violet/40' : 'bg-bg-tertiary border border-white/10'}`}
                >
                  I want to spend token
                </button>
              </div>
            </div>
            <div className="mb-3">
              <label className="text-small text-text-body block mb-1.5">Avalanche token</label>
              <select
                value={selectedAsset?.address ?? ''}
                onChange={(e) => { setSelectedToken(e.target.value); setQuote(null) }}
                className="w-full h-10 px-3 rounded-panel bg-bg-tertiary border border-white/10 text-body outline-none focus:border-accent-violet/50"
              >
                {currencies.map((a) => (
                  <option key={a.address} value={a.address}>
                    {a.symbol}
                  </option>
                ))}
              </select>
              {selectedAsset && tokenBalance != null && (
                <p className="text-tiny text-text-muted mt-1">
                  Balance: {tokenBalance.formatted} {selectedAsset.symbol}
                </p>
              )}
            </div>
            <div className="mb-3">
              <label className="text-small text-text-body block mb-1.5">
                {mode === 'receive'
                  ? `${destinationSymbol} to receive on ${isPredict ? 'Predict' : 'Polymarket'}`
                  : `Amount to spend (${selectedAsset?.symbol ?? 'token'})`} — min ${MIN_DEPOSIT_USD}
              </label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={amount}
                onChange={(e) => { setAmount(e.target.value); setQuote(null) }}
                placeholder="0.00"
                className="w-full h-12 px-3 rounded-panel bg-bg-tertiary border border-white/10 font-mono text-body outline-none focus:border-accent-violet/50"
              />
              {avaxBalance != null && Number(avaxBalance.formatted) < 0.02 && (
                <p className="text-tiny text-status-warning mt-1">Keep ~0.05 AVAX for gas. Low balance may cause failed transactions.</p>
              )}
            </div>
            {!quote ? (
              <button
                type="button"
                disabled={!canGetQuote || quoting}
                onClick={handleGetQuote}
                className="w-full h-11 rounded-panel bg-status-success hover:bg-status-success/90 text-white text-small font-medium disabled:opacity-50 disabled:cursor-not-allowed mb-3"
              >
                {quoting ? 'Getting quote...' : 'Get quote'}
              </button>
            ) : (
              <>
                {mode === 'receive' && quote.expectedTokenIn != null && (
                  <p className="text-tiny text-accent-blue mb-2">You pay ≈ {quote.expectedTokenIn.toFixed(6)} {selectedAsset?.symbol} (fees included).</p>
                )}
                {mode === 'spend' && quote.expectedDestinationOut != null && (
                  <p className="text-tiny text-accent-blue mb-2">
                    You will receive ≈ {quote.expectedDestinationOut.toFixed(isPredict ? 4 : 2)} {destinationSymbol} on {isPredict ? 'BNB Chain' : 'Polygon'}.
                  </p>
                )}
                {quoteExpired && (
                  <p className="text-tiny text-status-warning mb-2">Quote expired. Get a new quote.</p>
                )}
                {depositStep && (
                  <p className="text-tiny text-accent-blue mb-2">{depositStep}</p>
                )}
                <button
                  type="button"
                  disabled={sending || !!quoteExpired}
                  onClick={handleDepositNow}
                  className="w-full h-11 rounded-panel bg-status-success hover:bg-status-success/90 text-white text-small font-medium disabled:opacity-50 disabled:cursor-not-allowed mb-3"
                >
                  {sending ? (depositStep ?? 'Sending...') : 'Deposit now'}
                </button>
              </>
            )}
            {success && (
              <div className="mb-2 space-y-1">
                <p className="text-tiny text-status-success">
                  Transfer sent. Funds usually arrive in 2–5 minutes on {isPredict ? 'BNB Chain / Predict address' : 'Polymarket'}.
                </p>
                {lastTxHash && (
                  <a
                    href={`${SNOWTRACE_BASE}/tx/${lastTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-tiny text-accent-blue hover:underline inline-flex items-center gap-1"
                  >
                    View on Snowtrace <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            )}
            <p className="text-tiny text-text-muted mb-3">
              Powered by backend quote + signed transactions. No external redirect needed.
            </p>
          </>
        ) : (
          <p className="text-body text-text-muted">Could not load deposit address.</p>
        )}
      </div>
    </div>
  )
}
