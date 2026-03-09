import { useEffect, useState, useRef, useCallback } from 'react'
import { createMarketWs, type MarketWsMessage, type BookMessage, type LastTradeMessage } from '@/shared/api/websocket'
import type { OrderBookLevel } from '@/entities/market/types'

export interface LiveBook {
  bids: OrderBookLevel[]
  asks: OrderBookLevel[]
  lastTradePrice?: string
}

export interface LiveTrade {
  price: string
  side: 'BUY' | 'SELL'
  size: string
  time: number
}

export function useMarketWs(tokenId: string | null) {
  const [book, setBook] = useState<LiveBook | null>(null)
  const [trades, setTrades] = useState<LiveTrade[]>([])
  const tradesLimit = 50
  const onMessageRef = useRef<(data: MarketWsMessage) => void>()

  const onMessage = useCallback((data: MarketWsMessage) => {
    if (data.event_type === 'book') {
      const b = data as BookMessage
      setBook({
        bids: b.bids ?? [],
        asks: b.asks ?? [],
      })
    } else if (data.event_type === 'last_trade_price') {
      const t = data as LastTradeMessage
      setTrades((prev) => {
        const next = [
          { price: t.price, side: t.side, size: t.size, time: Number(t.timestamp) || Date.now() },
          ...prev.slice(0, tradesLimit - 1),
        ]
        return next
      })
      setBook((prev) =>
        prev ? { ...prev, lastTradePrice: t.price } : { bids: [], asks: [], lastTradePrice: t.price }
      )
    }
    // price_change could be used to update best bid/ask without full book
  }, [])

  onMessageRef.current = onMessage

  useEffect(() => {
    if (!tokenId) return
    const id = String(tokenId).trim().replace(/^["'\s\[\]]+|["'\s\[\]]+$/g, '')
    if (!id) return
    const close = createMarketWs([id], (data) => onMessageRef.current?.(data))
    return close
  }, [tokenId])

  return { book, trades }
}
