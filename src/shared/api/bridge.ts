import { BRIDGE_API } from '@/shared/config/api'

export interface SupportedAsset {
  chainId: string
  chainName: string
  token: {
    name: string
    symbol: string
    address: string
    decimals: number
  }
  minCheckoutUsd: number
}

export interface SupportedAssetsResponse {
  supportedAssets?: SupportedAsset[]
}

export interface DepositAddressesResponse {
  address?: {
    evm?: string
    svm?: string
    btc?: string
  }
  note?: string
}

export interface WithdrawAddressesResponse {
  address?: {
    evm?: string
    svm?: string
    btc?: string
  }
  note?: string
}

export interface BridgeTransaction {
  fromChainId: string
  fromTokenAddress: string
  fromAmountBaseUnit: string
  toChainId: string
  toTokenAddress: string
  status: 'DEPOSIT_DETECTED' | 'PROCESSING' | 'ORIGIN_TX_CONFIRMED' | 'SUBMITTED' | 'COMPLETED' | 'FAILED'
  txHash?: string
  createdTimeMs?: number
}

export interface TransactionStatusResponse {
  transactions?: BridgeTransaction[]
}

export interface QuoteRequest {
  fromAmountBaseUnit: string
  fromChainId: string
  fromTokenAddress: string
  recipientAddress: string
  toChainId: string
  toTokenAddress: string
}

export interface QuoteResponse {
  estCheckoutTimeMs?: number
  estInputUsd?: number
  estOutputUsd?: number
  estToTokenBaseUnit?: string
  quoteId?: string
  estFeeBreakdown?: {
    gasUsd?: number
    minReceived?: number
  }
}

export async function getSupportedAssets(): Promise<SupportedAssetsResponse> {
  const res = await fetch(`${BRIDGE_API}/supported-assets`)
  if (!res.ok) throw new Error('Failed to fetch supported assets')
  return res.json()
}

export async function createDepositAddresses(walletAddress: string): Promise<DepositAddressesResponse> {
  const res = await fetch(`${BRIDGE_API}/deposit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: walletAddress }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? 'Failed to create deposit addresses')
  }
  return res.json()
}

export interface CreateWithdrawAddressesParams {
  address: string
  toChainId: string
  toTokenAddress: string
  recipientAddr: string
}

export async function createWithdrawalAddresses(
  params: CreateWithdrawAddressesParams
): Promise<WithdrawAddressesResponse> {
  const res = await fetch(`${BRIDGE_API}/withdraw`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? 'Failed to create withdrawal addresses')
  }
  return res.json()
}

export async function getBridgeQuote(params: QuoteRequest): Promise<QuoteResponse> {
  const res = await fetch(`${BRIDGE_API}/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) throw new Error('Failed to get quote')
  return res.json()
}

export async function getBridgeStatus(address: string): Promise<TransactionStatusResponse> {
  const res = await fetch(`${BRIDGE_API}/status/${encodeURIComponent(address)}`)
  if (!res.ok) throw new Error('Failed to get status')
  return res.json()
}
