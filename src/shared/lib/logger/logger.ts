import type { LogEntry, LogLevel, ApiLogMeta, WsLogMeta, TxLogMeta, BusinessLogMeta } from './types'

const LEVEL_ORDER: LogLevel[] = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR']
const MAX_ENTRIES = 2000
let minLevel: LogLevel = 'DEBUG'
let consoleEnabled = false
const buffer: LogEntry[] = []
const alertCallbacks: ((entry: LogEntry) => void)[] = []

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER.indexOf(level) >= LEVEL_ORDER.indexOf(minLevel)
}

function addEntry(entry: LogEntry): void {
  buffer.push(entry)
  if (buffer.length > MAX_ENTRIES) buffer.shift()
  if (entry.level === 'ERROR' && alertCallbacks.length) {
    alertCallbacks.forEach((cb) => cb(entry))
  }
}

function createEntry(
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>,
  error?: LogEntry['error'],
  context?: LogEntry['context']
): LogEntry {
  const entry: LogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    level,
    message,
    timestamp: Date.now(),
    context,
    error,
    meta,
  }
  return entry
}

function log(level: LogLevel, message: string, meta?: Record<string, unknown>, error?: LogEntry['error'], context?: LogEntry['context']): void {
  if (!shouldLog(level)) return
  const entry = createEntry(level, message, meta, error, context)
  addEntry(entry)
  if (consoleEnabled) {
    const prefix = `[${level}]`
    const fn = level === 'ERROR' ? console.error : level === 'WARN' ? console.warn : console.log
    fn(prefix, message, meta ?? {}, error ?? '', context ?? '')
  }
}

export const logger = {
  setLevel(level: LogLevel): void {
    minLevel = level
  },
  getLevel(): LogLevel {
    return minLevel
  },
  setConsoleEnabled(enabled: boolean): void {
    consoleEnabled = enabled
  },
  isConsoleEnabled(): boolean {
    return consoleEnabled
  },
  onAlert(cb: (entry: LogEntry) => void): () => void {
    alertCallbacks.push(cb)
    return () => {
      const i = alertCallbacks.indexOf(cb)
      if (i >= 0) alertCallbacks.splice(i, 1)
    }
  },
  error(message: string, meta?: Record<string, unknown>, error?: LogEntry['error'], context?: LogEntry['context']): void {
    log('ERROR', message, meta, error, context)
  },
  warn(message: string, meta?: Record<string, unknown>, context?: LogEntry['context']): void {
    log('WARN', message, meta, undefined, context)
  },
  info(message: string, meta?: Record<string, unknown>, context?: LogEntry['context']): void {
    log('INFO', message, meta, undefined, context)
  },
  debug(message: string, meta?: Record<string, unknown>, context?: LogEntry['context']): void {
    log('DEBUG', message, meta, undefined, context)
  },
  trace(message: string, meta?: Record<string, unknown>, context?: LogEntry['context']): void {
    log('TRACE', message, meta, undefined, context)
  },
  api(level: LogLevel, message: string, apiMeta: ApiLogMeta, context?: LogEntry['context']): void {
    log(level, message, { api: apiMeta }, undefined, context)
  },
  ws(level: LogLevel, message: string, wsMeta: WsLogMeta, context?: LogEntry['context']): void {
    log(level, message, { ws: wsMeta }, undefined, context)
  },
  tx(level: LogLevel, message: string, txMeta: TxLogMeta, context?: LogEntry['context']): void {
    log(level, message, { tx: txMeta }, undefined, context)
  },
  business(level: LogLevel, message: string, bizMeta: BusinessLogMeta, context?: LogEntry['context']): void {
    log(level, message, { business: bizMeta }, undefined, context)
  },
  getBuffer(): LogEntry[] {
    return [...buffer]
  },
  getFiltered(options: { level?: LogLevel; since?: number; component?: string; search?: string }): LogEntry[] {
    return buffer.filter((e) => {
      if (options.level && e.level !== options.level) return false
      if (options.since && e.timestamp < options.since) return false
      if (options.component && e.context?.component !== options.component) return false
      if (options.search) {
        const s = options.search.toLowerCase()
        const msg = e.message.toLowerCase()
        const metaStr = JSON.stringify(e.meta ?? {}).toLowerCase()
        if (!msg.includes(s) && !metaStr.includes(s)) return false
      }
      return true
    })
  },
  export(options?: { level?: LogLevel; since?: number; format?: 'json' | 'text' }): string {
    const entries = options ? logger.getFiltered(options) : buffer
    const format = options?.format ?? 'json'
    if (format === 'text') {
      return entries
        .map(
          (e) =>
            `${new Date(e.timestamp).toISOString()} [${e.level}] ${e.message} ${e.context ? JSON.stringify(e.context) : ''} ${e.meta ? JSON.stringify(e.meta) : ''}`
        )
        .join('\n')
    }
    return JSON.stringify(entries, null, 0)
  },
  /** Trigger browser download of log file (no console output; logs only in buffer + file). */
  downloadLogFile(options?: { level?: LogLevel; since?: number; format?: 'json' | 'text' }): void {
    const format = options?.format ?? 'text'
    const content = logger.export({ ...options, format })
    const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ave-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.${format === 'json' ? 'json' : 'txt'}`
    a.click()
    URL.revokeObjectURL(url)
  },
  clear(): void {
    buffer.length = 0
  },
}
