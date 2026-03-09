import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAccount, useSwitchChain, useChainId, useSignTypedData } from 'wagmi'
import { logger } from '@/shared/lib/logger'
import { Check, ExternalLink, Link2, Loader2 } from 'lucide-react'
import { useTrading } from '@/shared/context/trading-context'
import { useDeployProxy } from '@/shared/hooks/use-deploy-proxy'
import { usePolymarketProxy } from '@/shared/hooks/use-polymarket-proxy'
import { cn } from '@/shared/lib/cn'
import { POLYGON_CHAIN_ID } from '@/shared/config/api'
import { createOnboard, getOnboardRequirements, getOnboardSignPayload } from '@/shared/api/onboard'

const PLATFORMS = [
  { id: 'polymarket', name: 'Polymarket', desc: 'Prediction markets on Polygon' },
  { id: 'azuro', name: 'Azuro', desc: 'Sports & prediction markets on Gnosis' },
  { id: 'native', name: 'Native Wallet', desc: 'Your EOA on selected chain' },
] as const

function truncateAddr(a: string) {
  if (a.length <= 14) return a
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

export function ConnectedPlatforms() {
  const queryClient = useQueryClient()
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()
  const { signTypedDataAsync } = useSignTypedData()
  const { proxy, isLoading: proxyLoading, refetch: refetchProxy } = usePolymarketProxy(address ?? undefined)
  const { canDeploy, deploying, deployError, deploy } = useDeployProxy(address ?? undefined)
  const { creds, isDeriving, deriveError, deriveApiKey, clearCreds } = useTrading()
  const [isSwitching, setIsSwitching] = useState(false)
  const [linkStep, setLinkStep] = useState<'idle' | 'switching' | 'deploying' | 'registering' | 'deriving' | 'done'>('idle')
  const [linkError, setLinkError] = useState<string | null>(null)
  const polymarketLinked = !!creds
  const onPolygon = chainId === POLYGON_CHAIN_ID
  // Only show "Connected" and "Unlink" when wallet + proxy + API key (full link). If we have creds but no proxy (e.g. Gamma 404), show "Reset key" instead.
  const polymarketConnected = isConnected && !!proxy && polymarketLinked
  const polymarketCredsButNoProxy = isConnected && polymarketLinked && !proxy && !proxyLoading

  const handleRefreshBalances = async () => {
    await Promise.all([
      refetchProxy(),
      queryClient.invalidateQueries({ queryKey: ['positions'] }),
      queryClient.invalidateQueries({ queryKey: ['positions', 'balance'] }),
      queryClient.invalidateQueries({ queryKey: ['open-orders'] }),
    ])
  }

  const handleLinkPolymarket = async () => {
    const log = (msg: string, meta?: Record<string, unknown>) =>
      logger.info(msg, meta, { component: 'connected-platforms', function: 'handleLinkPolymarket' })
    log('handleLinkPolymarket: step 1 — start', { chainId, address: address ?? undefined, isConnected })
    if (!isConnected) {
      log('handleLinkPolymarket: abort — not connected')
      return
    }
    setLinkError(null)
    setLinkStep('idle')
    log('handleLinkPolymarket: step 2 — linkError cleared')
    try {
      setIsSwitching(true)
      if (chainId !== POLYGON_CHAIN_ID && switchChainAsync) {
        setLinkStep('switching')
        log('handleLinkPolymarket: step 3a — switching to Polygon', { fromChainId: chainId })
        try {
          await switchChainAsync({ chainId: POLYGON_CHAIN_ID })
          log('handleLinkPolymarket: step 3b — switchChainAsync resolved, waiting 800ms')
          await new Promise((r) => setTimeout(r, 800))
          log('handleLinkPolymarket: step 3c — wait done')
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Chain switch failed'
          logger.warn('handleLinkPolymarket: chain switch failed', { message: msg, error: String(e) }, { component: 'connected-platforms', function: 'handleLinkPolymarket' })
          if (msg.includes('reject') || msg.includes('denied')) {
            setLinkError('Network switch rejected. Switch to Polygon manually and click Link again.')
          } else {
            setLinkError(msg)
          }
          return
        }
      } else {
        log('handleLinkPolymarket: step 3 — already on Polygon or no switch', { chainId })
      }
      if (!proxy && !proxyLoading) {
        log('handleLinkPolymarket: step 4 — no proxy, refetching from Gamma')
        const refreshed = await refetchProxy()
        const refreshedProxy = refreshed?.data ?? null
        log('handleLinkPolymarket: step 4a — refetch result', { hasProxy: !!refreshedProxy })
        if (!refreshedProxy && address) {
          let proxyFromDeploy: string | null = null
          if (canDeploy && !deploying) {
            setLinkStep('deploying')
            log('handleLinkPolymarket: step 4b — no proxy, trying relayer deploy')
            proxyFromDeploy = await deploy()
            log('handleLinkPolymarket: step 4c — deploy finished', { hasProxy: !!proxyFromDeploy, deployedProxy: proxyFromDeploy ?? undefined })
          }
          // Try backend onboarding flow (like reference): requirements -> sign-payload -> create
          setLinkStep('registering')
          log('handleLinkPolymarket: step 4d — trying backend onboarding flow')
          try {
            const req = await getOnboardRequirements(address)
            log('handleLinkPolymarket: step 4e — requirements', {
              linked: req.linked,
              hasProxy: req.hasProxy,
              canDeployProxy: req.canDeployProxy,
              proxyWalletPresent: !!req.proxyWallet,
              proxyWalletPrefix: req.proxyWallet ? String(req.proxyWallet).slice(0, 14) + '…' : null,
            })
            if (!req.linked) {
              const payload = await getOnboardSignPayload(address, POLYGON_CHAIN_ID)
              log('handleLinkPolymarket: step 4f — got sign payload, requesting signature')
              const signature = await signTypedDataAsync({
                domain: payload.domain,
                types: payload.types as Record<string, unknown>,
                primaryType: 'ClobAuth',
                message: payload.message,
              })
              await createOnboard(address, signature, payload.timestamp, payload.nonce)
              log('handleLinkPolymarket: step 4g — backend onboarding create success')
            }
            const recheck = await refetchProxy()
            const proxyAfter = recheck?.data ?? proxyFromDeploy ?? null
            if (proxyAfter && proxyFromDeploy && !recheck?.data && address) {
              queryClient.setQueryData(['polymarket-proxy', address.toLowerCase()], proxyAfter)
            }
            log('handleLinkPolymarket: step 4h — proxy after onboard', {
              hasProxy: !!proxyAfter,
              proxyAfterPrefix: proxyAfter ? String(proxyAfter).slice(0, 14) + '…' : null,
              fromRefetch: !!recheck?.data,
              fromDeploy: !!proxyFromDeploy && !recheck?.data,
              recheckStatus: recheck?.status,
              recheckUpdatedAt: recheck?.dataUpdatedAt,
            })
            if (!proxyAfter) {
              setLinkError(canDeploy ? 'Proxy deployment was requested, but proxy is not visible yet. Wait ~20-60s and click Link again.' : 'Proxy wallet not found yet. If this is a new wallet, wait for Polymarket indexing and try again.')
              return
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            setLinkError(msg)
            log('handleLinkPolymarket: backend onboarding failed', { message: msg })
            return
          }
        }
      }
      setLinkStep('deriving')
      log('handleLinkPolymarket: step 5 — calling deriveApiKey()', { chainId })
      await deriveApiKey()
      setLinkStep('done')
      log('handleLinkPolymarket: step 6 — deriveApiKey() completed', { hasProxy: !!proxy, note: 'API key linked.' })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to derive API key'
      logger.error('handleLinkPolymarket: error', { message: msg, error: String(e) }, undefined, { component: 'connected-platforms', function: 'handleLinkPolymarket' })
      if (msg.includes('Could not create api key') || msg.includes('400')) {
        setLinkError('Polymarket did not create API key. Ensure wallet is on Polygon; if needed visit polymarket.com with this wallet (create account), then click Link again.')
      } else {
        setLinkError(msg)
      }
      log('handleLinkPolymarket: setLinkError', { message: msg })
    } finally {
      setIsSwitching(false)
      setLinkStep('idle')
      log('handleLinkPolymarket: step 7 — end (isSwitching=false)')
    }
  }

  const stepLabels: Record<string, string> = {
    switching: 'Switching network…',
    deploying: 'Deploying proxy…',
    registering: 'Registering…',
    deriving: 'Deriving API key…',
  }

  return (
    <>
      <h2 className="text-h3 font-bold text-text-primary mb-4">Connected Platforms</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {PLATFORMS.map((p) => {
          const isPolymarket = p.id === 'polymarket'
          const isNative = p.id === 'native'
          const hasProxy = !!proxy
          const connected = isNative ? isConnected : isPolymarket ? polymarketConnected : false
          const showLink = isPolymarket && isConnected && hasProxy && !polymarketLinked
          const showUnlink = isPolymarket && polymarketConnected

          return (
            <div
              key={p.id}
              className="rounded-panel bg-bg-secondary/80 backdrop-blur-panel border border-white/10 p-4"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-text-primary">{p.name}</h3>
                  <p className="text-small text-text-muted mt-1">{p.desc}</p>
                </div>
                <span
                  className={cn(
                    'flex items-center gap-1 text-tiny',
                    connected ? 'text-status-success' : 'text-text-muted'
                  )}
                >
                  {connected ? <Check className="w-4 h-4" /> : null}
                  {isPolymarket && proxyLoading ? 'Checking…' : connected ? 'Connected' : 'Not Connected'}
                </span>
              </div>
              {isNative && address && (
                <p className="mt-2 font-mono text-tiny text-text-muted break-all">{address}</p>
              )}
              {isPolymarket && proxy && (
                <p className="mt-2 font-mono text-tiny text-text-muted" title={proxy}>
                  Proxy: {truncateAddr(proxy)}
                </p>
              )}
              {isPolymarket && !isConnected && (
                <p className="mt-2 text-tiny text-text-muted">Connect wallet in header to link Polymarket.</p>
              )}
              {isPolymarket && isConnected && !hasProxy && !proxyLoading && (
                <p className="mt-2 text-tiny text-text-muted">Proxy wallet not found. It usually appears after first login to polymarket.com with this wallet.</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2 items-center">
                {isPolymarket && isConnected && !hasProxy && !proxyLoading && (
                  <button
                    type="button"
                    disabled={isDeriving || isSwitching || deploying}
                    onClick={handleLinkPolymarket}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-panel bg-accent-violet/20 text-accent-violet text-small font-medium hover:bg-accent-violet/30 disabled:opacity-50"
                  >
                    {(isDeriving || isSwitching || deploying) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                    Check proxy and link
                  </button>
                )}
                {isPolymarket && showLink && (
                  <button
                    type="button"
                    disabled={isDeriving || isSwitching || deploying}
                    onClick={handleLinkPolymarket}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-panel bg-accent-violet text-white text-small font-medium hover:bg-accent-violet/90 disabled:opacity-50"
                  >
                    {(isDeriving || isSwitching || deploying) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                    Link Polymarket
                  </button>
                )}
                {isPolymarket && !onPolygon && isConnected && (
                  <span className="text-tiny text-status-warning">Network will switch to Polygon when you click Link</span>
                )}
                {isPolymarket && linkStep !== 'idle' && linkStep !== 'done' && stepLabels[linkStep] && (
                  <span className="text-tiny text-accent-blue">{stepLabels[linkStep]}</span>
                )}
                {isPolymarket && (deriveError || linkError) && (
                  <span className="text-tiny text-status-error block w-full">{linkError ?? deriveError}</span>
                )}
                {isPolymarket && (deriveError || linkError) && (
                  <button
                    type="button"
                    onClick={() => { setLinkError(null); setLinkStep('idle'); handleLinkPolymarket() }}
                    className="px-3 py-1.5 rounded-panel border border-accent-violet/50 text-accent-violet text-small hover:bg-accent-violet/10"
                  >
                    Retry
                  </button>
                )}
                {isPolymarket && deployError && (
                  <span className="text-tiny text-status-error">{deployError}</span>
                )}
                {isPolymarket && polymarketCredsButNoProxy && (
                  <span className="text-tiny text-text-muted mr-2">API key exists, proxy not found (Gamma 404).</span>
                )}
                {isPolymarket && polymarketCredsButNoProxy && (
                  <button type="button" onClick={() => { logger.info('ConnectedPlatforms: user cleared creds (no proxy)', {}, { component: 'connected-platforms', function: 'clearCreds' }); clearCreds() }} className="px-3 py-1.5 rounded-panel border border-white/20 text-text-muted text-small hover:bg-white/5">
                    Reset key
                  </button>
                )}
                {showUnlink && (
                  <button type="button" onClick={() => { logger.info('ConnectedPlatforms: user clicked Unlink', {}, { component: 'connected-platforms', function: 'unlink' }); clearCreds() }} className="px-3 py-1.5 rounded-panel border border-status-error/50 text-status-error text-small hover:bg-status-error/10">
                    Unlink
                  </button>
                )}
                {isPolymarket && proxy && (
                  <button
                    type="button"
                    onClick={handleRefreshBalances}
                    className="px-3 py-1.5 rounded-panel border border-white/20 text-text-muted text-small hover:bg-white/5"
                  >
                    Refresh balance
                  </button>
                )}
                {isPolymarket && proxy && (
                  <a
                    href={`https://polygonscan.com/address/${proxy}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-small text-accent-blue hover:underline inline-flex items-center gap-1"
                  >
                    View on Explorer <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {isNative && address && (
                  <a
                    href={`https://polygonscan.com/address/${address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-small text-accent-blue hover:underline inline-flex items-center gap-1"
                  >
                    View on Explorer <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {!connected && !showLink && isNative && (
                  <span className="text-small text-text-muted">Connect wallet in header</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
