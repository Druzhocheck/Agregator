/** Always displays Avalanche; network switching is encapsulated (e.g. auto Polygon for trading/deposit). */
export function NetworkSelector() {
  return (
    <div className="flex items-center gap-2 h-10 px-3 rounded-panel bg-bg-tertiary/80 border border-white/10">
      <span className="w-2 h-2 rounded-full bg-status-success animate-pulse" />
      <span className="text-small text-text-body">Avalanche</span>
    </div>
  )
}
