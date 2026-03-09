/**
 * Execute transactions from Polymarket proxy (Gnosis Safe).
 * Used for: USDC approval (trading), USDC transfer (withdraw to bridge).
 * Requires POL for gas — user signs and executes.
 */

import Safe from '@safe-global/protocol-kit'
import { encodeFunctionData, parseUnits, maxUint256 } from 'viem'
import { logger } from '@/shared/lib/logger'

const USDC_POLYGON = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'
const CTF = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045'
const CTF_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E'
const NEG_RISK_CTF_EXCHANGE = '0xC5d563A36AE78145C45a50134d48A1215220f80a'

const ERC20_APPROVE = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const

const ERC20_TRANSFER = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const

async function getSignerAddress(): Promise<string> {
  const ethereum = (window as unknown as { ethereum?: { request: (args: unknown) => Promise<unknown> } }).ethereum
  if (!ethereum) throw new Error('No wallet found')
  const [address] = (await ethereum.request({ method: 'eth_requestAccounts' })) as string[]
  if (!address) throw new Error('No account connected')
  return address
}

/**
 * Approve USDC from proxy to Polymarket contracts (CTF, CTF Exchange, Neg Risk).
 * Call before trading if allowance is low.
 */
export async function approveUsdcFromProxy(proxyAddress: string): Promise<string> {
  const log = (msg: string, meta?: Record<string, unknown>) =>
    logger.info(msg, meta, { component: 'safe-proxy', function: 'approveUsdcFromProxy' })
  log('approveUsdcFromProxy: start', { proxy: proxyAddress.slice(0, 10) + '…' })

  const signerAddress = await getSignerAddress()
  const provider = (window as unknown as { ethereum?: unknown }).ethereum
  if (!provider) throw new Error('No provider')

  const safe = await Safe.init({
    provider: provider as never,
    signer: signerAddress,
    safeAddress: proxyAddress,
  })

  const approveData = (spender: string) =>
    encodeFunctionData({
      abi: ERC20_APPROVE,
      functionName: 'approve',
      args: [spender as `0x${string}`, maxUint256],
    })

  const transactions = [
    { to: USDC_POLYGON as `0x${string}`, data: approveData(CTF), value: 0n },
    { to: USDC_POLYGON as `0x${string}`, data: approveData(CTF_EXCHANGE), value: 0n },
    { to: USDC_POLYGON as `0x${string}`, data: approveData(NEG_RISK_CTF_EXCHANGE), value: 0n },
  ]

  const safeTx = await safe.createTransaction({
    transactions: transactions.map((t) => ({
      to: t.to,
      data: t.data,
      value: '0',
    })),
  })
  const signedTx = await safe.signTransaction(safeTx)
  const result = await safe.executeTransaction(signedTx)
  const hash = typeof result.hash === 'string' ? result.hash : (result as { hash?: string })?.hash ?? ''
  log('approveUsdcFromProxy: executed', { hash })
  return hash
}

/**
 * Transfer USDC from proxy to a destination address (e.g. bridge).
 * Used for withdraw.
 */
export async function transferUsdcFromProxy(
  proxyAddress: string,
  toAddress: string,
  amountUsdc: number
): Promise<string> {
  const log = (msg: string, meta?: Record<string, unknown>) =>
    logger.info(msg, meta, { component: 'safe-proxy', function: 'transferUsdcFromProxy' })
  log('transferUsdcFromProxy: start', { proxy: proxyAddress.slice(0, 10) + '…', to: toAddress.slice(0, 10) + '…', amount: amountUsdc })

  const signerAddress = await getSignerAddress()
  const provider = (window as unknown as { ethereum?: unknown }).ethereum
  if (!provider) throw new Error('No provider')

  const safe = await Safe.init({
    provider: provider as never,
    signer: signerAddress,
    safeAddress: proxyAddress,
  })

  const amountWei = parseUnits(amountUsdc.toFixed(6), 6)
  const data = encodeFunctionData({
    abi: ERC20_TRANSFER,
    functionName: 'transfer',
    args: [toAddress as `0x${string}`, amountWei],
  })

  const safeTx = await safe.createTransaction({
    transactions: [{ to: USDC_POLYGON as `0x${string}`, data, value: '0' }],
  })
  const signedTx = await safe.signTransaction(safeTx)
  const result = await safe.executeTransaction(signedTx)
  const hash = typeof result.hash === 'string' ? result.hash : (result as { hash?: string })?.hash ?? ''
  log('transferUsdcFromProxy: executed', { hash })
  return hash
}
