export type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'TRACE'

export interface LogEntry {
  id: string
  level: LogLevel
  message: string
  timestamp: number
  context?: {
    component?: string
    function?: string
    params?: unknown
    wallet?: string
  }
  error?: {
    type?: string
    message: string
    stack?: string
  }
  meta?: Record<string, unknown>
}

export interface ApiLogMeta {
  method: string
  url: string
  requestParams?: unknown
  sentAt: number
  responseAt?: number
  statusCode?: number
  responseData?: unknown
  durationMs?: number
}

export interface WsLogMeta {
  event: 'connect' | 'subscribe' | 'message' | 'error' | 'reconnect' | 'close'
  channel?: string
  message?: unknown
  error?: string
}

export interface TxLogMeta {
  hash?: string
  from?: string
  to?: string
  value?: string
  gasPrice?: string
  gasUsed?: string
  status?: string
  confirmedAt?: number
}

export interface BusinessLogMeta {
  type: 'trade' | 'deposit' | 'withdraw' | 'link_account' | 'balance_update'
  marketId?: string
  outcome?: string
  amount?: number
  price?: number
  result?: string
  platform?: string
  fee?: number
  oldBalance?: number
  newBalance?: number
  diff?: number
}
