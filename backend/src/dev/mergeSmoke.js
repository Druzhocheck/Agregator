import 'dotenv/config'

const GAMMA_HOST = (process.env.GAMMA_HOST || 'https://gamma-api.polymarket.com').replace(/\/$/, '')
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

async function fetchJson(url, init) {
  const r = await fetch(url, init)
  if (!r.ok) throw new Error(`${url} -> ${r.status}`)
  return r.json()
}

async function main() {
  const [polyEvents, predictPayload] = await Promise.all([
    fetchJson(`${GAMMA_HOST}/events?limit=200&active=true&closed=false`),
    fetchJson(`${PREDICT_HOST}/v1/markets?first=300&status=OPEN`, { headers: headers() }),
  ])
  const predictMarkets = Array.isArray(predictPayload?.data) ? predictPayload.data : []

  const polyConditionToEvent = new Map()
  for (const e of polyEvents ?? []) {
    for (const m of e.markets ?? []) {
      if (m.conditionId) polyConditionToEvent.set(String(m.conditionId).toLowerCase(), e)
    }
  }

  let matchedById = 0
  const matchedPairs = []
  for (const pm of predictMarkets) {
    const ids = [
      ...(Array.isArray(pm.polymarketConditionIds) ? pm.polymarketConditionIds : []),
      pm.conditionId,
    ].filter(Boolean)
    const poly = ids.map((id) => polyConditionToEvent.get(String(id).toLowerCase())).find(Boolean)
    if (poly) {
      matchedById += 1
      if (matchedPairs.length < 20) {
        matchedPairs.push({
          predictId: pm.id,
          predictTitle: pm.title ?? pm.question ?? null,
          categorySlug: pm.categorySlug ?? null,
          polySlug: poly.slug ?? null,
          polyTitle: poly.title ?? poly.ticker ?? null,
        })
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        polymarketEvents: Array.isArray(polyEvents) ? polyEvents.length : 0,
        predictMarkets: predictMarkets.length,
        matchedByConditionId: matchedById,
        samplePairs: matchedPairs,
      },
      null,
      2
    )
  )
}

main().catch((e) => {
  console.error('[merge-smoke] failed', e instanceof Error ? e.message : String(e))
  process.exit(1)
})

