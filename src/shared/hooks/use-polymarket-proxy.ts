import { useQuery } from '@tanstack/react-query'
import { fetchProxyWallet } from '@/shared/api/polymarket'

/**
 * Resolve Polymarket proxy wallet for the connected EOA via Gamma API (same as reference).
 * Data API positions, activity, trades all use proxy address, not EOA.
 */
export function usePolymarketProxy(eoa: string | undefined) {
  const { data: proxy, isLoading, isError, refetch } = useQuery({
    queryKey: ['polymarket-proxy', eoa?.toLowerCase()],
    queryFn: () => fetchProxyWallet(eoa!),
    enabled: !!eoa?.startsWith?.('0x'),
    staleTime: 60_000,
  })
  return { proxy: proxy ?? null, isLoading, isError, refetch }
}
