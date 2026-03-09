import { useAccount } from 'wagmi'
import { ConnectedPlatforms } from '@/widgets/connected-platforms'
import { BalancesSection } from '@/widgets/balances-section'
import { CopyTradingSection } from '@/widgets/copy-trading-section'
import { PositionsSection } from '@/widgets/positions-section'
import { TransactionHistory } from '@/widgets/transaction-history'
import { logger } from '@/shared/lib/logger'
import { Download } from 'lucide-react'

export function ProfilePage() {
  useAccount()

  const handleExportLogs = () => {
    logger.downloadLogFile({ format: 'text' })
  }

  return (
    <div className="max-w-[1920px] mx-auto px-6 py-8">
      <h1 className="text-h1 font-bold text-text-primary mb-8">Profile</h1>

      <div className="flex gap-6">
        <aside className="w-[18%] min-w-[160px] max-w-[200px] shrink-0" aria-hidden />
        <main className="flex-1 min-w-0">
          <section className="mb-10">
            <ConnectedPlatforms />
          </section>
          <section className="mb-10">
            <BalancesSection />
          </section>
          <section id="copy-trading" className="mb-10 scroll-mt-8">
            <CopyTradingSection />
          </section>
          <section className="mb-10">
            <PositionsSection />
          </section>
          <section id="history">
            <TransactionHistory />
          </section>
          <section className="mb-10 rounded-panel bg-bg-tertiary/50 border border-white/10 p-4">
            <h2 className="text-base font-semibold text-text-primary mb-2">Debug: logs</h2>
            <p className="text-tiny text-text-muted mb-2">
              If you have issues linking Polymarket, click Export logs and save the file to <code className="px-1 py-0.5 rounded bg-bg-secondary">logs/</code> as <code className="px-1 py-0.5 rounded bg-bg-secondary">ave-logs.txt</code> to analyze the error.
            </p>
            <button
              type="button"
              onClick={handleExportLogs}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-panel bg-bg-secondary border border-white/10 text-small hover:bg-white/5"
            >
              <Download className="w-4 h-4" />
              Export logs
            </button>
          </section>
        </main>
        <aside className="w-[18%] min-w-[160px] max-w-[200px] shrink-0" aria-hidden />
      </div>
    </div>
  )
}
