const dev = typeof import.meta !== 'undefined' && import.meta.env?.DEV
export const GAMMA_API = dev ? '/api/gamma' : 'https://gamma-api.polymarket.com'
// Use CLOB directly so /book and other endpoints work (proxy can return 404 in some setups).
export const CLOB_API = 'https://clob.polymarket.com'
export const DATA_API = dev ? '/api/data' : 'https://data-api.polymarket.com'
export const BRIDGE_API = dev ? '/api/bridge' : 'https://bridge.polymarket.com'
export const WS_MARKET = 'wss://ws-subscriptions-clob.polymarket.com/ws/market'

export const POLYGON_CHAIN_ID = 137

export const SUPPORTED_NETWORKS = [
  { id: 'avalanche', name: 'Avalanche', chainId: 43114 },
  { id: 'polygon', name: 'Polygon', chainId: 137 },
  { id: 'gnosis', name: 'Gnosis', chainId: 100 },
] as const

export type NetworkId = (typeof SUPPORTED_NETWORKS)[number]['id']
