import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSignMessage } from 'wagmi'
import type { PredictConnectedAccount } from '@/entities/market/types'
import {
  createPredictJwt,
  fetchPredictAuthMessage,
  fetchPredictConnectedAccount,
} from '@/shared/api/predict'

const STORAGE_KEY = 'ave.predict.jwt'

interface PredictAuthContextValue {
  jwt: string | null
  account: PredictConnectedAccount | null
  isConnecting: boolean
  error: string | null
  isConnected: boolean
  connect: (signerAddress: string) => Promise<boolean>
  disconnect: () => void
  refreshAccount: () => Promise<void>
}

const PredictAuthContext = createContext<PredictAuthContextValue | null>(null)

export function PredictAuthProvider({ children }: { children: ReactNode }) {
  const { signMessageAsync } = useSignMessage()
  const [jwt, setJwt] = useState<string | null>(null)
  const [account, setAccount] = useState<PredictConnectedAccount | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) setJwt(stored)
    } catch {
      // ignore
    }
  }, [])

  const refreshAccount = useCallback(async () => {
    if (!jwt) {
      setAccount(null)
      return
    }
    const nextAccount = await fetchPredictConnectedAccount(jwt)
    setAccount(nextAccount)
  }, [jwt])

  useEffect(() => {
    refreshAccount()
  }, [refreshAccount])

  const connect = useCallback(async (signerAddress: string) => {
    if (!signerAddress) return false
    setIsConnecting(true)
    setError(null)
    try {
      const authMessage = await fetchPredictAuthMessage()
      if (!authMessage?.message) throw new Error('Failed to fetch Predict auth message')
      const signature = await signMessageAsync({ message: authMessage.message })
      const nextJwt = await createPredictJwt({
        signer: signerAddress,
        message: authMessage.message,
        signature,
      })
      if (!nextJwt) throw new Error('Failed to obtain Predict JWT')
      setJwt(nextJwt)
      try {
        localStorage.setItem(STORAGE_KEY, nextJwt)
      } catch {
        // ignore
      }
      const nextAccount = await fetchPredictConnectedAccount(nextJwt)
      setAccount(nextAccount)
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to connect Predict')
      return false
    } finally {
      setIsConnecting(false)
    }
  }, [signMessageAsync])

  const disconnect = useCallback(() => {
    setJwt(null)
    setAccount(null)
    setError(null)
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
  }, [])

  const value = useMemo<PredictAuthContextValue>(() => ({
    jwt,
    account,
    isConnecting,
    error,
    isConnected: Boolean(jwt && account?.address),
    connect,
    disconnect,
    refreshAccount,
  }), [jwt, account, isConnecting, error, connect, disconnect, refreshAccount])

  return <PredictAuthContext.Provider value={value}>{children}</PredictAuthContext.Provider>
}

export function usePredictAuth() {
  const ctx = useContext(PredictAuthContext)
  if (!ctx) throw new Error('usePredictAuth must be used within PredictAuthProvider')
  return ctx
}
