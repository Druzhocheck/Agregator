import { useCallback } from 'react'
import { useChainId, useSwitchChain } from 'wagmi'

/**
 * Ensures wallet is on the target chain. Switches automatically when needed.
 * User does not need to manually switch — call ensureNetwork before operations.
 */
export function useEnsureNetwork() {
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()

  const ensureNetwork = useCallback(
    async (targetChainId: number): Promise<boolean> => {
      if (chainId === targetChainId) return true
      if (!switchChainAsync) return false
      try {
        await switchChainAsync({ chainId: targetChainId })
        return true
      } catch {
        return false
      }
    },
    [chainId, switchChainAsync]
  )

  return { ensureNetwork, chainId }
}
