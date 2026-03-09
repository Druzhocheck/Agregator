/**
 * Polymarket CLOB client wrapper.
 * Uses @polymarket/clob-client with ethers v5 signer from window.ethereum.
 * useServerTime: true so L1 auth uses CLOB server time (avoids 400 from clock skew).
 */

import { AssetType, ClobClient, OrderType, Side, SignatureType } from '@polymarket/clob-client'
import { ethers } from 'ethers'
import { logger } from '@/shared/lib/logger'

const CLOB_HOST = 'https://clob.polymarket.com'
const POLYGON_CHAIN_ID = 137

export interface ClobCredentials {
  apiKey: string
  secret: string
  passphrase: string
}

export async function getClobSigner() {
  const ethereum = (window as unknown as { ethereum?: unknown }).ethereum
  if (!ethereum) throw new Error('No wallet found')
  const provider = new ethers.providers.Web3Provider(ethereum as never)
  const signer = provider.getSigner()
  return signer
}

function toApiKeyCreds(creds: ClobCredentials) {
  return { key: creds.apiKey, secret: creds.secret, passphrase: creds.passphrase }
}

async function ensureCollateralAllowance(
  client: ClobClient,
  required: number,
  proxy: string,
  log: (msg: string, meta?: Record<string, unknown>) => void
) {
  const ba = await client.getBalanceAllowance({ asset_type: AssetType.COLLATERAL }).catch(() => null)
  const balance = Number(ba?.balance ?? 0) / 1_000_000
  const allowance = Number(ba?.allowance ?? 0) / 1_000_000
  log('preflight collateral', { balance, allowance, required, proxy: `${proxy.slice(0, 10)}…` })

  if (!Number.isFinite(balance) || !Number.isFinite(allowance)) {
    throw new Error('Could not read Polymarket balance/allowance. Re-link account and try again.')
  }
  if (balance < required) {
    throw new Error(`Not enough balance on proxy. Required ${required.toFixed(2)} USDC, available ${balance.toFixed(2)} USDC.`)
  }
  if (allowance >= required) return

  log('preflight collateral: allowance low, executing approve from proxy', { allowance, required })
  const { approveUsdcFromProxy } = await import('@/shared/api/safe-proxy')
  try {
    await approveUsdcFromProxy(proxy)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Approve failed'
    throw new Error(
      `USDC allowance too low. Approve required (you will sign a Safe tx, gas paid in POL). ${msg}`
    )
  }
  const after = await client.getBalanceAllowance({ asset_type: AssetType.COLLATERAL }).catch(() => null)
  const allowanceAfter = Number(after?.allowance ?? 0) / 1_000_000
  log('preflight collateral: allowance after approve', { allowanceAfter, required })
  if (!Number.isFinite(allowanceAfter) || allowanceAfter < required) {
    // Some CLOB responses can stay stale (allowance=0) right after a successful Safe approve.
    // Continue and let order posting decide; avoids false-negative block.
    log('preflight collateral: allowance API still low after approve; continuing', { allowanceAfter, required })
  }
}

