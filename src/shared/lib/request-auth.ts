export function buildActionAuthMessage(params: {
  action: 'deployed_proxy'
  eoa: string
  proxyAddress?: string
  timestamp: number
}) {
  return [
    'Polymarket Avalanche Authorization',
    `action:${params.action}`,
    `eoa:${params.eoa.toLowerCase()}`,
    'nonce:',
    'requestId:',
    `proxy:${params.proxyAddress ? params.proxyAddress.toLowerCase() : ''}`,
    `timestamp:${params.timestamp}`,
  ].join('\n')
}
