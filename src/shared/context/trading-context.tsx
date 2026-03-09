import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { ClobCredentials } from '@/shared/api/clob'
import {
  deriveClobApiKey,
  placeMarketOrder as apiPlaceMarketOrder,
  placeLimitOrder as apiPlaceLimitOrder,
  cancelOrder as apiCancelOrder,
  getOpenOrders,
  type PlaceMarketOrderParams,
  type PlaceLimitOrderParams,
} from '@/shared/api/clob'
import { logger } from '@/shared/lib/logger'

interface TradingContextValue {
  creds: ClobCredentials | null
  isDeriving: boolean
  deriveError: string | null
  deriveApiKey: () => Promise<void>
  clearCreds: () => void
  placeMarketOrder: (params: PlaceMarketOrderParams) => Promise<{ orderID?: string; status?: string; errorMsg?: string }>
  placeLimitOrder: (params: PlaceLimitOrderParams) => Promise<{ orderID?: string; status?: string; errorMsg?: string }>
  cancelOrder: (orderId: string) => Promise<boolean>
  openOrders: unknown[]
  refreshOpenOrders: () => Promise<void>
}

const TradingContext = createContext<TradingContextValue | null>(null)

export function TradingProvider({ children }: { children: ReactNode }) {
  const [creds, setCreds] = useState<ClobCredentials | null>(null)
  const [isDeriving, setIsDeriving] = useState(false)
  const [deriveError, setDeriveError] = useState<string | null>(null)
  const [openOrders, setOpenOrders] = useState<unknown[]>([])

  const deriveApiKey = useCallback(async () => {
    const log = (msg: string, meta?: Record<string, unknown>) =>
      logger.info(msg, meta, { component: 'trading-context', function: 'deriveApiKey' })
    log('deriveApiKey: step 1 — start')
    setIsDeriving(true)
    setDeriveError(null)
    log('deriveApiKey: step 2 — state set (isDeriving=true, deriveError=null)')
    try {
      log('deriveApiKey: step 3 — calling deriveClobApiKey()')
      const c = await deriveClobApiKey()
      log('deriveApiKey: step 4 — deriveClobApiKey() returned', { keySuffix: c?.apiKey?.slice(-6) })
      setCreds(c)
      log('deriveApiKey: step 5 — setCreds done, success')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to derive API key'
      const errObj = e instanceof Error ? e : new Error(String(e))
      const res = (e as { response?: { status?: number; data?: unknown } })?.response
      logger.error(
        'deriveApiKey: failed',
        {
          message: msg,
          name: errObj.name,
          fullError: String(e),
          httpStatus: res?.status,
          responseData: res?.data,
        },
        { message: errObj.message, stack: (errObj as Error).stack },
        { component: 'trading-context', function: 'deriveApiKey' }
      )
      setDeriveError(msg)
      log('deriveApiKey: setDeriveError', { message: msg })
    } finally {
      setIsDeriving(false)
      log('deriveApiKey: step 6 — end (isDeriving=false)')
    }
  }, [])

  const clearCreds = useCallback(() => {
    setCreds(null)
    setDeriveError(null)
    setOpenOrders([])
  }, [])

  const placeMarketOrder = useCallback(
    async (params: PlaceMarketOrderParams) => {
      if (!creds) throw new Error('Derive API key first')
      return apiPlaceMarketOrder(creds, params)
    },
    [creds]
  )

  const placeLimitOrder = useCallback(
    async (params: PlaceLimitOrderParams) => {
      if (!creds) throw new Error('Derive API key first')
      return apiPlaceLimitOrder(creds, params)
    },
    [creds]
  )

  const cancelOrder = useCallback(
    async (orderId: string) => {
      if (!creds) throw new Error('Derive API key first')
      return apiCancelOrder(creds, orderId)
    },
    [creds]
  )

  const refreshOpenOrders = useCallback(async () => {
    if (!creds) return
    try {
      const orders = await getOpenOrders(creds)
      setOpenOrders(Array.isArray(orders) ? orders : [])
    } catch {
      setOpenOrders([])
    }
  }, [creds])

  return (
    <TradingContext.Provider
      value={{
        creds,
        isDeriving,
        deriveError,
        deriveApiKey,
        clearCreds,
        placeMarketOrder,
        placeLimitOrder,
        cancelOrder,
        openOrders,
        refreshOpenOrders,
      }}
    >
      {children}
    </TradingContext.Provider>
  )
}

export function useTrading() {
  const ctx = useContext(TradingContext)
  if (!ctx) throw new Error('useTrading must be used within TradingProvider')
  return ctx
}
