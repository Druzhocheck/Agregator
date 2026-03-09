/**
 * Polymarket WebSocket for real-time orderbook and trades.
 * Docs: https://docs.polymarket.com/market-data/websocket/market-channel
 */

import { logger } from '@/shared/lib/logger'

const WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market'

export type BookMessage = {
  event_type: 'book'
  asset_id: string
  market: string
  bids: { price: string; size: string }[]
  asks: { price: string; size: string }[]
  timestamp: string
  hash: string
}

export type PriceChangeMessage = {
  event_type: 'price_change'
  market: string
  price_changes: Array<{
    asset_id: string
    price: string
    size: string
    side: 'BUY' | 'SELL'
    hash: string
    best_bid: string
    best_ask: string
  }>
  timestamp: string
}

export type LastTradeMessage = {
  event_type: 'last_trade_price'
  asset_id: string
  market: string
  price: string
  side: 'BUY' | 'SELL'
  size: string
  timestamp: string
}

export type MarketWsMessage = BookMessage | PriceChangeMessage | LastTradeMessage

export function createMarketWs(assetIds: string[], onMessage: (data: MarketWsMessage) => void) {
  const ws = new WebSocket(WS_URL)

  ws.onopen = () => {
    const payload = { assets_ids: assetIds, type: 'market', custom_feature_enabled: true }
    ws.send(JSON.stringify(payload))
    logger.debug('WebSocket market subscribe', {
      channel: 'market',
      assetIds,
      url: WS_URL,
    }, { component: 'websocket', function: 'createMarketWs' })
  }

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data as string) as MarketWsMessage
      if (data.event_type === 'book') {
        const b = data as BookMessage
        logger.trace('WebSocket orderbook update', {
          asset_id: b.asset_id,
          bidsCount: b.bids?.length ?? 0,
          asksCount: b.asks?.length ?? 0,
          timestamp: b.timestamp,
        }, { component: 'websocket', function: 'onmessage' })
      }
      onMessage(data)
    } catch {
      // ignore
    }
  }

  ws.onerror = () => {
    logger.warn('WebSocket market error', { url: WS_URL, assetIds }, { component: 'websocket', function: 'createMarketWs' })
  }

  ws.onclose = () => {
    logger.debug('WebSocket market closed', { url: WS_URL, assetIds }, { component: 'websocket', function: 'createMarketWs' })
  }

  return () => {
    logger.trace('WebSocket market unsubscribe', { assetIds }, { component: 'websocket', function: 'createMarketWs' })
    ws.close()
  }
}
