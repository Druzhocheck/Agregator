const dev = typeof import.meta !== 'undefined' && import.meta.env?.DEV
// Production: use /api/proxy/* (Vercel rewrites to backend) or VITE_API_PROXY / VITE_ONBOARD_API
const apiProxy = typeof import.meta !== 'undefined' ? (import.meta.env as Record<string, string | undefined>).VITE_API_PROXY : ''
const onboardApi = typeof import.meta !== 'undefined' ? (import.meta.env as Record<string, string | undefined>).VITE_ONBOARD_API : ''
const proxyBase = (typeof apiProxy === 'string' && apiProxy.trim()) || (typeof onboardApi === 'string' && onboardApi ? String(onboardApi).replace(/\/onboard\/?$/, '').trim() : '')
const proxyBaseClean = proxyBase ? proxyBase.replace(/\/$/, '') : ''
export const GAMMA_API = dev ? '/api/gamma' : proxyBaseClean ? `${proxyBaseClean}/proxy/gamma` : '/api/proxy/gamma'
export const CLOB_API = 'https://clob.polymarket.com'
export const DATA_API = dev ? '/api/data' : proxyBaseClean ? `${proxyBaseClean}/proxy/data` : '/api/proxy/data'
export const BRIDGE_API = dev ? '/api/bridge' : proxyBaseClean ? `${proxyBaseClean}/proxy/bridge` : '/api/proxy/bridge'
export const WS_MARKET = 'wss://ws-subscriptions-clob.polymarket.com/ws/market'

export const POLYGON_CHAIN_ID = 137
export const AVALANCHE_CHAIN_ID = 43114

/** Copy Trading Vault (Avalanche C-Chain) — deposit/withdraw USDC for copy-trading */
export const COPY_TRADING_VAULT_ADDRESS = '0xC85f003E34Aa97d7e6e1646ab4FaE44857E8f065' as const
/** USDC on Avalanche */
export const USDC_AVALANCHE = '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E' as const

export const SUPPORTED_NETWORKS = [
  { id: 'avalanche', name: 'Avalanche', chainId: 43114 },
  { id: 'polygon', name: 'Polygon', chainId: 137 },
  { id: 'gnosis', name: 'Gnosis', chainId: 100 },
] as const

export type NetworkId = (typeof SUPPORTED_NETWORKS)[number]['id']