export async function deriveClobApiKey(): Promise<ClobCredentials> {
  const log = (msg: string, meta?: Record<string, unknown>) =>
    logger.info(msg, meta, { component: 'clob', function: 'deriveClobApiKey' })

  log('deriveClobApiKey: step 1 — getSigner')
  const signer = await getClobSigner()
  const address = await signer.getAddress()
  log('deriveClobApiKey: step 2 — got address', { address })

  const network = await signer.provider?.getNetwork().catch(() => null)
  const chainId = network?.chainId ?? 'unknown'
  log('deriveClobApiKey: step 3 — network', { chainId: String(chainId), host: CLOB_HOST })

  if (Number(chainId) !== POLYGON_CHAIN_ID) {
    log('deriveClobApiKey: wrong chain; CLOB expects Polygon 137', { chainId: String(chainId) })
  }

  log('deriveClobApiKey: step 4 — creating ClobClient (useServerTime=true)')
  const client = new ClobClient(
    CLOB_HOST,
    POLYGON_CHAIN_ID,
    signer as never,
    undefined, // creds
    undefined, // signatureType
    undefined, // funderAddress
    undefined, // geoBlockToken
    true // useServerTime — use CLOB server time for L1 auth (avoids 400)
  )

  try {
    log('deriveClobApiKey: step 5 — getServerTime()')
    const serverTime = await client.getServerTime().catch((err) => {
      log('deriveClobApiKey: getServerTime failed', { error: String(err) })
      return null
    })
    log('deriveClobApiKey: step 6 — server time', { serverTime, localTime: Math.floor(Date.now() / 1000) })

    // Like Polymarket backend: try GET derive first, then POST create only if needed.
    // createOrDeriveApiKey does create then derive on fail; library returns { key, secret, passphrase } or on 400
    // returns object from errorHandling (no throw), so we'd get stale derive key. So we derive first, then create.
    log('deriveClobApiKey: step 7 — deriveApiKey() → GET /auth/derive-api-key')
    let derived = await client.deriveApiKey(0).catch((e) => {
      log('deriveClobApiKey: deriveApiKey() threw', { error: String(e) })
      return null
    })
    if (derived?.key && derived?.secret && derived?.passphrase) {
      log('deriveClobApiKey: step 8 — deriveApiKey() returned existing creds', { keySuffix: derived?.key?.slice(-6) })
      log('deriveClobApiKey: step 9 — success, returning creds')
      return { apiKey: derived!.key, secret: derived!.secret, passphrase: derived!.passphrase }
    }
    log('deriveClobApiKey: step 7b — createApiKey() → POST /auth/api-key')
    const createResult = await client.createApiKey(0)
    const createErr = (createResult as { error?: string; status?: number })?.error
    const createStatus = (createResult as { status?: number })?.status
    log('deriveClobApiKey: step 8 — createApiKey result', {
      hasKey: !!(createResult as { key?: string })?.key,
      error: createErr,
      status: createStatus,
    })
    if (createErr || createStatus === 400) {
      const msg = typeof createErr === 'string' ? createErr : 'Could not create api key'
      log('deriveClobApiKey: step 8 FAIL — create returned error', { error: msg })
      throw new Error(msg)
    }
    const created = createResult as { key?: string; secret?: string; passphrase?: string }
    if (!created?.key || !created?.secret || !created?.passphrase) {
      log('deriveClobApiKey: step 8 FAIL — missing creds after create', { derived: !!created })
      throw new Error('Failed to derive API key')
    }
    log('deriveClobApiKey: step 9 — success, returning creds')
    return { apiKey: created.key, secret: created.secret, passphrase: created.passphrase }
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e))
    const res = (e as { response?: { status?: number; data?: unknown } })?.response
    const status = res?.status
    const responseData = res?.data
    logger.error(
      'deriveClobApiKey: error (check for 400 = Could not create api key)',
      {
        message: err.message,
        name: err.name,
        httpStatus: status,
        responseData,
        address,
        chainId: String(chainId),
      },
      { message: err.message, stack: (err as Error).stack },
      { component: 'clob', function: 'deriveClobApiKey' }
    )
    throw e
  }
}

export interface PlaceMarketOrderParams {
  tokenId: string
  side: 'BUY' | 'SELL'
  amount: number
  price: number
  tickSize?: string
  negRisk?: boolean
  /** Polymarket proxy (Safe) address — orders execute from this wallet; required for balance/allowance. */
  proxy?: string | null
}

export async function placeMarketOrder(
  creds: ClobCredentials,
  params: PlaceMarketOrderParams
): Promise<{ orderID?: string; status?: string; errorMsg?: string }> {
  const log = (msg: string, meta?: Record<string, unknown>) =>
    logger.info(msg, meta, { component: 'clob', function: 'placeMarketOrder' })

  log('placeMarketOrder: step 1 — start', {
    tokenId: params.tokenId,
    side: params.side,
    amount: params.amount,
    price: params.price,
    tickSize: params.tickSize,
    negRisk: params.negRisk,
    hasProxy: !!params.proxy,
  })
  if (!params.proxy) {
    throw new Error('Polymarket proxy required to trade. Link your account in Connected Platforms.')
  }
  const signer = await getClobSigner()
  const client = new ClobClient(
    CLOB_HOST,
    POLYGON_CHAIN_ID,
    signer as never,
    toApiKeyCreds(creds) as never,
    SignatureType.POLY_GNOSIS_SAFE, // required when maker is proxy (Safe); EOA signs on behalf of Safe
    params.proxy, // funderAddress — orders execute from proxy (Safe), not EOA
    undefined, // geoBlockToken
    true // useServerTime
  )

  const side = params.side === 'BUY' ? Side.BUY : Side.SELL
  const tickSize = (params.tickSize === '0.1' || params.tickSize === '0.001' || params.tickSize === '0.0001' ? params.tickSize : '0.01') as '0.1' | '0.01' | '0.001' | '0.0001'
  const options = { tickSize, negRisk: params.negRisk ?? false }

  // Preflight for BUY: show clear reason before posting order.
  if (params.side === 'BUY') {
    await ensureCollateralAllowance(client, params.amount, params.proxy, (msg, meta) =>
      log(`placeMarketOrder: ${msg}`, meta)
    )
  }

  log('placeMarketOrder: step 2 — createMarketOrder')
  let order: unknown
  try {
    order = await client.createMarketOrder(
      {
        tokenID: params.tokenId,
        side,
        amount: params.amount,
        price: params.price,
      },
      options
    )
    log('placeMarketOrder: step 3 — createMarketOrder ok', { orderSummary: typeof order === 'object' && order ? String((order as { orderID?: string }).orderID ?? 'no-id') : 'n/a' })
  } catch (e) {
    logger.error('placeMarketOrder: createMarketOrder failed', { error: String(e), params }, undefined, { component: 'clob', function: 'placeMarketOrder' })
    throw e
  }

  log('placeMarketOrder: step 4 — postOrder (FOK)')
  try {
    const response = await client.postOrder(order as never, OrderType.FOK)
    log('placeMarketOrder: step 5 — postOrder result', {
      orderID: response?.orderID,
      status: response?.status,
      errorMsg: response?.errorMsg,
    })
    return {
      orderID: response.orderID,
      status: response.status,
      errorMsg: response.errorMsg,
    }
  } catch (e) {
    const res = (e as { response?: { status?: number; data?: unknown } })?.response
    logger.error('placeMarketOrder: postOrder failed', {
      error: String(e),
      httpStatus: res?.status,
      responseData: res?.data,
    }, undefined, { component: 'clob', function: 'placeMarketOrder' })
    throw e
  }
}

