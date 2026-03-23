import 'dotenv/config'

const PREDICT_USE_TESTNET = ['1', 'true', 'yes'].includes(String(process.env.PREDICT_USE_TESTNET || '').toLowerCase())
const PREDICT_HOST = (
  process.env.PREDICT_HOST || (PREDICT_USE_TESTNET ? 'https://api-testnet.predict.fun' : 'https://api.predict.fun')
).replace(/\/$/, '')
const PREDICT_API_KEY = String(process.env.PREDICT_API_KEY || '')
const SEND_PREDICT_API_KEY = !PREDICT_USE_TESTNET && Boolean(PREDICT_API_KEY)

function headers() {
  const h = { 'Content-Type': 'application/json' }
  if (SEND_PREDICT_API_KEY) h['x-api-key'] = PREDICT_API_KEY
  return h
}

async function main() {
  const marketsUrl = `${PREDICT_HOST}/v1/markets?first=20&status=OPEN`
  const marketsRes = await fetch(marketsUrl, { headers: headers() })
  if (!marketsRes.ok) {
    throw new Error(`Predict markets failed: ${marketsRes.status}`)
  }
  const marketsJson = await marketsRes.json()
  const markets = Array.isArray(marketsJson?.data) ? marketsJson.data : []
  const first = markets[0]
  if (!first?.id) {
    console.log('[predict-smoke] no markets returned')
    return
  }

  const orderbookUrl = `${PREDICT_HOST}/v1/markets/${first.id}/orderbook`
  const obRes = await fetch(orderbookUrl, { headers: headers() })
  if (!obRes.ok) {
    throw new Error(`Predict orderbook failed: ${obRes.status}`)
  }
  const obJson = await obRes.json()
  const asks = obJson?.data?.asks ?? []
  const bids = obJson?.data?.bids ?? []

  console.log(
    JSON.stringify(
      {
        ok: true,
        marketCount: markets.length,
        firstMarketId: first.id,
        firstMarketTitle: first.title ?? first.question ?? null,
        firstMarketCategorySlug: first.categorySlug ?? null,
        orderbookAsks: asks.length,
        orderbookBids: bids.length,
      },
      null,
      2
    )
  )
}

main().catch((e) => {
  console.error('[predict-smoke] failed', e instanceof Error ? e.message : String(e))
  process.exit(1)
})

