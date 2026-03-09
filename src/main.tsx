import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Providers } from '@/app/providers'
import { AppRouter } from '@/app/router'
import { logger } from '@/shared/lib/logger'
import './index.css'

if (import.meta.env.DEV) {
  logger.setConsoleEnabled(true)
  logger.setLevel('DEBUG')
  logger.info('Dreams dev: logging enabled (console + buffer). Export logs from Profile to save to logs/ave-logs.txt.', {}, { component: 'app', function: 'main' })
}

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <Providers>
      <AppRouter />
    </Providers>
  </StrictMode>
)