export interface PlaceLimitOrderParams {
  tokenId: string
  side: 'BUY' | 'SELL'
  size: number
  price: number
  tickSize?: string
  negRisk?: boolean
  /** Polymarket proxy (Safe) address — orders execute from this wallet; required for balance/allowance. */
  proxy?: string | null
}

export async function placeLimitOrder(
  creds: ClobCredentials,
  params: PlaceLimitOrderParams
): Promise<{ orderID?: string; status?: string; errorMsg?: string }> {
  const log = (msg: string, meta?: Record<string, unknown>) =>
    logger.info(msg, meta, { component: 'clob', function: 'placeLimitOrder' })

  log('placeLimitOrder: step 1 — start', {
    tokenId: params.tokenId,
    side: params.side,
    size: params.size,
    price: params.price,
    tickSize: params.tickSize,
    negRisk: params.negRisk,
    hasProxy: !!params.proxy,
  })
  if (!params.proxy) {
    throw new Error('Polymarket proxy required to trade. Link your account in Connected Platforms.')
  }
  const signer = await getClobSigner()
  const client = new ClobClient(
    CLOB_HOST,
    POLYGON_CHAIN_ID,
    signer as never,
    toApiKeyCreds(creds) as never,
    SignatureType.POLY_GNOSIS_SAFE, // required when maker is proxy (Safe); EOA signs on behalf of Safe
    params.proxy, // funderAddress — orders execute from proxy (Safe), not EOA
    undefined, // geoBlockToken
    true // useServerTime
  )

  const side = params.side === 'BUY' ? Side.BUY : Side.SELL
  const tickSize = (params.tickSize === '0.1' || params.tickSize === '0.001' || params.tickSize === '0.0001' ? params.tickSize : '0.01') as '0.1' | '0.01' | '0.001' | '0.0001'
  const options = { tickSize, negRisk: params.negRisk ?? false }

  // Preflight for BUY: show clear reason before posting order.
  if (params.side === 'BUY') {
    const required = params.size * params.price
    await ensureCollateralAllowance(client, required, params.proxy, (msg, meta) =>
      log(`placeLimitOrder: ${msg}`, meta)
    )
  }

  log('placeLimitOrder: step 2 — createOrder (GTC)')
  let order: unknown
  try {
    order = await client.createOrder(
      {
        tokenID: params.tokenId,
        side,
        size: params.size,
        price: params.price,
      },
      options
    )
    log('placeLimitOrder: step 3 — createOrder ok', { orderSummary: typeof order === 'object' && order ? String((order as { orderID?: string }).orderID ?? 'no-id') : 'n/a' })
  } catch (e) {
    logger.error('placeLimitOrder: createOrder failed', { error: String(e), params }, undefined, { component: 'clob', function: 'placeLimitOrder' })
    throw e
  }

  log('placeLimitOrder: step 4 — postOrder (GTC)')
  try {
    const response = await client.postOrder(order as never, OrderType.GTC)
    log('placeLimitOrder: step 5 — postOrder result', {
      orderID: response?.orderID,
      status: response?.status,
      errorMsg: response?.errorMsg,
    })
    return {
      orderID: response.orderID,
      status: response.status,
      errorMsg: response.errorMsg,
    }
  } catch (e) {
    const res = (e as { response?: { status?: number; data?: unknown } })?.response
    logger.error('placeLimitOrder: postOrder failed', {
      error: String(e),
      httpStatus: res?.status,
      responseData: res?.data,
    }, undefined, { component: 'clob', function: 'placeLimitOrder' })
    throw e
  }
}

export async function cancelOrder(creds: ClobCredentials, orderId: string): Promise<boolean> {
  const signer = await getClobSigner()
  const client = new ClobClient(CLOB_HOST, POLYGON_CHAIN_ID, signer as never, toApiKeyCreds(creds) as never)
  await client.cancelOrder({ orderID: orderId })
  return true
}

export async function getOpenOrders(creds: ClobCredentials): Promise<unknown[]> {
  const signer = await getClobSigner()
  const client = new ClobClient(CLOB_HOST, POLYGON_CHAIN_ID, signer as never, toApiKeyCreds(creds) as never)
  return client.getOpenOrders()
}
